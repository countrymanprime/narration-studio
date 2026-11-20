package coverage

import (
	"os"
	"testing"
)

// A stored result is decoded once per change of its file: a read of an unchanged file answers the same report, a rewritten or removed file is
// read afresh, and what a caller does to the lists it was given is not seen by the next read.
func TestAStoredResultIsReadFromMemoryUntilItsFileChanges(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{results: alignedResults})
	run(t, service, testRequest())
	id := alignmentOf(t, service).RecordID
	if id == "" {
		t.Fatal("the run left no record")
	}
	path, err := service.results.path(id)
	if err != nil {
		t.Fatal(err)
	}

	first, ok := service.results.read(id)
	if !ok || len(first.Report.Tokens) == 0 {
		t.Fatalf("first read = %v, %d tokens", ok, len(first.Report.Tokens))
	}
	// The file is made unreadable to anything but the cache's stat: an unchanged file is answered from memory.
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, make([]byte, len(raw)), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	again, ok := service.results.read(id)
	if !ok || len(again.Report.Tokens) != len(first.Report.Tokens) {
		t.Fatalf("an unchanged file was not answered from memory: %v, %d tokens", ok, len(again.Report.Tokens))
	}

	// What a caller does to its copy is not seen by the next read.
	again.Report.Tokens[0].Text = "changed"
	again.Report.Tokens = again.Report.Tokens[:1]
	next, _ := service.results.read(id)
	if len(next.Report.Tokens) != len(first.Report.Tokens) || next.Report.Tokens[0].Text == "changed" {
		t.Fatalf("a caller's change reached the next read: %d tokens, first %q", len(next.Report.Tokens), next.Report.Tokens[0].Text)
	}

	// A file that changed (another size) is read afresh, here as unreadable.
	if err := os.WriteFile(path, []byte("not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, ok := service.results.read(id); ok {
		t.Fatal("a rewritten file was answered from memory")
	}
	// And a removed file is gone, whatever was cached.
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, ok := service.results.read(id); ok {
		t.Fatal("a removed file was answered from memory")
	}
}

// Writing a result drops what was cached for its record, so the next read is the file as written.
func TestWritingAStoredResultDropsItsCachedCopy(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{results: alignedResults})
	run(t, service, testRequest())
	id := alignmentOf(t, service).RecordID
	first, ok := service.results.read(id)
	if !ok {
		t.Fatal("no result")
	}
	first.Model = "other-model"
	first.Report.Tokens = first.Report.Tokens[:2]
	if err := service.results.write(first); err != nil {
		t.Fatal(err)
	}
	after, ok := service.results.read(id)
	if !ok || after.Model != "other-model" || len(after.Report.Tokens) != 2 {
		t.Fatalf("after a write: %v, model %q, %d tokens", ok, after.Model, len(after.Report.Tokens))
	}
}
