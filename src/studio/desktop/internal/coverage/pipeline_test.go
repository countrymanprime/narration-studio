package coverage

import (
	"testing"

	"desktop/internal/evidence"
)

// pipelinedRequest is cascadeRequest with the one-process cascade asked for: the first pass reports its doubts (UnsureBelow) and
// re-checks them itself, so the large model starts on an item as soon as the small one has finished it.
func pipelinedRequest() Request {
	request := cascadeRequest()
	request.UnsureBelow = 0.5
	request.Pipeline = true
	return request
}

func TestPipelinedCascadePassesTheRecheckModelToTheFirstPassOnly(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{}
	request := pipelinedRequest()
	request.Recheck.ModelDir = "/models/large-v3-turbo"

	run(t, p.service(sidecar), request)

	if len(sidecar.launches) != 1 {
		t.Fatalf("a chapter nothing is missing from is one process: %d launches", len(sidecar.launches))
	}
	got := flags(sidecar.launches[0])
	if got["--recheck-model"] != "large-v3-turbo" || got["--recheck-model-dir"] != "/models/large-v3-turbo" || got["--unsure-below"] != "0.5" || got["--model"] != "small" {
		t.Fatalf("the pipelined first pass's args = %v", got)
	}
}

func TestPipelineNeedsAScoreLineAndTheCascade(t *testing.T) {
	cases := map[string]func(*Request){
		"pipeline off":      func(r *Request) { r.Pipeline = false },
		"no score line":     func(r *Request) { r.UnsureBelow = 0 },
		"no re-check model": func(r *Request) { r.Recheck = Transcription{} },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			p := newTestProject(t)
			sidecar := &fakeSidecar{}
			request := pipelinedRequest()
			change(&request)

			run(t, p.service(sidecar), request)

			if _, piped := flags(sidecar.launches[0])["--recheck-model"]; piped {
				t.Fatalf("%s: the first pass must not be pipelined: %v", name, flags(sidecar.launches[0]))
			}
		})
	}
}

func TestPipelinedStateNamesTheCombinedPass(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{present: 8, afterRecheckPresent: 10}
	service := p.service(sidecar)
	var seen []State
	service.changed = func(state State) { seen = append(seen, state) }

	run(t, service, pipelinedRequest())

	if first := seen[0]; first.Pass != "pipeline" || first.FirstPassModel != "small" || first.RecheckModel != "large-v3-turbo" {
		t.Fatalf("the run's initial state = %+v, want both models named in one pass", first)
	}
	var passes []string
	for _, state := range seen {
		if len(passes) == 0 || passes[len(passes)-1] != state.Pass {
			passes = append(passes, state.Pass)
		}
	}
	want := []string{"pipeline", "recheck_windows", "realign"}
	if len(passes) != len(want) {
		t.Fatalf("passes = %v, want %v", passes, want)
	}
	for i := range want {
		if passes[i] != want[i] {
			t.Fatalf("passes = %v, want %v", passes, want)
		}
	}
}

func TestPipelinedRecheckIsStoredFromWhatTheProcessReported(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{pipelineWindows: 2, pipelineSeconds: 50}
	service := p.service(sidecar)

	state := run(t, service, pipelinedRequest())

	if state.Phase != PhaseComplete {
		t.Fatalf("state = %+v", state)
	}
	recheck := currentResult(t, service, DefaultAlignmentParams).Result.Recheck
	if recheck == nil || recheck.Model != "large-v3-turbo" || recheck.WholeChapter || recheck.Windows != 2 || recheck.Seconds != 50 {
		t.Fatalf("Recheck = %+v, want the two windows the process re-checked itself (MC5)", recheck)
	}
}

func TestPipelinedRunStillRechecksWhatIsMissingAfterwards(t *testing.T) {
	p := newTestProject(t)
	// The process re-checked two doubtful passages; a tail is still missing, which only the whole-chapter alignment can show.
	sidecar := &fakeSidecar{present: 8, afterRecheckPresent: 10, pipelineWindows: 2, pipelineSeconds: 50}
	service := p.service(sidecar)

	state := run(t, service, pipelinedRequest())

	if state.Phase != PhaseComplete {
		t.Fatalf("state = %+v", state)
	}
	if len(sidecar.launches) != 2 || len(sidecar.alignments()) != 2 {
		t.Fatalf("want the pipelined process, a re-check of the missing tail and the host's realign, got %d launches", len(sidecar.launches))
	}
	if again := flags(sidecar.launches[1]); again["--recheck"] == "" || again["--recheck-model"] != "" || again["--model"] != "large-v3-turbo" {
		t.Fatalf("the missing-tail re-check's args = %v", again)
	}
	if realign := sidecar.alignments()[1]; realign.WordsReport != "" || realign.Model != "small" || realign.CheckedBy != "large-v3-turbo" {
		t.Fatalf("the realign = %+v", realign)
	}
	recheck := currentResult(t, service, DefaultAlignmentParams).Result.Recheck
	if recheck == nil || recheck.Windows != 3 || recheck.Seconds <= 50 {
		t.Fatalf("Recheck = %+v, want the process's two windows and the tail's one", recheck)
	}
}

func TestPipelinedCancelKeepsTheFinishedItemsAndRecordsAPartialResult(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{exitCode: exitCancelled}
	service := p.service(sidecar)

	state := run(t, service, pipelinedRequest())

	if state.Phase != PhaseCancelled {
		t.Fatalf("state = %+v", state)
	}
	record := latestRecord(t, p)
	if record.Outcome != evidence.LedgerPartial || record.Counts["wordsStored"] != 2 {
		t.Fatalf("record = %+v, want a partial record that kept both items' words", record)
	}
}

func TestPipelinedFailureKeepsTheFinishedItemsAndNamesTheError(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{exitCode: 1, errorMessage: "the re-check model could not be loaded"}
	service := p.service(sidecar)

	state := run(t, service, pipelinedRequest())

	if state.Phase != PhaseFailed || state.Message != "the re-check model could not be loaded" {
		t.Fatalf("state = %+v", state)
	}
	if record := latestRecord(t, p); record.Outcome != evidence.LedgerFailed || record.Counts["wordsStored"] != 2 {
		t.Fatalf("record = %+v, want a failed record that still harvested the words", record)
	}
}

func TestPipelinedCancelDuringTheTailRecheckStillRecordsAPartialResult(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{present: 8, recheckExitCode: exitCancelled}
	service := p.service(sidecar)

	state := run(t, service, pipelinedRequest())

	if state.Phase != PhaseCancelled {
		t.Fatalf("state = %+v", state)
	}
	if record := latestRecord(t, p); record.Outcome != evidence.LedgerPartial {
		t.Fatalf("record = %+v", record)
	}
}

func TestPipelinedWordsAreCachedUnderTheCascadesKey(t *testing.T) {
	p := newTestProject(t)
	run(t, p.service(&fakeSidecar{}), pipelinedRequest())

	plain := &fakeSidecar{}
	run(t, p.service(plain), testRequest())

	if got := plain.transcriptions(); len(got) != 2 {
		t.Fatalf("a plain check must not reuse words a larger model has spliced into: transcribed %v, want both items again", got)
	}
}
