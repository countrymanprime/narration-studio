package packager

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf16"

	"github.com/countrymanprime/narration-utils/shell/internal/encodeport"
	"github.com/countrymanprime/narration-utils/shell/internal/pathfixtures"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
)

// The Delivery page's path and file-name guard (definition of done, rule 1, "Paths"): the folder a package is written into runs the
// shared fixture set, and the names it writes are checked against what Windows refuses.

func entriesOf(t *testing.T, dir string) []string {
	t.Helper()
	list, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var names []string
	for _, entry := range list {
		names = append(names, entry.Name())
	}
	return names
}

func TestPathGuardOutputFolder(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		req := acxRequest(t)
		req.OutputDir = p.Dir
		manifest, err := Assemble(context.Background(), req)
		switch {
		case p.Class == pathfixtures.Empty:
			if err == nil {
				t.Fatal("an empty output folder was accepted")
			}
			for _, name := range entriesOf(t, ".") {
				if strings.HasSuffix(name, ".mp3") {
					t.Fatalf("an empty folder name wrote %q into the working folder", name)
				}
			}
		case p.Class == pathfixtures.FileForFolder, p.DirReadOnly:
			if err == nil {
				t.Fatalf("a folder that cannot be written into was accepted: %q", p.Dir)
			}
			if !strings.Contains(err.Error(), filepath.Base(p.Dir)) {
				t.Fatalf("the refusal does not name the folder: %v", err)
			}
		default:
			if err != nil {
				t.Fatalf("Assemble into %q: %v", p.Dir, err)
			}
			if len(manifest.Files) != 5 {
				t.Fatalf("wrote %d files, want 5", len(manifest.Files))
			}
			for _, file := range manifest.Files {
				if _, err := os.Stat(file.DestPath); err != nil {
					t.Fatalf("%s is not where the manifest says: %v", file.Name, err)
				}
			}
		}
	})
}

func TestChapterFileNamesAreWhatWindowsAccepts(t *testing.T) {
	cases := []struct {
		name  string
		title string
		want  string
	}{
		// A reserved device name is only reserved as a whole name; the package number in front makes these ordinary names.
		{"CON", "CON", "01 - CON.mp3"},
		{"NUL", "NUL", "01 - NUL.mp3"},
		{"COM1", "COM1", "01 - COM1.mp3"},
		{"lower-case aux", "aux", "01 - aux.mp3"},
		{"trailing dot", "Chapter 1.", "01 - Chapter 1..mp3"},
		{"only dots", "...", "01 - ....mp3"},
		{"surrounding spaces are trimmed", "  Chapter One  ", "01 - Chapter One.mp3"},
		{"accented", "Café Résumé", "01 - Café Résumé.mp3"},
		{"emoji", "Down the Rabbit-Hole 🐇", "01 - Down the Rabbit-Hole 🐇.mp3"},
		{"right-to-left", "الفصل الأول פרק א", "01 - الفصل الأول פרק א.mp3"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := chapterFileName(1, tc.title, ".mp3")
			if err != nil || got != tc.want {
				t.Fatalf("chapterFileName(%q) = %q, %v; want %q", tc.title, got, err, tc.want)
			}
		})
	}
	for name, title := range map[string]string{
		"a NUL":            "Chapter\x00One",
		"a bell":           "Chapter\x07One",
		"a colon":          "Chapter: One",
		"a backslash":      `..\Chapter`,
		"a forward slash":  "../Chapter",
		"blank":            "   ",
		"a wildcard":       "Chapter*",
		"a line feed":      "Chapter\nOne",
		"a tab":            "Chapter\tOne",
		"a question mark":  "What?",
		"a pipe and quote": `a|b"c`,
	} {
		t.Run("refuses "+name, func(t *testing.T) {
			if got, err := chapterFileName(1, title, ".mp3"); err == nil {
				t.Fatalf("chapterFileName(%q) = %q, want a refusal", title, got)
			}
		})
	}
}

func TestAChapterNameLongerThanAFileNameCanBeIsRefusedBeforeAnythingIsWritten(t *testing.T) {
	cases := map[string]string{
		"256 letters":        strings.Repeat("a", 256),
		"300 CJK characters": strings.Repeat("本", 300),
		// Each emoji is two UTF-16 units, and Windows counts units: 130 of them are 260 units though only 130 characters.
		"130 emoji": strings.Repeat("🐇", 130),
	}
	for name, title := range cases {
		t.Run(name, func(t *testing.T) {
			req := acxRequest(t)
			req.Chapters[1].Title = title
			_, err := Assemble(context.Background(), req)
			if !errors.Is(err, ErrNameTooLong) {
				t.Fatalf("got %v, want ErrNameTooLong", err)
			}
			if !strings.Contains(err.Error(), "chapter 2") {
				t.Fatalf("the refusal does not name the chapter: %v", err)
			}
			if got := entriesOf(t, req.OutputDir); len(got) != 0 {
				t.Fatalf("a refused package left files behind: %v", got)
			}
		})
	}
	t.Run("the longest name that is allowed is written", func(t *testing.T) {
		req := acxRequest(t)
		title := strings.Repeat("a", 255-len("02 - .mp3"))
		req.Chapters[1].Title = title
		manifest, err := Assemble(context.Background(), req)
		if err != nil {
			t.Fatalf("a name of exactly 255 units was refused: %v", err)
		}
		for _, file := range manifest.Files {
			if len(utf16.Encode([]rune(file.Name))) > 255 {
				t.Fatalf("%s is longer than a file name can be", file.Name)
			}
		}
	})
}

func TestAnEmptyOrMissingEncodedFileIsRefusedNamingItAndNothingIsWritten(t *testing.T) {
	cases := map[string]func(t *testing.T, req *Request){
		"a zero-length chapter": func(t *testing.T, req *Request) {
			if err := os.WriteFile(req.Chapters[0].Path, nil, 0o600); err != nil {
				t.Fatal(err)
			}
		},
		"a zero-length retail sample": func(t *testing.T, req *Request) {
			if err := os.WriteFile(req.RetailSample.Path, nil, 0o600); err != nil {
				t.Fatal(err)
			}
		},
		"a chapter deleted after it was encoded": func(t *testing.T, req *Request) {
			if err := os.Remove(req.Chapters[1].Path); err != nil {
				t.Fatal(err)
			}
		},
		"a chapter that is a folder": func(t *testing.T, req *Request) {
			if err := os.Remove(req.Chapters[1].Path); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(req.Chapters[1].Path, 0o755); err != nil {
				t.Fatal(err)
			}
		},
	}
	for name, spoil := range cases {
		t.Run(name, func(t *testing.T) {
			req := acxRequest(t)
			spoil(t, &req)
			_, err := Assemble(context.Background(), req)
			if !errors.Is(err, ErrUnusableSource) {
				t.Fatalf("got %v, want ErrUnusableSource", err)
			}
			if got := entriesOf(t, req.OutputDir); len(got) != 0 {
				t.Fatalf("a refused package left files behind: %v", got)
			}
		})
	}
}

func TestAHugeEncodedFileIsCopiedWhole(t *testing.T) {
	req := acxRequest(t)
	big := filepath.Join(filepath.Dir(req.Chapters[0].Path), "big.mp3")
	handle, err := os.Create(big)
	if err != nil {
		t.Fatal(err)
	}
	// 64 MiB: far larger than any other fixture, and copied in one pass without being held in memory.
	const size = 64 << 20
	if err := handle.Truncate(size); err != nil {
		t.Fatalf("cannot make a %d-byte file: %v", size, err)
	}
	_ = handle.Close()
	req.Chapters[0].Path = big
	manifest, err := Assemble(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(manifest.Files[1].DestPath)
	if err != nil || info.Size() != size {
		t.Fatalf("the copy is %v bytes (%v), want %d", info, err, size)
	}
}

// stoppingPackager tags files like a Packager row, and fails or cancels on its n-th file to stand for what can go wrong half way
// through a package: the target folder deleted under it, a full disk, the narrator pressing Cancel.
type stoppingPackager struct {
	calls  *int
	stopAt int
	fail   error
	cancel context.CancelFunc
}

func (s stoppingPackager) Name() string { return "stopping" }

func (s stoppingPackager) Package(_ context.Context, file string, _ []encodeport.Chapter, _ encodeport.Tags) (string, error) {
	*s.calls++
	if *s.calls == s.stopAt {
		if s.cancel != nil {
			s.cancel()
		}
		if s.fail != nil {
			return "", s.fail
		}
	}
	out := strings.TrimSuffix(file, filepath.Ext(file)) + ".packaged" + filepath.Ext(file)
	return out, os.WriteFile(out, []byte("tagged"), 0o600)
}

func registryWith(p encodeport.Packager) *port.Registry[encodeport.Packager] {
	registry := &port.Registry[encodeport.Packager]{Kind: "packager"}
	registry.Register(port.Entry[encodeport.Packager]{
		Name:       "stopping",
		Descriptor: port.Descriptor{Label: "Stopping", Modes: []string{"mp3"}},
		New:        func() encodeport.Packager { return p },
	})
	return registry
}

func TestAFailedOrCancelledPackageLeavesNothingAndCanBeBuiltAgain(t *testing.T) {
	cases := map[string]func(calls *int) (stoppingPackager, context.Context){
		"a write that fails half way (disk full, the folder deleted)": func(calls *int) (stoppingPackager, context.Context) {
			return stoppingPackager{calls: calls, stopAt: 3, fail: errors.New("there is not enough space on the disk")}, context.Background()
		},
		"a cancel half way": func(calls *int) (stoppingPackager, context.Context) {
			ctx, cancel := context.WithCancel(context.Background())
			return stoppingPackager{calls: calls, stopAt: 3, cancel: cancel}, ctx
		},
	}
	for name, make := range cases {
		t.Run(name, func(t *testing.T) {
			req := acxRequest(t)
			req.Tags = encodeport.Tags{"title": "My Book"}
			var calls int
			stopper, ctx := make(&calls)
			req.Packagers = registryWith(stopper)
			if _, err := Assemble(ctx, req); err == nil {
				t.Fatal("the package did not stop")
			}
			if got := entriesOf(t, req.OutputDir); len(got) != 0 {
				t.Fatalf("a package that stopped left %v behind, and the next build would refuse them as already there", got)
			}
			// The sources are untouched and the same request builds once nothing stops it.
			req.Packagers = nil
			if _, err := Assemble(context.Background(), req); err != nil {
				t.Fatalf("building again after a stopped package: %v", err)
			}
		})
	}
	t.Run("files already in the folder are never removed", func(t *testing.T) {
		req := acxRequest(t)
		if err := os.MkdirAll(req.OutputDir, 0o755); err != nil {
			t.Fatal(err)
		}
		keep := filepath.Join(req.OutputDir, "notes.txt")
		if err := os.WriteFile(keep, []byte("mine"), 0o600); err != nil {
			t.Fatal(err)
		}
		req.Tags = encodeport.Tags{"title": "My Book"}
		var calls int
		req.Packagers = registryWith(stoppingPackager{calls: &calls, stopAt: 2, fail: errors.New("disk full")})
		if _, err := Assemble(context.Background(), req); err == nil {
			t.Fatal("the package did not stop")
		}
		if body, err := os.ReadFile(keep); err != nil || string(body) != "mine" {
			t.Fatalf("a file that was already in the folder was touched: %q, %v", body, err)
		}
		if got := entriesOf(t, req.OutputDir); len(got) != 1 {
			t.Fatalf("the folder holds %v, want only notes.txt", got)
		}
	})
}

func TestTheFoldersThePackageMadeAreRemovedWhenItStops(t *testing.T) {
	req := acxRequest(t)
	top := filepath.Join(filepath.Dir(req.OutputDir), "new")
	req.OutputDir = filepath.Join(top, "nested", "folder")
	req.Tags = encodeport.Tags{"title": "My Book"}
	var calls int
	req.Packagers = registryWith(stoppingPackager{calls: &calls, stopAt: 2, fail: errors.New("disk full")})
	if _, err := Assemble(context.Background(), req); err == nil {
		t.Fatal("expected a failure")
	}
	if _, err := os.Stat(top); err == nil {
		t.Fatalf("a package that stopped left the folders it made behind: %q", top)
	}
}
