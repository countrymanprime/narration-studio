package main

import (
	"context"
	"desktop/internal/brand"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"desktop/internal/extraction"
	"desktop/internal/extraction/apply"
	"desktop/internal/extraction/store"
	"desktop/internal/extractionport"
	"desktop/internal/extractionport/booknlp"
	"desktop/internal/extractionport/gliner"
	"desktop/internal/extractionport/rules"
	"desktop/internal/guide"
	"desktop/internal/port"
	"desktop/internal/runlog"
)

// The Story Bible's scan as a job (the mock's scanManuscript): the rules, then each source the narrator asked
// for, in the registry's order. Each source's suggestions are ingested as soon as it finishes, dropped by fingerprint
// when they were offered or rejected before, and the ones the 75% rule accepts are applied through the apply step, so a
// cancel keeps what the finished sources added. Progress is the sources done over the sources asked for.

// The sentences the scan says.
const (
	sentenceNoManuscript = "Import a manuscript before scanning it."
	sentenceTooManyIDs   = "That is more sources than there are."
)

// maxExtractionSourceIDs bounds the list a scan is asked for; the registry has five rows.
const maxExtractionSourceIDs = 16

// ExtractionScanJob is the scan in the shape of the other host jobs (WorkJob in the UI): Phase is idle, running,
// success, cancelled or error. Sources are the ones this scan runs, rules first; Added and Skipped count the suggestions
// stored and the ones dropped as offered or rejected before.
type ExtractionScanJob struct {
	ID      *string  `json:"id"`
	Kind    string   `json:"kind"`
	Phase   string   `json:"phase"`
	Message string   `json:"message"`
	Percent int      `json:"percent"`
	Logs    []string `json:"logs"`
	Elapsed float64  `json:"elapsed"`
	Error   string   `json:"error,omitempty"`
	Sources []string `json:"sources"`
	Added   int      `json:"added"`
	Skipped int      `json:"skipped"`
}

type extractionScanJob struct {
	mu sync.RWMutex
	// +checklocks:mu
	id string
	// +checklocks:mu
	phase string
	// +checklocks:mu
	message string
	// +checklocks:mu
	errorText string
	// +checklocks:mu
	percent int
	// +checklocks:mu
	logs []string
	// +checklocks:mu
	started time.Time
	// +checklocks:mu
	added int
	// +checklocks:mu
	skipped int
	// +checklocks:mu
	chunks  map[int]chunkProgress
	sources []string
	cancel  context.CancelFunc
}

func (j *extractionScanJob) running() bool {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return j.phase == "running"
}

func (j *extractionScanJob) snapshot() ExtractionScanJob {
	j.mu.RLock()
	defer j.mu.RUnlock()
	id := j.id
	return ExtractionScanJob{
		ID: &id, Kind: jobKindExtractionScan, Phase: j.phase, Message: j.message, Percent: j.percent, Logs: slices.Clone(j.logs),
		Elapsed: time.Since(j.started).Seconds(), Error: j.errorText, Sources: slices.Clone(j.sources), Added: j.added, Skipped: j.skipped,
	}
}

// say sets the message and logs it, unless the job has ended.
func (j *extractionScanJob) say(message string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.phase != "running" {
		return
	}
	j.message = message
	j.logs = append(j.logs, message)
}

// chunkProgress is how far a source reading the book in parts has got: parts read of parts in all, and the chapters that could
// not be read.
type chunkProgress struct {
	done, total int
	unread      []string
}

// chunkRead records that source i has read done of total parts, and shows it in the message and the percent. It adds no line
// to the logs for each part (a book has dozens); the percent never goes back and never reads 100 before the job ends.
func (j *extractionScanJob) chunkRead(i int, label string, done, total int, unread []string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.phase != "running" || total < 1 {
		return
	}
	if j.chunks == nil {
		j.chunks = map[int]chunkProgress{}
	}
	j.chunks[i] = chunkProgress{done: done, total: total, unread: slices.Clone(unread)}
	j.message = fmt.Sprintf("Scanning with %s (%d of %d): read %d of %d parts.", label, i+1, len(j.sources), done, total)
	if percent := min(99, (i*100+done*100/total)/len(j.sources)); percent > j.percent {
		j.percent = percent
	}
}

// unreadOf is how many parts source i could not read.
func (j *extractionScanJob) unreadOf(i int) int {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return len(j.chunks[i].unread)
}

// sourceDone counts one more source as done and what it added. The percent never reads 100 before the job ends.
func (j *extractionScanJob) sourceDone(done, added, skipped int) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.added += added
	j.skipped += skipped
	j.percent = max(j.percent, min(99, done*100/len(j.sources)))
}

// finish records how the scan ended: err when a source or the ingest failed, cancelled when the narrator stopped it.
func (j *extractionScanJob) finish(err error, cancelled bool) {
	j.mu.Lock()
	defer j.mu.Unlock()
	kept := suggestionsCount(j.added)
	switch {
	case cancelled:
		j.phase, j.message = "cancelled", fmt.Sprintf("Scan cancelled. Kept %s from the sources that finished.", kept)
	case err != nil:
		j.phase, j.errorText = "error", err.Error()
		j.message = fmt.Sprintf("The scan did not finish: %s. Kept %s from the sources that finished.", err.Error(), kept)
	default:
		j.phase, j.percent = "success", 100
		j.message = kept + " added."
		if j.skipped > 0 {
			j.message = fmt.Sprintf("%s added; %d already offered or rejected before.", kept, j.skipped)
		}
	}
	j.logs = append(j.logs, j.message)
}

func suggestionsCount(n int) string {
	if n == 1 {
		return "1 suggestion"
	}
	return fmt.Sprintf("%d suggestions", n)
}

// extractionScanRun is what one scan reads, taken once when it starts.
type extractionScanRun struct {
	registry  *port.Registry[extractionport.Source]
	installed []string
	input     extractionport.Input
	suggest   *store.Service
	bible     apply.Bible
	// cues writes the dialogue cues once the sources are done (extraction_cues.go); nil when the project has no Story Bible service.
	cues func(ctx context.Context, chapterIDs ...string) (guide.CueCounts, error)
}

// startExtractionScan checks the ids, then joins the running scan or starts one. An id that is not a source the scan
// can start is refused before anything starts.
func (h *Host) startExtractionScan(ids []string) (ExtractionScanJob, error) {
	registry := h.extractionRegistry()
	order, err := extractionScanOrder(registry, ids)
	if err != nil {
		return ExtractionScanJob{}, err
	}
	h.mu.RLock()
	running := h.extractionJob
	h.mu.RUnlock()
	if running != nil && running.running() {
		return running.snapshot(), nil
	}
	run, err := h.extractionScanInput(registry)
	if err != nil {
		return ExtractionScanJob{}, err
	}
	plan := h.extractionWorkers(order)
	run.input.Workers, run.input.Threads = plan.Workers, plan.Threads

	ctx, cancel := context.WithCancel(context.Background())
	id := fmt.Sprintf("extraction-scan-%d", time.Now().UnixNano())
	job := &extractionScanJob{id: id, phase: "running", started: time.Now(), sources: order, cancel: cancel}
	job.message = "Scanning the manuscript."
	job.logs = []string{job.message}

	h.mu.Lock()
	if h.extractionJob != nil && h.extractionJob.running() {
		joined := h.extractionJob
		h.mu.Unlock()
		cancel()
		return joined.snapshot(), nil
	}
	h.extractionJob = job
	h.mu.Unlock()

	ctx = runlog.WithRun(ctx, h.jobRuns.begin(h.runLog, id, jobKindExtractionScan, "sources", order))
	go h.runExtractionScan(ctx, job, run)
	return job.snapshot(), nil
}

// extractionWorkers is how many chapters GLiNER reads at once in a scan of sources: the Parallel processes setting
// (0: Automatic) planned against this computer's processors and free memory (planScanWorkers).
func (h *Host) extractionWorkers(sources []string) scanWorkerPlan {
	requested := 0
	if store := h.services().settings; store != nil {
		requested = coverageSettings(store).Parallel.Workers
	}
	return planScanWorkers(coverageMachine(), requested, sources)
}

// extractionScanOrder is the rules, then each id asked for in the registry's order, once. It refuses an id that is not
// a registered source the narrator can start.
func extractionScanOrder(registry *port.Registry[extractionport.Source], ids []string) ([]string, error) {
	if len(ids) > maxExtractionSourceIDs {
		return nil, extractionRefusal(sentenceTooManyIDs)
	}
	runnable := extractionport.RunnableNamesIn(registry)
	for _, id := range ids {
		if len(id) > maxSuggestionIDBytes || extractionport.CheckExtractIn(registry, id) != nil || !slices.Contains(runnable, id) {
			return nil, extractionRefusal(fmt.Sprintf("%q is not a source a scan can run.", truncateID(id)))
		}
	}
	order := []string{}
	for _, name := range runnable {
		if name == extractionport.Rules || slices.Contains(ids, name) {
			order = append(order, name)
		}
	}
	return order, nil
}

func truncateID(id string) string {
	if len(id) > maxSuggestionIDBytes {
		return id[:maxSuggestionIDBytes] + "…"
	}
	return id
}

// extractionScanInput reads what a scan needs from the open project: the manuscript's paragraphs, the suggestion store
// and the Story Bible.
func (h *Host) extractionScanInput(registry *port.Registry[extractionport.Source]) (extractionScanRun, error) {
	svc := h.services()
	if svc.config.projectFolder == "" {
		return extractionScanRun{}, errNoProject
	}
	bible := h.extractionBibleOf()
	if bible == nil {
		return extractionScanRun{}, errors.New(sentenceBibleUnavailable)
	}
	paragraphs, err := h.extractionParagraphsOf(svc)
	if err != nil {
		return extractionScanRun{}, err
	}
	if len(paragraphs) == 0 {
		return extractionScanRun{}, extractionRefusal(sentenceNoManuscript)
	}
	return extractionScanRun{
		registry:  registry,
		installed: h.extractionInstalledAssets(),
		input:     extractionport.Input{Paragraphs: paragraphs},
		suggest:   store.New(store.Config{Project: svc.config.projectFolder, Reporter: h.persist}),
		bible:     bible,
		cues:      h.cueRefresher(),
	}, nil
}

// runExtractionScan runs each source in turn, ingests and applies what it offered, then ends the job with one
// job:ended event.
func (h *Host) runExtractionScan(ctx context.Context, job *extractionScanJob, run extractionScanRun) {
	defer job.cancel()
	// The rules run first, in the host. The sources that start a sidecar then read at the same time (GLiNER beside BookNLP is
	// 6 to 29% faster than one after the other, docs/research/studio-next-extraction-chunking-benchmark.md), and their offers
	// are ingested one at a time in the registry's order, so the result does not depend on which finishes first.
	scanCtx, stop := context.WithCancel(ctx)
	var readers sync.WaitGroup
	defer func() {
		stop()
		readers.Wait()
	}()
	var failed error
	waiting := map[int]<-chan extractionRead{}
	start := func(i int, label string, extractor extractionport.Extractor) {
		result := make(chan extractionRead, 1)
		waiting[i] = result
		input := run.input
		input.Note = job.say
		input.Progress = func(done, total int, unread []string) { job.chunkRead(i, label, done, total, unread) }
		readers.Add(1)
		go func() {
			defer readers.Done()
			raws, err := extractor.Extract(scanCtx, input)
			result <- extractionRead{raws: raws, err: err}
		}()
	}
	for i, name := range job.sources {
		if ctx.Err() != nil {
			break
		}
		entry, err := run.registry.Lookup(name)
		if err != nil {
			failed = err
			break
		}
		label := entry.Descriptor.Label
		if a := extractionport.AvailableNowIn(run.registry, name, run.installed); !a.OK {
			job.say(fmt.Sprintf("Skipped %s: %s", label, a.Reason))
			job.sourceDone(i+1, 0, 0)
			continue
		}
		job.say(fmt.Sprintf("Scanning with %s (%d of %d).", label, i+1, len(job.sources)))
		extractor, err := entry.New().Extractor()
		if err != nil {
			job.say(fmt.Sprintf("Skipped %s: %s", label, err.Error()))
			job.sourceDone(i+1, 0, 0)
			continue
		}
		start(i, label, extractor)
		if name == extractionport.Rules {
			// The host's own rules finish before a sidecar starts, as they always have.
			if !h.takeRead(ctx, job, run, i, name, label, waiting, &failed) {
				break
			}
		}
	}
	for i, name := range job.sources {
		if failed != nil || ctx.Err() != nil {
			break
		}
		if _, ok := waiting[i]; !ok {
			continue
		}
		entry, _ := run.registry.Lookup(name)
		if !h.takeRead(ctx, job, run, i, name, entry.Descriptor.Label, waiting, &failed) {
			break
		}
	}
	if failed == nil && ctx.Err() == nil && run.cues != nil {
		job.say(cuesSentence(run.cues(ctx)))
	}
	job.finish(failed, failed == nil && ctx.Err() != nil)
	job.mu.RLock()
	event, ok := endedJob(job.id, jobKindExtractionScan, job.phase, job.message, job.started)
	job.mu.RUnlock()
	if ok {
		h.publishJobEnded(event)
	}
}

// extractionRead is what one source's extraction came to.
type extractionRead struct {
	raws []extractionport.Raw
	err  error
}

// takeRead waits for source i's extraction, ingests its offers and counts the source done. It reports false when the scan
// must stop (cancelled, or failed: *failed then holds the error).
func (h *Host) takeRead(ctx context.Context, job *extractionScanJob, run extractionScanRun, i int, name, label string, waiting map[int]<-chan extractionRead, failed *error) bool {
	var read extractionRead
	select {
	case read = <-waiting[i]:
	case <-ctx.Done():
		return false
	}
	delete(waiting, i)
	if ctx.Err() != nil {
		return false
	}
	if read.err != nil {
		*failed = read.err
		return false
	}
	added, skipped, err := ingestExtraction(run, store.Source(name), read.raws)
	if err != nil {
		*failed = err
		return false
	}
	job.say(fmt.Sprintf("%s offered %s.", label, suggestionsCount(added)))
	if unread := job.unreadOf(i); unread > 0 {
		job.say(fmt.Sprintf("%s could not read %d %s of the book; what it did read was kept.", label, unread, plural(unread, "part", "parts")))
	}
	job.sourceDone(i+1, added, skipped)
	return true
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// ingestExtraction stores one source's offers and applies the ones the 75% rule accepts. A suggestion that cannot be
// applied is held as needing verification with the reason (apply.Applier.Settle), and the scan goes on.
func ingestExtraction(run extractionScanRun, source store.Source, raws []extractionport.Raw) (added, skipped int, err error) {
	extractionDecisions.Lock()
	defer extractionDecisions.Unlock()
	entries, err := run.bible.Entries()
	if err != nil {
		return 0, 0, err
	}
	known := make(store.Bible, 0, len(entries))
	for _, e := range entries {
		known = append(known, store.Entry{ID: e.ID, Name: e.Name, Aliases: slices.Clone(e.Aliases)})
	}
	offers := make([]store.Raw, len(raws))
	for i, raw := range raws {
		offers[i] = storeRaw(raw)
	}
	result, err := run.suggest.Ingest(source, offers, store.Context{Paragraphs: run.input.Paragraphs, Bible: known, At: time.Now()})
	if err != nil {
		return 0, 0, err
	}
	if len(result.Added) > 0 {
		if _, err := apply.New(run.suggest, run.bible).Settle(); err != nil {
			return len(result.Added), len(result.Skipped), err
		}
	}
	return len(result.Added), len(result.Skipped), nil
}

func storeRaw(raw extractionport.Raw) store.Raw {
	p := raw.Payload
	quotes := make([]store.Quote, len(raw.Quotes))
	for i, q := range raw.Quotes {
		quotes[i] = store.Quote{ParagraphID: q.ParagraphID, Text: q.Text}
	}
	return store.Raw{
		Payload: store.Payload{Kind: p.Kind, Name: p.Name, Type: p.Type, Aliases: p.Aliases, Description: p.Description, AppearsIn: p.AppearsIn,
			Entry: p.Entry, Alias: p.Alias, Key: p.Key, Value: p.Value, To: p.To, Relation: p.Relation, Claim: p.Claim, Text: p.Text,
			Quote: p.Quote, Speaker: p.Speaker},
		Confidence: raw.Confidence, Quotes: quotes, ChapterID: raw.ChapterID, Flag: raw.Flag, Note: raw.Note,
	}
}

// extractionScanState answers the running or last scan, or an idle one.
func (h *Host) extractionScanState() ExtractionScanJob {
	h.mu.RLock()
	job := h.extractionJob
	h.mu.RUnlock()
	if job != nil {
		return job.snapshot()
	}
	return ExtractionScanJob{Kind: jobKindExtractionScan, Phase: "idle", Message: "Ready to scan the manuscript.", Logs: []string{}, Sources: []string{}}
}

// cancelExtractionScan stops a running scan: the running source's process is killed through its context. The job
// reports cancelled once the source has returned, keeping what the sources that finished added.
func (h *Host) cancelExtractionScan() ExtractionScanJob {
	h.mu.RLock()
	job := h.extractionJob
	h.mu.RUnlock()
	if job == nil || !job.running() {
		return h.extractionScanState()
	}
	job.say("Cancelling the scan.")
	// The answer is the state the cancel was asked in: once cancel() runs, the scan can end (and say so) before a
	// snapshot taken after it.
	state := job.snapshot()
	job.cancel()
	return state
}

// extractionRegistry is the scan's sources, in extractionport's order: the rules row runs the Story Bible's rules in the host
// (guide.RuleSuggestions), the GLiNER and BookNLP rows run the Manuscript Guide sidecar's suggest command from the analysis tool the registry has installed
// (and answer not downloaded until then), and the other rows are extractionport's own.
func (h *Host) extractionRegistry() *port.Registry[extractionport.Source] {
	if h.extractionSources != nil {
		return h.extractionSources
	}
	registry := &port.Registry[extractionport.Source]{Kind: "extraction source"}
	for _, entry := range extractionport.NewRegistry().Entries() {
		switch entry.Name {
		case extractionport.Rules:
			entry = rules.Entry(rules.Source{Files: h.rulesFiles})
		case extractionport.Gliner:
			entry = gliner.Entry(gliner.Source{Supervisor: h.sidecars, Command: h.glinerCommand,
				Install: func() (string, bool) { return h.analysisToolInstall(gliner.AssetID) }})
		case extractionport.BookNLP:
			entry = booknlp.Entry(booknlp.Source{Supervisor: h.sidecars, Command: h.booknlpCommand, Install: h.analysisToolInstall})
		}
		registry.Register(entry)
	}
	return registry
}

// analysisToolInstall is an analysis tool's install folder when the asset registry has it installed and verified and its
// row is pinned; a tool that is not, or a build with no analysis catalog, answers false.
func (h *Host) analysisToolInstall(id string) (string, bool) {
	tools := h.registry().analysis
	if tools == nil {
		return "", false
	}
	tool, ok := tools.Tool(id)
	if !ok || !tool.Available() || tools.State(tool) != "installed" {
		return "", false
	}
	return tools.InstallDir(id), true
}

// glinerCommand starts the Manuscript Guide sidecar as guideSuggestCommand does.
func (h *Host) glinerCommand() (gliner.Command, error) { return h.guideSuggestCommand() }

// booknlpCommand starts the Manuscript Guide sidecar as guideSuggestCommand does, with the spaCy model the Story Bible build
// would use when it is installed; otherwise the sidecar's default.
func (h *Host) booknlpCommand() (booknlp.Command, error) {
	command, err := h.guideSuggestCommand()
	if err != nil {
		return booknlp.Command{}, err
	}
	out := booknlp.Command{Program: command.Program, Args: command.Args, Manuscript: command.Manuscript, Guide: command.Guide}
	if store := h.services().settings; store != nil {
		if model, gate, err := h.spacyForBuild(store, false); err == nil && gate == nil {
			out.SpacyModel = model
		}
	}
	return out, nil
}

// rulesFiles are the open project's manuscript and Story Bible, which the rules read.
func (h *Host) rulesFiles() (rules.Files, error) {
	config := h.services().config
	if config.projectFolder == "" {
		return rules.Files{}, errNoProject
	}
	return rules.Files{
		Manuscript: filepath.Join(config.projectFolder, brand.ProjectFolder, "manuscript", "manuscript.json"),
		Guide:      filepath.Join(config.projectFolder, "ManuscriptGuide", "manuscript_guide.json"),
	}, nil
}

// guideSuggestCommand is how to start the Manuscript Guide sidecar's suggest command for the open project, as internal/guide
// starts the sidecar: the frozen sidecar alone, or Python and the backend script in development.
func (h *Host) guideSuggestCommand() (gliner.Command, error) {
	files, err := h.rulesFiles()
	if err != nil {
		return gliner.Command{}, err
	}
	config := h.services().config
	command := gliner.Command{Program: config.manuscriptPython, Manuscript: files.Manuscript, Guide: files.Guide}
	if _, err := os.Stat(command.Program); err != nil {
		return gliner.Command{}, errors.New("configure the Manuscript Guide executable before continuing")
	}
	if config.manuscriptBackend != "" {
		if _, err := os.Stat(config.manuscriptBackend); err != nil {
			return gliner.Command{}, errors.New("configure the Manuscript Guide backend before continuing")
		}
		command.Args = []string{config.manuscriptBackend}
	}
	return command, nil
}

// extractionParagraphsOf is the manuscript's paragraphs as the evidence check searches them.
func (h *Host) extractionParagraphsOf(svc hostServices) ([]extraction.Paragraph, error) {
	if h.extractionParagraphs != nil {
		return h.extractionParagraphs()
	}
	if svc.manuscript == nil {
		return nil, extractionRefusal(sentenceNoManuscript)
	}
	data, err := svc.manuscript.Load()
	if err != nil {
		return nil, err
	}
	raw, _ := data["paragraphs"].([]any)
	paragraphs := make([]extraction.Paragraph, 0, len(raw))
	for _, item := range raw {
		p, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id, _ := p["id"].(string)
		chapterID, _ := p["chapterId"].(string)
		text, _ := p["text"].(string)
		if id != "" {
			paragraphs = append(paragraphs, extraction.Paragraph{ID: id, ChapterID: chapterID, Text: text})
		}
	}
	return paragraphs, nil
}

// extractionInstalledAssets are the installed asset ids a source can run from: the analysis tools the registry has
// installed and verified (analysisToolInstall).
func (h *Host) extractionInstalledAssets() []string {
	if h.extractionInstalled != nil {
		return h.extractionInstalled()
	}
	tools := h.registry().analysis
	if tools == nil {
		return nil
	}
	var installed []string
	for _, tool := range tools.Tools() {
		if _, ok := h.analysisToolInstall(tool.ID); ok {
			installed = append(installed, tool.ID)
		}
	}
	return installed
}
