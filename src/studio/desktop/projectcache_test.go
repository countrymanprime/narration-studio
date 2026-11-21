package main

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"desktop/internal/dawport/reaper"
	"desktop/internal/filetest"
	"desktop/internal/tracks"
)

// countingProjectReader parses with the real REAPER reader and counts how many times it was asked to (#3287).
type countingProjectReader struct{ parses atomic.Int64 }

func (c *countingProjectReader) ReadProject(path string) (tracks.Project, error) {
	c.parses.Add(1)
	return reaper.ProjectReader{}.ReadProject(path)
}

func (c *countingProjectReader) ParseProject(path string, raw []byte) (tracks.Project, error) {
	c.parses.Add(1)
	return reaper.ProjectReader{}.ParseProject(path, raw)
}

func TestAnUnchangedSavedProjectIsParsedOnce(t *testing.T) {
	savedProjects.reset()
	counter := &countingProjectReader{}
	withProjectReaderRole(t, counter)
	path := filepath.Join(t.TempDir(), "Book.rpp")
	if err := os.WriteFile(path, []byte(chapterTracksRpp), 0o600); err != nil {
		t.Fatal(err)
	}
	for range 5 {
		if _, err := readProject(path); err != nil {
			t.Fatal(err)
		}
	}
	if got := counter.parses.Load(); got != 1 {
		t.Fatalf("5 reads of an unchanged file parsed it %d times, want 1", got)
	}
}

func TestAChangedSavedProjectIsParsedAgain(t *testing.T) {
	savedProjects.reset()
	counter := &countingProjectReader{}
	withProjectReaderRole(t, counter)
	path := filepath.Join(t.TempDir(), "Book.rpp")
	write := func(body string, mtime time.Time) {
		t.Helper()
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(path, mtime, mtime); err != nil {
			t.Fatal(err)
		}
	}
	base := time.Now().Add(-time.Hour)
	write(chapterTracksRpp, base)
	read := func() {
		t.Helper()
		if _, err := readProject(path); err != nil {
			t.Fatal(err)
		}
	}
	read()
	write(chapterTracksRpp+"\n", base) // same time, new bytes
	read()
	if got := counter.parses.Load(); got != 2 {
		t.Fatalf("a file with new bytes is parsed again: parses = %d, want 2", got)
	}
}

func TestASavedProjectRewrittenAtTheSameSizeAndTimeIsParsedAgain(t *testing.T) {
	savedProjects.reset()
	counter := &countingProjectReader{}
	withProjectReaderRole(t, counter)
	path := filepath.Join(t.TempDir(), "Book.rpp")
	if err := os.WriteFile(path, []byte(chapterTracksRpp), 0o600); err != nil {
		t.Fatal(err)
	}
	firstTrack := func() string {
		t.Helper()
		project, err := readProject(path)
		if err != nil || len(project.Tracks) == 0 {
			t.Fatalf("project = %v, %v", project, err)
		}
		return project.Tracks[0].Name
	}
	if got := firstTrack(); got != "Chapter I" {
		t.Fatalf("first track = %q, want Chapter I", got)
	}
	filetest.RewriteInPlace(t, path, `NAME "Chapter I"`, `NAME "Chapter X"`)
	if got := firstTrack(); got != "Chapter X" {
		t.Fatalf("after a rewrite that kept the size and the time the first track is %q, want Chapter X", got)
	}
	if got := counter.parses.Load(); got != 2 {
		t.Fatalf("the rewritten file was parsed %d times in all, want 2", got)
	}
	if firstTrack(); counter.parses.Load() != 2 {
		t.Fatalf("the untouched file was parsed again: parses = %d, want 2", counter.parses.Load())
	}
}

func TestASavedProjectSavedAgainWithTheSameBytesIsNotParsedAgain(t *testing.T) {
	savedProjects.reset()
	counter := &countingProjectReader{}
	withProjectReaderRole(t, counter)
	path := filepath.Join(t.TempDir(), "Book.rpp")
	for _, age := range []time.Duration{-time.Hour, -time.Minute} {
		if err := os.WriteFile(path, []byte(chapterTracksRpp), 0o600); err != nil {
			t.Fatal(err)
		}
		saved := time.Now().Add(age)
		if err := os.Chtimes(path, saved, saved); err != nil {
			t.Fatal(err)
		}
		if _, err := readProject(path); err != nil {
			t.Fatal(err)
		}
	}
	if got := counter.parses.Load(); got != 1 {
		t.Fatalf("the same bytes at a newer modification time were parsed %d times, want 1", got)
	}
}

func TestAProjectThatFailsToParseIsNotKept(t *testing.T) {
	savedProjects.reset()
	fake := &fakeProjectReaderRole{err: os.ErrInvalid}
	withProjectReaderRole(t, fake)
	path := filepath.Join(t.TempDir(), "Book.rpp")
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := readProject(path); err == nil {
		t.Fatal("want the parse error")
	}
	fake.err = nil
	if _, err := readProject(path); err != nil {
		t.Fatalf("a later read of the same file must parse again, got %v", err)
	}
}

func TestTheHostParsesTheSavedProjectOnceAcrossItsCalls(t *testing.T) {
	savedProjects.reset()
	host, ids := newTestHostForChapterMatch(t)
	counter := &countingProjectReader{}
	withProjectReaderRole(t, counter)
	for range 3 {
		if _, err := host.ChapterTrackLinks(); err != nil {
			t.Fatal(err)
		}
		if _, err := host.TracksList(); err != nil {
			t.Fatal(err)
		}
		if _, err := host.ChapterTrackMatch(ids[0]); err != nil {
			t.Fatal(err)
		}
		if _, err := host.ManuscriptChapters(); err != nil {
			t.Fatal(err)
		}
	}
	if got := counter.parses.Load(); got != 1 {
		t.Fatalf("12 host calls on one unchanged .rpp parsed it %d times, want 1", got)
	}
}

func TestACachedProjectSeesAnAudioFileThatWentMissing(t *testing.T) {
	savedProjects.reset()
	host, _ := newTestHostForChapterMatch(t)
	folder := host.config.projectFolder
	path := filepath.Join(folder, "Alice.rpp")
	media := filepath.Join(folder, "media", "ch1.wav")
	available := func() bool {
		project, err := readProject(path)
		if err != nil {
			t.Fatal(err)
		}
		for _, track := range project.Tracks {
			for _, item := range track.Items {
				if item.SourceFile == media {
					return item.SourceAvailable
				}
			}
		}
		t.Fatal("the item is not in the project")
		return false
	}
	if !available() {
		t.Fatal("the audio file exists, so the item should be available")
	}
	if err := os.Remove(media); err != nil {
		t.Fatal(err)
	}
	if available() {
		t.Fatal("the audio file is gone, but the cached project still says it is there")
	}
}

func TestACallerThatWritesIntoItsProjectDoesNotChangeTheCachedOne(t *testing.T) {
	savedProjects.reset()
	withProjectReaderRole(t, &countingProjectReader{})
	path := filepath.Join(t.TempDir(), "Book.rpp")
	if err := os.WriteFile(path, []byte(chapterTracksRpp), 0o600); err != nil {
		t.Fatal(err)
	}
	first, err := readProject(path) // the miss
	if err != nil || len(first.Tracks) == 0 {
		t.Fatalf("first = %v, %v", first, err)
	}
	want := first.Tracks[0].Name
	first.Tracks[0].Name = "HACKED"
	second, _ := readProject(path) // the hit
	second.Tracks[0].Name = "HACKED TOO"
	if third, _ := readProject(path); third.Tracks[0].Name != want {
		t.Fatalf("a later read saw %q, want %q", third.Tracks[0].Name, want)
	}
}

func TestAParseInFlightDoesNotBlockCachedReadsOfOtherProjects(t *testing.T) {
	cache := &projectCache{}
	dir := t.TempDir()
	a, b := filepath.Join(dir, "A.rpp"), filepath.Join(dir, "B.rpp")
	for _, p := range []string{a, b} {
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	fast := func(string, []byte) (tracks.Project, error) { return tracks.Project{}, nil }
	if _, err := cache.read(b, fast); err != nil {
		t.Fatal(err)
	}
	release, started := make(chan struct{}), make(chan struct{})
	t.Cleanup(func() { close(release) })
	go func() {
		_, _ = cache.read(a, func(string, []byte) (tracks.Project, error) {
			close(started)
			<-release
			return tracks.Project{}, nil
		})
	}()
	<-started
	done := make(chan struct{})
	go func() { _, _ = cache.read(b, fast); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("a cached read of B waited for the parse of A")
	}
}
