package main

import (
	"desktop/internal/brand"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// countingFS counts the files opened in it: hashing the embedded resources opens every one, a memoized key opens none.
type countingFS struct {
	fs.FS
	opened int
}

func (c *countingFS) Open(name string) (fs.File, error) {
	if info, err := fs.Stat(c.FS, name); err == nil && !info.IsDir() {
		c.opened++
	}
	return c.FS.Open(name)
}

func executableFile(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "app.exe")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func failOnReport(t *testing.T) func(kind, message string) {
	return func(kind, message string) { t.Errorf("reported %s: %s", kind, message) }
}

func memoPath(cache string) string {
	return filepath.Join(cache, brand.DataFolder, "runtime", resourceKeyMemoFile)
}

func TestMemoizedResourceKeyHashesTheResourcesOncePerExecutable(t *testing.T) {
	cache, executable := t.TempDir(), executableFile(t, "build 1")
	tree := &countingFS{FS: resourceTree(map[string]string{"runtime/guide/guide.exe": "frozen", "reaper/launcher.lua": "-- l"})}
	want, _ := resourceKeyFor(tree.FS)
	first, err := memoizedResourceKey(tree, cache, executable, failOnReport(t))
	if err != nil || first != want {
		t.Fatalf("first launch: %q, %v; want the content key %q", first, err, want)
	}
	if tree.opened != 2 {
		t.Fatalf("first launch opened %d resources, want both hashed", tree.opened)
	}
	for launch := 2; launch <= 4; launch++ {
		if again, err := memoizedResourceKey(tree, cache, executable, failOnReport(t)); err != nil || again != want {
			t.Fatalf("launch %d: %q, %v; want %q", launch, again, err, want)
		}
	}
	if tree.opened != 2 {
		t.Fatalf("later launches of the same executable opened %d more resources, want none", tree.opened-2)
	}
}

// An update replaces the executable and its embedded resources; a rebuild in place keeps the path. Either must give the new key,
// or an obsolete sidecar would start.
func TestMemoizedResourceKeyIsComputedAgainWhenTheExecutableChanges(t *testing.T) {
	old := resourceTree(map[string]string{"runtime/guide/guide.exe": "v1"})
	updated := resourceTree(map[string]string{"runtime/guide/guide.exe": "v2"})
	want, _ := resourceKeyFor(updated)
	// Each change differs from the remembered executable in one thing only, so each of path, size and time is checked on its own.
	keepTime := func(t *testing.T, path string, from os.FileInfo) {
		t.Helper()
		if err := os.Chtimes(path, time.Time{}, from.ModTime()); err != nil {
			t.Fatal(err)
		}
	}
	changes := map[string]func(t *testing.T, executable string) string{
		"another size, same time": func(t *testing.T, executable string) string {
			before, _ := os.Stat(executable)
			if err := os.WriteFile(executable, []byte("build 2, longer"), 0o600); err != nil {
				t.Fatal(err)
			}
			keepTime(t, executable, before)
			return executable
		},
		"same size, written later": func(t *testing.T, executable string) string {
			if err := os.Chtimes(executable, time.Time{}, time.Now().Add(time.Hour)); err != nil {
				t.Fatal(err)
			}
			return executable
		},
		"another path, same size and time": func(t *testing.T, executable string) string {
			before, _ := os.Stat(executable)
			moved := executableFile(t, "build 1")
			keepTime(t, moved, before)
			return moved
		},
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			cache, executable := t.TempDir(), executableFile(t, "build 1")
			if _, err := memoizedResourceKey(old, cache, executable, failOnReport(t)); err != nil {
				t.Fatal(err)
			}
			executable = change(t, executable)
			if got, err := memoizedResourceKey(updated, cache, executable, failOnReport(t)); err != nil || got != want {
				t.Fatalf("after the change: %q, %v; want the new content key %q", got, err, want)
			}
			// The new key is the one remembered from here on.
			counted := &countingFS{FS: updated}
			if got, _ := memoizedResourceKey(counted, cache, executable, failOnReport(t)); got != want || counted.opened != 0 {
				t.Fatalf("next launch: %q after opening %d resources, want %q from the memo", got, counted.opened, want)
			}
		})
	}
}

func TestMemoizedResourceKeyIgnoresAMemoItCannotTrust(t *testing.T) {
	tree := resourceTree(map[string]string{"runtime/guide/guide.exe": "frozen"})
	want, _ := resourceKeyFor(tree)
	for name, memo := range map[string]func(valid string) string{
		"not JSON":             func(string) string { return "{" },
		"empty":                func(string) string { return "" },
		"a key that is a path": func(valid string) string { return strings.Replace(valid, want, `..\\..\\elsewhere`, 1) },
		"a key of another age": func(valid string) string { return strings.Replace(valid, want, "v0-000000000000000000000000", 1) },
	} {
		t.Run(name, func(t *testing.T) {
			cache, executable := t.TempDir(), executableFile(t, "build 1")
			if _, err := memoizedResourceKey(tree, cache, executable, failOnReport(t)); err != nil {
				t.Fatal(err)
			}
			valid, err := os.ReadFile(memoPath(cache))
			if err != nil {
				t.Fatalf("no memo was written: %v", err)
			}
			if err := os.WriteFile(memoPath(cache), []byte(memo(string(valid))), 0o600); err != nil {
				t.Fatal(err)
			}
			if got, err := memoizedResourceKey(tree, cache, executable, failOnReport(t)); err != nil || got != want {
				t.Fatalf("got %q, %v; want the content key %q", got, err, want)
			}
		})
	}
}

// Without an executable to compare (os.Executable failed) nothing proves a memo is this build's: the key is hashed and none is kept.
func TestMemoizedResourceKeyHashesEveryTimeWithoutAnExecutable(t *testing.T) {
	cache := t.TempDir()
	tree := &countingFS{FS: resourceTree(map[string]string{"runtime/guide/guide.exe": "frozen"})}
	want, _ := resourceKeyFor(tree.FS)
	for launch := 1; launch <= 2; launch++ {
		if got, err := memoizedResourceKey(tree, cache, "", failOnReport(t)); err != nil || got != want {
			t.Fatalf("launch %d: %q, %v; want %q", launch, got, err, want)
		}
	}
	if tree.opened != 2 {
		t.Fatalf("opened %d resources over two launches, want one hash each", tree.opened)
	}
	if _, err := os.Stat(memoPath(cache)); err == nil {
		t.Fatal("a memo was written for no executable")
	}
}

func TestMemoizedResourceKeyReportsResourcesItCannotRead(t *testing.T) {
	if _, err := memoizedResourceKey(resourceTree(nil), t.TempDir(), executableFile(t, "build 1"), failOnReport(t)); err == nil {
		t.Fatal("an empty embedded file system was given a key")
	}
}

// A cache folder that cannot be written must not stop the launch or change the key; the log says why every launch hashes.
func TestMemoizedResourceKeyReportsAMemoItCannotWrite(t *testing.T) {
	cache := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(cache, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	tree := resourceTree(map[string]string{"runtime/guide/guide.exe": "frozen"})
	want, _ := resourceKeyFor(tree)
	var reported []string
	got, err := memoizedResourceKey(tree, cache, executableFile(t, "build 1"), func(kind, _ string) { reported = append(reported, kind) })
	if err != nil || got != want {
		t.Fatalf("got %q, %v; want the content key %q", got, err, want)
	}
	if len(reported) != 1 || reported[0] != "resource_key_memo_unwritable" {
		t.Fatalf("reported %v, want one resource_key_memo_unwritable", reported)
	}
}

// packagedResourcesIn is the launch path itself (Host.packagedResources): the second launch must find the unpacked folder without
// opening a resource, and a remembered key whose folder is gone or incomplete must unpack again.
func TestPackagedResourcesInUnpacksOnceAndThenOpensNothing(t *testing.T) {
	cache, executable := t.TempDir(), executableFile(t, "build 1")
	tree := &countingFS{FS: resourceTree(map[string]string{"runtime/guide/guide.exe": "frozen", "reaper/launcher.lua": "-- l"})}
	root, err := packagedResourcesIn(tree, cache, executable, failOnReport(t))
	if err != nil {
		t.Fatal(err)
	}
	if want, _ := materializeResources(tree.FS, cache, executable); root != want {
		t.Fatalf("root = %q, want the content-addressed folder %q", root, want)
	}
	sidecar := filepath.Join(root, "runtime", "guide", "guide.exe")
	tree.opened = 0
	again, err := packagedResourcesIn(tree, cache, executable, failOnReport(t))
	if err != nil || again != root {
		t.Fatalf("second launch: %q, %v; want %q", again, err, root)
	}
	// The launcher script is compared with the embedded one on every start (syncStableLauncher); the sidecars are not opened.
	if tree.opened > 1 {
		t.Fatalf("second launch opened %d resources, want at most the launcher script", tree.opened)
	}
	for name, damage := range map[string]func() error{
		"folder removed":  func() error { return os.RemoveAll(root) },
		"never completed": func() error { _ = os.Remove(sidecar); return os.Remove(filepath.Join(root, ".complete")) },
	} {
		if err := damage(); err != nil {
			t.Fatal(name, err)
		}
		if healed, err := packagedResourcesIn(tree, cache, executable, failOnReport(t)); err != nil || healed != root {
			t.Fatalf("%s: %q, %v; want %q unpacked again", name, healed, err, root)
		}
		if body, err := os.ReadFile(sidecar); err != nil || string(body) != "frozen" {
			t.Fatalf("%s: the sidecar is %q (%v), want it unpacked again", name, body, err)
		}
	}
}
