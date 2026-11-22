//go:build unix

package evidence

import (
	"reflect"
	"syscall"
	"testing"
	"time"
)

// A named pipe named like a record would hold a read open for ever; the listing passes over it before any open, so a
// Retain pass, which lists with the store's lock held, ends, and so does a read.
func TestRetainAndAReadPassOverANamedPipeNamedLikeARecord(t *testing.T) {
	ledger := newRetainLedger(t)
	ledger.write("old", LedgerComplete)
	ledger.write("new", LedgerComplete)
	if err := syscall.Mkfifo(ledger.file("pipe.json"), 0o600); err != nil {
		t.Skipf("this platform cannot make a named pipe: %v", err)
	}
	done := make(chan []string, 1)
	go func() { done <- ledger.retain(rcKeys) }()
	select {
	case dropped := <-done:
		if !reflect.DeepEqual(dropped, []string{"old"}) {
			t.Fatalf("Retain dropped %v, want old", dropped)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Retain did not return: it is reading the named pipe")
	}
	ledger.want(nil, nil, []string{"new"})
	mustExist(t, ledger.file("pipe.json"))
}
