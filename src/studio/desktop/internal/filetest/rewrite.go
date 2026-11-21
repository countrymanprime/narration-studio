// Package filetest holds what the tests of the host's decoded-file caches share.
package filetest

import (
	"bytes"
	"os"
	"testing"
)

// RewriteInPlace replaces the first old in the file at path with replacement, which must be as long, and puts the file's
// modification time back: the file's content changed while its size and time did not, which is the change a cache that trusts
// those two cannot see.
func RewriteInPlace(t *testing.T, path, old, replacement string) {
	t.Helper()
	before, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(old) != len(replacement) || !bytes.Contains(raw, []byte(old)) {
		t.Fatalf("%q must be in the file and as long as %q", old, replacement)
	}
	if err := os.WriteFile(path, bytes.Replace(raw, []byte(old), []byte(replacement), 1), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, before.ModTime(), before.ModTime()); err != nil {
		t.Fatal(err)
	}
	after, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if after.Size() != before.Size() || !after.ModTime().Equal(before.ModTime()) {
		t.Fatalf("the rewrite left size %d and time %v, want %d and %v", after.Size(), after.ModTime(), before.Size(), before.ModTime())
	}
}
