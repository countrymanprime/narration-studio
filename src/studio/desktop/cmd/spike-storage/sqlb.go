package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ncruces/go-sqlite3"
	ncdriver "github.com/ncruces/go-sqlite3/driver"
	ncfts5 "github.com/ncruces/go-sqlite3/ext/fts5"
	_ "modernc.org/sqlite"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/evidence"
	"github.com/countrymanprime/narration-utils/shell/internal/findings"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

const schema = `
CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE chapters(id TEXT PRIMARY KEY, ord INTEGER, title TEXT, paragraphs INTEGER, body_tokens INTEGER, present_tokens INTEGER);
CREATE TABLE paragraphs(id INTEGER PRIMARY KEY, chapter_id TEXT, pid TEXT, ord INTEGER, text TEXT);
CREATE TABLE tokens(chapter_id TEXT, idx INTEGER, pid TEXT, w INTEGER, text TEXT, status TEXT, heard TEXT, item INTEGER, t0 REAL, t1 REAL, PRIMARY KEY(chapter_id, idx)) WITHOUT ROWID;
CREATE TABLE asr_words(chapter_id TEXT, take INTEGER, idx INTEGER, text TEXT, t0 REAL, t1 REAL, PRIMARY KEY(chapter_id, take, idx)) WITHOUT ROWID;
CREATE TABLE peaks(chapter_id TEXT, take INTEGER, per_sec INTEGER, minmax BLOB, PRIMARY KEY(chapter_id, take)) WITHOUT ROWID;
CREATE TABLE findings(id TEXT PRIMARY KEY, analyzer TEXT, chapter_id TEXT, category TEXT, severity TEXT, status TEXT, confidence REAL, t0 REAL, t1 REAL, json TEXT);
CREATE TABLE decisions(seq INTEGER PRIMARY KEY AUTOINCREMENT, finding_id TEXT, status TEXT, note TEXT, ts TEXT);
CREATE TABLE marks(id TEXT PRIMARY KEY, chapter_id TEXT, pid TEXT, start INTEGER, end INTEGER, quote TEXT, type TEXT, text TEXT, status TEXT, thread TEXT, created_at TEXT);
CREATE TABLE pickups(id TEXT PRIMARY KEY, chapter_id TEXT, pid TEXT, t REAL, line TEXT, at TEXT, state TEXT);
CREATE TABLE entities(id TEXT PRIMARY KEY, name TEXT, category TEXT, occurrence_count INTEGER, json TEXT);
CREATE TABLE crash(id INTEGER PRIMARY KEY, v INTEGER);
`

const indexes = `
CREATE INDEX paragraphs_ch ON paragraphs(chapter_id, ord);
CREATE INDEX findings_sev ON findings(severity, chapter_id, t0);
CREATE INDEX findings_ch ON findings(chapter_id);
CREATE INDEX findings_cat ON findings(category, status);
CREATE INDEX decisions_f ON decisions(finding_id, seq);
CREATE INDEX marks_ch ON marks(chapter_id, pid);
CREATE INDEX pickups_ch ON pickups(chapter_id, state);
CREATE VIRTUAL TABLE para_fts USING fts5(text, content='paragraphs', content_rowid='id');
`

func dbPath(dir, backend string) string {
	return filepath.Join(projectRoot(dir), "index-"+backend+".db")
}

// driverName maps a backend to its database/sql driver and DSN.
func openDB(dir, backend string, readers int) (*sql.DB, error) {
	p := dbPath(dir, backend)
	var db *sql.DB
	var err error
	switch backend {
	case "modernc":
		db, err = sql.Open("sqlite", "file:"+filepath.ToSlash(p)+"?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)&_pragma=temp_store(MEMORY)")
	case "ncruces":
		db, err = ncdriver.Open("file:"+filepath.ToSlash(p)+"?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)&_pragma=temp_store(MEMORY)",
			func(c *sqlite3.Conn) error { return ncfts5.Register(c) })
	default:
		return nil, fmt.Errorf("unknown sql backend %q", backend)
	}
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(readers)
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return db, nil
}

type sqlBackend struct {
	name string
	dir  string
	db   *sql.DB
}

func newSQLBackend(dir, name string, conns int) (*sqlBackend, error) {
	db, err := openDB(dir, name, conns)
	if err != nil {
		return nil, err
	}
	return &sqlBackend{name: name, dir: dir, db: db}, nil
}

func (b *sqlBackend) Name() string { return b.name }
func (b *sqlBackend) Close() error { return b.db.Close() }

func (b *sqlBackend) count(q string, args ...any) (int, error) {
	var n int
	return n, b.db.QueryRow(q, args...).Scan(&n)
}

func (b *sqlBackend) Open() (map[string]int, error) {
	got := map[string]int{}
	var err error
	// chapter list with the coverage summary the Production page needs
	rows, err := b.db.Query(`SELECT id, ord, title, paragraphs, body_tokens, present_tokens FROM chapters ORDER BY ord`)
	if err != nil {
		return nil, err
	}
	n, present := 0, 0
	for rows.Next() {
		var id, title string
		var ord, paras, body, pres int
		if err := rows.Scan(&id, &ord, &title, &paras, &body, &pres); err != nil {
			return nil, err
		}
		n++
		present += pres
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	got["chapters"], got["presentTokens"] = n, present
	// marks
	mr, err := b.db.Query(`SELECT id, chapter_id, pid, start, end, quote, type, text, status, thread, created_at FROM marks ORDER BY chapter_id, pid, start`)
	if err != nil {
		return nil, err
	}
	nm := 0
	for mr.Next() {
		var a, c, p, q, t, tx, st, th, ca sql.NullString
		var s, e int
		if err := mr.Scan(&a, &c, &p, &s, &e, &q, &t, &tx, &st, &th, &ca); err != nil {
			return nil, err
		}
		nm++
	}
	mr.Close()
	got["marks"] = nm
	// findings summary
	fr, err := b.db.Query(`SELECT analyzer, severity, status, count(*) FROM findings GROUP BY analyzer, severity, status`)
	if err != nil {
		return nil, err
	}
	tot := 0
	for fr.Next() {
		var a, s, st string
		var c int
		if err := fr.Scan(&a, &s, &st, &c); err != nil {
			return nil, err
		}
		tot += c
	}
	fr.Close()
	got["findings"] = tot
	if got["pickups"], err = b.count(`SELECT count(*) FROM pickups`); err != nil {
		return nil, err
	}
	er, err := b.db.Query(`SELECT id, name, category, occurrence_count FROM entities ORDER BY name`)
	if err != nil {
		return nil, err
	}
	ne := 0
	for er.Next() {
		var a, n, c string
		var k int
		if err := er.Scan(&a, &n, &c, &k); err != nil {
			return nil, err
		}
		ne++
	}
	er.Close()
	got["entities"] = ne
	return got, nil
}

func (b *sqlBackend) ChapterText(c int) (int, error) {
	r, err := b.db.Query(`SELECT text FROM paragraphs WHERE chapter_id=? ORDER BY ord`, chapterID(c))
	if err != nil {
		return 0, err
	}
	defer r.Close()
	n := 0
	for r.Next() {
		var t string
		if err := r.Scan(&t); err != nil {
			return 0, err
		}
		n += len(t)
	}
	return n, r.Err()
}

func (b *sqlBackend) ChapterAlignment(c int) (int, error) {
	r, err := b.db.Query(`SELECT idx, pid, w, text, status, heard, item, t0, t1 FROM tokens WHERE chapter_id=? ORDER BY idx`, chapterID(c))
	if err != nil {
		return 0, err
	}
	defer r.Close()
	n := 0
	for r.Next() {
		var idx, w int
		var pid, text, status string
		var heard sql.NullString
		var item sql.NullInt64
		var t0, t1 sql.NullFloat64
		if err := r.Scan(&idx, &pid, &w, &text, &status, &heard, &item, &t0, &t1); err != nil {
			return 0, err
		}
		n++
	}
	return n, r.Err()
}

func (b *sqlBackend) ChapterASR(c, take int) (int, error) {
	r, err := b.db.Query(`SELECT idx, text, t0, t1 FROM asr_words WHERE chapter_id=? AND take=? ORDER BY idx`, chapterID(c), take)
	if err != nil {
		return 0, err
	}
	defer r.Close()
	n := 0
	for r.Next() {
		var idx int
		var text string
		var t0, t1 float64
		if err := r.Scan(&idx, &text, &t0, &t1); err != nil {
			return 0, err
		}
		n++
	}
	return n, r.Err()
}

func (b *sqlBackend) ChapterPeaks(c, take int) (int, error) {
	var blob []byte
	if err := b.db.QueryRow(`SELECT minmax FROM peaks WHERE chapter_id=? AND take=?`, chapterID(c), take).Scan(&blob); err != nil {
		return 0, err
	}
	return len(blob), nil
}

func (b *sqlBackend) EditMark(i int) error {
	n, err := b.count(`SELECT count(*) FROM marks`)
	if err != nil {
		return err
	}
	var id string
	if err := b.db.QueryRow(`SELECT id FROM marks LIMIT 1 OFFSET ?`, i%n).Scan(&id); err != nil {
		return err
	}
	_, err = b.db.Exec(`UPDATE marks SET text=? WHERE id=?`, fmt.Sprintf("edited %d", i), id)
	return err
}

func (b *sqlBackend) EditWord(c, idx int) error {
	_, err := b.db.Exec(`UPDATE tokens SET text=? WHERE chapter_id=? AND idx=?`, fmt.Sprintf("fixed%d", idx), chapterID(c), idx)
	return err
}

func (b *sqlBackend) GroupEditMarks(n, seed int) error {
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	st, err := tx.Prepare(`UPDATE marks SET text=? WHERE id=(SELECT id FROM marks LIMIT 1 OFFSET ?)`)
	if err != nil {
		return err
	}
	defer st.Close()
	for k := 0; k < n; k++ {
		if _, err := st.Exec(fmt.Sprintf("group %d.%d", seed, k), (seed*n+k)%1000); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (b *sqlBackend) DecideFinding(id string, i int) error {
	return b.GroupDecide([]string{id}, i)
}

func (b *sqlBackend) GroupDecide(ids []string, i int) error {
	tx, err := b.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, id := range ids {
		if _, err := tx.Exec(`INSERT INTO decisions(finding_id,status,note,ts) VALUES(?,?,?,?)`, id, "accepted", fmt.Sprintf("n%d", i), "2026-10-18T00:00:00Z"); err != nil {
			return err
		}
		if _, err := tx.Exec(`UPDATE findings SET status='accepted' WHERE id=?`, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (b *sqlBackend) QFindings() (int, error) {
	r, err := b.db.Query(`SELECT id, chapter_id, severity, t0 FROM findings WHERE severity IN ('warning','error') ORDER BY severity DESC, chapter_id, t0 LIMIT 50`)
	if err != nil {
		return 0, err
	}
	for r.Next() {
		var a, c, s string
		var t float64
		if err := r.Scan(&a, &c, &s, &t); err != nil {
			return 0, err
		}
	}
	r.Close()
	return b.count(`SELECT count(*) FROM findings WHERE severity IN ('warning','error')`)
}

func ftsQuery(s string) string { return `"` + strings.ReplaceAll(s, `"`, ``) + `"` }

func (b *sqlBackend) QName(name string) (int, error) {
	r, err := b.db.Query(`SELECT p.chapter_id, count(*) FROM para_fts f JOIN paragraphs p ON p.id=f.rowid WHERE para_fts MATCH ? GROUP BY p.chapter_id`, ftsQuery(name))
	if err != nil {
		return 0, err
	}
	defer r.Close()
	paras, chapters := 0, 0
	for r.Next() {
		var c string
		var n int
		if err := r.Scan(&c, &n); err != nil {
			return 0, err
		}
		paras += n
		chapters++
	}
	return paras*1000 + chapters, r.Err()
}

func (b *sqlBackend) QPickups() (int, error) {
	r, err := b.db.Query(`SELECT chapter_id, sum(n) FROM (
		SELECT chapter_id, count(*) n FROM pickups WHERE state='open' GROUP BY chapter_id
		UNION ALL
		SELECT chapter_id, count(*) n FROM findings WHERE category='pickup' AND status IN ('unreviewed','deferred') GROUP BY chapter_id) GROUP BY chapter_id ORDER BY chapter_id`)
	if err != nil {
		return 0, err
	}
	defer r.Close()
	total := 0
	for r.Next() {
		var c string
		var n int
		if err := r.Scan(&c, &n); err != nil {
			return 0, err
		}
		total += n
	}
	return total, r.Err()
}

func (b *sqlBackend) QFTS(term string) (int, error) {
	r, err := b.db.Query(`SELECT p.pid, snippet(para_fts, 0, '[', ']', '…', 12) FROM para_fts f JOIN paragraphs p ON p.id=f.rowid WHERE para_fts MATCH ? ORDER BY rank LIMIT 20`, ftsQuery(term))
	if err != nil {
		return 0, err
	}
	for r.Next() {
		var a, s string
		if err := r.Scan(&a, &s); err != nil {
			return 0, err
		}
	}
	r.Close()
	return b.count(`SELECT count(*) FROM para_fts WHERE para_fts MATCH ?`, ftsQuery(term))
}

// BuildIndex imports the JSON project into a fresh database, reading every file the way the host would, and returns the
// seconds each stage took. The JSON files stay the source of truth: this is the cost of the derived index.
func BuildIndex(dir, name string, meta *Meta) (map[string]float64, error) {
	_ = os.Remove(dbPath(dir, name))
	_ = os.Remove(dbPath(dir, name) + "-wal")
	_ = os.Remove(dbPath(dir, name) + "-shm")
	b, err := newSQLBackend(dir, name, 1)
	if err != nil {
		return nil, err
	}
	defer b.Close()
	times := map[string]float64{}
	lap := time.Now()
	mark := func(k string) { times[k] = time.Since(lap).Seconds(); lap = time.Now() }
	rep := &persist.Reporter{}
	read := func(path string, v any) error {
		out := rep.ReadJSON(path, path, persist.NarratorData, func(raw []byte) error { return json.Unmarshal(raw, v) })
		if out != persist.Loaded {
			return fmt.Errorf("read %s: %d", path, out)
		}
		return nil
	}
	root := projectRoot(dir)
	if _, err := b.db.Exec(schema); err != nil {
		return nil, err
	}
	tx, err := b.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var ms ManuscriptFile
	if err := read(filepath.Join(root, "manuscript", "manuscript.json"), &ms); err != nil {
		return nil, err
	}
	mark("readManuscript")
	insChapter := must(tx.Prepare(`INSERT INTO chapters VALUES(?,?,?,?,?,?)`))
	insPara := must(tx.Prepare(`INSERT INTO paragraphs(chapter_id,pid,ord,text) VALUES(?,?,?,?)`))
	insTok := must(tx.Prepare(`INSERT INTO tokens VALUES(?,?,?,?,?,?,?,?,?,?)`))
	for c, ch := range ms.Chapters {
		var res coverage.StoredResult
		if err := read(filepath.Join(root, "analysis", "coverage", "results", "rec-"+ch.ID+".json"), &res); err != nil {
			return nil, err
		}
		if _, err := insChapter.Exec(ch.ID, c, ch.Title, len(ch.Paragraphs), res.Report.Summary.BodyTokens, res.Report.Summary.PresentTokens); err != nil {
			return nil, err
		}
		for i, p := range ch.Paragraphs {
			if _, err := insPara.Exec(ch.ID, p.ID, i, p.Text); err != nil {
				return nil, err
			}
		}
		for _, t := range res.Report.Tokens {
			var pid any
			if t.ParagraphID != nil {
				pid = *t.ParagraphID
			}
			if _, err := insTok.Exec(ch.ID, t.Index, pid, t.Word, t.Text, t.Status, t.Heard, t.Item, t.Start, t.End); err != nil {
				return nil, err
			}
		}
	}
	mark("importChaptersTextAlignment")
	cache := evidence.NewCacheStore(dir)
	cache.Reporter = rep
	insASR := must(tx.Prepare(`INSERT INTO asr_words VALUES(?,?,?,?,?,?)`))
	insPeaks := must(tx.Prepare(`INSERT INTO peaks VALUES(?,?,?,?)`))
	for c := range ms.Chapters {
		for t := 0; t < meta.ChapterTakes[c]; t++ {
			blob, ok := cache.Read(takeKey(dir, c, t, "words"))
			if !ok {
				return nil, fmt.Errorf("words miss")
			}
			var wb WordsBlob
			if err := json.Unmarshal(blob, &wb); err != nil {
				return nil, err
			}
			var wf WordsFile
			if err := json.Unmarshal(wb.Segments[0], &wf); err != nil {
				return nil, err
			}
			for i, w := range wf.Words {
				if _, err := insASR.Exec(chapterID(c), t, i, w[0], w[1], w[2]); err != nil {
					return nil, err
				}
			}
			pb, ok := cache.Read(takeKey(dir, c, t, "peaks"))
			if !ok {
				return nil, fmt.Errorf("peaks miss")
			}
			var pk struct {
				PerSec int    `json:"bucketsPerSecond"`
				MinMax []byte `json:"minMax"`
			}
			if err := json.Unmarshal(pb, &pk); err != nil {
				return nil, err
			}
			if _, err := insPeaks.Exec(chapterID(c), t, pk.PerSec, pk.MinMax); err != nil {
				return nil, err
			}
		}
	}
	mark("importASRWordsAndPeaks")
	store := findings.NewStore(dir)
	store.SetPersist(rep)
	all, err := store.List(findings.Query{IncludeNotInLatestRun: true})
	if err != nil {
		return nil, err
	}
	var rv ReviewFile
	if err := read(filepath.Join(root, "findings", "review.json"), &rv); err != nil {
		return nil, err
	}
	status := map[string]string{}
	insDec := must(tx.Prepare(`INSERT INTO decisions(finding_id,status,note,ts) VALUES(?,?,?,?)`))
	for _, d := range rv.Decisions {
		status[d.FindingID] = string(d.Status)
		if _, err := insDec.Exec(d.FindingID, string(d.Status), d.Note, d.Timestamp); err != nil {
			return nil, err
		}
	}
	insF := must(tx.Prepare(`INSERT INTO findings VALUES(?,?,?,?,?,?,?,?,?,?)`))
	for _, f := range all {
		raw, _ := json.Marshal(f)
		st := "unreviewed"
		if s, ok := status[f.ID]; ok {
			st = s
		}
		ch := ""
		if f.Manuscript != nil {
			ch = f.Manuscript.ChapterID
		}
		var t0, t1 any
		if f.TimeRange != nil {
			t0, t1 = f.TimeRange.Start, f.TimeRange.End
		}
		var conf any
		if f.Confidence != nil {
			conf = *f.Confidence
		}
		if _, err := insF.Exec(f.ID, f.Analyzer, ch, string(f.Category), string(f.Severity), st, conf, t0, t1, string(raw)); err != nil {
			return nil, err
		}
	}
	mark("importFindingsAndDecisions")
	var mf MarksFile
	if err := read(filepath.Join(root, "marks.json"), &mf); err != nil {
		return nil, err
	}
	insM := must(tx.Prepare(`INSERT INTO marks VALUES(?,?,?,?,?,?,?,?,?,?,?)`))
	for _, m := range mf.Marks {
		th, _ := json.Marshal(m.Thread)
		if _, err := insM.Exec(m.ID, m.ChapterID, m.ParagraphID, m.Start, m.End, m.Quote, m.Type, m.Text, m.Status, string(th), m.CreatedAt.Format(time.RFC3339)); err != nil {
			return nil, err
		}
	}
	var pf PickupFile
	if err := read(filepath.Join(root, "pickups", "pickup-list.json"), &pf); err != nil {
		return nil, err
	}
	state := map[string]string{}
	for _, id := range pf.Done {
		state[id] = "done"
	}
	for _, id := range pf.Removed {
		state[id] = "removed"
	}
	for _, id := range pf.LeftOut {
		state[id] = "leftout"
	}
	insP := must(tx.Prepare(`INSERT INTO pickups VALUES(?,?,?,?,?,?,?)`))
	for _, a := range pf.Added {
		st := state[a.ID]
		if st == "" {
			st = "open"
		}
		if _, err := insP.Exec(a.ID, a.ChapterID, a.ParagraphID, a.Time, a.Line, a.At, st); err != nil {
			return nil, err
		}
	}
	var guide struct {
		Entities []json.RawMessage `json:"entities"`
	}
	if err := read(filepath.Join(root, "ManuscriptGuide", "manuscript_guide.json"), &guide); err != nil {
		return nil, err
	}
	insE := must(tx.Prepare(`INSERT INTO entities VALUES(?,?,?,?,?)`))
	for _, raw := range guide.Entities {
		var e struct {
			ID    string `json:"id"`
			Name  string `json:"canonical_name"`
			Cat   string `json:"category"`
			Count int    `json:"occurrence_count"`
		}
		if err := json.Unmarshal(raw, &e); err != nil {
			return nil, err
		}
		if _, err := insE.Exec(e.ID, e.Name, e.Cat, e.Count, string(raw)); err != nil {
			return nil, err
		}
	}
	mark("importMarksPickupsBible")
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	mark("commit")
	if _, err := b.db.Exec(indexes); err != nil {
		return nil, err
	}
	mark("createIndexes")
	if _, err := b.db.Exec(`INSERT INTO para_fts(para_fts) VALUES('rebuild')`); err != nil {
		return nil, fmt.Errorf("fts5 rebuild: %w", err)
	}
	mark("ftsRebuild")
	if _, err := b.db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		return nil, err
	}
	mark("checkpoint")
	return times, nil
}

func must(st *sql.Stmt, err error) *sql.Stmt {
	if err != nil {
		panic(err)
	}
	return st
}

func (b *sqlBackend) ListMarks() (int, error) {
	r, err := b.db.Query(`SELECT id, chapter_id, pid, start, end, quote, type, text, status, thread, created_at FROM marks ORDER BY chapter_id, pid, start`)
	if err != nil {
		return 0, err
	}
	defer r.Close()
	n := 0
	for r.Next() {
		var a, c, p, q, t, tx, st, th, ca sql.NullString
		var s, e int
		if err := r.Scan(&a, &c, &p, &s, &e, &q, &t, &tx, &st, &th, &ca); err != nil {
			return 0, err
		}
		n++
	}
	return n, r.Err()
}
