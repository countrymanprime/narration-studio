package evidence

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDerivedKeyChangesWithEveryPart(t *testing.T) {
	input := KeyInput{Path: "media/a.wav", Size: 10, ContentHash: "h"}
	base := DerivedKey(input, "peaks", "1", "p")
	if base != HashParts("media/a.wav", "10", "h", "peaks", "1", "p") {
		t.Fatalf("DerivedKey = %s, want the hash of its parts in order", base)
	}
	others := map[string]string{
		"path":      DerivedKey(KeyInput{Path: "media/b.wav", Size: 10, ContentHash: "h"}, "peaks", "1", "p"),
		"size":      DerivedKey(KeyInput{Path: "media/a.wav", Size: 11, ContentHash: "h"}, "peaks", "1", "p"),
		"content":   DerivedKey(KeyInput{Path: "media/a.wav", Size: 10, ContentHash: "i"}, "peaks", "1", "p"),
		"algorithm": DerivedKey(input, "silence", "1", "p"),
		"version":   DerivedKey(input, "peaks", "2", "p"),
		"params":    DerivedKey(input, "peaks", "1", "q"),
		"scope":     DerivedKey(input, "peaks", "1", "p", "range"),
	}
	seen := map[string]string{base: "base"}
	for part, key := range others {
		if other, taken := seen[key]; taken {
			t.Fatalf("a different %s gave the same key as %s", part, other)
		}
		seen[key] = part
	}
}

func TestSourceInputTakesThePartialHashAndNotTheTime(t *testing.T) {
	identity := baseCacheKey().Source
	if got, want := SourceInput(identity), (KeyInput{Path: identity.Path, Size: identity.Size, ContentHash: identity.PartialHash}); got != want {
		t.Fatalf("SourceInput = %+v, want %+v", got, want)
	}
}

// A project file is edited in place, so a change that keeps its size and time must still change its key.
func TestProjectFileInputSeesAnEditThatKeepsTheSizeAndTime(t *testing.T) {
	folder := t.TempDir()
	path := filepath.Join(folder, "book.rpp")
	writeSourceFile(t, path, []byte("POSITION 1"))
	before, err := ProjectFileInput(path, folder)
	if err != nil {
		t.Fatal(err)
	}
	if before.Path != "book.rpp" || before.Size != 10 {
		t.Fatalf("input = %+v, want the project-relative path and the size", before)
	}
	rewriteKeepingTime(t, path, []byte("POSITION 2"))
	after, err := ProjectFileInput(path, folder)
	if err != nil {
		t.Fatal(err)
	}
	if DerivedKey(before, "a", "1", "p") == DerivedKey(after, "a", "1", "p") {
		t.Fatal("an edit of the same size and time kept the key")
	}
}

func TestProjectFileInputOfAMissingFileIsAnError(t *testing.T) {
	if _, err := ProjectFileInput(filepath.Join(t.TempDir(), "gone.rpp"), ""); !os.IsNotExist(err) {
		t.Fatalf("err = %v, want not-exist", err)
	}
}
