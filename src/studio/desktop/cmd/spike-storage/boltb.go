package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	bolt "go.etcd.io/bbolt"

	"desktop/internal/coverage"
	"desktop/internal/evidence"
	"desktop/internal/findings"
	"desktop/internal/persist"
)

func boltPath(dir string) string { return filepath.Join(projectRoot(dir), "index-bolt.db") }

// boltBackend keeps each kind of record under its key: a chapter's alignment as one value, a mark as one value, a finding
// as one value. There are no secondary indexes: every cross-chapter question is a scan the caller writes.
type boltBackend struct {
	dir string
	db  *bolt.DB
}

func newBoltBackend(dir string) (*boltBackend, error) {
	db, err := bolt.Open(boltPath(dir), 0o600, nil)
	if err != nil {
		return nil, err
	}
	return &boltBackend{dir: dir, db: db}, nil
}

func (b *boltBackend) Name() string { return "bbolt" }
func (b *boltBackend) Close() error { return b.db.Close() }

func k2(ch, take int) []byte { return []byte(fmt.Sprintf("%s/%d", chapterID(ch), take)) }

func BuildBolt(dir string, meta *Meta) (map[string]float64, error) {
	_ = removeIfExists(boltPath(dir))
	b, err := newBoltBackend(dir)
	if err != nil {
		return nil, err
	}
	defer b.Close()
	j := newJSONBackend(dir, false, meta)
	ms, err := j.manuscript()
	if err != nil {
		return nil, err
	}
	tx, err := b.db.Begin(true)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	bk := func(n string) *bolt.Bucket { x, _ := tx.CreateBucket([]byte(n)); return x }
	chap, paras, align, asr, peaks, fnd, dec, mrk, pick, ent := bk("chapters"), bk("paragraphs"), bk("alignment"), bk("asr"), bk("peaks"), bk("findings"), bk("decisions"), bk("marks"), bk("pickups"), bk("entities")
	cache := evidence.NewCacheStore(dir)
	cache.Reporter = j.rep
	for c, ch := range ms.Chapters {
		var res coverage.StoredResult
		if err := j.read(j.resultPath(c), "coverage", &res); err != nil {
			return nil, err
		}
		raw, _ := json.Marshal(map[string]any{"id": ch.ID, "title": ch.Title, "paragraphs": len(ch.Paragraphs), "body": res.Report.Summary.BodyTokens, "present": res.Report.Summary.PresentTokens})
		chap.Put([]byte(ch.ID), raw)
		pj, _ := json.Marshal(ch.Paragraphs)
		paras.Put([]byte(ch.ID), pj)
		tj, _ := json.Marshal(res.Report.Tokens)
		align.Put([]byte(ch.ID), tj)
		for t := 0; t < meta.ChapterTakes[c]; t++ {
			blob, _ := cache.Read(takeKey(dir, c, t, "words"))
			var wb WordsBlob
			_ = json.Unmarshal(blob, &wb)
			asr.Put(k2(c, t), wb.Segments[0])
			pb, _ := cache.Read(takeKey(dir, c, t, "peaks"))
			var pk struct {
				MinMax []byte `json:"minMax"`
			}
			_ = json.Unmarshal(pb, &pk)
			peaks.Put(k2(c, t), pk.MinMax)
		}
	}
	store := findings.NewStore(dir)
	store.SetPersist(j.rep)
	all, err := store.List(findings.Query{IncludeNotInLatestRun: true})
	if err != nil {
		return nil, err
	}
	var rv ReviewFile
	if err := j.read(j.path("findings", "review.json"), "review", &rv); err != nil {
		return nil, err
	}
	status := map[string]string{}
	for i, d := range rv.Decisions {
		status[d.FindingID] = string(d.Status)
		raw, _ := json.Marshal(d)
		var seq [8]byte
		binary.BigEndian.PutUint64(seq[:], uint64(i))
		dec.Put(seq[:], raw)
	}
	for _, f := range all {
		if s, ok := status[f.ID]; ok {
			f.Review.Status = findings.Status(s)
		}
		raw, _ := json.Marshal(f)
		fnd.Put([]byte(f.ID), raw)
	}
	var mf MarksFile
	if err := j.read(j.path("marks.json"), "marks", &mf); err != nil {
		return nil, err
	}
	for _, m := range mf.Marks {
		raw, _ := json.Marshal(m)
		mrk.Put([]byte(m.ID), raw)
	}
	var pf PickupFile
	if err := j.read(j.path("pickups", "pickup-list.json"), "pickups", &pf); err != nil {
		return nil, err
	}
	closed := map[string]string{}
	for _, id := range pf.Done {
		closed[id] = "done"
	}
	for _, id := range pf.Removed {
		closed[id] = "removed"
	}
	for _, id := range pf.LeftOut {
		closed[id] = "leftout"
	}
	for _, a := range pf.Added {
		raw, _ := json.Marshal(map[string]any{"id": a.ID, "chapter": a.ChapterID, "state": closed[a.ID]})
		pick.Put([]byte(a.ID), raw)
	}
	var guide struct {
		Entities []json.RawMessage `json:"entities"`
	}
	if err := j.read(j.path("ManuscriptGuide", "manuscript_guide.json"), "bible", &guide); err != nil {
		return nil, err
	}
	for i, e := range guide.Entities {
		ent.Put([]byte(fmt.Sprintf("%05d", i)), e)
	}
	return map[string]float64{}, tx.Commit()
}

func (b *boltBackend) get(bucket string, key []byte, v any) error {
	return b.db.View(func(tx *bolt.Tx) error {
		raw := tx.Bucket([]byte(bucket)).Get(key)
		if raw == nil {
			return fmt.Errorf("%s/%s missing", bucket, key)
		}
		return json.Unmarshal(raw, v)
	})
}

func (b *boltBackend) scan(bucket string, fn func(k, v []byte) error) error {
	return b.db.View(func(tx *bolt.Tx) error { return tx.Bucket([]byte(bucket)).ForEach(fn) })
}

func (b *boltBackend) Open() (map[string]int, error) {
	got := map[string]int{}
	present := 0
	if err := b.scan("chapters", func(k, v []byte) error {
		var c struct{ Present int }
		var x struct {
			ID      string `json:"id"`
			Present int    `json:"present"`
		}
		_ = c
		if err := json.Unmarshal(v, &x); err != nil {
			return err
		}
		got["chapters"]++
		present += x.Present
		return nil
	}); err != nil {
		return nil, err
	}
	got["presentTokens"] = present
	for bucket, key := range map[string]string{"marks": "marks", "findings": "findings", "pickups": "pickups", "entities": "entities"} {
		var gg int
		if err := b.scan(bucket, func(k, v []byte) error {
			var x map[string]any
			if err := json.Unmarshal(v, &x); err != nil {
				return err
			}
			gg++
			return nil
		}); err != nil {
			return nil, err
		}
		got[key] = gg
	}
	return got, nil
}

func (b *boltBackend) ChapterText(c int) (int, error) {
	var ps []MsParagraph
	if err := b.get("paragraphs", []byte(chapterID(c)), &ps); err != nil {
		return 0, err
	}
	n := 0
	for _, p := range ps {
		n += len(p.Text)
	}
	return n, nil
}

func (b *boltBackend) ChapterAlignment(c int) (int, error) {
	var t []coverage.TokenLine
	if err := b.get("alignment", []byte(chapterID(c)), &t); err != nil {
		return 0, err
	}
	return len(t), nil
}

func (b *boltBackend) ChapterASR(c, take int) (int, error) {
	var wf WordsFile
	if err := b.get("asr", k2(c, take), &wf); err != nil {
		return 0, err
	}
	return len(wf.Words), nil
}

func (b *boltBackend) ChapterPeaks(c, take int) (int, error) {
	n := 0
	return n, b.db.View(func(tx *bolt.Tx) error { n = len(tx.Bucket([]byte("peaks")).Get(k2(c, take))); return nil })
}

func (b *boltBackend) EditMark(i int) error {
	return b.GroupEditMarks(1, i)
}

func (b *boltBackend) EditWord(c, idx int) error {
	return b.db.Update(func(tx *bolt.Tx) error {
		bk := tx.Bucket([]byte("alignment"))
		var t []coverage.TokenLine
		if err := json.Unmarshal(bk.Get([]byte(chapterID(c))), &t); err != nil {
			return err
		}
		t[idx%len(t)].Text = fmt.Sprintf("fixed%d", idx)
		raw, _ := json.Marshal(t)
		return bk.Put([]byte(chapterID(c)), raw)
	})
}

func (b *boltBackend) GroupEditMarks(n, seed int) error {
	return b.db.Update(func(tx *bolt.Tx) error {
		bk := tx.Bucket([]byte("marks"))
		cur := bk.Cursor()
		k, v := cur.First()
		for skip := (seed * n) % 1000; skip > 0 && k != nil; skip-- {
			k, v = cur.Next()
		}
		for i := 0; i < n && k != nil; i++ {
			var m map[string]any
			if err := json.Unmarshal(v, &m); err != nil {
				return err
			}
			m["text"] = fmt.Sprintf("group %d.%d", seed, i)
			raw, _ := json.Marshal(m)
			if err := bk.Put(append([]byte{}, k...), raw); err != nil {
				return err
			}
			k, v = cur.Next()
		}
		return nil
	})
}

func (b *boltBackend) DecideFinding(id string, i int) error { return b.GroupDecide([]string{id}, i) }

func (b *boltBackend) GroupDecide(ids []string, i int) error {
	return b.db.Update(func(tx *bolt.Tx) error {
		bk := tx.Bucket([]byte("findings"))
		for _, id := range ids {
			var f findings.Finding
			if err := json.Unmarshal(bk.Get([]byte(id)), &f); err != nil {
				return err
			}
			f.Review.Status = findings.StatusAccepted
			raw, _ := json.Marshal(f)
			if err := bk.Put([]byte(id), raw); err != nil {
				return err
			}
		}
		return nil
	})
}

func (b *boltBackend) QFindings() (int, error) {
	n := 0
	return n, b.scan("findings", func(k, v []byte) error {
		var f struct {
			Severity string `json:"severity"`
		}
		if err := json.Unmarshal(v, &f); err != nil {
			return err
		}
		if f.Severity == "warning" || f.Severity == "error" {
			n++
		}
		return nil
	})
}

func (b *boltBackend) QName(name string) (int, error) {
	low := strings.ToLower(name)
	paras, chapters := 0, 0
	err := b.scan("paragraphs", func(k, v []byte) error {
		var ps []MsParagraph
		if err := json.Unmarshal(v, &ps); err != nil {
			return err
		}
		hit := false
		for _, p := range ps {
			if wordMatch(strings.ToLower(p.Text), low) {
				paras++
				hit = true
			}
		}
		if hit {
			chapters++
		}
		return nil
	})
	return paras*1000 + chapters, err
}

func (b *boltBackend) QPickups() (int, error) {
	total := 0
	if err := b.scan("pickups", func(k, v []byte) error {
		var p struct{ State string }
		if err := json.Unmarshal(v, &p); err != nil {
			return err
		}
		if p.State == "" {
			total++
		}
		return nil
	}); err != nil {
		return 0, err
	}
	err := b.scan("findings", func(k, v []byte) error {
		var f struct {
			Category string                  `json:"category"`
			Review   struct{ Status string } `json:"review"`
		}
		if err := json.Unmarshal(v, &f); err != nil {
			return err
		}
		if f.Category == "pickup" && (f.Review.Status == "unreviewed" || f.Review.Status == "deferred") {
			total++
		}
		return nil
	})
	return total, err
}

func (b *boltBackend) QFTS(term string) (int, error) {
	n, err := b.QName(term)
	return n / 1000, err
}

var _ = persist.Disposable

func (b *boltBackend) ListMarks() (int, error) {
	n := 0
	return n, b.scan("marks", func(k, v []byte) error {
		var m map[string]any
		if err := json.Unmarshal(v, &m); err != nil {
			return err
		}
		n++
		return nil
	})
}

func removeIfExists(p string) error {
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
