package coverage

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"desktop/internal/filetest"
	"desktop/internal/persist"
)

// A stored result is decoded once per change of its file: a read of an unchanged file answers the same report without decoding it, a rewritten
// or removed file is read afresh, and what a caller does to the lists it was given is not seen by the next read.
func TestAStoredResultIsReadFromMemoryUntilItsFileChanges(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{results: alignedResults})
	run(t, service, testRequest())
	id := alignmentOf(t, service).RecordID
	if id == "" {
		t.Fatal("the run left no record")
	}
	path := mustPath(t, service, id)

	first, ok := service.results.read(id)
	if !ok || len(first.Report.Tokens) == 0 {
		t.Fatalf("first read = %v, %d tokens", ok, len(first.Report.Tokens))
	}
	decoded := service.results.cache.decoded.Load()
	again, ok := service.results.read(id)
	if !ok || len(again.Report.Tokens) != len(first.Report.Tokens) || service.results.cache.decoded.Load() != decoded {
		t.Fatalf("an unchanged file was not answered from memory: %v, %d tokens, %d more decodes", ok, len(again.Report.Tokens), service.results.cache.decoded.Load()-decoded)
	}

	// What a caller does to its copy is not seen by the next read.
	again.Report.Tokens[0].Text = "changed"
	again.Report.Tokens = again.Report.Tokens[:1]
	next, _ := service.results.read(id)
	if len(next.Report.Tokens) != len(first.Report.Tokens) || next.Report.Tokens[0].Text == "changed" {
		t.Fatalf("a caller's change reached the next read: %d tokens, first %q", len(next.Report.Tokens), next.Report.Tokens[0].Text)
	}

	// A file that changed is read afresh, here as unreadable.
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

// The file's size and modification time are not its identity: content that changed under both is what the next read answers, and the
// untouched file after it is not decoded again.
func TestAResultRewrittenAtTheSameSizeAndTimeIsDecodedAgain(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{results: alignedResults})
	run(t, service, testRequest())
	id := alignmentOf(t, service).RecordID
	first, ok := service.results.read(id)
	if !ok || len(first.Model) < 2 {
		t.Fatalf("first read = %v, model %q", ok, first.Model)
	}
	other := strings.Repeat("x", len(first.Model))
	filetest.RewriteInPlace(t, mustPath(t, service, id), `"`+first.Model+`"`, `"`+other+`"`)
	if after, ok := service.results.read(id); !ok || after.Model != other {
		t.Fatalf("after the rewrite: %v, model %q, want %q", ok, after.Model, other)
	}
	decoded := service.results.cache.decoded.Load()
	if after, ok := service.results.read(id); !ok || after.Model != other || service.results.cache.decoded.Load() != decoded {
		t.Fatalf("the untouched file: %v, model %q, %d more decodes", ok, after.Model, service.results.cache.decoded.Load()-decoded)
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

// The result read last is the one kept longest: a sweep over other chapters' results does not push out the one the page is on.
func TestTheResultReadMostRecentlyOutlivesASweepOfOthers(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{results: alignedResults})
	run(t, service, testRequest())
	id := alignmentOf(t, service).RecordID
	cache := service.results.cache
	result, _ := service.results.read(id)
	var other persist.Held[StoredResult]
	other.Set(persist.Sum(nil), result)
	for i := 0; i < resultCacheSize+2; i++ {
		cache.put(fmt.Sprintf("other-%d", i), other, cache.now())
		// The page reads its own chapter between the sweep's reads.
		if _, ok := cache.get(id).Value(); !ok {
			t.Fatalf("after %d other results the one read in between was pushed out", i+1)
		}
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if len(cache.entries) > resultCacheSize {
		t.Fatalf("%d entries, want at most %d", len(cache.entries), resultCacheSize)
	}
}

// A file that changed after a cached read is read afresh and its old entry is not served again, even if the old size and time come back.
func TestAChangedResultFileDropsItsCachedEntry(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{results: alignedResults})
	run(t, service, testRequest())
	id := alignmentOf(t, service).RecordID
	path := mustPath(t, service, id)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := service.results.read(id); !ok {
		t.Fatal("no result")
	}
	if err := os.WriteFile(path, []byte("not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, ok := service.results.read(id); ok {
		t.Fatal("a corrupt file was answered")
	}
	// The old bytes and time come back: it is read from the file (it decodes), not from an entry that should have gone.
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	service.results.cache.mu.Lock()
	left := len(service.results.cache.entries)
	service.results.cache.mu.Unlock()
	if left != 0 {
		t.Fatalf("%d entries kept after the file changed", left)
	}
	if _, ok := service.results.read(id); !ok {
		t.Fatal("the restored file did not read")
	}
}

func mustPath(t *testing.T, service *Service, id string) string {
	t.Helper()
	path, err := service.results.path(id)
	if err != nil {
		t.Fatal(err)
	}
	return path
}

// A reader that decoded the file before a write must not store what it read after the write dropped the record: the entry would carry the old
// content after the file changed.
func TestAReaderThatDecodedBeforeAWriteDoesNotStoreItsResult(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{results: alignedResults})
	run(t, service, testRequest())
	id := alignmentOf(t, service).RecordID
	result, ok := service.results.read(id)
	if !ok {
		t.Fatal("no result")
	}
	cache := service.results.cache
	cache.drop(id)
	epoch := cache.now() // the reader begins
	if err := service.results.write(result); err != nil {
		t.Fatal(err) // the writer drops the record and writes
	}
	var late persist.Held[StoredResult]
	late.Set(persist.Sum(nil), result)
	cache.put(id, late, epoch) // the late reader stores what it read
	if _, ok := cache.get(id).Value(); ok {
		t.Fatal("a result decoded before the write was stored after it")
	}
}
