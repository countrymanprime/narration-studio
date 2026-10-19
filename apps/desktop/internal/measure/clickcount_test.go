package measure

import (
	"bytes"
	"context"
	"errors"
	"testing"
)

// The report's click_candidate_count is the Diagnostics click detector's count over the same audio, so Master & QC and
// Diagnostics never disagree about how many clicks a file has.

func clickRead(spikes int) []float64 {
	room := roomTone(cleanupRate, 3, -65, 11)
	for k := range spikes {
		at := int((0.5 + 0.8*float64(k)) * cleanupRate)
		for i := range 88 { // a 2 ms spike
			room[at+i] = 0.5
		}
	}
	return concat(speech(1), room, speech(1))
}

func TestReportCountsTheClicksDiagnosticsFinds(t *testing.T) {
	for _, spikes := range []int{0, 1, 3} {
		raw := encodeWAV(t, 1, cleanupRate, 24, false, clickRead(spikes))
		report, err := Analyze(bytes.NewReader(raw))
		if err != nil {
			t.Fatalf("Analyze: %v", err)
		}
		d := diagnoseBytes(t, raw, DiagnosticInput{SourceKind: SourceRawRecording, Options: DefaultDiagnosticOptions()})
		want := len(candidatesOf(d, CleanupClick))
		if want != spikes {
			t.Fatalf("%d spikes: Diagnostics found %d clicks, the fixture is wrong", spikes, want)
		}
		if report.ClickCandidateCount == nil || *report.ClickCandidateCount != want {
			t.Fatalf("%d spikes: ClickCandidateCount = %v, want %d", spikes, report.ClickCandidateCount, want)
		}
	}
}

func TestReportCountsZeroClicksInCleanAudioAndInSilence(t *testing.T) {
	for name, samples := range map[string][]float64{"a clean read": speech(2), "digital silence": silence(cleanupRate, 2)} {
		report, err := Analyze(bytes.NewReader(encodeWAV(t, 1, cleanupRate, 24, false, samples)))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if report.ClickCandidateCount == nil || *report.ClickCandidateCount != 0 {
			t.Fatalf("%s: ClickCandidateCount = %v, want 0, a measurement and not null", name, report.ClickCandidateCount)
		}
	}
}

func TestRangeReportCountsOnlyClicksInsideTheRange(t *testing.T) {
	raw := encodeWAV(t, 1, cleanupRate, 24, false, clickRead(3)) // spikes at 1.5, 2.3 and 3.1 s
	report, err := AnalyzeContext(context.Background(), bytes.NewReader(raw), Options{Range: &Range{StartSeconds: 0, LengthSeconds: 2}})
	if err != nil {
		t.Fatalf("AnalyzeContext: %v", err)
	}
	if report.ClickCandidateCount == nil || *report.ClickCandidateCount != 1 {
		t.Fatalf("ClickCandidateCount = %v, want 1: only the spike at 1.5 s is in the first 2 s", report.ClickCandidateCount)
	}
}

func TestMP3ClickCountIsNullUntilItsAudioIsDecoded(t *testing.T) {
	path := mp3Fixture(t)
	notChecked, err := MeasureFile(context.Background(), path, Options{})
	if err != nil {
		t.Fatalf("MeasureFile: %v", err)
	}
	if notChecked.Report.ClickCandidateCount != nil {
		t.Fatalf("undecoded MP3 ClickCandidateCount = %d, want null", *notChecked.Report.ClickCandidateCount)
	}
	wav := encodeWAV(t, 1, cleanupRate, 24, false, clickRead(2))
	decoded, err := MeasureFile(context.Background(), path, Options{Decoder: fakeDecoder{wav: wav}})
	if err != nil {
		t.Fatalf("MeasureFile: %v", err)
	}
	if got := decoded.Report.ClickCandidateCount; got == nil || *got != 2 {
		t.Fatalf("decoded MP3 ClickCandidateCount = %v, want 2", got)
	}
	failed, err := MeasureFile(context.Background(), path, Options{Decoder: fakeDecoder{err: errors.New("corrupt mp3")}})
	if err != nil {
		t.Fatalf("MeasureFile: %v", err)
	}
	if failed.Report.ClickCandidateCount != nil {
		t.Fatalf("failed decode ClickCandidateCount = %d, want null", *failed.Report.ClickCandidateCount)
	}
}
