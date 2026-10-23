package process

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"desktop/internal/runlog"
)

// sayCommand prints a line and exits 0; its argument holds a canary the timing record must not carry.
func sayCommand() (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd.exe", []string{"/c", "echo CANARY_ARGUMENT"}
	}
	return "sh", []string{"-c", "echo CANARY_ARGUMENT"}
}

func timingRecords(t *testing.T, path string) []map[string]any {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatalf("line %q is not JSON: %v", line, err)
		}
		if record["event"] == "sidecar.timing" {
			out = append(out, record)
		}
	}
	return out
}

func checkTiming(t *testing.T, records []map[string]any, mode string) {
	t.Helper()
	if len(records) != 1 {
		t.Fatalf("got %d sidecar.timing records, want 1", len(records))
	}
	record := records[0]
	if record["mode"] != mode || record["exit_code"] != float64(0) {
		t.Errorf("record = %v, want mode %s and exit 0", record, mode)
	}
	if first, ok := record["first_output_ms"].(float64); !ok || first < 0 {
		t.Errorf("first_output_ms = %v, want a non-negative number: the child printed a line", record["first_output_ms"])
	}
	total, ok := record["total_ms"].(float64)
	if !ok || total < record["first_output_ms"].(float64) {
		t.Errorf("total_ms = %v, want at least first_output_ms %v", record["total_ms"], record["first_output_ms"])
	}
	if strings.Contains(strings.ToUpper(toJSON(record)), "CANARY") {
		t.Errorf("record holds the argument: %v", record)
	}
	if kind := record["kind"]; kind != "sh" && kind != "cmd" {
		t.Errorf("kind = %v, want the program's bare name", kind)
	}
}

func toJSON(v any) string { raw, _ := json.Marshal(v); return string(raw) }

func newTimedRun(t *testing.T) (*runlog.Logger, *runlog.Run, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "run.jsonl")
	logger := runlog.New(path, 0)
	return logger, logger.Begin("test"), path
}

func TestRunRecordsSpawnToFirstOutputAndTotal(t *testing.T) {
	_, run, path := newTimedRun(t)
	program, args := sayCommand()
	if _, _, _, err := NewSupervisor().Run(runlog.WithRun(context.Background(), run), program, args...); err != nil {
		t.Fatal(err)
	}
	checkTiming(t, timingRecords(t, path), "run")
}

func TestStartRecordsTimingWhenTheChildExits(t *testing.T) {
	_, run, path := newTimedRun(t)
	program, args := sayCommand()
	child, err := NewSupervisor().Start(runlog.WithRun(context.Background(), run), program, args...)
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(20 * time.Second)
	for len(timingRecords(t, path)) == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if !child.HasExited() {
		t.Fatal("child still running")
	}
	checkTiming(t, timingRecords(t, path), "start")
}

func TestStartStreamRecordsTimingAtTheFirstLine(t *testing.T) {
	_, run, path := newTimedRun(t)
	program, args := sayCommand()
	child, err := NewSupervisor().StartStream(runlog.WithRun(context.Background(), run), func(string) {}, program, args...)
	if err != nil {
		t.Fatal(err)
	}
	<-child.Done()
	checkTiming(t, timingRecords(t, path), "stream")
}

func TestALaunchWithoutARunUsesTheFallbackRun(t *testing.T) {
	_, run, path := newTimedRun(t)
	supervisor := NewSupervisor()
	program, args := sayCommand()
	if _, _, _, err := supervisor.Run(context.Background(), program, args...); err != nil {
		t.Fatal(err)
	}
	if got := timingRecords(t, path); len(got) != 0 {
		t.Fatalf("a launch with no run and no fallback was logged: %v", got)
	}
	supervisor.SetFallbackRun(func() *runlog.Run { return run })
	if _, _, _, err := supervisor.Run(context.Background(), program, args...); err != nil {
		t.Fatal(err)
	}
	checkTiming(t, timingRecords(t, path), "run")
}

func TestProgramKindIsTheBareName(t *testing.T) {
	for program, want := range map[string]string{
		`C:\Program Files\App\resources\manuscript-guide\manuscript-guide.exe`: "manuscript-guide",
		"/opt/x/Python3": "python3",
		"sh":             "sh",
	} {
		if got := programKind(program); got != want {
			t.Errorf("programKind(%q) = %q, want %q", program, got, want)
		}
	}
}
