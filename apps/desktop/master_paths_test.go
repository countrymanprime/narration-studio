package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestMasterPathFixtures runs the shared path fixture set (definition of done, rule 1, "Paths") through the one place Master & QC
// resolves a file: the picker's answer, the measurement, and the host's last-run lookup that Play the quietest and Open in the DAW use.
// A file is always found again by the path the picker gave, whatever the path looks like; a missing one fails with a named reason.
// Different-case and trailing-dot paths run on Windows only; UNC is an owner check.
func TestMasterPathFixtures(t *testing.T) {
	start := t.TempDir()
	elsewhere := t.TempDir() // a folder outside the starting one
	long := strings.Repeat("a long chapter name ", 3)
	cases := []struct {
		name    string
		path    string
		prepare func(t *testing.T, path string)
		missing bool
	}{
		{name: "outside the starting folder", path: filepath.Join(elsewhere, "Chapter 01.wav")},
		{name: "nested", path: filepath.Join(start, "a", "b", "c", "Chapter 01.wav")},
		{name: "spaces", path: filepath.Join(start, "my book  with spaces", " Chapter 01 .wav")},
		{name: "unicode, emoji and right-to-left", path: filepath.Join(start, "書籍 📚 كتاب", "פרק 1 🎧.wav")},
		{name: "very long", path: filepath.Join(start, strings.TrimSpace(long), strings.TrimSpace(long)+".wav")},
		{name: "read-only", path: filepath.Join(start, "ro", "Chapter 01.wav"), prepare: func(t *testing.T, path string) {
			if err := os.Chmod(path, 0o444); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "missing", path: filepath.Join(start, "nope", "Chapter 01.wav"), missing: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if !tc.missing {
				if err := os.MkdirAll(filepath.Dir(tc.path), 0o755); err != nil {
					t.Fatalf("this system cannot make the path: %v", err)
				}
				writeToneWAV(t, tc.path)
				if tc.prepare != nil {
					tc.prepare(t, tc.path)
				}
			}
			host, _ := measureHost(t, tc.path)
			if _, err := host.startMeasure(pickAll(t, host)); err != nil {
				t.Fatal(err)
			}
			job := waitForMeasurement(t, host)
			if job.Phase != "success" || len(job.Files) != 1 {
				t.Fatalf("job = %s with %d files: %s", job.Phase, len(job.Files), job.Message)
			}
			file := job.Files[0]
			if file.Name != filepath.Base(tc.path) {
				t.Fatalf("name = %q, want %q", file.Name, filepath.Base(tc.path))
			}
			if tc.missing {
				if file.Status != "failed" || file.Error == "" {
					t.Fatalf("a missing file must fail with a reason: %+v", file)
				}
			} else if file.Status != "measured" || file.Report == nil {
				t.Fatalf("the file was not measured: %+v", file)
			}
			// The page's file id is the path the host answered; the file actions find the file by it.
			if found, ok := host.lastRunFile(file.Path); !ok || found.Path != file.Path {
				t.Fatalf("lastRunFile(%q) did not find the file the run holds", file.Path)
			}
			if _, picked := host.pickedFile(file.Path); !picked {
				t.Fatalf("pickedFile(%q) refused a file the picker gave", file.Path)
			}
		})
	}

	t.Run("a path nobody picked is refused, even beside a picked one", func(t *testing.T) {
		picked := filepath.Join(start, "picked.wav")
		writeToneWAV(t, picked)
		host, _ := measureHost(t, picked)
		pickAll(t, host)
		for _, other := range []string{filepath.Join(start, "other.wav"), filepath.Join(start, "x", "..", "other.wav"), "picked.wav", ""} {
			if _, err := host.startMeasure([]string{other}); err == nil {
				t.Fatalf("%q was measured without being picked", other)
			}
			if _, ok := host.lastRunFile(other); ok {
				t.Fatalf("%q is in a run that never started", other)
			}
		}
		// A picked file named through a dot-dot detour is the same file.
		if _, err := host.startMeasure([]string{filepath.Join(start, "x", "..", "picked.wav")}); err != nil {
			t.Fatalf("a detour to a picked file was refused: %v", err)
		}
		waitForMeasurement(t, host)
	})

	// Not run on Linux: Windows owner check (case-insensitive names, trailing dots and spaces, UNC shares).
	t.Run("windows only: different case, trailing dots and spaces", func(t *testing.T) {
		if runtime.GOOS != "windows" {
			return
		}
		path := filepath.Join(start, "Case Test.wav")
		writeToneWAV(t, path)
		for _, variant := range []string{strings.ToUpper(path), path + ".", path + " "} {
			host, _ := measureHost(t, variant)
			if _, err := host.startMeasure(pickAll(t, host)); err != nil {
				t.Fatalf("%q: %v", variant, err)
			}
			job := waitForMeasurement(t, host)
			if len(job.Files) != 1 || (job.Files[0].Status != "measured" && job.Files[0].Error == "") {
				t.Fatalf("%q ended without a measurement or a reason: %+v", variant, job.Files)
			}
		}
	})
}
