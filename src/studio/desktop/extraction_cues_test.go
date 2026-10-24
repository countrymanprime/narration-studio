package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"sync/atomic"
	"testing"
	"time"

	"desktop/internal/extractionport"
	"desktop/internal/guide"
	"desktop/internal/manuscript"
)

// cueSeam counts the refreshes and answers each with counts and err.
func cueSeam(host *Host, counts guide.CueCounts, err error) *atomic.Int32 {
	calls := &atomic.Int32{}
	host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) {
		calls.Add(1)
		return counts, err
	}
	return calls
}

func TestAScanEndsByWritingTheDialogueCues(t *testing.T) {
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: offers(&scanLog{}, "rules")})
	calls := cueSeam(host, guide.CueCounts{Cues: 12, Attributed: 5}, nil)
	decodeScanJob(t)(host.ExtractionScan(nil))
	nextJobEnd(t, events)
	job := waitScan(t, host)
	if calls.Load() != 1 || job.Phase != "success" || !slices.Contains(job.Logs, "Found 12 quoted lines; 5 with a speaker.") {
		t.Fatalf("calls %d, job %+v", calls.Load(), job)
	}
}

func TestACueFailureIsLoggedAndDoesNotFailTheScan(t *testing.T) {
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: offers(&scanLog{}, "rules")})
	cueSeam(host, guide.CueCounts{}, errors.New("Import a manuscript first."))
	decodeScanJob(t)(host.ExtractionScan(nil))
	nextJobEnd(t, events)
	job := waitScan(t, host)
	if job.Phase != "success" || !slices.Contains(job.Logs, "Could not find the quoted lines: Import a manuscript first.") {
		t.Fatalf("job %+v", job)
	}
}

func TestACancelledOrFailedScanWritesNoCues(t *testing.T) {
	g := newGate()
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: g.extract()})
	calls := cueSeam(host, guide.CueCounts{}, nil)
	decodeScanJob(t)(host.ExtractionScan(nil))
	waitGate(t, g.started, "the extract")
	if _, err := host.ExtractionScanCancel(); err != nil {
		t.Fatal(err)
	}
	nextJobEnd(t, events)
	host, _, events = scanHost(t, scanSource{name: extractionport.Rules, runs: true,
		extract: func(context.Context, extractionport.Input) ([]extractionport.Raw, error) {
			return nil, errors.New("broken")
		}})
	host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) { calls.Add(1); return guide.CueCounts{}, nil }
	decodeScanJob(t)(host.ExtractionScan(nil))
	nextJobEnd(t, events)
	if calls.Load() != 0 {
		t.Fatalf("cues were written %d times", calls.Load())
	}
}

func TestCuesSentence(t *testing.T) {
	for want, counts := range map[string]guide.CueCounts{
		"Found 0 quoted lines; 0 with a speaker.": {},
		"Found 1 quoted line; 1 with a speaker.":  {Cues: 1, Attributed: 1},
	} {
		if got := cuesSentence(counts, nil); got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
	}
}

func TestASuccessfulImportWritesTheDialogueCues(t *testing.T) {
	host := &Host{}
	done := make(chan struct{}, 2)
	host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) {
		done <- struct{}{}
		return guide.CueCounts{}, nil
	}
	host.importJobEnded(manuscript.ImportJob{ID: "failed", Phase: "error"})
	host.importJobEnded(manuscript.ImportJob{ID: "ok", Phase: "success"})
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("the import wrote no cues")
	}
	select {
	case <-done:
		t.Fatal("a failed import wrote cues")
	case <-time.After(50 * time.Millisecond):
	}
}

// speakerHost is a host whose Story Bible has Ada (a Character, in c1 and c2) and the Spire (a Place, in c3), and whose cue refreshes
// are sent, as their chapter ids, on the channel it returns.
func speakerHost(t *testing.T) (*Host, chan []string) {
	t.Helper()
	project := t.TempDir()
	svc := guide.New(project, "", "", nil, nil)
	path := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	document := `{"entities":[
		{"id":"ada","canonical_name":"Ada","category":"Character","occurrences":[{"chapterId":"c1"}],"aliases":[{"text":"Lady Ada","occurrences":[{"chapterId":"c2"}]}]},
		{"id":"spire","canonical_name":"Spire","category":"Place","occurrences":[{"chapterId":"c3"}],"aliases":[]}]}`
	if err := os.WriteFile(path, []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	refreshed := make(chan []string, 4)
	host := &Host{guide: svc}
	host.refreshCues = func(_ context.Context, chapterIDs ...string) (guide.CueCounts, error) {
		refreshed <- chapterIDs
		return guide.CueCounts{}, nil
	}
	return host, refreshed
}

func nextRefresh(t *testing.T, refreshed chan []string) []string {
	t.Helper()
	select {
	case chapters := <-refreshed:
		return chapters
	case <-time.After(10 * time.Second):
		t.Fatal("no cue refresh")
		return nil
	}
}

func noRefresh(t *testing.T, refreshed chan []string) {
	t.Helper()
	select {
	case chapters := <-refreshed:
		t.Fatalf("an unexpected cue refresh of %v", chapters)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestFilingAnEntryUnderOrOutOfASpeakingTypeRefreshesItsChapters(t *testing.T) {
	host, refreshed := speakerHost(t)
	if _, err := host.GuideEdit("spire", map[string]string{"category": "Character"}); err != nil {
		t.Fatal(err)
	}
	if got := nextRefresh(t, refreshed); !slices.Equal(got, []string{"c3"}) {
		t.Fatalf("filed under Character: refreshed %v", got)
	}
	if _, err := host.GuideEdit("ada", map[string]string{"category": "Place"}); err != nil {
		t.Fatal(err)
	}
	if got := nextRefresh(t, refreshed); !slices.Equal(got, []string{"c1", "c2"}) {
		t.Fatalf("filed out of Character: refreshed %v", got)
	}
	noRefresh(t, refreshed)
}

func TestAnEditThatFilesNoSpeakerRefreshesNothing(t *testing.T) {
	host, refreshed := speakerHost(t)
	if _, err := host.GuideEdit("ada", map[string]string{"context": "A navigator."}); err != nil {
		t.Fatal(err)
	}
	if _, err := host.GuideEdit("spire", map[string]string{"category": "Lore"}); err != nil {
		t.Fatal(err)
	}
	if _, err := host.GuideEdit("spire", map[string]string{"category": "No such type"}); err == nil {
		t.Fatal("an unknown type was accepted")
	}
	noRefresh(t, refreshed)
}

func TestDeletingASpeakerRefreshesItsChapters(t *testing.T) {
	host, refreshed := speakerHost(t)
	if _, err := host.GuideDelete("spire"); err != nil {
		t.Fatal(err)
	}
	noRefresh(t, refreshed)
	if _, err := host.GuideDelete("ada"); err != nil {
		t.Fatal(err)
	}
	if got := nextRefresh(t, refreshed); !slices.Equal(got, []string{"c1", "c2"}) {
		t.Fatalf("refreshed %v", got)
	}
}

func TestANewSpeakerRefreshesItsChapters(t *testing.T) {
	host, refreshed := speakerHost(t)
	host.refreshSpeakerCues(speakerSnapshot{}, "ada") // what GuideCreate does once the entry is written
	if got := nextRefresh(t, refreshed); !slices.Equal(got, []string{"c1", "c2"}) {
		t.Fatalf("refreshed %v", got)
	}
	host.refreshSpeakerCues(speakerSnapshot{}, "spire")
	noRefresh(t, refreshed)
}

func TestATypeThatStartsSpeakingRefreshesEveryChapter(t *testing.T) {
	host, refreshed := speakerHost(t)
	if _, err := host.GuideTypeSetSpeaks("Place", true); err != nil {
		t.Fatal(err)
	}
	if got := nextRefresh(t, refreshed); len(got) != 0 {
		t.Fatalf("refreshed %v, want every chapter", got)
	}
	if _, err := host.GuideTypeSetSpeaks("Nope", true); err == nil {
		t.Fatal("an unknown type was accepted")
	}
	noRefresh(t, refreshed)
}
