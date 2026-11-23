package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"desktop/internal/brand"
	"desktop/internal/coverage"
	"desktop/internal/evidence"
	"desktop/internal/findings"
	"desktop/internal/guide"
	"desktop/internal/process"
	"desktop/internal/project"
	"desktop/internal/scriptprep"
)

// perfBook says what seedPerfBook writes: a book the size of a real one, with what a narrator's work leaves beside it. The
// sizes docs/research/performance-architecture-2026-11.md measures are 3, 44 and 103 chapters of 40 paragraphs (1, 17 and 40
// hours at 9,000 words an hour) and 300 chapters of 6.
type perfBook struct {
	Chapters   int // chapters, each linked to a track of its own
	Paragraphs int // paragraphs a chapter, of about 88 words each
	Items      int // takes on each chapter's track
	Tracks     int // extra empty tracks after the chapters'
	Checked    int // chapters with a recording check, from the first
	Checks     int // complete checks of each checked chapter; every one leaves a ledger record and a stored result
	Audio      int // minutes of recording in each chapter's own 48 kHz 24-bit WAV; 0 keeps the one shared 2 s file (#4042)
}

// perfBookSpecEnv and perfBookDirEnv turn TestSeedAPerfBook on: the folder to write and what to put in it.
const (
	perfBookDirEnv  = "NARRATION_PERF_BOOK"
	perfBookSpecEnv = "NARRATION_PERF_SEED"
)

// parsePerfBook reads "chapters=44 paragraphs=40 items=100 tracks=20 checked=10 checks=2". What is left out is 40
// paragraphs, 100 items, no extra tracks, every chapter checked, once.
func parsePerfBook(spec string) (perfBook, error) {
	book := perfBook{Paragraphs: 40, Items: 100, Checked: -1, Checks: 1}
	fields := map[string]*int{
		"chapters": &book.Chapters, "paragraphs": &book.Paragraphs, "items": &book.Items,
		"tracks": &book.Tracks, "checked": &book.Checked, "checks": &book.Checks, "audio": &book.Audio,
	}
	for _, pair := range strings.Fields(spec) {
		name, value, _ := strings.Cut(pair, "=")
		field, known := fields[name]
		number, err := strconv.Atoi(value)
		if !known || err != nil || number < 0 {
			return perfBook{}, fmt.Errorf("%q is not one of chapters, paragraphs, items, tracks, checked, checks, audio with a whole number", pair)
		}
		*field = number
	}
	if book.Chapters < 1 || book.Paragraphs < 1 || book.Items < 1 {
		return perfBook{}, fmt.Errorf("a book needs at least one chapter, one paragraph a chapter and one item a track: %q", spec)
	}
	if book.Checked < 0 || book.Checked > book.Chapters {
		book.Checked = book.Chapters
	}
	return book, nil
}

func perfGUID(n int) string      { return fmt.Sprintf("{A0000000-0000-4000-8000-%012d}", n) }
func perfChapterID(n int) string { return fmt.Sprintf("c-%04d", n+1) }

// perfFirstNames and perfSurnames name the people of the seeded book: 625 of them before a name repeats.
var (
	perfFirstNames = strings.Fields("Mara Tobias Ingrid Felix Odette Harlan Wren Lucian Greta Anselm Petra Corin Isolde Jasper Linnea Marek Noor Osric Paloma Quentin Rosalind Stellan Tamsin Ulric Vesna")
	perfSurnames   = strings.Fields("Ellison Reed Solberg Navarro Laurent Pike Calloway Ashdown Brennick Castellan Dunmore Everhart Fairweather Galloway Hartwell Ivers Jarrow Kestrel Lindqvist Marchetti Northcott Okafor Pemberton Quill Rookwood")
)

// perfVocabulary is the words of the seeded prose: enough of them, drawn in no repeating order, that the aligner places a
// read of a chapter where it belongs. (The 19 words in a fixed cycle that scripts/dev/real-app/seed.py writes align in many
// places at once, and a word-for-word read of them scores about 70 % present.)
var perfVocabulary = strings.Fields(`the narrator walked slowly through quiet streets while morning light settled over old brick walls and she
	remembered everything a river ran below bridge where children once played with paper boats until evening bells called them home across
	wet fields of barley his letter arrived late in winter folded twice inside grey envelope that smelled faintly smoke nobody spoke at
	table because rain kept falling against tall windows their garden had grown wild behind iron gate yet roses still opened every june
	under patient sun we carried lanterns down narrow stairs into cellar full dusty bottles forgotten names somewhere distant train crossed
	valley its whistle thin as thread pulled tight between two hills when night came silver moon rose above harbour boats rocked gently
	beside wooden pier sailors sang songs about faraway islands green water white birds circling high cliffs`)

// perfParagraph is one paragraph of 88 pseudo-words in sentences of twelve. Every fourth is a quoted line with a named speaker,
// a new person every second line, so the Story Bible build finds about five characters and ten dialogue cues in a chapter of
// 40 paragraphs.
func perfParagraph(seed int) string {
	words := make([]string, 88)
	state := uint32(seed)*2654435761 + 1
	for i := range words {
		state = state*1664525 + 1013904223 // a fixed sequence for each paragraph, so a book seeds the same every time
		words[i] = perfVocabulary[int(state>>16)%len(perfVocabulary)]
		if (i+1)%12 == 0 {
			words[i] += "."
		}
	}
	text := strings.Join(words, " ")
	if seed%4 != 3 {
		return text
	}
	person := seed / 8
	speaker := perfFirstNames[person%len(perfFirstNames)] + " " + perfSurnames[person/len(perfFirstNames)%len(perfSurnames)]
	return fmt.Sprintf("\u201cWe walked through the quiet streets and remembered everything,\u201d said %s. %s", speaker, text)
}

// perfAudioRate is the sample rate of a seeded chapter recording: a studio's 48 kHz, mono, 24-bit.
const perfAudioRate = 48000

// writeSparseWAV writes a silent mono 24-bit WAV of seconds at rate without writing its zeros: the header, then a hole the
// file system reads back as silence, so an hour of recording costs a header on disk and the full decode on read.
func writeSparseWAV(path string, rate, seconds int) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	dataBytes := rate * 3 * seconds
	header := make([]byte, 44)
	copy(header, "RIFF")
	putLE32(header[4:], uint32(36+dataBytes)) //nolint:gosec // G115: a few hundred MB at most
	copy(header[8:], "WAVEfmt ")
	putLE32(header[16:], 16)
	putLE16(header[20:], 1)
	putLE16(header[22:], 1)
	putLE32(header[24:], uint32(rate))   //nolint:gosec // G115: a sample rate
	putLE32(header[28:], uint32(rate*3)) //nolint:gosec // G115: a byte rate
	putLE16(header[32:], 3)
	putLE16(header[34:], 24)
	copy(header[36:], "data")
	putLE32(header[40:], uint32(dataBytes)) //nolint:gosec // G115: a few hundred MB at most
	file, err := os.Create(path)            //nolint:gosec // G304: a path the rig builds under its own folder
	if err != nil {
		return err
	}
	if _, err := file.Write(header); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Truncate(int64(44 + dataBytes)); err != nil {
		_ = file.Close()
		return err
	}
	return file.Close()
}

// writePerfBookBase writes what scripts/dev/real-app/seed.py --chapters writes, in Go so the tests need no Python: the
// manuscript, Book.rpp with one track of items per chapter, the project's link to it and each chapter's link to its track.
func writePerfBookBase(dir string, book perfBook) error {
	type chapter struct {
		ID        string   `json:"id"`
		Title     string   `json:"title"`
		Subtitle  *string  `json:"subtitle"`
		Index     int      `json:"index"`
		WordCount int      `json:"wordCount"`
		Sections  []string `json:"sections"`
	}
	type paragraph struct {
		ID           string  `json:"id"`
		Index        int     `json:"index"`
		ChapterID    string  `json:"chapterId"`
		ChapterTitle string  `json:"chapterTitle"`
		SectionID    *string `json:"sectionId"`
		Text         string  `json:"text"`
		SourceIndex  int     `json:"sourceIndex"`
	}
	const documentID = "perf-book"
	chapters, paragraphs := []chapter{}, []paragraph{}
	var rpp strings.Builder
	rpp.WriteString("<REAPER_PROJECT 0.1 \"7.0\" 0\n  RECORD_PATH \"Media\" \"\"\n")
	item := 0
	for c := range book.Chapters {
		title := fmt.Sprintf("Chapter %d", c+1)
		words := 0
		for p := range book.Paragraphs {
			n := c*book.Paragraphs + p
			text := perfParagraph(n)
			words += len(strings.Fields(text))
			paragraphs = append(paragraphs, paragraph{ID: fmt.Sprintf("p-%06d", n+1), Index: p, ChapterID: perfChapterID(c), ChapterTitle: title, Text: text, SourceIndex: n})
		}
		chapters = append(chapters, chapter{ID: perfChapterID(c), Title: title, Index: c, WordCount: words, Sections: []string{}})
		fmt.Fprintf(&rpp, "  <TRACK %s\n    TRACKID %s\n    NAME %q\n    ISBUS 0 0\n", perfGUID(c+1), perfGUID(c+1), title)
		// Each take plays its own five seconds of the one shared file: the words a check hears are kept by source and played
		// range, so takes that all played the same range would share one set of words.
		file, span := "Media/take.wav", 1<<30
		if book.Audio > 0 { // the chapter's own recording: each take plays 5 s of it, wrapping when the book has more takes than the recording has fives
			file, span = fmt.Sprintf("Media/chapter-%04d.wav", c+1), book.Audio*60-5
			if err := writeSparseWAV(filepath.Join(dir, filepath.FromSlash(file)), perfAudioRate, book.Audio*60); err != nil {
				return err
			}
		}
		for k := range book.Items {
			fmt.Fprintf(&rpp, "    <ITEM\n      POSITION %d\n      LENGTH 5\n      IGUID %s\n      NAME \"take-%d\"\n      SOFFS %d\n      PLAYRATE 1 1 0 -1 0 0.0025\n      GUID %s\n      <SOURCE WAVE\n        FILE %q\n      >\n    >\n",
				5*k, perfGUID(1_000_000+item), item, (5*k)%span, perfGUID(5_000_000+item), file)
			item++
		}
		rpp.WriteString("  >\n")
	}
	for e := range book.Tracks {
		n := book.Chapters + 1 + e
		fmt.Fprintf(&rpp, "  <TRACK %s\n    TRACKID %s\n    NAME \"Extra %d\"\n    ISBUS 0 0\n  >\n", perfGUID(n), perfGUID(n), e+1)
	}
	rpp.WriteString(">\n")

	manuscript, err := json.Marshal(map[string]any{
		"schemaVersion": 1, "documentId": documentID, "importedAt": "2026-01-01T00:00:00+00:00",
		// As an import from Markdown writes them: the page refuses a book whose format and source name it cannot read.
		"importer": map[string]any{"format": "markdown", "version": 1},
		"source":   map[string]any{"fileName": "perf-book.md", "sha256": strings.Repeat("0", 64), "storedPath": "manuscript/sources/perf-book.md"},
		"chapters": chapters, "paragraphs": paragraphs,
	})
	if err != nil {
		return err
	}
	rppPath := filepath.Join(dir, "Book.rpp")
	files := map[string][]byte{
		filepath.Join(dir, brand.ProjectFolder, "manuscript", "manuscript.json"): manuscript,
		filepath.Join(dir, "Media", "take.wav"):                                  silentWAV(22050), // 2 s of silence every seeded take shares; a real REAPER opens it
		rppPath:                                                                  []byte(rpp.String()),
	}
	for path, content := range files {
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			return err
		}
		if err := os.WriteFile(path, content, 0o600); err != nil {
			return err
		}
	}
	link, err := project.BuildDawLink(dir, rppPath)
	if err != nil {
		return err
	}
	decided := time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC)
	manifest := project.New("", decided)
	manifest.DawProjectFile, manifest.ChapterSync = &link, &project.ChapterSync{DecidedAt: decided}
	if err := manifest.Save(dir); err != nil {
		return err
	}
	links := evidence.NewMappingStore(dir)
	for c, chapter := range chapters {
		if _, err := links.Confirm(documentID, perfGUID(c+1), chapter.ID, chapter.Title); err != nil {
			return err
		}
	}
	return nil
}

// wordPerTokenSidecar stands in for `compare.py --coverage`: it "hears" the chapter exactly as written, one word a token,
// spread evenly over the chapter's items. The host's own aligner then scores those words, so the ledger record and the
// stored result go through the real write path and come out the size a clean read of the chapter would leave.
func wordPerTokenSidecar(_ context.Context, _ string, args ...string) (coverage.Child, error) {
	values := map[string]string{}
	for i := 0; i+1 < len(args); i++ {
		if strings.HasPrefix(args[i], "--") {
			values[args[i]] = args[i+1]
		}
	}
	child := &coverageChild{}
	func() { // the sidecar has finished by the time the host first looks: the watch waits out no poll (gapSidecar does the same)
		code := 0
		if err := hearTheChapter(values); err != nil {
			code = 1
			_ = os.WriteFile(values["--progress"], []byte("ERROR|0|"+err.Error()+"\n"), 0o600)
		} else {
			_ = os.WriteFile(values["--progress"], []byte("DONE|100|Finished\n"), 0o600)
		}
		child.mu.Lock()
		child.code = &code
		child.mu.Unlock()
	}()
	return child, nil
}

// hearTheChapter writes a words file for each unmuted manifest item and the words report that lists them.
func hearTheChapter(values map[string]string) error {
	var manifest coverage.Manifest
	var book struct {
		Paragraphs []struct{ ChapterID, Text string }
	}
	for path, into := range map[string]any{values["--manifest"]: &manifest, values["--manuscript"]: &book} {
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(raw, into); err != nil {
			return err
		}
	}
	var words []string
	for _, paragraph := range book.Paragraphs {
		if paragraph.ChapterID == values["--chapter-id"] {
			words = append(words, strings.Fields(paragraph.Text)...)
		}
	}
	var heard []coverage.ManifestItem
	for _, item := range manifest.Items {
		if !item.Muted {
			heard = append(heard, item)
		}
	}
	var report strings.Builder
	for n, item := range heard {
		mine := words[len(words)*n/len(heard) : len(words)*(n+1)/len(heard)]
		timed := make([][]any, len(mine))
		for w, word := range mine {
			at := item.StartOffset + item.Length*float64(w)/float64(len(mine)+1)
			timed[w] = []any{word, at, at + item.Length/float64(2*len(mine)+2)}
		}
		file, err := json.Marshal(map[string]any{
			"schemaVersion": 1, "sourceStart": item.StartOffset, "sourceEnd": item.StartOffset + item.Length, "words": timed,
			"transcription": map[string]any{"model": values["--model"], "language": "en", "hotwordsHash": nil, "vadFilter": true},
		})
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(values["--words-dir"], item.WordsFile), file, 0o600); err != nil {
			return err
		}
		fmt.Fprintf(&report, "COVERAGE_WORDS|{\"index\":%d,\"itemGuid\":%q,\"words\":\"transcribed\"}\n", item.Index, item.ItemGUID)
	}
	return os.WriteFile(values["--out"], []byte(report.String()), 0o600)
}

// perfHost is a host over the project in dir, built the way ServiceStartup builds one but without its background loops: a
// Whisper catalog with the default model installed, the word-per-token sidecar for recording checks and no other sidecar.
func perfHost(t *testing.T, dir string) *Host {
	t.Helper()
	home := t.TempDir()
	for _, name := range []string{"LOCALAPPDATA", "USERPROFILE", "HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME"} {
		t.Setenv(name, home)
	}
	t.Setenv(fakeGuideCountEnv, filepath.Join(t.TempDir(), "guide-calls.jsonl"))
	models := whisperWithSmall(t, true)
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	host.coverageLauncher = wordPerTokenSidecar
	host.assets = newAssetRegistry(t.TempDir(), nil, models, nil, nil)
	next := host.config
	next.projectFolder = dir
	next.manuscriptPython = "unused-python"
	next.comparePython, next.compareBackend = "python-sidecar", "compare.py"
	next.teleprompterPython = "unused-python"
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	// As coverageHostWithAligner: wait for the runs and the reads a finished check starts before the folders go.
	t.Cleanup(func() {
		if svc := host.services(); svc.coverage != nil {
			svc.coverage.Wait()
		}
		host.chapterSyncEmits.Wait()
	})
	return host
}

// seedPerfBook writes book into dir: the base files, then through a host over them a recording check for each checked
// chapter, a Story Bible, findings at about 40 per 1,000 words with 45 % decided, marks at about 15 per 1,000 words, a
// pickup list and script prep. Everything after the base goes through the code the app writes it with.
func seedPerfBook(t *testing.T, dir string, book perfBook) {
	t.Helper()
	if err := writePerfBookBase(dir, book); err != nil {
		t.Fatal(err)
	}
	host := perfHost(t, dir)
	must := func(_ string, err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	for range book.Checks {
		for c := range book.Checked {
			answer, err := host.CoverageStart(perfChapterID(c), nil)
			if err != nil || !strings.Contains(answer, `"status":"started"`) {
				t.Fatalf("the check of %s did not start: %s %v", perfChapterID(c), answer, err)
			}
			host.services().coverage.Wait()
		}
	}
	if results, _ := filepath.Glob(filepath.Join(dir, brand.ProjectFolder, "analysis", "coverage", "results", "*.json")); len(results) != book.Checked*book.Checks {
		t.Fatalf("%d stored results, want %d: a check did not finish complete", len(results), book.Checked*book.Checks)
	}
	// The Story Bible is built by a service of its own, as countingGuideIn's: the host's would run the developer's real sidecar when
	// the checkout has a .venv, and this test binary answers the build's pronunciation lookups without one.
	sidecars := process.NewSupervisor()
	t.Cleanup(func() { _ = sidecars.Close() })
	must(guide.New(dir, os.Args[0], "", host.services().settings, sidecars).Build("", "", guide.RulesOnly))
	seedPerfFindings(t, host.services().findings, book)

	marks := []string{"stress", "breath", "pace", "emo", "note"}
	for c := range book.Chapters {
		for p := range book.Paragraphs {
			n := c*book.Paragraphs + p
			// 4 marks in every 3 paragraphs of 88 words is 15 per 1,000 words.
			for m := range 1 + (n%3)/2 {
				must(host.MarksAdd(perfChapterID(c), fmt.Sprintf("p-%06d", n+1), 10*m, 10*m+3, marks[(n+m)%len(marks)], ""))
			}
		}
		// A pickup the narrator added in one chapter of eight: adding one builds the whole pickup list, the slowest read there is.
		if c%8 == 0 {
			must(host.PickupsAdd(perfChapterID(c), 12.5, "Read this line again, slower"))
		}
		must(host.ScriptPrepSetChapter(perfChapterID(c), []string{scriptprep.PrepPrepped, scriptprep.PrepProgress, scriptprep.PrepNone}[c%3]))
	}
	// A finished check starts a chapter sync read of its own; none may still be running when a caller counts a read's work.
	host.chapterSyncEmits.Wait()
}

// seedPerfFindings saves 3 or 4 findings for each paragraph (about 40 per 1,000 words), 45 in 100 of them decided. The
// decisions are recorded first: a decision on a finding the store does not hold yet is kept for the save that brings it,
// and recording it then does not search the whole book's findings for each one.
func seedPerfFindings(t *testing.T, store *findings.Store, book perfBook) {
	t.Helper()
	categories := []findings.Category{findings.CategoryTranscriptDiscrepancy, findings.CategoryPronunciation, findings.CategoryPacing, findings.CategoryPickup}
	statuses := []findings.Status{findings.StatusAccepted, findings.StatusDismissed, findings.StatusDeferred}
	byChapter := make([][]findings.Finding, book.Chapters)
	n := 0
	for c := range book.Chapters {
		for p := range book.Paragraphs {
			paragraph := c*book.Paragraphs + p
			for k := range 3 + paragraph%2 {
				confidence := float64(50+n%50) / 100
				start := float64(p*30 + k*5)
				finding := findings.Finding{
					SchemaVersion: findings.SchemaVersion, ID: fmt.Sprintf("perf-%07d", n), Analyzer: "transcript-compare",
					Category: categories[n%len(categories)], Severity: []findings.Severity{findings.SeverityInfo, findings.SeverityWarning, findings.SeverityError}[n%3],
					Confidence: &confidence, ConfidenceReason: "word_scores", EvidenceVersion: "v1",
					TimeRange: &findings.TimeRange{Start: start, End: start + 2},
					Manuscript: &findings.Manuscript{
						ChapterID: perfChapterID(c), ChapterTitle: fmt.Sprintf("Chapter %d", c+1), Expected: "quiet streets", Recorded: "quite streets",
						Span: &findings.Span{ParagraphID: fmt.Sprintf("p-%06d", paragraph+1)},
					},
					Evidence: map[string]any{"heard": "quite streets", "wordScores": []float64{0.41, 0.93}},
					Review:   findings.ReviewState{Status: findings.StatusUnreviewed},
				}
				if err := finding.Validate(); err != nil {
					t.Fatal(err)
				}
				if n%20 < 9 {
					if _, _, err := store.RecordDecision(finding.ID, finding.EvidenceVersion, statuses[n%len(statuses)], "", "2026-11-10T00:00:00Z"); err != nil {
						t.Fatal(err)
					}
				}
				byChapter[c] = append(byChapter[c], finding)
				n++
			}
		}
	}
	for c, fresh := range byChapter {
		if _, err := store.SaveAnalyzerFindings("transcript-compare", perfChapterID(c), fresh); err != nil {
			t.Fatal(err)
		}
	}
}

// TestSeedAPerfBook writes a seeded book into the folder NARRATION_PERF_BOOK names, sized by NARRATION_PERF_SEED, for the
// real-app rig and the read table (docs/operations/real-app-driver.md). It is skipped without them.
func TestSeedAPerfBook(t *testing.T) {
	dir := os.Getenv(perfBookDirEnv)
	if dir == "" || os.Getenv(perfBookSpecEnv) == "" {
		t.Skipf("set %s to a folder and %s to a size (chapters=44) to seed a book", perfBookDirEnv, perfBookSpecEnv)
	}
	book, err := parsePerfBook(os.Getenv(perfBookSpecEnv))
	if err != nil {
		t.Fatal(err)
	}
	if entries, _ := os.ReadDir(dir); len(entries) > 0 {
		t.Fatalf("%s is not empty: seed a book into a new folder", dir)
	}
	seedPerfBook(t, dir, book)
}

func TestAPerfBookSpecReadsItsSizesAndRefusesWhatItDoesNotKnow(t *testing.T) {
	cases := []struct {
		name, spec string
		want       perfBook
		refused    bool
	}{
		{"chapters alone take the defaults", "chapters=44", perfBook{Chapters: 44, Paragraphs: 40, Items: 100, Checked: 44, Checks: 1}, false},
		{"every option", "chapters=300 paragraphs=6 items=5 tracks=20 checked=10 checks=3 audio=60", perfBook{300, 6, 5, 20, 10, 3, 60}, false},
		{"more checked than chapters is every chapter", "chapters=2 checked=9", perfBook{Chapters: 2, Paragraphs: 40, Items: 100, Checked: 2, Checks: 1}, false},
		{"no chapter checked", "chapters=2 checked=0", perfBook{Chapters: 2, Paragraphs: 40, Items: 100, Checks: 1}, false},
		{"empty", "", perfBook{}, true},
		{"no chapters", "chapters=0", perfBook{}, true},
		{"a negative size", "chapters=-3", perfBook{}, true},
		{"not a number", "chapters=many", perfBook{}, true},
		{"an unknown option", "chapters=3 hours=17", perfBook{}, true},
		{"no items to check", "chapters=3 items=0", perfBook{}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := parsePerfBook(c.spec)
			if (err != nil) != c.refused || got != c.want {
				t.Fatalf("parsePerfBook(%q) = %+v, %v; want %+v, refused %v", c.spec, got, err, c.want, c.refused)
			}
		})
	}
}

// A book checked in part and more than once: the cases a real project is in and the full seed is not.
func TestASeededBookHoldsTheChecksFindingsBibleMarksAndPickupsItWasAskedFor(t *testing.T) {
	dir := t.TempDir()
	seedPerfBook(t, dir, perfBook{Chapters: 3, Paragraphs: 8, Items: 4, Tracks: 2, Checked: 2, Checks: 2})
	host := freshPerfHost(t, dir)
	count := func(pattern ...string) int {
		t.Helper()
		found, err := filepath.Glob(filepath.Join(append([]string{dir}, pattern...)...))
		if err != nil {
			t.Fatal(err)
		}
		return len(found)
	}
	if ledger, results := count(brand.ProjectFolder, "analysis", "ledger", "*.json"), count(brand.ProjectFolder, "analysis", "coverage", "results", "*.json"); ledger != 4 || results != 4 {
		t.Errorf("%d ledger records and %d stored results, want 4 of each: two chapters checked twice", ledger, results)
	}
	read := func(binding func() (string, error), into any) {
		t.Helper()
		answer, err := binding()
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal([]byte(answer), into); err != nil {
			t.Fatal(err)
		}
	}
	var chapters struct {
		Chapters []struct {
			ID               string   `json:"id"`
			RecordedFraction *float64 `json:"recordedFraction"`
		} `json:"chapters"`
	}
	read(host.ManuscriptChapters, &chapters)
	fractions := map[string]*float64{}
	for _, chapter := range chapters.Chapters {
		fractions[chapter.ID] = chapter.RecordedFraction
	}
	// The chapter list also holds the opening and closing credits the host adds.
	if first, third := fractions[perfChapterID(0)], fractions[perfChapterID(2)]; first == nil || *first != 1 || third != nil {
		t.Errorf("recorded fractions: chapter 1 %v, chapter 3 %v; want 1 and none", derefFloat(first), third)
	}
	// The page refuses to start on a book whose import it cannot name (wire_invalid on Bootstrap).
	if book, _ := host.Bootstrap()["manuscript"].(map[string]any); book["format"] != "markdown" || book["sourceName"] != "perf-book.md" {
		t.Errorf("Bootstrap's manuscript = %v, want its format and source name", host.Bootstrap()["manuscript"])
	}
	var summary struct {
		Total int `json:"total"`
	}
	read(host.FindingsSummary, &summary)
	// 8 paragraphs of 3 or 4 findings in each of 3 chapters, and the Story Bible's own findings beside them.
	if summary.Total < 84 {
		t.Errorf("%d findings, want at least the 84 seeded", summary.Total)
	}
	var entities []json.RawMessage
	read(host.GuideEntities, &entities)
	if len(entities) != 3 {
		t.Errorf("%d Story Bible entries, want the 3 speakers of 24 paragraphs", len(entities))
	}
	var marks struct {
		Marks []json.RawMessage `json:"marks"`
	}
	read(host.MarksList, &marks)
	if len(marks.Marks) != 32 {
		t.Errorf("%d marks, want 32: four in every three paragraphs", len(marks.Marks))
	}
	var pickups struct {
		Pickups []json.RawMessage `json:"pickups"`
	}
	read(host.PickupsList, &pickups)
	if len(pickups.Pickups) == 0 {
		t.Errorf("an empty pickup list, want the narrator's pickup in chapter 1 at least")
	}
}

func derefFloat(v *float64) any {
	if v == nil {
		return nil
	}
	return *v
}

// A book seeded with recordings of its own (#4042) draws a waveform for every take of the chapter, and the read after the first is
// answered from the evidence cache: the host path the Editing page's waveform takes, over real files.
func TestAWaveformReadOverSeededRecordingsDrawsEveryTakeAndIsKept(t *testing.T) {
	dir := t.TempDir()
	book, err := parsePerfBook("chapters=1 paragraphs=2 items=4 audio=2")
	if err != nil {
		t.Fatal(err)
	}
	seedPerfBook(t, dir, book)
	host := freshPerfHost(t, dir)
	read := func() WorkspacePeaksView {
		t.Helper()
		answer, err := host.WorkspacePeaks(perfChapterID(0))
		if err != nil {
			t.Fatal(err)
		}
		var view WorkspacePeaksView
		if err := json.Unmarshal([]byte(answer), &view); err != nil {
			t.Fatal(err)
		}
		return view
	}
	first := read()
	if len(first.Items) == 0 {
		t.Fatal("the chapter's alignment has no items")
	}
	for _, item := range first.Items {
		if item.Peaks == nil || item.Reason != "" || item.Peaks.BucketsPerSecond != 50 || item.Peaks.SampleRate != perfAudioRate {
			t.Fatalf("item %d has no waveform over its own recording: %+v", item.Index, item)
		}
	}
	var entries []string
	_ = filepath.WalkDir(evidence.CacheDir(dir), func(path string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			entries = append(entries, path)
		}
		return nil
	})
	if len(entries) == 0 {
		t.Fatalf("the peaks were not kept in the evidence cache under %s", evidence.CacheDir(dir))
	}
	if again := read(); len(again.Items) != len(first.Items) || again.Items[0].Peaks == nil {
		t.Fatalf("the read after the first lost the waveform: %+v", again)
	}
}

// A call that runs out of time shows what it has and says why the rest is missing; the read goes on in the background, so a later call
// is answered without reading the file again (#4042). Before, every call over a long recording timed out the same way and blanked the strip.
func TestAWaveformReadThatRunsOutOfTimeKeepsReadingAndTheNextCallHasIt(t *testing.T) {
	dir := t.TempDir()
	book, err := parsePerfBook("chapters=1 paragraphs=2 items=3 audio=3")
	if err != nil {
		t.Fatal(err)
	}
	seedPerfBook(t, dir, book)
	host := freshPerfHost(t, dir)
	saved := workspacePeaksTimeout
	workspacePeaksTimeout = 20 * time.Millisecond
	t.Cleanup(func() { workspacePeaksTimeout = saved })
	read := func() WorkspacePeaksView {
		t.Helper()
		answer, err := host.WorkspacePeaks(perfChapterID(0))
		if err != nil {
			t.Fatal(err)
		}
		var view WorkspacePeaksView
		if err := json.Unmarshal([]byte(answer), &view); err != nil {
			t.Fatal(err)
		}
		return view
	}
	first := read()
	for _, item := range first.Items {
		if item.Peaks != nil || item.Reason != stillReading {
			t.Fatalf("item %d of a read cut short should say it is still being read: %+v", item.Index, item)
		}
	}
	deadline := time.Now().Add(2 * time.Minute)
	for {
		later := read()
		if later.Items[0].Peaks != nil {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("the read never finished in the background: %+v", later.Items[0])
		}
		time.Sleep(100 * time.Millisecond)
	}
}
