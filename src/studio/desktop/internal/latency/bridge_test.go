//go:build latency

package latency

// The REAPER bridge round trip, end to end: the real Go client (bridge.Client and bridge.Actions) against the real
// narration_ui_bridge.lua running on the harness's fake `reaper`, which scripts/research/bridge-fake-driver.py ticks like REAPER's defer
// loop (16 to 33 ms apart). The host side is a goroutine calling Dispatch every LATENCY_BRIDGE_TICK_MS (150, transcriptLoop's tick).
//
//	LATENCY_BRIDGE_PYTHON=<repo>/.venv/Scripts/python.exe go test -tags latency -run TestBridgeRoundTrip -count=1 -v ./internal/latency
//
// Optional: LATENCY_BRIDGE_CALLS (default 100 measured calls, after 10 warm-up calls), LATENCY_BRIDGE_TICK_MS (default 150),
// LATENCY_BRIDGE_LOG_KB (a comma list of events.log sizes to pre-fill, default "0,1024,8192") and LATENCY_OUT (a file the markdown is appended to).
//
// Each call is PlayPosition (read-only: the cheapest round trip). Calls are spread at random offsets inside the host tick, so the wait for the
// tick averages over its phase. A probe polls the session folder every millisecond to split the round trip: the command file written, the
// bridge taking it (the file is gone), the answer appended to events.log, and the host delivering it.

import (
	"bufio"
	"context"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/bridge"
)

type phases struct {
	total, taken, written, delivered time.Duration
}

func startDriver(t *testing.T, python, dir string, prefillKB int) {
	t.Helper()
	if prefillKB > 0 {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		line := bridge.EncodeFields([]string{"PROJECT_STATUS", "", "C:/Projects/Book/Book.rpp", "0", "1234", "1", "62.500000"}) + "\n"
		filler := strings.Repeat(line, prefillKB*1024/len(line)+1)
		if err := os.WriteFile(filepath.Join(dir, "events.log"), []byte(filler), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	driver, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "..", "scripts", "research", "bridge-fake-driver.py"))
	if err != nil {
		t.Fatal(err)
	}
	command := exec.Command(python, driver, dir)
	stdin, err := command.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		t.Fatalf("could not start the driver: %v", err)
	}
	t.Cleanup(func() { _ = stdin.Close(); _ = command.Wait() })
	ready := make(chan string, 1)
	go func() {
		line, _ := bufio.NewReader(stdout).ReadString('\n')
		ready <- strings.TrimSpace(line)
	}()
	select {
	case line := <-ready:
		if line != "READY" {
			t.Fatalf("the driver said %q, not READY", line)
		}
	case <-time.After(60 * time.Second):
		t.Fatal("the driver never said READY")
	}
}

// probe watches the session folder for one command and returns when it has seen the command file taken and the log grow.
func probe(dir string, sentAt time.Time, logBefore int64, out chan<- [2]time.Duration) {
	var taken, written time.Duration
	commands := filepath.Join(dir, "commands")
	events := filepath.Join(dir, "events.log")
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) && (taken == 0 || written == 0) {
		if taken == 0 {
			if names, _ := os.ReadDir(commands); len(names) == 0 {
				taken = time.Since(sentAt)
			}
		}
		if taken != 0 && written == 0 {
			// Heartbeats also grow the log, so this is "the log grew after the command was taken": close enough, and the
			// answer is written in the same tick that takes the command.
			if info, err := os.Stat(events); err == nil && info.Size() > logBefore {
				written = time.Since(sentAt)
			}
		}
		time.Sleep(500 * time.Microsecond)
	}
	out <- [2]time.Duration{taken, written}
}

func round(t *testing.T, python string, prefillKB, calls int, tick time.Duration) []phases {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "hub_latency")
	startDriver(t, python, dir, prefillKB)
	client, err := bridge.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	actions := bridge.NewActions(client, func(string) error { return nil })
	actions.SetTimeout(10 * time.Second)

	// The host's loop: one Dispatch per tick, like Host.transcriptLoop, and nothing else.
	loopCtx, stop := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(tick)
		defer ticker.Stop()
		for {
			select {
			case <-loopCtx.Done():
				return
			case <-ticker.C:
				_ = client.Dispatch()
			}
		}
	}()
	t.Cleanup(func() { stop(); <-done })

	var all []phases
	random := rand.New(rand.NewSource(11))
	for i := 0; i < calls+10; i++ {
		time.Sleep(time.Duration(random.Int63n(int64(tick))))
		info, _ := os.Stat(filepath.Join(dir, "events.log"))
		var before int64
		if info != nil {
			before = info.Size()
		}
		probed := make(chan [2]time.Duration, 1)
		sent := time.Now()
		go probe(dir, sent, before, probed)
		if _, err := actions.PlayPosition(loopCtx); err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
		total := time.Since(sent)
		seen := <-probed
		if i >= 10 {
			all = append(all, phases{total: total, taken: seen[0], written: seen[1], delivered: total})
		}
	}
	return all
}

func percentiles(values []time.Duration) (p50, p95, max time.Duration) {
	sorted := append([]time.Duration(nil), values...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	at := func(p float64) time.Duration { return sorted[int(float64(len(sorted)-1)*p+0.5)] }
	return at(0.5), at(0.95), sorted[len(sorted)-1]
}

func TestBridgeRoundTrip(t *testing.T) {
	python := os.Getenv("LATENCY_BRIDGE_PYTHON")
	if python == "" {
		t.Fatal("set LATENCY_BRIDGE_PYTHON to a Python with lupa (the repository's .venv); run this test by name: -run TestBridgeRoundTrip")
	}
	calls := envInt("LATENCY_BRIDGE_CALLS", 100)
	tick := time.Duration(envInt("LATENCY_BRIDGE_TICK_MS", 150)) * time.Millisecond
	sizes := []int{0, 1024, 8192}
	if raw := os.Getenv("LATENCY_BRIDGE_LOG_KB"); raw != "" {
		sizes = nil
		for _, part := range strings.Split(raw, ",") {
			size, err := strconv.Atoi(strings.TrimSpace(part))
			if err != nil {
				t.Fatalf("LATENCY_BRIDGE_LOG_KB: %v", err)
			}
			sizes = append(sizes, size)
		}
	}

	var table strings.Builder
	fmt.Fprintf(&table, "### Bridge round trip, PlayPosition against the fake reaper (host tick %d ms, bridge tick 16 to 33 ms, %d calls)\n\n", tick.Milliseconds(), calls)
	table.WriteString("| events.log at start (KB) | Round trip p50 (ms) | p95 (ms) | Max (ms) | Command taken p50 (ms) | Answer written p50 (ms) |\n| --- | --- | --- | --- | --- | --- |\n")
	for _, size := range sizes {
		results := round(t, python, size, calls, tick)
		var totals, taken, written []time.Duration
		for _, result := range results {
			totals, taken, written = append(totals, result.total), append(taken, result.taken), append(written, result.written)
		}
		p50, p95, max := percentiles(totals)
		takenP50, _, _ := percentiles(taken)
		writtenP50, _, _ := percentiles(written)
		fmt.Fprintf(&table, "| %d | %s | %s | %s | %s | %s |\n", size, ms(p50), ms(p95), ms(max), ms(takenP50), ms(writtenP50))
	}
	t.Log("\n" + table.String())
	if out := os.Getenv("LATENCY_OUT"); out != "" {
		file, err := os.OpenFile(out, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = file.Close() }()
		if _, err := file.WriteString("\n" + table.String()); err != nil {
			t.Fatal(err)
		}
	}
}
