package process

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"desktop/internal/trace"
)

func tracedEvents(tracer *trace.Tracer) []map[string]any {
	var out []map[string]any
	for _, line := range tracer.Snapshot() {
		var record map[string]any
		if json.Unmarshal(line, &record) == nil {
			out = append(out, record)
		}
	}
	return out
}

func TestRunTracesTheLaunchAndTheExitWithoutTheArguments(t *testing.T) {
	tracer := trace.New(trace.Options{})
	supervisor := NewSupervisor()
	supervisor.SetTracer(tracer)
	program, args := echoExitCommand()
	args = append(args, "CANARY-ARGUMENT")
	if _, _, _, err := supervisor.Run(context.Background(), program, args...); err != nil {
		t.Fatal(err)
	}
	records := tracedEvents(tracer)
	if len(records) != 2 || records[0]["event"] != "start" || records[1]["event"] != "exit" {
		t.Fatalf("records = %v, want a sidecar start then a sidecar exit", records)
	}
	if records[1]["mode"] != "run" || records[1]["exit_code"] != float64(7) {
		t.Errorf("exit record = %v, want mode run and exit code 7", records[1])
	}
	for _, line := range tracer.Snapshot() {
		if strings.Contains(string(line), "CANARY") {
			t.Errorf("an argument reached the trace: %s", line)
		}
	}
}

func TestAProgramThatCannotStartIsTracedAsAFailure(t *testing.T) {
	tracer := trace.New(trace.Options{})
	supervisor := NewSupervisor()
	supervisor.SetTracer(tracer)
	if _, _, _, err := supervisor.Run(context.Background(), "no-such-program-1827"); err == nil {
		t.Fatal("Run of a missing program succeeded")
	}
	records := tracedEvents(tracer)
	if len(records) != 1 || records[0]["event"] != "start_failed" || records[0]["kind"] != "no-such-program-1827" || records[0]["err"] != "not_found" && records[0]["err"] != "other" {
		t.Errorf("records = %v, want one start_failed for the program kind", records)
	}
}

func TestTraceKindKeepsOnlyIDCharacters(t *testing.T) {
	cases := map[string]string{
		`C:\Program Files\Narration\Manuscript Guide.exe`: "manuscript_guide",
		"/opt/ünï/side car":                               "side_car",
		"":                                                "unknown",
	}
	for program, want := range cases {
		if got := traceKind(program); got != want {
			t.Errorf("traceKind(%q) = %q, want %q", program, got, want)
		}
	}
	if got := traceKind(strings.Repeat("a", 100)); len(got) != 64 {
		t.Errorf("a 100-character name gave %d characters, want 64", len(got))
	}
}
