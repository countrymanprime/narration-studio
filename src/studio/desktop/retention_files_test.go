package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"desktop/internal/comparerun"
	"desktop/internal/guide"
)

var filesNow = time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)

// putFile writes a file below the project, last modified age before filesNow, and answers its path.
func putFile(t *testing.T, project, rel string, size int, age time.Duration) string {
	t.Helper()
	path := filepath.Join(project, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, make([]byte, size), 0o600); err != nil {
		t.Fatal(err)
	}
	when := filesNow.Add(-age)
	if err := os.Chtimes(path, when, when); err != nil {
		t.Fatal(err)
	}
	return path
}

func previewName(i int) string { return fmt.Sprintf("%064x.wav", i) }

// The rules are the owner's answers on #3816: previews 64 MB oldest first; Compare files the newest 20 runs and 7 days.
func TestTheFolderRulesAreTheOwnersAnswers(t *testing.T) {
	if previewRule.MaxBytes != 64<<20 || previewRule.KeepGroups != 0 || previewRule.MaxAge != 0 {
		t.Errorf("previews: %+v; want a cap of 64 MB and nothing else", previewRule)
	}
	if previewRule.Guard != 10*time.Minute || compareRule.Guard != 24*time.Hour {
		t.Errorf("guards: previews %v, compare %v; want ten minutes and a day", previewRule.Guard, compareRule.Guard)
	}
	if compareRule.KeepGroups != 20 || compareRule.MaxAge != 7*24*time.Hour || compareRule.MaxBytes != 0 {
		t.Errorf("compare files: %+v; want the newest 20 runs and 7 days", compareRule)
	}
	if got := previewRetention("p").folder; got != guide.PreviewFolder() {
		t.Errorf("previews are pruned in %q, not where they are written (%q)", got, guide.PreviewFolder())
	}
	if got := compareRetention("p").folder; got != comparerun.DiffFolder() {
		t.Errorf("compare files are pruned in %q, not where they are written (%q)", got, comparerun.DiffFolder())
	}
}

func TestThePreviewStepTakesTheLeastRecentlyUsedOverTheCapAndLeavesWhatIsNotAPreview(t *testing.T) {
	project := t.TempDir()
	folder := filepath.ToSlash(guide.PreviewFolder())
	oldest := putFile(t, project, folder+"/"+previewName(1), 400, 3*time.Hour)
	middle := putFile(t, project, folder+"/"+previewName(2), 400, 2*time.Hour)
	fresh := putFile(t, project, folder+"/"+previewName(3), 400, time.Minute) // used a minute ago: not removed to meet the cap
	part := putFile(t, project, folder+"/"+previewName(4)+".4242.part", 400, 5*time.Hour)
	note := putFile(t, project, folder+"/notes.txt", 400, 5*time.Hour)
	step := previewRetention(project)
	step.rule.MaxBytes = 500
	step.now = func() time.Time { return filesNow }

	report := step.Run(context.Background(), func() bool { return false })
	if report.Err != nil || report.Stopped || report.Kind != "tts previews" || report.Removed != 2 {
		t.Fatalf("report = %+v; want two previews removed", report)
	}
	if fileExists(oldest) || fileExists(middle) || !fileExists(fresh) || !fileExists(part) || !fileExists(note) {
		t.Fatalf("oldest kept %v, middle kept %v, fresh kept %v, part kept %v, note kept %v", fileExists(oldest), fileExists(middle), fileExists(fresh), fileExists(part), fileExists(note))
	}
	if report.FilesBefore != 3 || report.FilesAfter != 1 {
		t.Fatalf("report = %+v; want the three previews counted (a .part file and a note are not), 1 left", report)
	}
}

func TestTheCompareStepKeepsTheNewestTwentyRunsWholeAndTouchesNothingElse(t *testing.T) {
	project := t.TempDir()
	diffs := filepath.ToSlash(comparerun.DiffFolder())
	for i := range 23 {
		for _, ext := range []string{".diff", ".manuscript.txt", ".recorded.txt"} {
			putFile(t, project, fmt.Sprintf("%s/Chapter_%016d%s", diffs, i, ext), 10, time.Duration(23-i+25)*time.Hour) // all past the day a run is left alone
		}
	}
	decisions := []string{
		putFile(t, project, "TranscriptCompare/equivalences.csv", 10, 400*24*time.Hour),
		putFile(t, project, "TranscriptCompare/vocab_hints.json", 10, 400*24*time.Hour),
		putFile(t, project, "TranscriptCompare/vocabulary_hints.txt", 10, 400*24*time.Hour),
		putFile(t, project, diffs+"/readme.txt", 10, 400*24*time.Hour),
	}
	step := compareRetention(project)
	step.now = func() time.Time { return filesNow }

	report := step.Run(context.Background(), func() bool { return false })
	if report.Err != nil || report.Removed != 9 || report.Kind != "transcript compare files" {
		t.Fatalf("report = %+v; want the three oldest runs, nine files, removed", report)
	}
	for i := range 23 {
		for _, ext := range []string{".diff", ".manuscript.txt", ".recorded.txt"} {
			kept := fileExists(filepath.Join(project, filepath.FromSlash(fmt.Sprintf("%s/Chapter_%016d%s", diffs, i, ext))))
			if want := i >= 3; kept != want {
				t.Fatalf("run %d file %s kept = %v, want %v", i, ext, kept, want)
			}
		}
	}
	for _, path := range decisions {
		if !fileExists(path) {
			t.Fatalf("%s was removed", filepath.Base(path))
		}
	}
}

func TestTheCompareStepDropsARunAWeekOldWhateverTheCount(t *testing.T) {
	project := t.TempDir()
	diffs := filepath.ToSlash(comparerun.DiffFolder())
	old := putFile(t, project, diffs+"/T_0000000000000001.diff", 10, 8*24*time.Hour)
	recent := putFile(t, project, diffs+"/T_0000000000000002.diff", 10, 6*24*time.Hour)
	step := compareRetention(project)
	step.now = func() time.Time { return filesNow }
	if report := step.Run(context.Background(), func() bool { return false }); report.Err != nil || report.Removed != 1 {
		t.Fatalf("report = %+v", report)
	}
	if fileExists(old) || !fileExists(recent) {
		t.Fatalf("old kept %v, recent kept %v", fileExists(old), fileExists(recent))
	}
}

func TestTheFolderStepsStopAndToleranceNilsAndMissingFolders(t *testing.T) {
	project := t.TempDir()
	diffs := filepath.ToSlash(comparerun.DiffFolder())
	old := putFile(t, project, diffs+"/T_0000000000000001.diff", 10, 400*24*time.Hour)
	step := compareRetention(project)
	step.now = func() time.Time { return filesNow }

	if report := step.Run(context.Background(), func() bool { return true }); !report.Stopped || !fileExists(old) {
		t.Fatalf("told to stop: %+v, file kept %v", report, fileExists(old))
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if report := step.Run(cancelled, func() bool { return false }); !report.Stopped || !fileExists(old) {
		t.Fatalf("cancelled: %+v, file kept %v", report, fileExists(old))
	}
	if report := (folderRetention{name: "x", project: t.TempDir(), folder: "none", rule: compareRule}).Run(nil, nil); report.Err != nil || report.Stopped || report.FilesBefore != 0 { //nolint:staticcheck // a nil context is the point
		t.Fatalf("a folder that is not there, no stop, no context, no clock: %+v", report)
	}
}

// Opening a project removes a week-old Transcript Compare run and leaves its newer run, the narrator's decisions beside them and a preview.
func TestOpeningAProjectPrunesTheCompareFilesAndLeavesTheDecisionsAndPreviews(t *testing.T) {
	project := twoTakeCoverageProject(t)
	diffs := filepath.ToSlash(comparerun.DiffFolder())
	old := time.Now().Add(-8 * 24 * time.Hour)
	young := time.Now().Add(-time.Hour)
	var oldFiles, youngFiles []string
	for _, ext := range []string{".diff", ".manuscript.txt", ".recorded.txt"} {
		oldFiles = append(oldFiles, putStamped(t, project, diffs+"/Chapter_0000000000000001"+ext, old))
		youngFiles = append(youngFiles, putStamped(t, project, diffs+"/Chapter_0000000000000002"+ext, young))
	}
	decisions := putStamped(t, project, "TranscriptCompare/equivalences.csv", old)
	preview := putStamped(t, project, filepath.ToSlash(guide.PreviewFolder())+"/"+previewName(7), old)

	host := coverageHost(t, project, true, fakeAlignedCoverageSidecarWithSkip())
	waitForRetentionPass(t, host, "open")
	host.closeRetention()

	for _, path := range oldFiles {
		if fileExists(path) {
			t.Fatalf("%s, a week-old run's file, was kept", filepath.Base(path))
		}
	}
	for _, path := range append(youngFiles, decisions, preview) {
		if !fileExists(path) {
			t.Fatalf("%s was removed", filepath.Base(path))
		}
	}
}

func putStamped(t *testing.T, project, rel string, when time.Time) string {
	t.Helper()
	path := filepath.Join(project, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, when, when); err != nil {
		t.Fatal(err)
	}
	return path
}

// Previews dated in the future (a clock set back, a restored project) do not keep the cap out of reach: their file times are set to now,
// they are left alone for the guard period, and then they are the least recently used like any other.
func TestThePreviewStepMovesFutureFileTimesToNowSoTheCapIsMetAfterTheGuard(t *testing.T) {
	project := t.TempDir()
	folder := filepath.ToSlash(guide.PreviewFolder())
	real := time.Now()
	var future []string
	for i := range 3 {
		path := filepath.Join(project, filepath.FromSlash(folder), previewName(i))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, make([]byte, 400), 0o600); err != nil {
			t.Fatal(err)
		}
		when := real.Add(1000 * 24 * time.Hour)
		if err := os.Chtimes(path, when, when); err != nil {
			t.Fatal(err)
		}
		future = append(future, path)
	}
	ordinary := putFile(t, project, folder+"/"+previewName(9), 400, 0)
	if err := os.Chtimes(ordinary, real.Add(-time.Hour), real.Add(-time.Hour)); err != nil {
		t.Fatal(err)
	}
	step := previewRetention(project)
	step.rule.MaxBytes = 500
	step.now = func() time.Time { return real }
	if report := step.Run(context.Background(), func() bool { return false }); report.Err != nil || fileExists(ordinary) {
		t.Fatalf("first pass: %+v, ordinary kept %v; want the hour-old preview, the only one outside the guard, removed", report, fileExists(ordinary))
	}
	for _, path := range future {
		if !fileExists(path) {
			t.Fatal("a future-dated preview was removed inside the guard")
		}
	}
	// Eleven minutes later the three are the least recently used like any other, and the cap is met.
	step.now = func() time.Time { return real.Add(11 * time.Minute) }
	if report := step.Run(context.Background(), func() bool { return false }); report.Err != nil || report.BytesAfter > 500 {
		t.Fatalf("second pass: %+v; want the folder within the cap once the guard has passed", report)
	}
}

// A Transcript Compare run just written is not pushed out by older runs dated in the future: it is read right after it is written.
func TestTheCompareStepNeverRemovesTheRunJustWrittenWhenOthersAreDatedAhead(t *testing.T) {
	project := t.TempDir()
	diffs := filepath.ToSlash(comparerun.DiffFolder())
	real := time.Now()
	for i := range 20 {
		for _, ext := range []string{".diff", ".manuscript.txt", ".recorded.txt"} {
			path := filepath.Join(project, filepath.FromSlash(fmt.Sprintf("%s/Ahead_%016d%s", diffs, i+1, ext)))
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
				t.Fatal(err)
			}
			when := real.Add(2 * 24 * time.Hour)
			if err := os.Chtimes(path, when, when); err != nil {
				t.Fatal(err)
			}
		}
	}
	fresh := putStamped(t, project, diffs+"/Ch1_1763812800000000.diff", real.Add(-time.Second))
	step := compareRetention(project)
	step.now = func() time.Time { return real }
	if report := step.Run(context.Background(), func() bool { return false }); report.Err != nil || !fileExists(fresh) {
		t.Fatalf("report = %+v, run just written kept %v; want it left", report, fileExists(fresh))
	}
}
