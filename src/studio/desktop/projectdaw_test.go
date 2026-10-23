package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// rpp-scan: only .rpp files directly in the folder count, in any case; backups and subfolders do not.
func TestScanDawFiles(t *testing.T) {
	folder := t.TempDir()
	for _, name := range []string{"Book.RPP", "Book.rpp-bak", "notes.txt"} {
		if err := os.WriteFile(filepath.Join(folder, name), nil, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(folder, "old", "x.rpp"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "old", "Old.rpp"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	found := scanRppFiles(folder)
	if len(found) != 1 || found[0] != "Book.RPP" {
		t.Fatalf("scanRppFiles = %v, want [Book.RPP]", found)
	}
	if got := scanRppFiles(""); len(got) != 0 {
		t.Fatalf("no folder: %v", got)
	}
}

// project-daw-host: a Start-menu launch (no --daw) of a folder holding one .rpp is REAPER, and the capability report says so.
func TestDawLaunchKindFollowsTheFolderWithoutAFlag(t *testing.T) {
	host := recorderHost(t, nil)
	writeFile(t, filepath.Join(host.config.projectFolder, "Book.rpp"), "")
	host.dawFolder.forget()
	if kind := host.dawLaunchKind(host.services()); kind != dawport.KindREAPER {
		t.Fatalf("folder with Book.rpp: kind = %v, want KindREAPER", kind)
	}
	if engine := host.recordingEngine(host.services()); engine != engineDAW {
		t.Fatalf("engine = %q, want daw", engine)
	}
}
