package main

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sort"
	"time"
)

// OpStat is one timed operation. Times are milliseconds over N runs; WriteKB is the median bytes the process asked the
// operating system to write during one run (Linux: /proc/self/io wchar; Windows: WriteTransferCount), in KiB.
type OpStat struct {
	Name    string  `json:"name"`
	N       int     `json:"n"`
	P50     float64 `json:"p50ms"`
	P95     float64 `json:"p95ms"`
	Max     float64 `json:"maxms"`
	WriteKB float64 `json:"writeKiB"`
	Result  string  `json:"result,omitempty"`
	Err     string  `json:"err,omitempty"`
}

type Result struct {
	Backend   string             `json:"backend"`
	Scale     string             `json:"scale"`
	OS        string             `json:"os"`
	Go        string             `json:"go"`
	CPUs      int                `json:"cpus"`
	Ops       []OpStat           `json:"ops"`
	RSSMB     map[string]float64 `json:"rssMB"`
	DiskBytes map[string]int64   `json:"diskBytes"`
	Notes     map[string]string  `json:"notes,omitempty"`
}

func newResult(backend, scale string) *Result {
	return &Result{Backend: backend, Scale: scale, OS: runtime.GOOS + "/" + runtime.GOARCH, Go: runtime.Version(), CPUs: runtime.NumCPU(), RSSMB: map[string]float64{}, DiskBytes: map[string]int64{}, Notes: map[string]string{}}
}

func pct(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	i := int(float64(len(sorted)-1)*p + 0.5)
	return sorted[i]
}

// timeOp runs fn up to max times (at least min, stopping early once budget is spent) and records the distribution. fn gets
// the run number. The first run is included: these are one-shot interactions, not a warmed loop, but each op is run in a
// process that has already opened the project.
func (r *Result) timeOp(name string, min, max int, budget time.Duration, fn func(i int) (string, error)) {
	var durs, writes []float64
	var last string
	var firstErr error
	began := time.Now()
	n := 0
	for i := 0; i < max; i++ {
		w0 := procWrite()
		t0 := time.Now()
		res, err := fn(i)
		d := time.Since(t0)
		w1 := procWrite()
		if err != nil {
			firstErr = err
			break
		}
		last = res
		durs = append(durs, float64(d.Microseconds())/1000)
		writes = append(writes, float64(w1-w0)/1024)
		n++
		if i+1 >= min && time.Since(began) > budget {
			break
		}
	}
	st := OpStat{Name: name, N: n, Result: last}
	if firstErr != nil {
		st.Err = firstErr.Error()
	}
	if n > 0 {
		sort.Float64s(durs)
		sort.Float64s(writes)
		st.P50, st.P95, st.Max, st.WriteKB = pct(durs, .5), pct(durs, .95), durs[len(durs)-1], pct(writes, .5)
	}
	r.Ops = append(r.Ops, st)
	fmt.Fprintf(os.Stderr, "  %-34s n=%-3d p50=%9.2f ms  p95=%9.2f ms  write=%9.1f KiB  %s%s\n", name, st.N, st.P50, st.P95, st.WriteKB, st.Result, st.Err)
}

func (r *Result) snapshotRSS(label string) {
	rss, hwm := procMem()
	r.RSSMB[label+".rss"] = rss
	r.RSSMB[label+".peak"] = hwm
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	r.RSSMB[label+".goHeapInuse"] = float64(ms.HeapInuse) / 1048576
}

func emit(v any) {
	b, _ := json.MarshalIndent(v, "", "  ")
	fmt.Println(string(b))
}
