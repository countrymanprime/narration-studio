package bridge

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

type recordedLog struct {
	failed bool
	lines  []string
}

func (r *recordedLog) Helper()      {}
func (r *recordedLog) Failed() bool { return r.failed }
func (r *recordedLog) Logf(format string, args ...any) {
	r.lines = append(r.lines, strings.TrimSpace(fmt.Sprintf(format, args...)))
}

func TestTheFakeREAPERNamesWhereAnExchangeWasLostWhenATestFails(t *testing.T) {
	dir := t.TempDir()
	client, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	// A command nobody read, an answer nobody dispatched, and a fake that saw a read error: the three places an exchange can be lost.
	if _, err := client.Send("fx_range_params", []string{"act1-1"}); err != nil {
		t.Fatal(err)
	}
	appendEvents(t, dir, []string{"ITEM_STALE", "act0-0", testItem, "fx"})
	fake := &fakeReaper{}
	fake.note(func(s *fakeReaperSeen) { s.readErrors++; s.lastReadError = "sharing violation" })
	fake.noteTick()

	passing := &recordedLog{}
	fake.diagnose(passing, client, dir)
	if len(passing.lines) != 0 {
		t.Fatalf("a passing test logged %v", passing.lines)
	}
	failing := &recordedLog{failed: true}
	fake.diagnose(failing, client, dir)
	if len(failing.lines) != 1 {
		t.Fatalf("a failing test logged %d entries, want 1", len(failing.lines))
	}
	pending, _ := filepath.Glob(filepath.Join(dir, "commands", "*.cmd"))
	size, _ := os.Stat(filepath.Join(dir, "events.log"))
	for _, want := range []string{"read errors=1", `"sharing violation"`, pending[0], "events.log size=" + strconv.FormatInt(size.Size(), 10), "dispatch offset=0", "ticks=1"} {
		if !strings.Contains(failing.lines[0], want) {
			t.Errorf("the diagnosis lacks %q:\n%s", want, failing.lines[0])
		}
	}
}
