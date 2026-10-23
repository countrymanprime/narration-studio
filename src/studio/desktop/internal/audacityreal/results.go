//go:build audacityreal && linux

package audacityreal

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

// Row statuses. A row is one step of one test; a test's status is the worst of its rows.
const (
	StatusPass = "pass"
	StatusFail = "fail"
	StatusSkip = "skip"
	StatusInfo = "info" // a measurement or an observed fact the test only records
)

// Row is one recorded step.
type Row struct {
	Step     string   `json:"step"`
	Status   string   `json:"status"`
	Evidence string   `json:"evidence,omitempty"`
	Raw      []string `json:"raw,omitempty"` // files under raw/ holding the exact reply bytes this row is about
}

// Result is what one test writes to results/<id>.json.
type Result struct {
	Test      string    `json:"test"`
	Title     string    `json:"title"`
	Status    string    `json:"status"`
	Audacity  string    `json:"audacity"`
	Runner    string    `json:"runner"`
	Started   time.Time `json:"started"`
	DurationS float64   `json:"duration_s"`
	Rows      []Row     `json:"rows"`
}

// Rec collects a test's rows and writes them when the test ends, pass or fail.
type Rec struct {
	t     *testing.T
	env   Env
	mu    sync.Mutex
	res   Result
	start time.Time
}

// Begin starts a result for test id (for example "A3-T3"). The file is written in t's cleanup.
func (e Env) Begin(t *testing.T, id, title string) *Rec {
	t.Helper()
	r := &Rec{t: t, env: e, start: time.Now()}
	r.res = Result{Test: id, Title: title, Audacity: e.Version, Runner: e.Runner, Started: r.start.UTC()}
	t.Cleanup(r.write)
	return r
}

func (r *Rec) add(step, status, evidence string, raw []string) {
	r.mu.Lock()
	r.res.Rows = append(r.res.Rows, Row{Step: step, Status: status, Evidence: evidence, Raw: raw})
	r.mu.Unlock()
	r.t.Logf("[%s] %s: %s: %s", r.res.Test, status, step, evidence)
}

// Pass records a step that held.
func (r *Rec) Pass(step, evidence string, raw ...string) { r.add(step, StatusPass, evidence, raw) }

// Info records a measurement or an observed fact that is not itself an expectation.
func (r *Rec) Info(step, evidence string, raw ...string) { r.add(step, StatusInfo, evidence, raw) }

// Skip records a step that could not run, with what it needs.
func (r *Rec) Skip(step, why string) { r.add(step, StatusSkip, why, nil) }

// Fail records a step that did not hold and fails the test, without stopping it.
func (r *Rec) Fail(step, evidence string, raw ...string) {
	r.add(step, StatusFail, evidence, raw)
	r.t.Fail()
}

// Fatal records a failed step and stops the test.
func (r *Rec) Fatal(step, evidence string, raw ...string) {
	r.Fail(step, evidence, raw...)
	r.t.FailNow()
}

// Check records a pass when ok, else a failure, with the same evidence either way. It returns ok.
func (r *Rec) Check(step string, ok bool, evidence string, raw ...string) bool {
	if ok {
		r.Pass(step, evidence, raw...)
	} else {
		r.Fail(step, evidence, raw...)
	}
	return ok
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// Raw saves bytes (a reply, a screenshot's text) under raw/<test>/<name>.bin and returns the file's path relative to the output
// folder, for a row to cite.
func (r *Rec) Raw(name string, b []byte) string {
	rel := filepath.Join("raw", r.res.Test, unsafeName.ReplaceAllString(name, "_")+".bin")
	path := filepath.Join(r.env.Out, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err == nil {
		_ = os.WriteFile(path, b, 0o644)
	}
	return rel
}

func (r *Rec) write() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.res.DurationS = time.Since(r.start).Seconds()
	status := StatusSkip
	for _, row := range r.res.Rows {
		switch row.Status {
		case StatusFail:
			status = StatusFail
		case StatusPass, StatusInfo:
			if status != StatusFail {
				status = StatusPass
			}
		}
	}
	if r.t.Failed() {
		status = StatusFail
	}
	r.res.Status = status
	b, err := json.MarshalIndent(r.res, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(filepath.Join(r.env.Out, "results", r.res.Test+".json"), append(b, '\n'), 0o644)
}

// Visible makes reply bytes readable in a row: line feeds and control bytes are written as escapes, and long replies are cut.
func Visible(b []byte) string {
	s := fmt.Sprintf("%q", string(b))
	if len(s) > 300 {
		s = s[:300] + `…"(` + fmt.Sprint(len(b)) + " bytes)"
	}
	return strings.TrimSpace(s)
}

// Golden saves reply bytes under golden/<name>.bin in the output folder. The files a run keeps there are the ones copied into
// src/studio/tests/audacity3/real/foundation/golden/ so the fake pipe and the client's reader are tested against what Audacity wrote.
func (r *Rec) Golden(name string, b []byte) string {
	rel := filepath.Join("golden", unsafeName.ReplaceAllString(name, "_")+".bin")
	path := filepath.Join(r.env.Out, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err == nil {
		_ = os.WriteFile(path, b, 0o644)
	}
	return rel
}
