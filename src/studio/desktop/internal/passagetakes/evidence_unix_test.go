//go:build unix

package passagetakes

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

// A level that was read and pauses that were not is not an answer to keep. The level and the diagnostics read the same
// file over the same range and refuse the same bytes, so no file on disk fails the second read after passing the first;
// a named pipe does, because the level is read from whatever opens and the diagnostics refuse what is not a regular
// file. (MeasureCache.Get refuses a pipe before either reads it.)
func TestALevelWithoutDiagnosticsIsNotDecoded(t *testing.T) {
	dir := t.TempDir()
	wav, err := os.ReadFile(writeWAV(t, dir, "read.wav", noisy(concat(gap(0.5), tone(2, -12), gap(0.5)), -60)))
	if err != nil {
		t.Fatal(err)
	}
	pipe := filepath.Join(dir, "pipe.wav")
	if err := syscall.Mkfifo(pipe, 0o600); err != nil {
		t.Skipf("no named pipes here: %v", err)
	}
	// Opened for reading as well, so neither this open nor the reader's waits for the other end.
	writer, err := os.OpenFile(pipe, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	written := make(chan error, 1)
	go func() {
		_, err := writer.Write(wav)
		written <- err
	}()

	got, decoded := MeasureRange(Range{File: pipe, Kind: "WAVE", Start: 0, Length: 3})
	// Closed before the wait: a write the reader never drained ends with the close, and the test fails on what was read.
	_ = writer.Close()
	<-written
	if !got.RMS.OK {
		t.Fatalf("the level was not read from the pipe: %+v", got)
	}
	if decoded {
		t.Error("figures without their pauses and breaths were answered as decoded")
	}
	for name, f := range map[string]Figure{"pause": got.Pause, "breaths": got.Breaths} {
		if f.OK || !strings.HasPrefix(f.Reason, "The take's pauses and breaths could not be read (") {
			t.Errorf("%s = %+v", name, f)
		}
	}
}
