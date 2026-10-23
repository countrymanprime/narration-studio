package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"desktop/internal/coverage"
	"desktop/internal/evidence"
	"desktop/internal/findings"
	"desktop/internal/persist"
)

// Backend is what the benchmark drives. Every method answers a count so the backends can be checked against each other.
type Backend interface {
	Name() string
	Open() (map[string]int, error)
	ChapterText(c int) (int, error)
	ChapterAlignment(c int) (int, error)
	ChapterASR(c, take int) (int, error)
	ChapterPeaks(c, take int) (int, error)
	EditMark(i int) error
	EditWord(c, idx int) error
	GroupEditMarks(n, seed int) error
	DecideFinding(id string, i int) error
	GroupDecide(ids []string, i int) error
	ListMarks() (int, error)
	QFindings() (int, error)
	QName(name string) (int, error)
	QPickups() (int, error)
	QFTS(term string) (int, error)
	Close() error
}

var errUnsupported = fmt.Errorf("not supported")

// jsonBackend is the current approach: the same files, read through persist.Reporter.ReadJSON, findings through the real
// findings.Store and the analysis cache through the real evidence.CacheStore. Writes replicate marks.write and
// coverage.resultStore (MarshalIndent, temp file, rename); fsync adds a file and directory sync before and after the rename.
type jsonBackend struct {
	dir   string
	fsync bool
	rep   *persist.Reporter
	store *findings.Store
	cache *evidence.CacheStore
	meta  *Meta
	// Parts is how long the last Open spent on each file group, in ms.
	Parts map[string]float64
}

func newJSONBackend(dir string, fsync bool, meta *Meta) *jsonBackend {
	b := &jsonBackend{dir: dir, fsync: fsync, rep: &persist.Reporter{}, meta: meta}
	b.store = findings.NewStore(dir)
	b.store.SetPersist(b.rep)
	b.cache = evidence.NewCacheStore(dir)
	b.cache.Reporter = b.rep
	return b
}

func (b *jsonBackend) Name() string {
	if b.fsync {
		return "json+fsync"
	}
	return "json"
}
func (b *jsonBackend) Close() error { return nil }
func (b *jsonBackend) path(parts ...string) string {
	return filepath.Join(append([]string{projectRoot(b.dir)}, parts...)...)
}

func (b *jsonBackend) read(path, what string, v any) error {
	var derr error
	out := b.rep.ReadJSON(path, what, persist.NarratorData, func(raw []byte) error {
		derr = json.Unmarshal(raw, v)
		return derr
	})
	if out != persist.Loaded {
		return fmt.Errorf("%s: outcome %d %v", what, out, derr)
	}
	return nil
}

func (b *jsonBackend) write(path string, v any) error {
	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return b.writeBytes(path, raw)
}

func (b *jsonBackend) writeBytes(path string, raw []byte) error {
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(raw); err != nil {
		f.Close()
		return err
	}
	if b.fsync {
		if err := f.Sync(); err != nil {
			f.Close()
			return err
		}
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	if b.fsync {
		syncDir(filepath.Dir(path))
	}
	return nil
}

func (b *jsonBackend) manuscript() (*ManuscriptFile, error) {
	var ms ManuscriptFile
	return &ms, b.read(b.path("manuscript", "manuscript.json"), "manuscript", &ms)
}

func (b *jsonBackend) resultPath(c int) string {
	return b.path("analysis", "coverage", "results", "rec-"+chapterID(c)+".json")
}

func (b *jsonBackend) Open() (map[string]int, error) {
	got := map[string]int{}
	b.Parts = map[string]float64{}
	lap := time.Now()
	part := func(k string) { b.Parts[k] = float64(time.Since(lap).Microseconds()) / 1000; lap = time.Now() }
	defer func() {}()
	ms, err := b.manuscript()
	part("manuscript.json")
	if err != nil {
		return nil, err
	}
	got["chapters"] = len(ms.Chapters)
	present := 0
	for c := range ms.Chapters {
		var res coverage.StoredResult
		if err := b.read(b.resultPath(c), "coverage result", &res); err != nil {
			return nil, err
		}
		present += res.Report.Summary.PresentTokens
	}
	got["presentTokens"] = present
	part("coverage results (all chapters)")
	var mf MarksFile
	if err := b.read(b.path("marks.json"), "marks", &mf); err != nil {
		return nil, err
	}
	got["marks"] = len(mf.Marks)
	part("marks.json")
	sum, err := b.store.Summary()
	if err != nil {
		return nil, err
	}
	got["findings"] = sum.Total
	part("findings (every scope file + review.json)")
	var pf PickupFile
	if err := b.read(b.path("pickups", "pickup-list.json"), "pickups", &pf); err != nil {
		return nil, err
	}
	got["pickups"] = len(pf.Added)
	part("pickup-list.json")
	var guide struct {
		Entities []struct {
			ID, Name, Category string
			Count              int
		} `json:"entities"`
	}
	var raw struct {
		Entities []struct {
			ID    string `json:"id"`
			Name  string `json:"canonical_name"`
			Cat   string `json:"category"`
			Count int    `json:"occurrence_count"`
		} `json:"entities"`
	}
	_ = guide
	if err := b.read(b.path("ManuscriptGuide", "manuscript_guide.json"), "story bible", &raw); err != nil {
		return nil, err
	}
	got["entities"] = len(raw.Entities)
	part("Story Bible")
	return got, nil
}

func (b *jsonBackend) ChapterText(c int) (int, error) {
	ms, err := b.manuscript()
	if err != nil {
		return 0, err
	}
	n := 0
	for _, p := range ms.Chapters[c].Paragraphs {
		n += len(p.Text)
	}
	return n, nil
}

func (b *jsonBackend) ChapterAlignment(c int) (int, error) {
	var res coverage.StoredResult
	if err := b.read(b.resultPath(c), "coverage result", &res); err != nil {
		return 0, err
	}
	return len(res.Report.Tokens), nil
}

func (b *jsonBackend) ChapterASR(c, take int) (int, error) {
	blob, ok := b.cache.Read(takeKey(b.dir, c, take, "words"))
	if !ok {
		return 0, fmt.Errorf("words cache miss for %d/%d", c, take)
	}
	var wb WordsBlob
	if err := json.Unmarshal(blob, &wb); err != nil {
		return 0, err
	}
	var wf WordsFile
	if err := json.Unmarshal(wb.Segments[0], &wf); err != nil {
		return 0, err
	}
	return len(wf.Words), nil
}

func (b *jsonBackend) ChapterPeaks(c, take int) (int, error) {
	blob, ok := b.cache.Read(takeKey(b.dir, c, take, "peaks"))
	if !ok {
		return 0, fmt.Errorf("peaks cache miss")
	}
	var pk struct {
		Buckets int    `json:"buckets"`
		MinMax  []byte `json:"minMax"`
	}
	if err := json.Unmarshal(blob, &pk); err != nil {
		return 0, err
	}
	return len(pk.MinMax), nil
}

func (b *jsonBackend) EditMark(i int) error {
	var mf MarksFile
	if err := b.read(b.path("marks.json"), "marks", &mf); err != nil {
		return err
	}
	mf.Marks[i%len(mf.Marks)].Text = fmt.Sprintf("edited %d", i)
	return b.write(b.path("marks.json"), mf)
}

func (b *jsonBackend) EditWord(c, idx int) error {
	var res coverage.StoredResult
	if err := b.read(b.resultPath(c), "coverage result", &res); err != nil {
		return err
	}
	res.Report.Tokens[idx%len(res.Report.Tokens)].Text = fmt.Sprintf("fixed%d", idx)
	return b.write(b.resultPath(c), res)
}

func (b *jsonBackend) GroupEditMarks(n, seed int) error {
	var mf MarksFile
	if err := b.read(b.path("marks.json"), "marks", &mf); err != nil {
		return err
	}
	for k := 0; k < n; k++ {
		mf.Marks[(seed*n+k)%len(mf.Marks)].Text = fmt.Sprintf("group %d.%d", seed, k)
	}
	return b.write(b.path("marks.json"), mf)
}

func (b *jsonBackend) DecideFinding(id string, i int) error {
	_, found, err := b.store.RecordDecision(id, "", findings.StatusAccepted, fmt.Sprintf("n%d", i), "2026-10-18T00:00:00Z")
	if err == nil && !found {
		err = fmt.Errorf("finding %s not found", id)
	}
	return err
}

func (b *jsonBackend) GroupDecide(ids []string, i int) error {
	for _, id := range ids {
		if err := b.DecideFinding(id, i); err != nil {
			return err
		}
	}
	return nil
}

func (b *jsonBackend) ListMarks() (int, error) {
	var mf MarksFile
	if err := b.read(b.path("marks.json"), "marks", &mf); err != nil {
		return 0, err
	}
	return len(mf.Marks), nil
}

func (b *jsonBackend) QFindings() (int, error) {
	total := 0
	for _, s := range []findings.Severity{findings.SeverityError, findings.SeverityWarning} {
		p, err := b.store.Page(findings.Query{Severity: s, Limit: 50})
		if err != nil {
			return 0, err
		}
		total += p.Total
	}
	return total, nil
}

func (b *jsonBackend) QName(name string) (int, error) {
	ms, err := b.manuscript()
	if err != nil {
		return 0, err
	}
	low := strings.ToLower(name)
	paras := 0
	chapters := map[string]int{}
	for _, ch := range ms.Chapters {
		for _, p := range ch.Paragraphs {
			if wordMatch(strings.ToLower(p.Text), low) {
				paras++
				chapters[ch.ID]++
			}
		}
	}
	return paras*1000 + len(chapters), nil
}

func (b *jsonBackend) QPickups() (int, error) {
	var pf PickupFile
	if err := b.read(b.path("pickups", "pickup-list.json"), "pickups", &pf); err != nil {
		return 0, err
	}
	closed := map[string]bool{}
	for _, l := range [][]string{pf.Done, pf.Removed, pf.LeftOut} {
		for _, id := range l {
			closed[id] = true
		}
	}
	byChapter := map[string]int{}
	for _, a := range pf.Added {
		if !closed[a.ID] {
			byChapter[a.ChapterID]++
		}
	}
	for _, st := range []findings.Status{findings.StatusUnreviewed, findings.StatusDeferred} {
		p, err := b.store.Page(findings.Query{Category: findings.CategoryPickup, Status: st})
		if err != nil {
			return 0, err
		}
		for _, f := range p.Findings {
			if f.Manuscript != nil {
				byChapter[f.Manuscript.ChapterID]++
			}
		}
	}
	total := 0
	keys := make([]string, 0, len(byChapter))
	for k, v := range byChapter {
		total += v
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return total, nil
}

func wordMatch(text, term string) bool {
	for off := 0; ; {
		i := strings.Index(text[off:], term)
		if i < 0 {
			return false
		}
		s, e := off+i, off+i+len(term)
		before := s == 0 || !isLetter(text[s-1])
		after := e == len(text) || !isLetter(text[e])
		if before && after {
			return true
		}
		off = s + 1
	}
}

func isLetter(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c >= 0x80
}

func (b *jsonBackend) QFTS(term string) (int, error) {
	ms, err := b.manuscript()
	if err != nil {
		return 0, err
	}
	low := strings.ToLower(term)
	n := 0
	var first []string
	for _, ch := range ms.Chapters {
		for _, p := range ch.Paragraphs {
			if wordMatch(strings.ToLower(p.Text), low) {
				n++
				if len(first) < 20 {
					first = append(first, p.ID)
				}
			}
		}
	}
	return n, nil
}
