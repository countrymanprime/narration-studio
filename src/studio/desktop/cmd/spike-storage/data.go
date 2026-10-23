package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/coverage"
	"github.com/countrymanprime/narration-studio/shell/internal/evidence"
	"github.com/countrymanprime/narration-studio/shell/internal/findings"
	"github.com/countrymanprime/narration-studio/shell/internal/marks"
	"github.com/countrymanprime/narration-studio/shell/internal/measure"
)

// Scale is one synthetic project size. Every density is per 1,000 script words.
type Scale struct {
	Name         string  `json:"name"`
	Chapters     int     `json:"chapters"`
	Words        int     `json:"words"`
	Takes        int     `json:"takes"` // 0 = 1 to 3 at random, otherwise exactly this many
	FindingsPerK float64 `json:"findingsPerK"`
	MarksPerK    float64 `json:"marksPerK"`
	Pickups      int     `json:"pickups"`
	Entities     int     `json:"entities"`
}

var scales = map[string]Scale{
	// The owner's book: 17 h, 35 chapters, ~150k words. Marks sit at 15 a thousand words (2,250).
	"full": {Name: "full", Chapters: 35, Words: 150000, Takes: 0, FindingsPerK: 40, MarksPerK: 15, Pickups: 300, Entities: 300},
	// The same book at every ceiling data-files.md enforces: 3 takes everywhere (450k ASR words), 10,000 marks.
	"max": {Name: "max", Chapters: 35, Words: 150000, Takes: 3, FindingsPerK: 80, MarksPerK: 66.7, Pickups: 600, Entities: 400},
	// Issue #1764's 5,000 chapters, at 40 words a chapter, one take.
	"stress": {Name: "stress", Chapters: 5000, Words: 200000, Takes: 1, FindingsPerK: 40, MarksPerK: 15, Pickups: 500, Entities: 300},
	// A quick run for tests.
	"tiny": {Name: "tiny", Chapters: 4, Words: 6000, Takes: 0, FindingsPerK: 40, MarksPerK: 15, Pickups: 20, Entities: 30},
}

// Meta is what the generator counted, written beside the project.
type Meta struct {
	Scale        Scale          `json:"scale"`
	ScriptWords  int            `json:"scriptWords"`
	Paragraphs   int            `json:"paragraphs"`
	ASRWords     int            `json:"asrWords"`
	Takes        int            `json:"takes"`
	Findings     int            `json:"findings"`
	Decisions    int            `json:"decisions"`
	Marks        int            `json:"marks"`
	Pickups      int            `json:"pickups"`
	Entities     int            `json:"entities"`
	AudioSeconds float64        `json:"audioSeconds"`
	Bytes        map[string]int `json:"bytesByKind"`
	Files        map[string]int `json:"filesByKind"`
	GenSeconds   float64        `json:"genSeconds"`
	ChapterIDs   []string       `json:"chapterIds"`
	Names        []string       `json:"names"`
	ChapterTakes []int          `json:"chapterTakes"`
}

func chapterID(i int) string { return fmt.Sprintf("ch-%04d", i+1) }

var syl = []string{"ba", "ro", "mi", "la", "ten", "dor", "an", "vel", "or", "is", "ka", "thu", "pen", "sar", "el", "gon", "wyn", "ha", "lo", "mer", "ne", "ri", "to", "ul", "fen", "ca", "de", "po", "sti", "ver"}

func pseudoWord(r *rand.Rand) string {
	n := 1 + r.Intn(3)
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteString(syl[r.Intn(len(syl))])
	}
	return b.String()
}

func capital(s string) string { return strings.ToUpper(s[:1]) + s[1:] }

func idHash(parts ...any) string {
	sum := sha256.Sum256([]byte(fmt.Sprint(parts...)))
	return hex.EncodeToString(sum[:8])
}

func writeJSON(path string, v any, indent bool) (int, error) {
	var b []byte
	var err error
	if indent {
		b, err = json.MarshalIndent(v, "", "  ")
	} else {
		b, err = json.Marshal(v)
	}
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 0, err
	}
	return len(b), os.WriteFile(path, b, 0o600)
}

// ManuscriptFile mirrors manuscript/manuscript.json closely enough to carry the text (shape estimated, not imported: the
// manuscript package's types are not needed for the storage question).
type ManuscriptFile struct {
	SchemaVersion int         `json:"schemaVersion"`
	Chapters      []MsChapter `json:"chapters"`
}
type MsChapter struct {
	ID         string        `json:"id"`
	Title      string        `json:"title"`
	Kind       string        `json:"contentKind"`
	Paragraphs []MsParagraph `json:"paragraphs"`
}
type MsParagraph struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type PickupAdded struct {
	ID          string  `json:"id"`
	ChapterID   string  `json:"chapterId"`
	ParagraphID string  `json:"paragraphId,omitempty"`
	Time        float64 `json:"time"`
	Line        string  `json:"line"`
	At          string  `json:"at"`
}
type PickupFile struct {
	SchemaVersion int           `json:"schemaVersion"`
	Added         []PickupAdded `json:"added"`
	Removed       []string      `json:"removed"`
	LeftOut       []string      `json:"leftOut"`
	Done          []string      `json:"done"`
	Waiting       []string      `json:"waiting"`
}

type MarksFile struct {
	SchemaVersion int              `json:"schemaVersion"`
	MigratedNotes bool             `json:"migratedNotes"`
	Types         []marks.MarkType `json:"types"`
	Marks         []marks.Mark     `json:"marks"`
}

type ReviewFile struct {
	SchemaVersion int                    `json:"schema_version"`
	Decisions     []findings.Decision    `json:"decisions"`
	Types         []findings.TypeChoice  `json:"types,omitempty"`
	Thread        []findings.ThreadEntry `json:"thread,omitempty"`
}

type WordsFile struct {
	SchemaVersion int            `json:"schemaVersion"`
	SourceStart   float64        `json:"sourceStart"`
	SourceEnd     float64        `json:"sourceEnd"`
	Words         [][]any        `json:"words"`
	Transcription map[string]any `json:"transcription"`
}
type WordsBlob struct {
	SchemaVersion int               `json:"schemaVersion"`
	Segments      []json.RawMessage `json:"segments"`
}

func projectRoot(dir string) string { return filepath.Join(dir, "narration-studio") }

func takeKey(dir string, ch, take int, analyzer string) evidence.CacheEntryKey {
	return evidence.CacheEntryKey{
		Source:          evidence.SourceIdentity{Path: fmt.Sprintf("Recordings/%s-take%d.wav", chapterID(ch), take), Size: int64(1000 + ch), PartialHash: idHash(ch, take)},
		AnalyzerID:      analyzer,
		AnalyzerVersion: "1",
		ParamHash:       "p1",
	}
}

// Generate writes a synthetic project into dir using the real schemas and, where a package exports its writer, the real
// writer (findings.Store, evidence.CacheStore). It is deterministic for a scale.
func Generate(dir string, sc Scale) (*Meta, error) {
	start := time.Now()
	r := rand.New(rand.NewSource(42))
	meta := &Meta{Scale: sc, Bytes: map[string]int{}, Files: map[string]int{}}
	root := projectRoot(dir)
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	vocab := make([]string, 4000)
	for i := range vocab {
		vocab[i] = pseudoWord(r)
	}
	zipf := rand.NewZipf(r, 1.15, 2, uint64(len(vocab)-1))
	names := make([]string, sc.Entities)
	for i := range names {
		names[i] = capital(pseudoWord(r)) + pseudoWord(r)
		if i%5 == 0 {
			names[i] += " " + capital(pseudoWord(r))
		}
	}
	nameZipf := rand.NewZipf(r, 1.3, 1, uint64(len(names)-1))
	meta.Names = names

	// Manuscript.
	ms := ManuscriptFile{SchemaVersion: 1}
	perChapter := sc.Words / sc.Chapters
	type occurrence struct {
		Chapter, Para, Start, End int
		Name                      string
	}
	var occs []occurrence
	chapterWords := make([][]string, sc.Chapters)   // flat word list per chapter (whitespace words)
	chapterParaOf := make([][]int, sc.Chapters)     // word -> paragraph index
	chapterWordInPara := make([][]int, sc.Chapters) // word -> ordinal inside paragraph
	for c := 0; c < sc.Chapters; c++ {
		n := perChapter/2 + r.Intn(perChapter+1)
		if c == sc.Chapters-1 {
			n = perChapter
		}
		ch := MsChapter{ID: chapterID(c), Title: "Chapter " + fmt.Sprint(c+1) + ": " + capital(pseudoWord(r)) + " " + pseudoWord(r), Kind: "narration"}
		pi := 0
		for produced := 0; produced < n; {
			pl := 35 + r.Intn(50)
			if produced+pl > n {
				pl = n - produced
			}
			if pl < 1 {
				break
			}
			words := make([]string, 0, pl)
			for w := 0; w < pl; w++ {
				var t string
				if r.Intn(40) == 0 {
					t = names[int(nameZipf.Uint64())]
				} else {
					t = vocab[int(zipf.Uint64())]
				}
				if w == 0 || (w > 3 && r.Intn(14) == 0) {
					t = capital(t)
				}
				if w == pl-1 || r.Intn(13) == 0 {
					t += "."
				}
				words = append(words, t)
			}
			text := strings.Join(words, " ")
			pid := fmt.Sprintf("%s-p%03d", ch.ID, pi)
			ch.Paragraphs = append(ch.Paragraphs, MsParagraph{ID: pid, Text: text})
			for w, t := range strings.Fields(text) {
				chapterWords[c] = append(chapterWords[c], t)
				chapterParaOf[c] = append(chapterParaOf[c], pi)
				chapterWordInPara[c] = append(chapterWordInPara[c], w)
			}
			for _, nm := range names {
				if idx := strings.Index(text, nm); idx >= 0 && len(occs) < 400000 {
					occs = append(occs, occurrence{c, pi, idx, idx + len(nm), nm})
				}
			}
			produced += pl
			pi++
			meta.Paragraphs++
		}
		meta.ScriptWords += len(chapterWords[c])
		ms.Chapters = append(ms.Chapters, ch)
		meta.ChapterIDs = append(meta.ChapterIDs, ch.ID)
	}
	n, err := writeJSON(filepath.Join(root, "manuscript", "manuscript.json"), ms, true)
	if err != nil {
		return nil, err
	}
	meta.Bytes["manuscript"], meta.Files["manuscript"] = n, 1

	// Coverage results (the per-chapter alignment, one TokenLine a script word) and the ASR word caches + peaks.
	cache := evidence.NewCacheStore(dir)
	chapterStart := make([]float64, sc.Chapters)
	chapterDur := make([]float64, sc.Chapters)
	cursor := 0.0
	for c := 0; c < sc.Chapters; c++ {
		words := chapterWords[c]
		dur := float64(len(words)) * 0.4 // 150 wpm-ish: 17 h for ~150k words at ~0.4 s a word
		if sc.Words >= 100000 && sc.Chapters < 100 {
			dur = float64(len(words)) * (17.0 * 3600 / float64(sc.Words))
		}
		chapterStart[c], chapterDur[c] = cursor, dur
		cursor += dur
		meta.AudioSeconds += dur
		toks := make([]coverage.TokenLine, len(words))
		present := 0
		step := dur / float64(len(words))
		item := 0
		for i, w := range words {
			p := fmt.Sprintf("%s-p%03d", chapterID(c), chapterParaOf[c][i])
			st, en := float64(i)*step, float64(i+1)*step
			tl := coverage.TokenLine{Index: i, ParagraphID: &p, Word: chapterWordInPara[c][i], Text: w, Status: "read", Item: &item, Start: &st, End: &en}
			if r.Intn(60) == 0 {
				tl.Status = "misread"
				h := vocab[int(zipf.Uint64())]
				tl.Heard = &h
			}
			if r.Intn(150) == 0 {
				tl.Status, tl.Item, tl.Start, tl.End = "skip", nil, nil, nil
			} else {
				present++
			}
			toks[i] = tl
		}
		res := coverage.StoredResult{
			SchemaVersion: 1, RecordID: "rec-" + chapterID(c), DocumentID: "doc-1", ChapterID: chapterID(c),
			ManuscriptHash: "mh", Model: "small.en", Language: "en",
			Report: coverage.Report{
				Summary: coverage.Summary{SchemaVersion: 1, ChapterID: chapterID(c), BodyTokens: len(words), PresentTokens: present, MissingTokens: len(words) - present},
				Items:   []coverage.ItemLine{{Index: 0, ItemGUID: "{" + idHash("item", c) + "}", Status: "ok", PlayedSeconds: dur, WordCount: len(words)}},
				Tokens:  toks, Extras: []coverage.ExtraLine{}, Paragraphs: []coverage.ParagraphLine{}, Regions: []coverage.RegionLine{},
			},
		}
		n, err := writeJSON(filepath.Join(root, "analysis", "coverage", "results", "rec-"+chapterID(c)+".json"), res, true)
		if err != nil {
			return nil, err
		}
		meta.Bytes["coverageResults"] += n
		meta.Files["coverageResults"]++

		takes := sc.Takes
		if takes == 0 {
			takes = 1 + r.Intn(3)
		}
		meta.ChapterTakes = append(meta.ChapterTakes, takes)
		for t := 0; t < takes; t++ {
			meta.Takes++
			wf := WordsFile{SchemaVersion: 1, SourceStart: 0, SourceEnd: dur, Transcription: map[string]any{"model": "small.en", "language": "en"}}
			wf.Words = make([][]any, 0, len(words))
			for i, w := range words {
				if t > 0 && r.Intn(40) == 0 {
					continue // another take reads it a little differently
				}
				wf.Words = append(wf.Words, []any{strings.TrimRight(strings.ToLower(w), "."), round3(float64(i) * step), round3(float64(i+1)*step - 0.03)})
			}
			meta.ASRWords += len(wf.Words)
			raw, _ := json.Marshal(wf)
			blob, _ := json.Marshal(WordsBlob{SchemaVersion: 1, Segments: []json.RawMessage{raw}})
			if err := cache.Write(takeKey(dir, c, t, "words"), blob); err != nil {
				return nil, err
			}
			meta.Bytes["asrWordsCache"] += len(blob)
			meta.Files["asrWordsCache"]++
			buckets := int(dur * measure.DefaultPeaksPerSecond)
			mm := make([]byte, buckets*2)
			r.Read(mm)
			pk := measure.Peaks{StartSeconds: 0, BucketsPerSecond: measure.DefaultPeaksPerSecond, Buckets: buckets, MinMax: mm, SampleRate: 44100, Channels: 1}
			pb, _ := json.Marshal(pk)
			if err := cache.Write(takeKey(dir, c, t, "peaks"), pb); err != nil {
				return nil, err
			}
			meta.Bytes["peaksCache"] += len(pb) * 4 / 3
			meta.Files["peaksCache"]++
		}
	}
	_ = base64.StdEncoding

	// Findings, through the real store.
	store := findings.NewStore(dir)
	type fk struct {
		analyzer string
		cat      findings.Category
		share    float64
	}
	kinds := []fk{{"transcript-compare", findings.CategoryTranscriptDiscrepancy, 0.50}, {"audio-quality", findings.CategoryAudioQuality, 0.25}, {"take-review", findings.CategoryTakeComparison, 0.10}, {"transcript-compare", findings.CategoryPickup, 0.05}, {"pronunciation", findings.CategoryPronunciation, 0.10}}
	total := int(float64(meta.ScriptWords) / 1000 * sc.FindingsPerK)
	byScope := map[string][]findings.Finding{}
	var ids []string
	sev := []findings.Severity{findings.SeverityInfo, findings.SeverityWarning, findings.SeverityError}
	for i := 0; i < total; i++ {
		x := r.Float64()
		var k fk
		acc := 0.0
		for _, cand := range kinds {
			acc += cand.share
			if x <= acc {
				k = cand
				break
			}
		}
		if k.analyzer == "" {
			k = kinds[0]
		}
		c := r.Intn(sc.Chapters)
		wi := r.Intn(len(chapterWords[c]))
		pid := fmt.Sprintf("%s-p%03d", chapterID(c), chapterParaOf[c][wi])
		t0 := chapterStart[c] + chapterDur[c]*float64(wi)/float64(len(chapterWords[c]))
		conf := 0.5 + r.Float64()*0.5
		f := findings.Finding{
			SchemaVersion: findings.SchemaVersion, ID: idHash("f", i), Analyzer: k.analyzer,
			Project:    findings.Project{Path: "Challenges_001.rpp"},
			Source:     findings.Source{File: fmt.Sprintf("Recordings/%s-take0.wav", chapterID(c)), TrackGUID: "{" + idHash("t", c) + "}", ItemGUID: "{" + idHash("item", c) + "}", TakeGUID: "{" + idHash("take", c) + "}"},
			TimeRange:  &findings.TimeRange{Start: t0, End: t0 + 0.4 + r.Float64()},
			Manuscript: &findings.Manuscript{ChapterID: chapterID(c), ChapterTitle: ms.Chapters[c].Title, Expected: chapterWords[c][wi], Recorded: vocab[int(zipf.Uint64())], Span: &findings.Span{ParagraphID: pid}},
			Category:   k.cat, Severity: sev[r.Intn(10)/4%3], Confidence: &conf, ConfidenceReason: "alignment score and a second pass agree",
			EvidenceVersion: idHash("ev", i), Evidence: map[string]any{"kind": "misread", "score": conf, "window": []int{wi - 3, wi + 3}},
			Review: findings.ReviewState{Status: findings.StatusUnreviewed},
		}
		if r.Intn(3) == 0 {
			f.SuggestedAction = &findings.SuggestedAction{Kind: "mark_for_pickup", Parameters: map[string]any{"chapter": chapterID(c)}, RequiresConfirmation: true}
		}
		key := k.analyzer + "/" + chapterID(c)
		byScope[key] = append(byScope[key], f)
		ids = append(ids, f.ID)
	}
	// review.json: decisions on about 45 % of findings (mirrors the unexported reviewHistory).
	rv := ReviewFile{SchemaVersion: 1}
	statuses := []findings.Status{findings.StatusAccepted, findings.StatusDismissed, findings.StatusDeferred}
	for i, id := range ids {
		if r.Intn(100) < 45 {
			d := findings.Decision{FindingID: id, EvidenceVersion: idHash("ev", i), Status: statuses[r.Intn(3)], Timestamp: time.Date(2026, 9, 1, 0, 0, i%86400, 0, time.UTC).Format(time.RFC3339)}
			if r.Intn(4) == 0 {
				d.Note = "checked against the script: " + pseudoWord(r) + " " + pseudoWord(r)
			}
			rv.Decisions = append(rv.Decisions, d)
		}
	}
	meta.Decisions = len(rv.Decisions)
	n, err = writeJSON(filepath.Join(root, "findings", "review.json"), rv, true)
	if err != nil {
		return nil, err
	}
	meta.Bytes["review"], meta.Files["review"] = n, 1

	byID := map[string]findings.Decision{}
	for _, d := range rv.Decisions {
		byID[d.FindingID] = d
	}
	for key, fs := range byScope {
		for i := range fs {
			if d, ok := byID[fs[i].ID]; ok {
				fs[i].Review = findings.ReviewState{Status: d.Status, Note: d.Note, Timestamp: d.Timestamp}
			}
		}
		byScope[key] = fs
	}
	for key, fs := range byScope {
		parts := strings.SplitN(key, "/", 2)
		if _, err := store.SaveAnalyzerFindings(parts[0], parts[1], fs); err != nil {
			return nil, fmt.Errorf("save findings %s: %w", key, err)
		}
		meta.Files["findings"]++
	}
	meta.Findings = total
	// Marks.
	mf := MarksFile{SchemaVersion: 1, MigratedNotes: true, Types: marks.DefaultTypes()}
	nMarks := int(float64(meta.ScriptWords) / 1000 * sc.MarksPerK)
	if nMarks > marks.MaxMarks {
		nMarks = marks.MaxMarks
	}
	for i := 0; i < nMarks; i++ {
		c := r.Intn(sc.Chapters)
		p := ms.Chapters[c].Paragraphs[r.Intn(len(ms.Chapters[c].Paragraphs))]
		if len(p.Text) < 12 {
			continue
		}
		s := r.Intn(len(p.Text) - 8)
		e := s + 3 + r.Intn(6)
		ty := mf.Types[r.Intn(len(mf.Types))]
		m := marks.Mark{ID: idHash("m", i), ChapterID: ms.Chapters[c].ID, ParagraphID: p.ID, Start: s, End: e, Quote: p.Text[s:e], Type: ty.Key, Text: "stress the second word, then a beat " + pseudoWord(r), CreatedAt: time.Date(2026, 9, 1, 0, 0, i%86400, 0, time.UTC), Thread: []marks.Message{}}
		if ty.Asks {
			m.Status = marks.StatusOpen
			if r.Intn(2) == 0 {
				m.Status = marks.StatusResolved
			}
		}
		for k := r.Intn(3); k > 0; k-- {
			m.Thread = append(m.Thread, marks.Message{Who: "narrator", Text: "reply " + pseudoWord(r), At: time.Date(2026, 9, 2, 0, 0, k, 0, time.UTC).Format(time.RFC3339)})
		}
		mf.Marks = append(mf.Marks, m)
	}
	meta.Marks = len(mf.Marks)
	n, err = writeJSON(filepath.Join(root, "marks.json"), mf, true)
	if err != nil {
		return nil, err
	}
	meta.Bytes["marks"], meta.Files["marks"] = n, 1

	// Pickups.
	pf := PickupFile{SchemaVersion: 1, Removed: []string{}, LeftOut: []string{}, Done: []string{}, Waiting: []string{}}
	for i := 0; i < sc.Pickups; i++ {
		c := r.Intn(sc.Chapters)
		id := idHash("pk", i)
		pf.Added = append(pf.Added, PickupAdded{ID: id, ChapterID: chapterID(c), ParagraphID: ms.Chapters[c].Paragraphs[0].ID, Time: chapterStart[c] + r.Float64()*chapterDur[c], Line: "the line to re-record " + pseudoWord(r), At: time.Date(2026, 9, 3, 0, 0, i%86400, 0, time.UTC).Format(time.RFC3339)})
		switch r.Intn(10) {
		case 0, 1, 2:
			pf.Done = append(pf.Done, id)
		case 3:
			pf.Removed = append(pf.Removed, id)
		case 4:
			pf.LeftOut = append(pf.LeftOut, id)
		}
	}
	meta.Pickups = len(pf.Added)
	n, err = writeJSON(filepath.Join(root, "pickups", "pickup-list.json"), pf, true)
	if err != nil {
		return nil, err
	}
	meta.Bytes["pickups"], meta.Files["pickups"] = n, 1

	// Story Bible (shape estimated from src/studio/sidecars/manuscript-guide/core/manuscript_guide.py).
	type ev struct {
		ChapterID   string `json:"chapter_id"`
		ParagraphID string `json:"paragraph_id"`
		Start       int    `json:"start"`
		End         int    `json:"end"`
		Text        string `json:"text"`
	}
	ents := make([]map[string]any, len(names))
	for i, nm := range names {
		ents[i] = map[string]any{"id": "ent-" + idHash(nm), "canonical_name": nm, "category": []string{"Character", "Place", "Organization", "Lore", "Item", "Event"}[i%6],
			"aliases": []any{}, "occurrences": []ev{}, "occurrence_count": 0, "description": map[string]any{"text": "A name in the book. " + pseudoWord(r)},
			"pronunciation": map[string]any{"say": strings.ToLower(nm), "status": "researched"}, "personality_notes": []any{}, "relationships": []any{}, "properties": []any{},
			"locked": false, "manual": false, "review_state": "generated", "appearances": []any{}}
	}
	idx := map[string]int{}
	for i, nm := range names {
		idx[nm] = i
	}
	for _, o := range occs {
		e := ents[idx[o.Name]]
		txt := ms.Chapters[o.Chapter].Paragraphs[o.Para].Text
		lo, hi := max(0, o.Start-60), min(len(txt), o.End+60)
		list := e["occurrences"].([]ev)
		if len(list) < 400 {
			e["occurrences"] = append(list, ev{ms.Chapters[o.Chapter].ID, ms.Chapters[o.Chapter].Paragraphs[o.Para].ID, o.Start, o.End, txt[lo:hi]})
		}
		e["occurrence_count"] = e["occurrence_count"].(int) + 1
	}
	guide := map[string]any{"schema_version": 2, "source": map[string]any{"path": "manuscript.json", "sha256": idHash("src")}, "generated_at": time.Now().UTC().Format(time.RFC3339), "entities": ents, "dialogue_cues": []any{}, "vocabulary_candidates": []any{}, "absorbed_names": map[string]any{}}
	n, err = writeJSON(filepath.Join(root, "ManuscriptGuide", "manuscript_guide.json"), guide, true)
	if err != nil {
		return nil, err
	}
	meta.Bytes["storyBible"], meta.Files["storyBible"] = n, 1
	meta.Entities = len(ents)
	meta.GenSeconds = time.Since(start).Seconds()
	_, err = writeJSON(filepath.Join(dir, "spike-meta.json"), meta, true)
	return meta, err
}

func round3(f float64) float64 { return float64(int64(f*1000+0.5)) / 1000 }
