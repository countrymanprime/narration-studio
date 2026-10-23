package main

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	bolt "go.etcd.io/bbolt"
)

type LatStat struct {
	N      int     `json:"n"`
	Errors int     `json:"errors"`
	P50    float64 `json:"p50ms"`
	P95    float64 `json:"p95ms"`
	Max    float64 `json:"maxms"`
}

func lat(durs []float64, errs int) LatStat {
	sort.Float64s(durs)
	s := LatStat{N: len(durs), Errors: errs}
	if len(durs) > 0 {
		s.P50, s.P95, s.Max = pct(durs, .5), pct(durs, .95), durs[len(durs)-1]
	}
	return s
}

type ConcResult struct {
	Backend      string             `json:"backend"`
	Readers      int                `json:"readers"`
	Seconds      int                `json:"seconds"`
	Separate     bool               `json:"writerInSeparateProcess"`
	ReadAlone    map[string]LatStat `json:"readersAlone"`
	ReadWithW    map[string]LatStat `json:"readersWithWriter"`
	Writer       LatStat            `json:"writer"`
	FirstWriteEr string             `json:"firstWriterError,omitempty"`
	FirstReadEr  string             `json:"firstReaderError,omitempty"`
}

// readers runs n goroutines against b for d and returns the latency of each reader op.
func readers(b Backend, meta *Meta, n int, d time.Duration) (map[string]LatStat, string) {
	var mu sync.Mutex
	durs := map[string][]float64{}
	errs := map[string]int{}
	var first string
	var wg sync.WaitGroup
	deadline := time.Now().Add(d)
	for g := 0; g < n; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			r := rand.New(rand.NewSource(int64(g)))
			for time.Now().Before(deadline) {
				for _, op := range []string{"loadChapterAlignment", "listMarks"} {
					t0 := time.Now()
					var err error
					if op == "listMarks" {
						_, err = b.ListMarks()
					} else {
						_, err = b.ChapterAlignment(r.Intn(meta.Scale.Chapters))
					}
					el := float64(time.Since(t0).Microseconds()) / 1000
					mu.Lock()
					if err != nil {
						errs[op]++
						if first == "" {
							first = err.Error()
						}
					} else {
						durs[op] = append(durs[op], el)
					}
					mu.Unlock()
				}
			}
		}(g)
	}
	wg.Wait()
	out := map[string]LatStat{}
	for _, op := range []string{"loadChapterAlignment", "listMarks"} {
		out[op] = lat(durs[op], errs[op])
	}
	return out, first
}

type writerOut struct {
	Commits int     `json:"commits"`
	Errors  int     `json:"errors"`
	P50     float64 `json:"p50"`
	P95     float64 `json:"p95"`
	Max     float64 `json:"max"`
	First   string  `json:"first"`
}

func writerLoop(b Backend, secs int) writerOut {
	var durs []float64
	var o writerOut
	deadline := time.Now().Add(time.Duration(secs) * time.Second)
	for i := 0; time.Now().Before(deadline); i++ {
		t0 := time.Now()
		if err := b.EditMark(i); err != nil {
			o.Errors++
			if o.First == "" {
				o.First = err.Error()
			}
		} else {
			durs = append(durs, float64(time.Since(t0).Microseconds())/1000)
		}
		time.Sleep(20 * time.Millisecond)
	}
	l := lat(durs, o.Errors)
	o.Commits, o.P50, o.P95, o.Max = l.N, l.P50, l.P95, l.Max
	return o
}

func runConc(dir, name string, secs int) ConcResult {
	meta := loadMeta(dir)
	const nReaders = 4
	res := ConcResult{Backend: name, Readers: nReaders, Seconds: secs, Separate: name != "bbolt"}
	b, err := newBackend(dir, name, meta, nReaders+1)
	if err != nil {
		fatal(err)
	}
	defer b.Close()
	res.ReadAlone, _ = readers(b, meta, nReaders, 2*time.Second)
	var wg sync.WaitGroup
	var wo writerOut
	if name == "bbolt" {
		// bbolt takes an exclusive file lock: a second process cannot open the file, so the writer shares the process.
		wg.Add(1)
		go func() { defer wg.Done(); wo = writerLoop(b, secs) }()
	} else {
		cmd := exec.Command(self(), "writer", "-dir", dir, "-backend", name, "-mode", "conc", "-secs", strconv.Itoa(secs))
		cmd.Stderr = os.Stderr
		pipe, _ := cmd.StdoutPipe()
		if err := cmd.Start(); err != nil {
			fatal(err)
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = json.NewDecoder(pipe).Decode(&wo)
			_ = cmd.Wait()
		}()
	}
	time.Sleep(300 * time.Millisecond) // let the child open
	var first string
	res.ReadWithW, first = readers(b, meta, nReaders, time.Duration(secs-1)*time.Second)
	res.FirstReadEr = first
	wg.Wait()
	res.Writer = LatStat{N: wo.Commits, Errors: wo.Errors, P50: wo.P50, P95: wo.P95, Max: wo.Max}
	res.FirstWriteEr = wo.First
	return res
}

type CrashResult struct {
	Backend         string `json:"backend"`
	Kills           int    `json:"kills"`
	Consistent      int    `json:"consistent"`
	Torn            int    `json:"tornOrUnparseable"`
	Inconsistent    int    `json:"mixedVersions"`
	LostAcked       int    `json:"lostAcknowledgedCommit"`
	OpenFailed      int    `json:"openFailed"`
	IntegrityFailed int    `json:"integrityCheckFailed"`
	StrayTmp        int    `json:"strayTmpFiles"`
	Note            string `json:"note,omitempty"`
}

const crashRecords = 5000

type crashRec struct {
	ID  int    `json:"id"`
	V   int    `json:"v"`
	Pad string `json:"pad"`
}

func crashDir(dir, backend string) string { return filepath.Join(dir, "crash-"+backend) }
func crashFile(dir string) string         { return filepath.Join(projectRoot(dir), "state.json") }

func runCrash(dir, backend string, iters int) CrashResult {
	cd := crashDir(dir, backend)
	_ = os.RemoveAll(cd)
	res := CrashResult{Backend: backend}
	r := rand.New(rand.NewSource(7))
	for i := 0; i < iters; i++ {
		cmd := exec.Command(self(), "writer", "-dir", cd, "-backend", backend, "-mode", "crash")
		cmd.Stderr = os.Stderr
		pipe, _ := cmd.StdoutPipe()
		if err := cmd.Start(); err != nil {
			fatal(err)
		}
		var acked atomic.Int64
		ready := make(chan struct{}, 1)
		exited := make(chan struct{})
		go func() {
			defer close(exited)
			sc := bufio.NewScanner(pipe)
			for sc.Scan() {
				if v, ok := strings.CutPrefix(sc.Text(), "ack "); ok {
					n, _ := strconv.ParseInt(v, 10, 64)
					acked.Store(n)
					select {
					case ready <- struct{}{}:
					default:
					}
				}
			}
		}()
		select {
		case <-ready:
		case <-exited:
			_ = cmd.Wait()
			res.Kills++
			res.OpenFailed++
			continue
		case <-time.After(10 * time.Second):
		}
		time.Sleep(time.Duration(5+r.Intn(150)) * time.Millisecond)
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		res.Kills++
		checkCrash(cd, backend, int(acked.Load()), &res)
	}
	if strings.HasPrefix(backend, "json") {
		entries, _ := os.ReadDir(projectRoot(cd))
		for _, e := range entries {
			if strings.HasSuffix(e.Name(), ".tmp") {
				res.StrayTmp++
			}
		}
	}
	res.Note = "process kill (SIGKILL / TerminateProcess) only; power loss and OS crash were not tested"
	return res
}

func checkCrash(cd, backend string, acked int, res *CrashResult) {
	switch backend {
	case "json", "json-naive", "json+fsync":
		raw, err := os.ReadFile(crashFile(cd))
		if err != nil {
			res.OpenFailed++
			return
		}
		var recs struct{ Records []crashRec }
		if err := json.Unmarshal(raw, &recs); err != nil || len(recs.Records) != crashRecords {
			res.Torn++
			return
		}
		for _, x := range recs.Records {
			if x.V != recs.Records[0].V {
				res.Inconsistent++
				return
			}
		}
		if recs.Records[0].V < acked {
			res.LostAcked++
			return
		}
		res.Consistent++
	case "modernc", "ncruces":
		db, err := openDB(cd, backend, 1)
		if err != nil {
			res.OpenFailed++
			return
		}
		defer db.Close()
		var ic string
		if err := db.QueryRow(`PRAGMA integrity_check`).Scan(&ic); err != nil || ic != "ok" {
			res.IntegrityFailed++
			return
		}
		var n, distinct, v int
		if err := db.QueryRow(`SELECT count(*), count(DISTINCT v), max(v) FROM crash`).Scan(&n, &distinct, &v); err != nil || n != crashRecords {
			res.Torn++
			return
		}
		if distinct != 1 {
			res.Inconsistent++
			return
		}
		if v < acked {
			res.LostAcked++
			return
		}
		res.Consistent++
	case "bbolt":
		db, err := bolt.Open(filepath.Join(projectRoot(cd), "crash.bolt"), 0o600, &bolt.Options{Timeout: 5 * time.Second})
		if err != nil {
			res.OpenFailed++
			return
		}
		defer db.Close()
		bad, n, v := false, 0, -1
		mixed := false
		_ = db.View(func(tx *bolt.Tx) error {
			bk := tx.Bucket([]byte("kv"))
			if bk == nil {
				bad = true
				return nil
			}
			return bk.ForEach(func(k, val []byte) error {
				n++
				x, _ := strconv.Atoi(string(val[:10]))
				if v >= 0 && x != v {
					mixed = true
				}
				v = x
				return nil
			})
		})
		switch {
		case bad || n != crashRecords:
			res.Torn++
		case mixed:
			res.Inconsistent++
		case v < acked:
			res.LostAcked++
		default:
			res.Consistent++
		}
	}
}

// runWriter is the sidecar-like process: it either writes small edits for a while (conc) or rewrites the whole crash state
// in a loop printing an acknowledgement after every commit until it is killed (crash).
func runWriter(dir, backend, mode string, secs int) {
	switch mode {
	case "conc":
		meta := loadMeta(dir)
		b, err := newBackend(dir, backend, meta, 2)
		if err != nil {
			emit(writerOut{Errors: 1, First: err.Error()})
			return
		}
		defer b.Close()
		emit(writerLoop(b, secs))
	case "crash":
		crashWriter(dir, backend)
	}
}

func crashWriter(dir, backend string) {
	debug.SetGCPercent(400)
	pad := strings.Repeat("x", 120)
	ack := func(v int) { fmt.Printf("ack %d\n", v) }
	switch backend {
	case "json", "json+fsync", "json-naive":
		path := crashFile(dir)
		_ = os.MkdirAll(filepath.Dir(path), 0o755)
		start := 0
		if raw, err := os.ReadFile(path); err == nil {
			var recs struct{ Records []crashRec }
			if json.Unmarshal(raw, &recs) == nil && len(recs.Records) > 0 {
				start = recs.Records[0].V
			}
		}
		recs := make([]crashRec, crashRecords)
		for i := range recs {
			recs[i] = crashRec{ID: i, Pad: pad}
		}
		for v := start + 1; ; v++ {
			for i := range recs {
				recs[i].V = v
			}
			raw, _ := json.MarshalIndent(map[string]any{"records": recs}, "", "  ")
			if backend == "json-naive" {
				if err := os.WriteFile(path, raw, 0o600); err != nil {
					return
				}
			} else {
				j := &jsonBackend{fsync: backend == "json+fsync"}
				if err := j.writeBytes(path, raw); err != nil {
					return
				}
			}
			ack(v)
		}
	case "modernc", "ncruces":
		_ = os.MkdirAll(projectRoot(dir), 0o755)
		db, err := openDB(dir, backend, 1)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(3)
		}
		var n int
		if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE name='crash'`).Scan(&n); err != nil {
			return
		}
		start := 0
		if n == 0 {
			if _, err := db.Exec(`CREATE TABLE crash(id INTEGER PRIMARY KEY, v INTEGER, pad TEXT)`); err != nil {
				return
			}
			tx, _ := db.Begin()
			for i := 0; i < crashRecords; i++ {
				_, _ = tx.Exec(`INSERT INTO crash VALUES(?,0,?)`, i, pad)
			}
			_ = tx.Commit()
		} else {
			_ = db.QueryRow(`SELECT max(v) FROM crash`).Scan(&start)
		}
		for v := start + 1; ; v++ {
			if err := commitSQL(db, v); err != nil {
				return
			}
			ack(v)
		}
	case "bbolt":
		_ = os.MkdirAll(projectRoot(dir), 0o755)
		db, err := bolt.Open(filepath.Join(projectRoot(dir), "crash.bolt"), 0o600, nil)
		if err != nil {
			return
		}
		start := 0
		_ = db.Update(func(tx *bolt.Tx) error {
			bk, _ := tx.CreateBucketIfNotExists([]byte("kv"))
			if bk.Get([]byte("00000")) == nil {
				for i := 0; i < crashRecords; i++ {
					_ = bk.Put([]byte(fmt.Sprintf("%05d", i)), []byte(fmt.Sprintf("%010d", 0)+pad))
				}
			} else {
				start, _ = strconv.Atoi(string(bk.Get([]byte("00000"))[:10]))
			}
			return nil
		})
		for v := start + 1; ; v++ {
			err := db.Update(func(tx *bolt.Tx) error {
				bk := tx.Bucket([]byte("kv"))
				for i := 0; i < crashRecords; i++ {
					if err := bk.Put([]byte(fmt.Sprintf("%05d", i)), []byte(fmt.Sprintf("%010d", v)+pad)); err != nil {
						return err
					}
				}
				return nil
			})
			if err != nil {
				return
			}
			ack(v)
		}
	}
}

func commitSQL(db *sql.DB, v int) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE crash SET v=?`, v); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}
