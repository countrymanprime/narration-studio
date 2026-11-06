// Package diagexport builds the diagnostics bundle a narrator attaches to a bug report by hand (docs/prds/activity-trace.prd.md):
// one zip with a manifest that says what is and is not in it, made only of records that cannot hold content. The bundle holds
// the activity trace (typed fields only, internal/trace), the run log cut down to an allow-list of scalar keys, and the trace's
// in-memory ring when the disk trace is off. Sidecar stderr, host.log and bridge.jsonl are left out and the manifest says so: they
// carry free text until each is migrated to typed events. A last pass drops any line that names the user or the open project's
// files, whatever field it sits in. Nothing here sends anything anywhere.
package diagexport

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"desktop/internal/trace"
)

// FormatVersion changes when the manifest's shape does.
const FormatVersion = 1

// minLeakTerm is the shortest term the leak check searches for: a one- or two-letter name would match inside half the file.
const minLeakTerm = 3

// Options is everything Build reads. A path that does not exist is a file the bundle leaves out, not an error.
type Options struct {
	// Tracer supplies the in-memory ring and is flushed before the trace file is read. May be nil.
	Tracer *trace.Tracer
	// TracePath is logs/trace.jsonl; its backups (.2, .1) are read too, oldest first.
	TracePath string
	// RunLogPath is logs/run.jsonl.
	RunLogPath string
	// AppVersion is written to the manifest.
	AppVersion string
	// LeakTerms are strings no line of the bundle may contain: the user name, the open project's folder and file names.
	LeakTerms []string
	// Now is the clock (time.Now), a test seam.
	Now func() time.Time
}

// File is one entry of the bundle as the manifest and the preview list it.
type File struct {
	Name   string `json:"name"`
	Lines  int    `json:"lines"`
	Bytes  int    `json:"bytes"`
	Source string `json:"source"`
}

// Excluded is something a reader might expect in the bundle and why it is not.
type Excluded struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// LeakCheck is what the last pass did. It never lists the terms, only how many there were.
type LeakCheck struct {
	Terms        int `json:"terms"`
	LinesDropped int `json:"linesDropped"`
}

// Manifest is manifest.json, and also what the preview shows before anything is saved.
type Manifest struct {
	Format           int        `json:"format"`
	CreatedAt        string     `json:"createdAt"`
	AppVersion       string     `json:"appVersion"`
	RedactionVersion int        `json:"redactionVersion"`
	TraceEnabled     bool       `json:"traceEnabled"`
	Files            []File     `json:"files"`
	Excluded         []Excluded `json:"excluded"`
	LeakCheck        LeakCheck  `json:"leakCheck"`
	Note             string     `json:"note"`
}

// Bundle is a built, checked bundle held in memory.
type Bundle struct {
	manifest Manifest
	names    []string
	files    map[string][]byte
}

// Manifest is the bundle's manifest.
func (b *Bundle) Manifest() Manifest { return b.manifest }

// Preview is what the narrator sees before saving: the manifest, which says every file, its size and what was left out.
func (b *Bundle) Preview() Manifest { return b.manifest }

// File is the content of one included file, or nil.
func (b *Bundle) File(name string) []byte { return b.files[name] }

// runKeys are the run log keys an export keeps; every other key is dropped, so a new run-log field stays out until it is added here.
var runKeys = map[string]bool{
	"ts": true, "level": true, "event": true, "run": true, "tool": true, "outcome": true, "duration_ms": true,
	"kind": true, "mode": true, "first_output_ms": true, "total_ms": true, "exit_code": true, "cid": true,
}

// safeString is the only shape a kept run-log string may have: a word, an id or a timestamp.
var safeString = regexp.MustCompile(`^[A-Za-z0-9_.:+-]{1,64}$`)

// Build reads the logs and returns the checked bundle.
func Build(opts Options) (*Bundle, error) {
	now := time.Now
	if opts.Now != nil {
		now = opts.Now
	}
	opts.Tracer.Flush()
	bundle := &Bundle{files: map[string][]byte{}}
	terms := leakTerms(opts.LeakTerms)
	dropped := 0
	add := func(name, source string, lines [][]byte) {
		kept, drop := leakCheck(lines, terms)
		dropped += drop
		if len(kept) == 0 {
			return
		}
		body := append(bytes.Join(kept, []byte("\n")), '\n')
		bundle.files[name] = body
		bundle.names = append(bundle.names, name)
		bundle.manifest.Files = append(bundle.manifest.Files, File{Name: name, Lines: len(kept), Bytes: len(body), Source: source})
	}

	traceLines, err := readLines(opts.TracePath+".2", opts.TracePath+".1", opts.TracePath)
	if err != nil {
		return nil, err
	}
	add("trace.jsonl", "logs/trace.jsonl and its backups", traceLines)
	if !opts.Tracer.Enabled() {
		add("trace-memory.jsonl", "the last records kept in memory while the disk trace is off", opts.Tracer.Snapshot())
	}
	runLines, err := readLines(opts.RunLogPath)
	if err != nil {
		return nil, err
	}
	add("run.jsonl", "logs/run.jsonl, allow-listed keys only", filterRunLog(runLines))

	bundle.manifest.Format = FormatVersion
	bundle.manifest.CreatedAt = now().UTC().Format(time.RFC3339)
	bundle.manifest.AppVersion = opts.AppVersion
	bundle.manifest.RedactionVersion = trace.RedactionVersion
	bundle.manifest.TraceEnabled = opts.Tracer.Enabled()
	bundle.manifest.LeakCheck = LeakCheck{Terms: len(terms), LinesDropped: dropped}
	bundle.manifest.Excluded = []Excluded{
		{Name: "sidecar stderr", Reason: "free text from the Python tools; it can hold manuscript text until the sidecars log typed events"},
		{Name: "host.log", Reason: "free-text messages; folded in when the host logs through the trace"},
		{Name: "bridge.jsonl", Reason: "the REAPER bridge's own log; not included until its events are typed"},
		{Name: "your content", Reason: "manuscript, transcripts, names, typed text, audio and file paths are never recorded; a path is a class and a hash"},
	}
	bundle.manifest.Note = "Nothing is sent anywhere. Attach this file to a GitHub issue by hand."
	if bundle.manifest.Files == nil {
		bundle.manifest.Files = []File{}
	}
	return bundle, nil
}

// WriteZip writes the bundle, with manifest.json first, to dest. The file is made with owner-only permission.
func (b *Bundle) WriteZip(dest string) error {
	manifest, err := json.MarshalIndent(b.manifest, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.OpenFile(dest, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	writer := zip.NewWriter(file)
	write := func(name string, body []byte) error {
		entry, err := writer.Create(name)
		if err != nil {
			return err
		}
		_, err = entry.Write(body)
		return err
	}
	err = write("manifest.json", append(manifest, '\n'))
	for _, name := range b.names {
		if err == nil {
			err = write(name, b.files[name])
		}
	}
	if err == nil {
		err = writer.Close()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(dest)
	}
	return err
}

func leakTerms(raw []string) []string {
	var terms []string
	seen := map[string]bool{}
	for _, term := range raw {
		term = strings.ToLower(strings.TrimSpace(term))
		if len(term) >= minLeakTerm && !seen[term] {
			seen[term] = true
			terms = append(terms, term)
		}
	}
	return terms
}

// leakCheck drops each line that contains a term, compared without case, in the raw line or with its JSON escapes undone.
func leakCheck(lines [][]byte, terms []string) (kept [][]byte, dropped int) {
	for _, line := range lines {
		if hasTerm(line, terms) {
			dropped++
			continue
		}
		kept = append(kept, line)
	}
	return kept, dropped
}

func hasTerm(line []byte, terms []string) bool {
	if len(terms) == 0 {
		return false
	}
	lower := strings.ToLower(string(line))
	var decoded string
	var value any
	if json.Unmarshal(line, &value) == nil {
		again, _ := json.Marshal(value)
		decoded = strings.ToLower(strings.ReplaceAll(string(again), `\\`, `/`))
	}
	flat := strings.ReplaceAll(lower, `\\`, `/`)
	for _, term := range terms {
		slashed := strings.ReplaceAll(term, `\`, `/`)
		if strings.Contains(lower, term) || strings.Contains(flat, slashed) || (decoded != "" && strings.Contains(decoded, slashed)) {
			return true
		}
	}
	return false
}

// readLines reads the files that exist, in the order given, one element per non-empty line.
func readLines(paths ...string) ([][]byte, error) {
	var lines [][]byte
	for _, path := range paths {
		if path == "" {
			continue
		}
		file, err := os.Open(path)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("could not read %s: %w", path, err)
		}
		reader := bufio.NewReaderSize(file, 64<<10)
		for {
			line, readErr := reader.ReadBytes('\n')
			if trimmed := bytes.TrimSpace(line); len(trimmed) > 0 {
				lines = append(lines, append([]byte(nil), trimmed...))
			}
			if readErr != nil {
				break
			}
		}
		_ = file.Close()
	}
	return lines, nil
}

// filterRunLog keeps, for each run-log line that parses, only the allow-listed keys whose values are numbers, flags or safe words.
func filterRunLog(lines [][]byte) [][]byte {
	var out [][]byte
	for _, line := range lines {
		var record map[string]any
		if json.Unmarshal(line, &record) != nil {
			continue
		}
		kept := map[string]any{}
		for key, value := range record {
			if !runKeys[key] {
				continue
			}
			switch typed := value.(type) {
			case float64, bool:
				kept[key] = typed
			case string:
				if safeString.MatchString(typed) {
					kept[key] = typed
				}
			}
		}
		if len(kept) == 0 {
			continue
		}
		encoded, err := json.Marshal(kept)
		if err == nil {
			out = append(out, encoded)
		}
	}
	return out
}

// Summarize writes the safe summary of trace lines an agent can read first (--logs-summary): how many records, over what time, how
// often each event happened, how many were warnings or errors and the error classes they gave. It prints event names, counts and
// error classes only, never another field's value.
func Summarize(w io.Writer, traceLines []byte) error {
	events := map[string]int{}
	levels := map[string]int{}
	classes := map[string]int{}
	sessions := map[string]bool{}
	total := 0
	first, last := "", ""
	scanner := bufio.NewScanner(bytes.NewReader(traceLines))
	scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)
	for scanner.Scan() {
		var record map[string]any
		if json.Unmarshal(scanner.Bytes(), &record) != nil {
			continue
		}
		total++
		area, _ := record["area"].(string)
		name, _ := record["event"].(string)
		level, _ := record["level"].(string)
		events[area+"."+name]++
		levels[level]++
		if sess, ok := record["sess"].(string); ok {
			sessions[sess] = true
		}
		if ts, ok := record["ts"].(string); ok {
			if first == "" {
				first = ts
			}
			last = ts
		}
		if class, ok := record["err"].(string); ok && class != "none" && safeString.MatchString(class) {
			classes[area+"."+name+" "+class]++
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(w, "Activity trace summary\n%d records, %d launches\n", total, len(sessions))
	if first != "" {
		_, _ = fmt.Fprintf(w, "From %s to %s\n", first, last)
	}
	_, _ = fmt.Fprintf(w, "Levels: debug %d, info %d, warn %d, error %d\n\nEvents\n", levels["debug"], levels["info"], levels["warn"], levels["error"])
	for _, key := range sortedKeys(events) {
		_, _ = fmt.Fprintf(w, "  %6d  %s\n", events[key], key)
	}
	if len(classes) > 0 {
		_, _ = fmt.Fprintln(w, "\nError classes")
		for _, key := range sortedKeys(classes) {
			_, _ = fmt.Fprintf(w, "  %6d  %s\n", classes[key], key)
		}
	}
	return nil
}

func sortedKeys(counts map[string]int) []string {
	keys := make([]string, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// ReadTrace is the trace file and its backups, oldest first, as one block of lines for Summarize.
func ReadTrace(path string) ([]byte, error) {
	lines, err := readLines(path+".2", path+".1", path)
	if err != nil {
		return nil, err
	}
	return append(bytes.Join(lines, []byte("\n")), '\n'), nil
}
