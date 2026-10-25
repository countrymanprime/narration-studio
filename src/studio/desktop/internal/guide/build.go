package guide

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf16"
)

// This file is the Story Bible build: manuscript_guide.py build, which #2251 step 3 moved here and deleted, so the host is the only
// writer of manuscript_guide.json. The sidecar is asked only for what needs its Python: the language model's entity spans (its
// `entities` command, skipped for a rules-only build) and the automatic pronunciation of every name the build keeps (its
// `pronunciation` command, every name in one process). The host does the rest (build_entities.go, build_merge.go), writes the file as
// write_json did, then finds the dialogue cues against it (cues.go), holding editMu from reading the saved file to writing the cues, so
// an edit made while the model runs is merged, not lost. It writes the progress file and the run log the build dialog reads, with the
// sidecar's lines and words. tests/fixtures/guide-build (frozen) pins every byte against the sidecar's build (TestBuildMatchesTheSidecar).

// buildModel is the model work a build asks for. The sidecar does it (sidecarModel); the tests stand in recorded answers.
type buildModel interface {
	// entities runs the language model over the paragraphs (the ones the host read, which its answer must match) and gives names its
	// spans, nil when the model could not be loaded (the sidecar logged why); then it answers the pronunciation of each word names
	// returned, in order, from the same process.
	entities(ctx context.Context, manuscript, model, log string, paragraphs []ruleParagraph, names func(spans [][]entitySpan) []string) ([]*pyObject, error)
	// pronunciations is the automatic pronunciation of each word, in order (manuscript_guide.py pronunciation()).
	pronunciations(ctx context.Context, words []string, log string) ([]*pyObject, error)
}

// Build runs the Story Bible build. model is what the sidecar gives spaCy (the folder of an installed model, or a model name), or
// RulesOnly. It answers the sidecar's old stdout line, BUILT|<entries>|<file>. A build that fails reports why in the progress file and
// the log, as the sidecar did; a cue refresh that fails fails the build after the new entries are written, as before.
func (s *Service) Build(progress, log, model string) (string, error) {
	if s.project == "" {
		return "", errNoProject
	}
	run := &buildRun{progress: progress, log: log}
	out, refreshErr, err := s.build(context.Background(), run, model, true)
	if err != nil {
		run.fail(err)
		return "", err
	}
	if refreshErr != nil {
		return out, refreshErr
	}
	_ = s.SaveFindings() // best-effort; a problem here never fails a build that already succeeded (see SaveFindings)
	return out, nil
}

// The build's progress lines and log messages, as the sidecar wrote them.
const (
	rulesOnlyChosen = "Extraction: rules-only, chosen for this build. It is lower quality than a language model."
)

// build is manuscript_guide.py build and then, with refresh, the cue refresh. err is a failure of the build, which wrote nothing;
// refreshErr one of the refresh after it, when the file is written.
func (s *Service) build(ctx context.Context, run *buildRun, model string, refresh bool) (out string, refreshErr, err error) {
	manuscriptPath, guidePath := s.manuscript(), s.guidePath()
	run.say("Reading canonical manuscript")
	run.stage("LOAD", 5, "Reading manuscript...")
	paragraphs, raw, err := readRuleManuscript(manuscriptPath)
	if err != nil {
		return "", nil, err
	}
	sum := sha256.Sum256(raw)
	run.say("Loaded " + thousands(len(paragraphs)) + " paragraphs")
	run.stage("EXTRACT", 30, "Finding people, places, and organizations...")
	seenRaw, seen, err := readPrevious(guidePath)
	if err != nil {
		return "", nil, err
	}
	fresh, err := s.extract(ctx, run, manuscriptPath, model, paragraphs)
	if err != nil {
		return "", nil, err
	}

	s.editMu.Lock()
	defer s.editMu.Unlock()
	s.held = nil
	previous, err := rereadPrevious(guidePath, seenRaw, seen)
	if err != nil {
		return "", nil, err
	}
	types, err := buildTypes(previous)
	if err != nil {
		return "", nil, err
	}
	if err := fileUnderTypes(fresh, types); err != nil {
		return "", nil, err
	}
	run.stage("MERGE", 85, "Preserving locked edits...")
	run.say("Merging generated entries with locked and manual edits")
	entities, err := mergeLocked(fresh, previous)
	if err != nil {
		return "", nil, err
	}
	document, err := builtDocument(s.resolved(manuscriptPath), hex.EncodeToString(sum[:]), s.now(), entities, previous, types)
	if err != nil {
		return "", nil, err
	}
	if err := writePyDocument(guidePath, document); err != nil {
		return "", nil, err
	}
	run.stage("DONE", 100, fmt.Sprintf("Built guide with %d entities", len(entities)))
	run.say(fmt.Sprintf("Built Story Bible with %d entities", len(entities)))
	out = fmt.Sprintf("BUILT|%d|%s", len(entities), guidePath)
	if refresh {
		_, refreshErr = refreshCues(ctx, manuscriptPath, guidePath, nil)
	}
	return out, refreshErr, nil
}

// extract is build_entities up to the merge: the candidates (the language model's, or the rules' when it is not chosen or cannot be
// loaded), the entries, and their pronunciations.
func (s *Service) extract(ctx context.Context, run *buildRun, manuscriptPath, model string, paragraphs []ruleParagraph) ([]freshEntity, error) {
	models := s.models()
	var sorted, made []freshEntity
	words := func(candidates []ruleCandidate) []string {
		sorted, made = buildEntities(paragraphs, candidates)
		list := []string{}
		for _, entity := range made {
			list = append(list, entity.words...)
		}
		return list
	}
	var values []*pyObject
	var err error
	if model == RulesOnly {
		run.say(rulesOnlyChosen)
		if asked := words(ruleCandidates(paragraphs)); len(asked) > 0 {
			values, err = models.pronunciations(ctx, asked, run.log)
		}
	} else {
		run.say("Extracting candidates with spaCy model " + model)
		values, err = models.entities(ctx, manuscriptPath, model, run.log, paragraphs, func(spans [][]entitySpan) []string {
			if spans == nil {
				return words(ruleCandidates(paragraphs))
			}
			return words(spacyCandidates(paragraphs, spans))
		})
	}
	if err != nil {
		return nil, err
	}
	next := 0
	for _, entity := range made {
		for _, holder := range entity.holders {
			if next >= len(values) {
				return nil, errPronunciationAnswer
			}
			holder.set("pronunciation", values[next])
			next++
		}
	}
	if next != len(values) {
		return nil, errPronunciationAnswer
	}
	return sorted, nil
}

// readPrevious is load_json(args.out) where build read it, before the extraction: the bytes and the value, nil for a file that is
// missing, unreadable or not JSON. A file load_json crashed on fails the build there, as it did.
func readPrevious(path string) ([]byte, any, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, nil //nolint:nilerr // load_json reads an OSError as no file
	}
	value, err := pyLoadBible(raw, errBuildShape)
	return raw, value, err
}

// rereadPrevious is the file as it is now, under editMu: the value read before the extraction when its bytes have not changed since,
// so an edit made while the model ran is merged in, not written over.
func rereadPrevious(path string, seenRaw []byte, seen any) (any, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, nil //nolint:nilerr // load_json reads an OSError as no file
	}
	if seenRaw != nil && bytes.Equal(raw, seenRaw) {
		return seen, nil
	}
	return pyLoadBible(raw, errBuildShape)
}

// builtDocument is the file build writes, in its key order: the entries, the old dialogue cues (the refresh finds the new ones), the
// vocabulary, the absorbed names, and the types when the old file had them.
func builtDocument(source, sha string, now time.Time, entities []any, previous any, types []*pyObject) (*pyObject, error) {
	old, _ := previous.(*pyObject)
	if old == nil || !pyTruthy(previous) {
		old = newPyObject()
	}
	cues, _ := pyGet(old, "dialogue_cues", []any{})
	vocabulary, err := vocabularyFromEntities(entities)
	if err != nil {
		return nil, err
	}
	absorbed, _ := pyGet(old, "absorbed_names", newPyObject())
	document := newPyObject(
		"schema_version", pyInt{big.NewInt(schemaVersion)},
		"source", newPyObject("path", source, "sha256", sha),
		"generated_at", isoformat(now),
		"entities", entities,
		"dialogue_cues", cues,
		"vocabulary_candidates", vocabulary,
		"absorbed_names", absorbed,
	)
	if _, has := old.values["types"]; has {
		rows := make([]any, len(types))
		for i, row := range types {
			rows[i] = row
		}
		document.set("types", rows)
	}
	return document, nil
}

// isoformat is datetime.isoformat() of a UTC time: microseconds only when there are any, and +00:00.
func isoformat(at time.Time) string {
	at = at.UTC()
	text := at.Format("2006-01-02T15:04:05")
	if micro := at.Nanosecond() / 1000; micro != 0 {
		text += fmt.Sprintf(".%06d", micro)
	}
	return text + "+00:00"
}

// thousands is Python's f"{n:,}".
func thousands(n int) string {
	text := strconv.Itoa(n)
	for at := len(text) - 3; at > 0 && text[at-1] != '-'; at -= 3 {
		text = text[:at] + "," + text[at:]
	}
	return text
}

// resolved is Path(path).resolve(): absolute, through any links. A path that cannot be resolved stays absolute.
func (s *Service) resolved(path string) string {
	if s.resolvePath != nil {
		return s.resolvePath(path)
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	if real, err := filepath.EvalSymlinks(absolute); err == nil {
		return real
	}
	return absolute
}

func (s *Service) now() time.Time {
	if s.clock != nil {
		return s.clock()
	}
	return time.Now()
}

func (s *Service) models() buildModel {
	if s.buildModel != nil {
		return s.buildModel
	}
	return sidecarModel{s}
}

// buildRun is where a build reports: the progress file (stage|percent|message, replaced on each line) and the run log (one JSON line per
// message, appended), both as the sidecar wrote them; "" is nowhere.
type buildRun struct {
	progress, log string
	// stages and said are every progress line and log message, in order, for the tests.
	stages, said []string
}

// stage is narration_common.progress write_progress.
func (r *buildRun) stage(stage string, percent int, message string) {
	text := fmt.Sprintf("%s|%d|%s", stage, max(0, min(100, percent)), message)
	r.stages = append(r.stages, text)
	if r.progress == "" {
		return
	}
	line := []byte(text + pyLineEnd)
	if dir := filepath.Dir(r.progress); dir != "" {
		_ = os.MkdirAll(dir, 0o755)
	}
	temporary := r.progress + ".tmp"
	for range 8 {
		// The reader polls the file several times a second; on Windows the rename fails while it holds it open, so it is retried.
		if os.WriteFile(temporary, line, 0o644) == nil && os.Rename(temporary, r.progress) == nil { //nolint:gosec // G306: as the sidecar wrote it
			return
		}
		time.Sleep(30 * time.Millisecond)
	}
	_ = os.WriteFile(r.progress, line, 0o644) //nolint:gosec // G306: as the sidecar wrote it; progress is best-effort
}

// say is narration_common.logging_utils log at info: {"level", "msg", "ts"} with sorted keys and ASCII escapes, appended to the log.
func (r *buildRun) say(message string) {
	r.said = append(r.said, message)
	if r.log == "" {
		return
	}
	line := `{"level": "info", "msg": ` + asciiJSON(message) + `, "ts": "` + time.Now().UTC().Format("2006-01-02T15:04:05.000Z") + `"}` + pyLineEnd
	if dir := filepath.Dir(r.log); dir != "" {
		_ = os.MkdirAll(dir, 0o755)
	}
	file, err := os.OpenFile(r.log, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644) //nolint:gosec // G302: as the sidecar wrote it
	if err != nil {
		return
	}
	defer func() { _ = file.Close() }()
	_, _ = file.WriteString(line)
}

// fail is what the sidecar's main did when a build raised: ERROR: <reason> in the log (the sidecar wrote it already when the reason is
// its own) and ERROR|0|<reason> as the progress.
func (r *buildRun) fail(err error) {
	var failure *sidecarFailure
	if !errors.As(err, &failure) {
		r.say("ERROR: " + err.Error())
	}
	r.stage("ERROR", 0, err.Error())
}

// asciiJSON is json.dumps(text) with its default ensure_ascii: every character outside ASCII as \uXXXX (a surrogate pair beyond the
// BMP), the control characters escaped as json.dumps escapes them.
func asciiJSON(text string) string {
	var out strings.Builder
	out.WriteByte('"')
	for _, r := range text {
		switch {
		case r == '"':
			out.WriteString(`\"`)
		case r == '\\':
			out.WriteString(`\\`)
		case r == '\n':
			out.WriteString(`\n`)
		case r == '\r':
			out.WriteString(`\r`)
		case r == '\t':
			out.WriteString(`\t`)
		case r == '\b':
			out.WriteString(`\b`)
		case r == '\f':
			out.WriteString(`\f`)
		case r < 0x20 || (r > 0x7e && r <= 0xffff):
			fmt.Fprintf(&out, `\u%04x`, r)
		case r > 0xffff:
			high, low := utf16.EncodeRune(r)
			fmt.Fprintf(&out, `\u%04x\u%04x`, high, low)
		default:
			out.WriteRune(r)
		}
	}
	out.WriteByte('"')
	return out.String()
}

// errPronunciationAnswer is a pronunciation answer that does not hold one value per word.
var errPronunciationAnswer = errors.New("the pronunciation lookup gave an answer that could not be read")

// errEntitiesAnswer is a language model answer that does not match the manuscript the host read.
var errEntitiesAnswer = errors.New("the language model gave an answer that does not match the manuscript")

// sidecarFailure is a sidecar command that failed, with the reason it logged (and wrote to the build's log already).
type sidecarFailure struct{ reason string }

func (f *sidecarFailure) Error() string { return f.reason }

// sidecarModel is the build's model work done by the sidecar.
type sidecarModel struct{ s *Service }

// runForBuild runs one sidecar command for the build. A failure is its logged reason: the message of its last ERROR log line.
func (m sidecarModel) runForBuild(ctx context.Context, args ...string) (string, error) {
	out, err := m.s.runContext(ctx, args...)
	if err != nil {
		if reason, ok := loggedReason(err.Error()); ok {
			return "", &sidecarFailure{reason: reason}
		}
		return "", err
	}
	return out, nil
}

// loggedReason is the reason the sidecar logged before it exited 1: its last JSON log line whose message starts "ERROR: ".
func loggedReason(stderr string) (string, bool) {
	lines := strings.Split(strings.TrimSpace(stderr), "\n")
	for index := len(lines) - 1; index >= 0; index-- {
		var record struct {
			Msg string `json:"msg"`
		}
		if json.Unmarshal([]byte(strings.TrimSpace(lines[index])), &record) != nil {
			continue
		}
		if reason, found := strings.CutPrefix(record.Msg, "ERROR: "); found && reason != "" {
			return reason, true
		}
	}
	return "", false
}

func logArgs(log string) []string {
	if log == "" {
		return nil
	}
	return []string{"--log", log}
}

// entities runs `entities --manuscript M --spacy-model X --words-file W` and reads its answer as it comes: a first line
// {"available": true|false}, then (when available) one line per paragraph, {"paragraphId": ..., "entities": [[start, end, label], ...]}.
// Once every paragraph's line is in, the host makes the names and writes them to W, and the same process prints their pronunciations,
// one JSON object a line: one process per build, as the sidecar's build was.
func (m sidecarModel) entities(ctx context.Context, manuscript, model, log string, paragraphs []ruleParagraph, names func(spans [][]entitySpan) []string) ([]*pyObject, error) {
	if m.s.project == "" {
		return nil, errNoProject
	}
	if m.s.sidecars == nil {
		return nil, fmt.Errorf("the sidecar supervisor is unavailable")
	}
	dir, err := os.MkdirTemp("", "guide-build-*")
	if err != nil {
		return nil, err
	}
	defer func() { _ = os.RemoveAll(dir) }()
	wordsFile := filepath.Join(dir, "words.json")
	args := append([]string{"entities", "--manuscript", manuscript, "--spacy-model", model, "--words-file", wordsFile}, logArgs(log)...)
	program, fullArgs, err := m.s.command(append(args, m.s.defaultPronunciationSourceArgs()...))
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var mu sync.Mutex
	var lines []string
	arrived := make(chan struct{}, 1)
	child, err := m.s.sidecars.StartStream(ctx, func(line string) {
		mu.Lock()
		lines = append(lines, line)
		mu.Unlock()
		select {
		case arrived <- struct{}{}:
		default:
		}
	}, program, fullArgs...)
	if err != nil {
		return nil, err
	}
	defer func() {
		cancel() // a build that stops early does not leave the sidecar waiting for its words
		<-child.Done()
	}()
	failed := func() error {
		if reason, ok := loggedReason(child.StderrTail()); ok {
			return &sidecarFailure{reason: reason}
		}
		if message := strings.TrimSpace(child.StderrTail()); message != "" {
			return errors.New(message)
		}
		return errors.New("Story Bible sidecar failed") //nolint:staticcheck // the words Run uses
	}
	answered := func() (spans [][]entitySpan, done bool, err error) {
		mu.Lock()
		defer mu.Unlock()
		if len(lines) == 0 {
			return nil, false, nil
		}
		available, err := entitiesHead(lines[0])
		if err != nil {
			return nil, false, err
		}
		if !available {
			return nil, true, nil
		}
		if len(lines) < 1+len(paragraphs) {
			return nil, false, nil
		}
		spans, err = parseSpanLines(lines[1:1+len(paragraphs)], paragraphs)
		return spans, err == nil, err
	}
	var spans [][]entitySpan
	for {
		var done bool
		if spans, done, err = answered(); err != nil {
			return nil, err
		} else if done {
			break
		}
		select {
		case <-arrived:
			continue
		case <-child.Done():
		}
		// The process ended: every line it printed has arrived.
		if spans, done, err = answered(); err == nil && done {
			break
		}
		if code, _ := child.ExitCode(); code != 0 {
			return nil, failed()
		}
		if err != nil {
			return nil, err
		}
		return nil, errEntitiesAnswer
	}
	words := names(spans)
	if err := writeWords(wordsFile, words); err != nil {
		return nil, err
	}
	<-child.Done()
	if code, _ := child.ExitCode(); code != 0 {
		return nil, failed()
	}
	mu.Lock()
	defer mu.Unlock()
	skip := 1
	if spans != nil {
		skip += len(paragraphs)
	}
	return parsePronunciationObjects(strings.Join(lines[skip:], "\n"), len(words))
}

// writeWords writes the names for the sidecar beside the file and renames it into place, so it never reads half a list.
func writeWords(path string, words []string) error {
	encoded, _ := json.Marshal(words) // a list of strings cannot fail to encode
	if err := os.WriteFile(path+".tmp", encoded, 0o600); err != nil {
		return err
	}
	return os.Rename(path+".tmp", path)
}

// entitiesHead reads the first line `entities` prints: whether the model loaded.
func entitiesHead(line string) (bool, error) {
	var head struct {
		Available *bool `json:"available"`
	}
	if json.Unmarshal([]byte(line), &head) != nil || head.Available == nil {
		return false, errEntitiesAnswer
	}
	return *head.Available, nil
}

// parseEntitySpans reads a whole answer of `entities` up to its pronunciations: whether the model loaded, and each paragraph's spans.
func parseEntitySpans(out string, paragraphs []ruleParagraph) ([][]entitySpan, bool, error) {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	available, err := entitiesHead(lines[0])
	if err != nil || !available {
		return nil, false, err
	}
	if len(lines)-1 != len(paragraphs) {
		return nil, false, errEntitiesAnswer
	}
	spans, err := parseSpanLines(lines[1:], paragraphs)
	return spans, err == nil, err
}

// parseSpanLines reads one line per paragraph, refusing an answer for other paragraphs or with a span outside its paragraph.
func parseSpanLines(lines []string, paragraphs []ruleParagraph) ([][]entitySpan, error) {
	spans := make([][]entitySpan, len(paragraphs))
	for i, line := range lines {
		var row struct {
			ParagraphID string               `json:"paragraphId"`
			Entities    [][3]json.RawMessage `json:"entities"`
		}
		if json.Unmarshal([]byte(line), &row) != nil || row.ParagraphID != paragraphs[i].paragraphID {
			return nil, errEntitiesAnswer
		}
		spans[i] = make([]entitySpan, len(row.Entities))
		for j, entity := range row.Entities {
			var span entitySpan
			if json.Unmarshal(entity[0], &span.start) != nil || json.Unmarshal(entity[1], &span.end) != nil || json.Unmarshal(entity[2], &span.label) != nil ||
				span.start < 0 || span.start > span.end || span.end > len(paragraphs[i].text) {
				return nil, errEntitiesAnswer
			}
			spans[i][j] = span
		}
	}
	return spans, nil
}

// pronunciations runs `pronunciation --words-file F`: the words in a file (a book's names would not fit on a Windows command line),
// one JSON object printed per word, in order, with the narrator's preferred source first.
func (m sidecarModel) pronunciations(ctx context.Context, words []string, log string) ([]*pyObject, error) {
	path, remove, err := writeWordsFile(words)
	if err != nil {
		return nil, err
	}
	defer remove()
	out, err := m.runForBuild(ctx, m.s.wordsFileArgs(path, log)...)
	if err != nil {
		return nil, err
	}
	return parsePronunciationObjects(out, len(words))
}

// wordsFileArgs is the build's `pronunciation` command for the words in the file, with the narrator's preferred source when there is one.
func (s *Service) wordsFileArgs(path, log string) []string {
	args := append([]string{"pronunciation", "--words-file", path}, logArgs(log)...)
	return append(args, s.defaultPronunciationSourceArgs()...)
}

// parsePronunciationObjects reads one JSON object per line, as Python wrote each, in its key order.
func parsePronunciationObjects(out string, want int) ([]*pyObject, error) {
	values := make([]*pyObject, 0, want)
	for _, line := range strings.Split(out, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		value, err := pyLoads(strings.TrimSpace(line))
		object, ok := value.(*pyObject)
		if err != nil || !ok {
			return nil, errPronunciationAnswer
		}
		values = append(values, object)
	}
	if len(values) != want {
		return nil, errPronunciationAnswer
	}
	return values, nil
}
