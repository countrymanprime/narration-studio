// Command spike-storage is a throwaway benchmark for the storage question in docs/research/storage-engine-spike.md: JSON
// files (today) against SQLite through two pure-Go drivers and bbolt, on a synthetic 17 h, 35 chapter project that uses the
// app's real schemas. It is its own module so the app's go.mod and go.sum stay untouched, and nothing imports it.
//
//	go run . all -dir <empty dir> -scale full -out results.json
package main

import (
	"archive/zip"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
	"unicode"
)

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}

func loadMeta(dir string) *Meta {
	raw, err := os.ReadFile(filepath.Join(dir, "spike-meta.json"))
	if err != nil {
		fatal(err)
	}
	var m Meta
	if err := json.Unmarshal(raw, &m); err != nil {
		fatal(err)
	}
	return &m
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: spike-storage gen|build|bench|conc|crash|disk|all")
		os.Exit(2)
	}
	cmd, args := os.Args[1], os.Args[2:]
	fs := flag.NewFlagSet(cmd, flag.ExitOnError)
	dir := fs.String("dir", "", "project directory")
	scale := fs.String("scale", "full", "tiny|full|max|stress")
	backend := fs.String("backend", "json", "json|json+fsync|modernc|ncruces|bbolt")
	out := fs.String("out", "", "results file (all)")
	secs := fs.Int("secs", 5, "seconds (conc)")
	iters := fs.Int("iters", 60, "kill iterations (crash)")
	mode := fs.String("mode", "", "writer mode")
	_ = fs.Parse(args)
	if *dir == "" {
		fatal(fmt.Errorf("-dir is required"))
	}
	switch cmd {
	case "gen":
		sc, ok := scales[*scale]
		if !ok {
			fatal(fmt.Errorf("unknown scale %q", *scale))
		}
		m, err := Generate(*dir, sc)
		if err != nil {
			fatal(err)
		}
		emit(m)
	case "build":
		emit(runBuild(*dir, *backend))
	case "bench":
		emit(runBench(*dir, *backend))
	case "conc":
		emit(runConc(*dir, *backend, *secs))
	case "writer":
		runWriter(*dir, *backend, *mode, *secs)
	case "crash":
		emit(runCrash(*dir, *backend, *iters))
	case "coldopen":
		// Run after the operating system's file cache was dropped (Linux: echo 3 > /proc/sys/vm/drop_caches as root).
		meta := loadMeta(*dir)
		t0 := time.Now()
		b, err := newBackend(*dir, *backend, meta, 4)
		if err != nil {
			fatal(err)
		}
		if _, err := b.Open(); err != nil {
			fatal(err)
		}
		fmt.Printf("%s first open after cache drop: %.1f ms\n", *backend, float64(time.Since(t0).Microseconds())/1000)
	case "info":
		printInfo(*dir)
	case "disk":
		emit(runDisk(*dir))
	case "all":
		runAll(*dir, *scale, *out)
	default:
		fatal(fmt.Errorf("unknown command %q", cmd))
	}
}

func runBuild(dir, backend string) map[string]any {
	meta := loadMeta(dir)
	res := map[string]any{"backend": backend}
	start := time.Now()
	r0, _ := procMem()
	var stages map[string]float64
	var err error
	switch backend {
	case "modernc", "ncruces":
		stages, err = BuildIndex(dir, backend, meta)
	case "bbolt":
		stages, err = BuildBolt(dir, meta)
	default:
		err = fmt.Errorf("nothing to build for %s", backend)
	}
	if err != nil {
		fatal(err)
	}
	_, peak := procMem()
	res["seconds"] = time.Since(start).Seconds()
	res["stages"] = stages
	res["peakRSSMB"] = peak
	res["baseRSSMB"] = r0
	return res
}

func newBackend(dir, name string, meta *Meta, conns int) (Backend, error) {
	switch name {
	case "json":
		return newJSONBackend(dir, false, meta), nil
	case "json+fsync":
		return newJSONBackend(dir, true, meta), nil
	case "modernc", "ncruces":
		return newSQLBackend(dir, name, conns)
	case "bbolt":
		return newBoltBackend(dir)
	}
	return nil, fmt.Errorf("unknown backend %q", name)
}

// vocabulary picks one common, one middling and one rare word of the manuscript for the full-text queries.
func pickTerms(dir string, meta *Meta) (common, mid, rare string) {
	b := newJSONBackend(dir, false, meta)
	ms, err := b.manuscript()
	if err != nil {
		fatal(err)
	}
	freq := map[string]int{}
	for _, ch := range ms.Chapters {
		for _, p := range ch.Paragraphs {
			for _, w := range strings.FieldsFunc(strings.ToLower(p.Text), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
				freq[w]++
			}
		}
	}
	type kv struct {
		w string
		n int
	}
	var all []kv
	for w, n := range freq {
		all = append(all, kv{w, n})
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].n != all[j].n {
			return all[i].n > all[j].n
		}
		return all[i].w < all[j].w
	})
	common = all[0].w
	mid = all[len(all)/4].w
	rare = all[len(all)-1].w
	return
}

func runBench(dir, name string) *Result {
	meta := loadMeta(dir)
	res := newResult(name, meta.Scale.Name)
	fmt.Fprintf(os.Stderr, "== %s on %s (%d chapters, %d script words, %d ASR words, %d findings, %d marks)\n", name, meta.Scale.Name, meta.Scale.Chapters, meta.ScriptWords, meta.ASRWords, meta.Findings, meta.Marks)
	common, mid, rare := pickTerms(dir, meta)
	res.snapshotRSS("start")
	C := meta.Scale.Chapters
	var b Backend
	var openErr error
	var last map[string]int
	res.timeOp("openProject", 5, 7, 20*time.Second, func(i int) (string, error) {
		if b != nil {
			b.Close()
		}
		var err error
		b, err = newBackend(dir, name, meta, 4)
		if err != nil {
			return "", err
		}
		last, err = b.Open()
		return fmt.Sprint(last), err
	})
	if len(res.Ops) > 0 && res.Ops[0].Err != "" {
		openErr = fmt.Errorf("%s", res.Ops[0].Err)
	}
	if openErr != nil {
		emit(res)
		return res
	}
	if jb, ok := b.(*jsonBackend); ok {
		pj, _ := json.Marshal(jb.Parts)
		res.Notes["openBreakdownMs"] = string(pj)
	}
	res.snapshotRSS("afterOpen")
	count := func(f func(i int) (int, error)) func(i int) (string, error) {
		return func(i int) (string, error) { n, err := f(i); return fmt.Sprint(n), err }
	}
	res.timeOp("chapterText", 3, 40, 4*time.Second, count(func(i int) (int, error) { return b.ChapterText(i % C) }))
	res.timeOp("chapterAlignment", 3, 40, 4*time.Second, count(func(i int) (int, error) { return b.ChapterAlignment(i % C) }))
	res.timeOp("chapterASR(take0)", 3, 40, 4*time.Second, count(func(i int) (int, error) { return b.ChapterASR(i%C, 0) }))
	res.timeOp("chapterPeaks(take0)", 3, 40, 4*time.Second, count(func(i int) (int, error) { return b.ChapterPeaks(i%C, 0) }))
	res.timeOp("listMarks", 3, 30, 4*time.Second, count(func(i int) (int, error) { return b.ListMarks() }))
	res.timeOp("query.findings(sev>=warning)", 3, 30, 5*time.Second, count(func(i int) (int, error) { return b.QFindings() }))
	res.timeOp("query.name(common)", 3, 30, 5*time.Second, count(func(i int) (int, error) { return b.QName(meta.Names[0]) }))
	res.timeOp("query.name(rare)", 3, 30, 5*time.Second, count(func(i int) (int, error) { return b.QName(meta.Names[len(meta.Names)-1]) }))
	res.timeOp("query.pickupsUnresolved", 3, 30, 5*time.Second, count(func(i int) (int, error) { return b.QPickups() }))
	res.timeOp("query.fts(common)", 3, 30, 5*time.Second, count(func(i int) (int, error) { return b.QFTS(common) }))
	res.timeOp("query.fts(mid)", 3, 30, 5*time.Second, count(func(i int) (int, error) { return b.QFTS(mid) }))
	res.timeOp("query.fts(rare)", 3, 30, 5*time.Second, count(func(i int) (int, error) { return b.QFTS(rare) }))
	res.snapshotRSS("afterReads")
	res.timeOp("edit.oneMark", 3, 30, 5*time.Second, func(i int) (string, error) { return "", b.EditMark(i) })
	res.timeOp("edit.oneAlignmentWord", 3, 30, 5*time.Second, func(i int) (string, error) { return "", b.EditWord(i%C, 17+i) })
	res.timeOp("edit.decideOneFinding", 3, 20, 6*time.Second, func(i int) (string, error) {
		return "", b.DecideFinding(idHash("f", (i*7+3)%meta.Findings), i)
	})
	res.timeOp("undoGroup.50marks", 3, 15, 5*time.Second, func(i int) (string, error) { return "", b.GroupEditMarks(50, i) })
	res.timeOp("undoGroup.20decisions", 2, 8, 8*time.Second, func(i int) (string, error) {
		ids := make([]string, 20)
		for k := range ids {
			ids[k] = idHash("f", (i*131+k*17)%meta.Findings)
		}
		return "", b.GroupDecide(ids, i)
	})
	res.snapshotRSS("end")
	b.Close()
	if strings.HasPrefix(name, "json") {
		res.Notes["cache"] = "OS file cache warm; process cold (no in-process cache)"
	}
	res.Notes["goroutines"] = fmt.Sprint(runtime.NumGoroutine())
	for _, f := range []string{"", "-wal", "-shm"} {
		if st, err := os.Stat(dbPath(dir, name) + f); err == nil {
			res.DiskBytes[name+f] = st.Size()
		}
	}
	if st, err := os.Stat(boltPath(dir)); err == nil && name == "bbolt" {
		res.DiskBytes["bbolt"] = st.Size()
	}
	return res
}

type DiskReport struct {
	JSONBytes   int64            `json:"jsonBytes"`
	JSONFiles   int              `json:"jsonFiles"`
	JSONZip     int64            `json:"jsonZipBytes"`
	ByKindBytes map[string]int64 `json:"byKindBytes"`
	DB          map[string]int64 `json:"dbBytes"`
	DBZip       map[string]int64 `json:"dbZipBytes"`
}

func zipSize(paths []string) int64 {
	cw := &countWriter{}
	zw := zip.NewWriter(cw)
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			continue
		}
		w, _ := zw.Create(filepath.Base(p) + fmt.Sprint(len(paths)))
		_, _ = io.Copy(w, f)
		f.Close()
	}
	_ = zw.Close()
	return cw.n
}

type countWriter struct{ n int64 }

func (c *countWriter) Write(p []byte) (int, error) { c.n += int64(len(p)); return len(p), nil }

func runDisk(dir string) DiskReport {
	r := DiskReport{ByKindBytes: map[string]int64{}, DB: map[string]int64{}, DBZip: map[string]int64{}}
	var jsonPaths []string
	_ = filepath.Walk(projectRoot(dir), func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		base := filepath.Base(p)
		if strings.HasPrefix(base, "index-") {
			if strings.HasSuffix(base, ".db") {
				name := strings.TrimSuffix(strings.TrimPrefix(base, "index-"), ".db")
				r.DB[name] = info.Size()
				r.DBZip[name] = zipSize([]string{p})
			}
			return nil
		}
		r.JSONBytes += info.Size()
		r.JSONFiles++
		jsonPaths = append(jsonPaths, p)
		rel, _ := filepath.Rel(projectRoot(dir), p)
		kind := strings.Split(filepath.ToSlash(rel), "/")[0]
		if kind == "analysis" {
			kind = strings.Join(strings.Split(filepath.ToSlash(rel), "/")[:2], "/")
		}
		r.ByKindBytes[kind] += info.Size()
		return nil
	})
	r.JSONZip = zipSize(jsonPaths)
	return r
}

type AllResults struct {
	When    string            `json:"when"`
	Meta    *Meta             `json:"meta"`
	Builds  []map[string]any  `json:"builds"`
	Bench   []Result          `json:"bench"`
	Conc    []ConcResult      `json:"concurrency"`
	Crash   []CrashResult     `json:"crash"`
	Disk    DiskReport        `json:"disk"`
	Drivers map[string]string `json:"drivers"`
}

func self() string { p, _ := os.Executable(); return p }

func sub(args ...string) []byte {
	cmd := exec.Command(self(), args...)
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		fmt.Fprintf(os.Stderr, "subcommand %v failed: %v\n", args, err)
		return nil
	}
	return out
}

func runAll(dir, scale, outPath string) {
	sc, ok := scales[scale]
	if !ok {
		fatal(fmt.Errorf("unknown scale %q", scale))
	}
	all := AllResults{When: time.Now().UTC().Format(time.RFC3339), Drivers: driverVersions()}
	fmt.Fprintln(os.Stderr, "== generating", scale)
	m, err := Generate(dir, sc)
	if err != nil {
		fatal(err)
	}
	all.Meta = m
	fmt.Fprintf(os.Stderr, "   generated in %.1fs: %d script words, %d ASR words, %d findings, %d decisions, %d marks, %d pickups\n", m.GenSeconds, m.ScriptWords, m.ASRWords, m.Findings, m.Decisions, m.Marks, m.Pickups)
	for _, be := range []string{"modernc", "ncruces", "bbolt"} {
		fmt.Fprintln(os.Stderr, "== build index", be)
		var r map[string]any
		if out := sub("build", "-dir", dir, "-backend", be); out != nil {
			_ = json.Unmarshal(out, &r)
		}
		all.Builds = append(all.Builds, r)
	}
	all.Disk = runDisk(dir)
	for _, be := range []string{"json", "json+fsync", "modernc", "ncruces", "bbolt"} {
		var r Result
		if out := sub("bench", "-dir", dir, "-backend", be, "-scale", scale); out != nil {
			_ = json.Unmarshal(out, &r)
		}
		all.Bench = append(all.Bench, r)
	}
	for _, be := range []string{"json", "modernc", "ncruces", "bbolt"} {
		fmt.Fprintln(os.Stderr, "== concurrency", be)
		var r ConcResult
		if out := sub("conc", "-dir", dir, "-backend", be, "-secs", "5"); out != nil {
			_ = json.Unmarshal(out, &r)
		}
		all.Conc = append(all.Conc, r)
	}
	for _, be := range []string{"json", "json-naive", "modernc", "ncruces", "bbolt"} {
		fmt.Fprintln(os.Stderr, "== crash", be)
		var r CrashResult
		if out := sub("crash", "-dir", dir, "-backend", be, "-iters", "60"); out != nil {
			_ = json.Unmarshal(out, &r)
		}
		all.Crash = append(all.Crash, r)
	}
	if outPath != "" {
		b, _ := json.MarshalIndent(all, "", "  ")
		if err := os.WriteFile(outPath, b, 0o644); err != nil {
			fatal(err)
		}
	}
	fmt.Println(renderMarkdown(&all))
}
