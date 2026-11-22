package evidence

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

// An entry whose name a named pipe took after the listing is not read: a read of a pipe whose writer says nothing would wait for ever,
// out of reach of the pass's stop function. The link to a pipe is the same.
func TestEntryAnalyzerDoesNotWaitOnAPipeThatTookAnEntrysName(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("no named pipes in the file system on Windows")
	}
	dir := t.TempDir()
	fifo := filepath.Join(dir, "pipe.json")
	if err := exec.Command("mkfifo", fifo).Run(); err != nil {
		t.Skipf("no mkfifo here: %v", err)
	}
	// A writer that holds the pipe open and writes nothing: a reader never sees data or the end.
	writer, err := os.OpenFile(fifo, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = writer.Close() })
	link := filepath.Join(dir, "link.json")
	if err := os.Symlink(fifo, link); err != nil {
		t.Skipf("no symbolic links here: %v", err)
	}
	store := &CacheStore{dir: dir}
	for _, name := range []string{"pipe.json", "link.json"} {
		done := make(chan bool, 1)
		go func() {
			_, ok := store.entryAnalyzer(name)
			done <- ok
		}()
		select {
		case ok := <-done:
			if ok {
				t.Fatalf("%s was read as an entry", name)
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("reading %s did not return: a pass would wait on it for ever", name)
		}
	}
}
