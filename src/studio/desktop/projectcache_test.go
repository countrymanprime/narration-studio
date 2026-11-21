package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"desktop/internal/dawport/audacity"
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
	rpp := strings.Replace(chapterTracksRpp, "\n", "\n  MARKER 1 0 \"Chapter I\" 1\n  MARKER 1 10 \"\" 1\n  MARKER 2 4 \"PICKUP: a line\" 0\n", 1)
	if err := os.WriteFile(path, []byte(rpp), 0o600); err != nil {
		t.Fatal(err)
	}
	first, err := readProject(path) // the miss
	if err != nil || len(first.Tracks) == 0 || len(first.Regions) != 1 || len(first.Markers) != 1 {
		t.Fatalf("first = %v, %v", first, err)
	}
	want := [3]string{first.Tracks[0].Name, first.Regions[0].Name, first.Markers[0].Name}
	hack := func(project tracks.Project, name string) {
		project.Tracks[0].Name, project.Regions[0].Name, project.Markers[0].Name = name, name, name
	}
	hack(first, "HACKED")
	second, _ := readProject(path) // the hit
	hack(second, "HACKED TOO")
	third, _ := readProject(path)
	if got := [3]string{third.Tracks[0].Name, third.Regions[0].Name, third.Markers[0].Name}; got != want {
		t.Fatalf("a later read saw the track, region and marker %q, want %q", got, want)
	}
}

// recordingProjectParser is a role with a byte parser that records what it was given.
type recordingProjectParser struct {
	raw       []byte
	pathReads int
}

func (r *recordingProjectParser) ReadProject(string) (tracks.Project, error) {
	r.pathReads++
	return tracks.Project{}, nil
}

func (r *recordingProjectParser) ParseProject(_ string, raw []byte) (tracks.Project, error) {
	r.raw = raw
	return tracks.Project{}, nil
}

func TestTheReaderParsesTheBytesThatWereHashed(t *testing.T) {
	savedProjects.reset()
	recorder := &recordingProjectParser{}
	withProjectReaderRole(t, recorder)
	path := filepath.Join(t.TempDir(), "Book.rpp")
	if err := os.WriteFile(path, []byte(chapterTracksRpp), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := readProject(path); err != nil {
		t.Fatal(err)
	}
	if string(recorder.raw) != chapterTracksRpp || recorder.pathReads != 0 {
		t.Fatalf("the reader got %d bytes and %d reads by path, want the file's %d bytes and none", len(recorder.raw), recorder.pathReads, len(chapterTracksRpp))
	}
}

func TestTheCacheHoldsTheLastFourProjects(t *testing.T) {
	cache := &projectCache{}
	dir := t.TempDir()
	parses := map[string]int{}
	read := func(name string) int {
		t.Helper()
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(name), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := cache.read(path, func(string, []byte) (tracks.Project, bool, error) {
			parses[name]++
			return tracks.Project{}, true, nil
		}); err != nil {
			t.Fatal(err)
		}
		return parses[name]
	}
	names := []string{"1.rpp", "2.rpp", "3.rpp", "4.rpp", "5.rpp"}
	for _, name := range names {
		read(name)
	}
	if got := len(cache.entries); got != 4 {
		t.Fatalf("after five projects the cache holds %d, want 4", got)
	}
	// Newest first: the read of the first project at the end puts the second one out, which nothing asks for afterwards.
	for _, name := range []string{"5.rpp", "4.rpp", "3.rpp", "2.rpp"} {
		if got := read(name); got != 1 {
			t.Fatalf("%s is one of the last four, but it was parsed %d times, want 1", name, got)
		}
	}
	if got := read("1.rpp"); got != 2 {
		t.Fatalf("the first of five projects was parsed %d times, want 2 (it was put out)", got)
	}
}

func TestAnOversizedProjectFileIsRefusedWithoutBeingRead(t *testing.T) {
	cache := &projectCache{}
	path := filepath.Join(t.TempDir(), audacity.SnapshotFile)
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(path, maxCachedProjectBytes+1); err != nil { // sparse: nothing is written
		t.Fatal(err)
	}
	var given []byte
	asked := ""
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	_, err := cache.read(path, func(path string, raw []byte) (tracks.Project, bool, error) {
		asked, given = path, raw
		return parseProject(path, raw)
	})
	runtime.ReadMemStats(&after)
	if asked != path || given != nil {
		t.Fatalf("the reader was given %q and %d bytes, want the path and no bytes", asked, len(given))
	}
	if want := fmt.Sprintf("the Audacity snapshot is too large to read (%d bytes)", maxCachedProjectBytes+1); err == nil || err.Error() != want {
		t.Fatalf("err = %v, want the reader's own refusal %q", err, want)
	}
	if len(cache.entries) != 0 {
		t.Fatalf("the cache kept %d entries for a file it did not read", len(cache.entries))
	}
	if allocated := after.TotalAlloc - before.TotalAlloc; allocated > 1<<20 {
		t.Fatalf("refusing the file allocated %d bytes, want under 1 MB", allocated)
	}
}

func TestAPathOnlyReaderIsNotKeptUnderBytesItDidNotParse(t *testing.T) {
	savedProjects.reset()
	t.Cleanup(savedProjects.reset)
	reader := &pathOnlyProjectReader{}
	withProjectReaderRole(t, reader)
	path := filepath.Join(t.TempDir(), "Book.rpp")
	if err := os.WriteFile(path, []byte(chapterTracksRpp), 0o600); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err := readProject(path); err != nil {
			t.Fatal(err)
		}
	}
	if reader.reads != 2 || len(savedProjects.entries) != 0 {
		t.Fatalf("a reader with no byte parser read an unchanged file %d times and %d parses were kept, want 2 and none", reader.reads, len(savedProjects.entries))
	}
}

// pathOnlyProjectReader is a role that only reads by path: it has no ParseProject.
type pathOnlyProjectReader struct{ reads int }

func (r *pathOnlyProjectReader) ReadProject(string) (tracks.Project, error) {
	r.reads++
	return tracks.Project{}, nil
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
	fast := func(string, []byte) (tracks.Project, bool, error) { return tracks.Project{}, true, nil }
	if _, err := cache.read(b, fast); err != nil {
		t.Fatal(err)
	}
	release, started := make(chan struct{}), make(chan struct{})
	t.Cleanup(func() { close(release) })
	go func() {
		_, _ = cache.read(a, func(string, []byte) (tracks.Project, bool, error) {
			close(started)
			<-release
			return tracks.Project{}, true, nil
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
