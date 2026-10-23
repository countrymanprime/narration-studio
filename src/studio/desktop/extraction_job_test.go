package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/analysistools"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/apply"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/store"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
)

// scanSource is a test source: it is available unless unavailable gives a reason, and extract is what it offers.
type scanSource struct {
	name, icon  string
	runs        bool
	unavailable string
	extract     func(context.Context, extractionport.Input) ([]extractionport.Raw, error)
}

func (s scanSource) Name() string     { return s.name }
func (s scanSource) Icon() string     { return s.icon }
func (s scanSource) Runs() bool       { return s.runs }
func (s scanSource) Assets() []string { return nil }
func (s scanSource) Scored() bool     { return true }

func (s scanSource) Available() extractionport.Availability {
	if s.unavailable != "" {
		return extractionport.Availability{Reason: s.unavailable}
	}
	return extractionport.Availability{OK: true}
}

func (s scanSource) Extractor() (extractionport.Extractor, error) {
	if a := s.Available(); !a.OK {
		return nil, &port.NotSupportedError{Capability: s.name, Support: port.Support{Level: port.NotYetAvailable, Message: a.Reason}}
	}
	return s, nil
}

func (s scanSource) Extract(ctx context.Context, in extractionport.Input) ([]extractionport.Raw, error) {
	if s.extract == nil {
		return nil, nil
	}
	return s.extract(ctx, in)
}

// offers returns an extract that records its source's name in ran and offers raws.
func offers(ran *scanLog, name string, raws ...extractionport.Raw) func(context.Context, extractionport.Input) ([]extractionport.Raw, error) {
	return func(context.Context, extractionport.Input) ([]extractionport.Raw, error) {
		ran.add(name)
		return raws, nil
	}
}

type scanLog struct {
	mu sync.Mutex
	// +checklocks:mu
	names []string
}

func (l *scanLog) add(name string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.names = append(l.names, name)
}

func (l *scanLog) all() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return slices.Clone(l.names)
}

func scanRegistry(sources ...scanSource) *port.Registry[extractionport.Source] {
	labels := map[string]string{extractionport.Rules: "Rules", extractionport.Imported: "Imported file", extractionport.LocalModel: "Local model",
		extractionport.Gliner: "GLiNER", extractionport.BookNLP: "BookNLP"}
	registry := &port.Registry[extractionport.Source]{Kind: "extraction source"}
	for _, s := range sources {
		registry.Register(port.Entry[extractionport.Source]{Name: s.name, Descriptor: port.Descriptor{Label: labels[s.name],
			Modes: []string{extractionport.ModeExtract}}, New: func() extractionport.Source { return s }})
	}
	return registry
}

func scanRaw(p extraction.Payload, confidence float64, paragraphID, quote string) extractionport.Raw {
	raw := extractionport.Raw{Payload: p, Confidence: &confidence}
	if quote != "" {
		raw.Quotes = []extractionport.Quote{{ParagraphID: paragraphID, Text: quote}}
	}
	return raw
}

// The rules' offers: a new entry the rule accepts, a property of the locked Duchess the rule accepts but the apply step
// cannot write, and a name it is not sure of.
var (
	rulesDodo    = scanRaw(extraction.Payload{Kind: extraction.KindEntry, Name: "The Dodo", Type: "Character"}, 0.9, "", "")
	rulesDuchess = scanRaw(extraction.Payload{Kind: extraction.KindProperty, Entry: "The Duchess", Key: "Manner", Value: "Stern"}, 0.95,
		"p-000002", "spoke sternly")
	rulesRabbit  = scanRaw(extraction.Payload{Kind: extraction.KindAlias, Entry: "White Rabbit", Alias: "Rabbit"}, 0.5, "", "")
	glinerHatter = scanRaw(extraction.Payload{Kind: extraction.KindEntry, Name: "The Hatter", Type: "Character"}, 0.6, "", "")
)

// scanHost is a host over a fresh project with no suggestions, whose Story Bible has Alice, the White Rabbit and the
// locked Duchess, the manuscript extractionParagraphs and the sources given.
func scanHost(t *testing.T, sources ...scanSource) (*Host, *apply.FakeBible, chan jobEnded) {
	t.Helper()
	bible := &apply.FakeBible{Entities: []apply.Entry{
		{ID: "alice", Name: "Alice", Category: "Character"},
		{ID: "white-rabbit", Name: "White Rabbit", Category: "Character"},
		{ID: "duchess", Name: "The Duchess", Category: "Character", Locked: true},
	}}
	host := &Host{extractionBible: bible, extractionSources: scanRegistry(sources...)}
	host.config.projectFolder = t.TempDir()
	host.extractionParagraphs = func() ([]extraction.Paragraph, error) { return slices.Clone(extractionParagraphs), nil }
	return host, bible, collectJobEnds(host)
}

func decodeScanJob(t *testing.T) func(string, error) ExtractionScanJob {
	return func(payload string, err error) ExtractionScanJob {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var job ExtractionScanJob
		if err := json.Unmarshal([]byte(payload), &job); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return job
	}
}

// waitScan polls the state until the job leaves running.
func waitScan(t *testing.T, host *Host) ExtractionScanJob {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if job := decodeScanJob(t)(host.ExtractionScanState()); job.Phase != "running" {
			return job
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("the scan did not end")
	return ExtractionScanJob{}
}

func storedSuggestions(t *testing.T, host *Host) []store.Suggestion {
	t.Helper()
	list, err := host.extractionStore().List()
	if err != nil {
		t.Fatal(err)
	}
	return list
}

func storedAbout(t *testing.T, host *Host, ref string) store.Suggestion {
	t.Helper()
	for _, s := range storedSuggestions(t, host) {
		if s.Payload.Name == ref || s.Payload.Entry == ref && s.Kind == extraction.KindProperty || s.Payload.Alias == ref {
			return s
		}
	}
	t.Fatalf("no suggestion about %q", ref)
	return store.Suggestion{}
}

func TestExtractionScanRunsTheInstalledSourcesInOrder(t *testing.T) {
	ran := &scanLog{}
	host, _, events := scanHost(t,
		scanSource{name: extractionport.Rules, runs: true, extract: offers(ran, "rules", rulesRabbit)},
		scanSource{name: extractionport.Imported},
		scanSource{name: extractionport.LocalModel, runs: true, unavailable: "No local model is installed."},
		scanSource{name: extractionport.Gliner, runs: true, extract: offers(ran, "gliner", glinerHatter)},
		scanSource{name: extractionport.BookNLP, runs: true, extract: offers(ran, "booknlp")},
	)

	for _, refused := range [][]string{{"nope"}, {extractionport.Imported}, {strings.Repeat("x", 100)}, slices.Repeat([]string{"rules"}, 17)} {
		if _, err := host.ExtractionScan(refused); err == nil {
			t.Fatalf("scan %v was not refused", refused)
		}
	}
	if job := decodeScanJob(t)(host.ExtractionScanState()); job.Phase != "idle" {
		t.Fatalf("a refused scan started a job: %+v", job)
	}

	job := decodeScanJob(t)(host.ExtractionScan([]string{extractionport.BookNLP, extractionport.Gliner, extractionport.LocalModel}))
	if want := []string{"rules", "local-model", "gliner", "booknlp"}; !slices.Equal(job.Sources, want) || job.Kind != "extraction_scan" {
		t.Fatalf("job = %+v, want sources %v", job, want)
	}
	nextJobEnd(t, events)
	job = waitScan(t, host)
	if want := []string{"rules", "gliner", "booknlp"}; !slices.Equal(ran.all(), want) {
		t.Fatalf("ran %v, want %v", ran.all(), want)
	}
	if !slices.Contains(job.Logs, "Skipped Local model: No local model is installed.") {
		t.Fatalf("the unavailable source's reason is not in the logs: %q", job.Logs)
	}
	if job.Phase != "success" || job.Added != 2 {
		t.Fatalf("job = %+v", job)
	}
	for _, s := range storedSuggestions(t, host) {
		if want := map[string]store.Source{"Rabbit": store.SourceRules, "The Hatter": store.SourceGLiNER}[s.Payload.Alias+s.Payload.Name]; s.Source != want {
			t.Fatalf("%+v came from %q", s.Payload, s.Source)
		}
	}

	ran = &scanLog{}
	host, _, events = scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: offers(ran, "rules")},
		scanSource{name: extractionport.Gliner, runs: true, extract: offers(ran, "gliner")})
	if job := decodeScanJob(t)(host.ExtractionScan(nil)); !slices.Equal(job.Sources, []string{"rules"}) {
		t.Fatalf("a scan with no sources asked for runs %v, want the rules", job.Sources)
	}
	nextJobEnd(t, events)
	if !slices.Equal(ran.all(), []string{"rules"}) {
		t.Fatalf("ran %v", ran.all())
	}
}

// gate blocks an extract until it is opened or its context is cancelled, and says when it has started.
type gate struct {
	started, open chan struct{}
	cancelled     chan struct{}
}

func newGate() *gate {
	return &gate{started: make(chan struct{}), open: make(chan struct{}), cancelled: make(chan struct{})}
}

func (g *gate) extract(raws ...extractionport.Raw) func(context.Context, extractionport.Input) ([]extractionport.Raw, error) {
	return func(ctx context.Context, _ extractionport.Input) ([]extractionport.Raw, error) {
		close(g.started)
		select {
		case <-g.open:
			return raws, nil
		case <-ctx.Done():
			close(g.cancelled)
			return nil, ctx.Err()
		}
	}
}

func waitGate(t *testing.T, ch chan struct{}, what string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(10 * time.Second):
		t.Fatalf("%s did not happen", what)
	}
}

func TestSecondExtractionScanWhileRunningJoinsTheFirst(t *testing.T) {
	rules := newGate()
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: rules.extract(rulesRabbit)},
		scanSource{name: extractionport.Gliner, runs: true})
	first := decodeScanJob(t)(host.ExtractionScan(nil))
	waitGate(t, rules.started, "the rules starting")
	second := decodeScanJob(t)(host.ExtractionScan([]string{extractionport.Gliner}))
	if *second.ID != *first.ID || second.Phase != "running" || !slices.Equal(second.Sources, []string{"rules"}) {
		t.Fatalf("the second scan %+v did not join the first %+v", second, first)
	}
	close(rules.open)
	if event := nextJobEnd(t, events); event.ID != *first.ID {
		t.Fatalf("ended %+v", event)
	}
	noMoreJobEnds(t, events)
}

func TestExtractionScanProgressIsReal(t *testing.T) {
	rules, gliner := newGate(), newGate()
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: rules.extract(rulesRabbit)},
		scanSource{name: extractionport.Gliner, runs: true, extract: gliner.extract(glinerHatter)})
	decodeScanJob(t)(host.ExtractionScan([]string{extractionport.Gliner}))
	waitGate(t, rules.started, "the rules starting")
	job := decodeScanJob(t)(host.ExtractionScanState())
	if job.Percent != 0 || job.Message != "Scanning with Rules (1 of 2)." {
		t.Fatalf("while the rules run: %d%% %q", job.Percent, job.Message)
	}
	close(rules.open)
	waitGate(t, gliner.started, "GLiNER starting")
	job = decodeScanJob(t)(host.ExtractionScanState())
	if job.Percent != 50 || job.Message != "Scanning with GLiNER (2 of 2)." || job.Added != 1 {
		t.Fatalf("while GLiNER runs: %+v", job)
	}
	close(gliner.open)
	nextJobEnd(t, events)
	if job = waitScan(t, host); job.Percent != 100 || job.Phase != "success" {
		t.Fatalf("ended %+v", job)
	}

	// The last source done does not read 100 before the job ends.
	j := &extractionScanJob{phase: "running", sources: []string{"rules"}}
	j.sourceDone(1, 0, 0)
	if j.snapshot().Percent != 99 {
		t.Fatalf("percent after the last source = %d, want 99 until the job ends", j.snapshot().Percent)
	}
}

func TestExtractionScanCancelStopsTheProcessAndKeepsWhatWasIngested(t *testing.T) {
	gliner := newGate()
	ran := &scanLog{}
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: offers(ran, "rules", rulesRabbit, rulesDodo)},
		scanSource{name: extractionport.Gliner, runs: true, extract: gliner.extract(glinerHatter)})
	decodeScanJob(t)(host.ExtractionScan([]string{extractionport.Gliner}))
	waitGate(t, gliner.started, "GLiNER starting")
	if job := decodeScanJob(t)(host.ExtractionScanCancel()); job.Message != "Cancelling the scan." {
		t.Fatalf("cancel answered %+v", job)
	}
	waitGate(t, gliner.cancelled, "GLiNER seeing the cancel")
	event := nextJobEnd(t, events)
	if event.Kind != jobKindExtractionScan || event.Outcome != jobOutcomeCancelled {
		t.Fatalf("ended %+v", event)
	}
	job := waitScan(t, host)
	if job.Phase != "cancelled" || job.Added != 2 || job.Message != "Scan cancelled. Kept 2 suggestions from the sources that finished." {
		t.Fatalf("job = %+v", job)
	}
	if list := storedSuggestions(t, host); len(list) != 2 || slices.ContainsFunc(list, func(s store.Suggestion) bool { return s.Source == store.SourceGLiNER }) {
		t.Fatalf("kept %+v", list)
	}
	if job := decodeScanJob(t)(host.ExtractionScanCancel()); job.Phase != "cancelled" {
		t.Fatalf("a cancel with nothing running answered %+v", job)
	}
}

func TestExtractionScanSkipsWhatWasOfferedOrRejected(t *testing.T) {
	ran := &scanLog{}
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: offers(ran, "rules", rulesRabbit, rulesDodo, rulesDuchess)})
	decodeScanJob(t)(host.ExtractionScan(nil))
	nextJobEnd(t, events)
	if job := waitScan(t, host); job.Added != 3 || job.Skipped != 0 {
		t.Fatalf("first scan %+v", job)
	}
	rabbit := storedAbout(t, host, "Rabbit")
	decodeDecision(t)(host.ExtractionReject(rabbit.ID))

	decodeScanJob(t)(host.ExtractionScan(nil))
	nextJobEnd(t, events)
	job := waitScan(t, host)
	if job.Added != 0 || job.Skipped != 3 || job.Message != "0 suggestions added; 3 already offered or rejected before." {
		t.Fatalf("second scan %+v", job)
	}
	if list := storedSuggestions(t, host); len(list) != 3 || storedAbout(t, host, "Rabbit").Status != extraction.StatusRejected {
		t.Fatalf("after scanning again: %+v", list)
	}
}

func TestExtractionScanAppliesAcceptedAutoInTheJob(t *testing.T) {
	ran := &scanLog{}
	host, bible, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: offers(ran, "rules", rulesDuchess, rulesDodo, rulesRabbit)})
	decodeScanJob(t)(host.ExtractionScan(nil))
	nextJobEnd(t, events)
	if job := waitScan(t, host); job.Phase != "success" {
		t.Fatalf("job = %+v", job)
	}
	dodo := storedAbout(t, host, "The Dodo")
	if dodo.Status != extraction.StatusAcceptedAuto || dodo.Applied == nil || !dodo.Applied.Created {
		t.Fatalf("the Dodo was not applied: %+v", dodo)
	}
	entries, _ := bible.Entries()
	if i := slices.IndexFunc(entries, func(e apply.Entry) bool { return e.Name == "The Dodo" }); i < 0 || !entries[i].FlaggedEntry {
		t.Fatalf("the Story Bible has no flagged Dodo: %+v", entries)
	}
	duchess := storedAbout(t, host, "The Duchess")
	if duchess.Status != extraction.StatusNeedsVerification || duchess.Reason == "" || duchess.Applied != nil {
		t.Fatalf("the locked Duchess's property was not held with its reason: %+v", duchess)
	}
	if rabbit := storedAbout(t, host, "Rabbit"); rabbit.Status != extraction.StatusNeedsVerification || rabbit.Applied != nil {
		t.Fatalf("the unsure name was applied: %+v", rabbit)
	}
}

func TestExtractionScanEndsWithOneJobEndedEvent(t *testing.T) {
	ran := &scanLog{}
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: offers(ran, "rules", rulesDodo)})
	job := decodeScanJob(t)(host.ExtractionScan(nil))
	event := nextJobEnd(t, events)
	if event.ID != *job.ID || event.Kind != "extraction_scan" || event.Outcome != jobOutcomeSuccess || event.Message != "1 suggestion added." {
		t.Fatalf("ended %+v", event)
	}
	noMoreJobEnds(t, events)

	// A source that fails ends the job with an error, still with one event.
	host, _, events = scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: func(context.Context, extractionport.Input) ([]extractionport.Raw, error) {
		return nil, context.DeadlineExceeded
	}})
	decodeScanJob(t)(host.ExtractionScan(nil))
	if event := nextJobEnd(t, events); event.Outcome != jobOutcomeError {
		t.Fatalf("ended %+v", event)
	}
	noMoreJobEnds(t, events)
	if job := waitScan(t, host); job.Error == "" {
		t.Fatalf("job = %+v", job)
	}
}

func TestExtractionScanRefusesWithNoProjectOrManuscript(t *testing.T) {
	host := &Host{extractionSources: scanRegistry(scanSource{name: extractionport.Rules, runs: true})}
	if _, err := host.ExtractionScan(nil); err == nil {
		t.Fatal("a scan with no project was not refused")
	}
	host, _, _ = scanHost(t, scanSource{name: extractionport.Rules, runs: true})
	host.extractionParagraphs = func() ([]extraction.Paragraph, error) { return nil, nil }
	if _, err := host.ExtractionScan(nil); err == nil || err.Error() != sentenceNoManuscript {
		t.Fatalf("a scan with no manuscript answered %v", err)
	}
	if job := decodeScanJob(t)(host.ExtractionScanState()); job.Phase != "idle" || job.Sources == nil || job.Logs == nil {
		t.Fatalf("idle = %+v", job)
	}
}

// toolsHost is a host over a fresh project whose scan sources are the real registry: the Manuscript Guide sidecar is
// this test binary (runFakeGuideRender, which writes the arguments it was started with to the file returned and prints
// no suggestion), and the analysis catalog holds a pinned GLiNER and BookNLP small row, one small file each, neither
// installed.
func toolsHost(t *testing.T) (*Host, *analysistools.Manager, string) {
	t.Helper()
	weights := []byte("fake-weights")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(weights) }))
	t.Cleanup(server.Close)
	sum := sha256.Sum256(weights)
	row := func(id, source string) map[string]any {
		return map[string]any{"id": id, "provider": "test", "displayName": id, "version": "1", "license": "MIT", "ramGB": 1, "source": source,
			"files": []map[string]any{{"name": "weights.model", "url": server.URL + "/" + id, "sha256": hex.EncodeToString(sum[:]), "size": len(weights)}}}
	}
	catalog := filepath.Join(t.TempDir(), "analysis.json")
	raw, _ := json.Marshal(map[string]any{"catalogVersion": 1, "tools": []map[string]any{row("gliner", "gliner"), row("booknlp-small", "booknlp")}})
	if err := os.WriteFile(catalog, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	tools, err := analysistools.New(catalog, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	host, _, _ := scanHost(t)
	host.extractionSources = nil
	host.assets = newAssetRegistry(t.TempDir(), nil, nil, nil, nil)
	host.assets.registerAnalysisTools(tools)
	host.config.manuscriptPython = os.Args[0]
	host.sidecars = process.NewSupervisor()
	t.Cleanup(func() { _ = host.sidecars.Close() })
	args := filepath.Join(t.TempDir(), "args.txt")
	t.Setenv(fakeGuideRenderEnv, "ok")
	t.Setenv("SHELL_FAKE_GUIDE_ARGS", args)
	return host, tools, args
}

// sourceRows is ExtractionSources by id.
func sourceRows(t *testing.T, host *Host) map[string]ExtractionSource {
	t.Helper()
	payload, err := host.ExtractionSources()
	if err != nil {
		t.Fatal(err)
	}
	var rows []ExtractionSource
	if err := json.Unmarshal([]byte(payload), &rows); err != nil {
		t.Fatal(err)
	}
	byID := map[string]ExtractionSource{}
	for _, row := range rows {
		byID[row.ID] = row
	}
	return byID
}

// scanWith runs one scan of source to its end and answers the job and the arguments the sidecar was last started with.
func scanWith(t *testing.T, host *Host, args, source string) (ExtractionScanJob, []string) {
	t.Helper()
	_ = os.Remove(args)
	if _, err := host.ExtractionScan([]string{source}); err != nil {
		t.Fatal(err)
	}
	job := waitScan(t, host)
	raw, _ := os.ReadFile(args)
	return job, strings.Split(strings.TrimSpace(string(raw)), "\n")
}

func argAfter(args []string, flag string) string {
	if i := slices.Index(args, flag); i >= 0 && i+1 < len(args) {
		return args[i+1]
	}
	return ""
}

// G22: the host scan registers the GLiNER and BookNLP adapters. Not installed, each answers not downloaded and a scan
// skips it with that reason; installed, a scan with that source starts the sidecar's suggest command for it with the
// registry's install folder.
func TestExtractionRegistryRunsTheGlinerAndBookNLPAdaptersWhenInstalled(t *testing.T) {
	host, tools, args := toolsHost(t)
	rows := sourceRows(t, host)
	if ids := slices.Sorted(func(yield func(string) bool) {
		for id := range rows {
			if !yield(id) {
				return
			}
		}
	}); strings.Join(ids, ",") != "booknlp,gliner,imported,local-model,rules" {
		t.Fatalf("sources = %v", ids)
	}
	for id, reason := range map[string]string{extractionport.Gliner: "GLiNER is not downloaded.", extractionport.BookNLP: "BookNLP is not downloaded."} {
		if row := rows[id]; row.Available || row.Reason != reason || !row.Runs {
			t.Fatalf("%s before install = %+v, want unavailable with %q", id, row, reason)
		}
		job, _ := scanWith(t, host, args, id)
		if job.Phase != "success" || !slices.ContainsFunc(job.Logs, func(l string) bool { return strings.Contains(l, "Skipped") && strings.Contains(l, reason) }) {
			t.Fatalf("a scan with %s not installed = %+v", id, job)
		}
	}

	for _, tool := range []struct{ asset, source, label string }{
		{"gliner", extractionport.Gliner, "GLiNER"},
		{"booknlp-small", extractionport.BookNLP, "BookNLP"},
	} {
		if err := tools.Install(context.Background(), tool.asset); err != nil {
			t.Fatal(err)
		}
		if row := sourceRows(t, host)[tool.source]; !row.Available {
			t.Fatalf("%s installed = %+v, want available", tool.source, row)
		}
		job, started := scanWith(t, host, args, tool.source)
		if job.Phase != "success" || !slices.Contains(job.Logs, tool.label+" offered 0 suggestions.") {
			t.Fatalf("a scan with %s installed = %+v", tool.source, job)
		}
		if len(started) == 0 || started[0] != "suggest" || argAfter(started, "--source") != tool.source ||
			argAfter(started, "--install") != tools.InstallDir(tool.asset) {
			t.Fatalf("the %s sidecar started with %q, want suggest --source %s --install %s", tool.source, started, tool.source, tools.InstallDir(tool.asset))
		}
	}
}
