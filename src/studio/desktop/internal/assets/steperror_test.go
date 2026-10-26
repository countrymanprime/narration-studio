package assets

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// manyEntries is an archive of n small files under one package folder, the shape of a large wheel.
func manyEntries(t *testing.T, n int) []byte {
	t.Helper()
	entries := make(map[string]string, n)
	for i := range n {
		entries[fmt.Sprintf("torch/include/part%05d.h", i)] = "x"
	}
	return buildZip(t, entries)
}

// The torch 2.14.1 win_amd64 wheel that both BookNLP rows and GLiNER pin holds 12,990 entries. An entry cap of 10,000 refused it after
// its SHA-256 matched, and every BookNLP install failed with "could not be unpacked or prepared" (#2251).
func TestAnArchiveWithAsManyEntriesAsThePinnedTorchWheelIsUnpacked(t *testing.T) {
	const torchEntries = 12990
	archive := manyEntries(t, torchEntries)
	files := []File{archiveFile(serve(t, archive).URL, archive, torchEntries)}
	root := t.TempDir()
	if err := Install(context.Background(), root, "analysis", "booknlp-small", "1", files); err != nil {
		t.Fatalf("the pinned torch wheel's entry count must unpack: %v", err)
	}
	manifest, err := ReadManifest(Dir(root, "analysis", "booknlp-small", "1"))
	if err != nil {
		t.Fatal(err)
	}
	if got := len(manifest.Files[0].Extracted); got != torchEntries {
		t.Fatalf("unpacked %d files, want %d", got, torchEntries)
	}
}

// The entry cap still holds: an archive over it is refused before anything is written, with its count in the detail.
func TestAnArchiveOverTheEntryCapIsStillRefused(t *testing.T) {
	staging := t.TempDir()
	archive := manyEntries(t, maxArchiveFiles+1)
	file := File{Name: "big.whl", Extract: "big", Expand: maxArchiveFiles + 1}
	if err := os.WriteFile(filepath.Join(staging, file.Name), archive, 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := extractArchive(staging, file)
	if !errors.Is(err, ErrBadArchive) || !strings.Contains(err.Error(), fmt.Sprint(maxArchiveFiles+1)) {
		t.Fatalf("err = %v, want ErrBadArchive naming the count", err)
	}
	if _, statErr := os.Stat(filepath.Join(staging, "big")); !os.IsNotExist(statErr) {
		t.Fatal("nothing may be written before the entries are checked")
	}
}

// A failed unpack names its step and archive, and the cause, so the host log and the narrator's details say which file and why.
func TestAFailedUnpackNamesTheStepTheArchiveAndTheCause(t *testing.T) {
	junk := []byte("this is not a zip file at all")
	files := []File{archiveFile(serve(t, junk).URL, junk, 1000)}
	err := Install(context.Background(), t.TempDir(), "spacy", "sm", "3.8.0", files)
	var step *StepError
	if !errors.As(err, &step) || step.Step != StepUnpack || step.File != "model.whl" || !errors.Is(err, ErrBadArchive) {
		t.Fatalf("err = %#v, want an unpack StepError for model.whl that is ErrBadArchive", err)
	}
	if got := step.Detail(); !strings.HasPrefix(got, "Unpacking model.whl: ") || !strings.Contains(got, "not a valid zip file") {
		t.Fatalf("Detail = %q", got)
	}
}

func TestAFailedPrepareNamesItsStepAndArchive(t *testing.T) {
	archive := buildZip(t, map[string]string{"a.json": "alpha"})
	files := []File{archiveFile(serve(t, archive).URL, archive, 100)}
	refuse := func(string, File, []ExtractedFile) ([]ExtractedFile, error) {
		return nil, errors.New("the dataset has no entries")
	}
	err := InstallWith(context.Background(), t.TempDir(), "dict", "d", "1", files, Options{Derive: refuse})
	var step *StepError
	if !errors.As(err, &step) || step.Step != StepPrepare || !errors.Is(err, ErrBadContent) {
		t.Fatalf("err = %#v, want a prepare StepError that is ErrBadContent", err)
	}
	if got := step.Detail(); got != "Preparing model.whl: the downloaded data could not be prepared for use: the dataset has no entries" {
		t.Fatalf("Detail = %q", got)
	}
}

// The detail never carries a folder of this computer: a file system error keeps its operation and its reason, and any other mention of
// the staging folder is cut to the path inside it.
func TestTheDetailOfAStepErrorCarriesNoFolderOfThisComputer(t *testing.T) {
	staging := filepath.Join(t.TempDir(), "Users", "Narrator Name", "cache", "booknlp.installing")
	cases := map[string]error{
		"a path error":   &fs.PathError{Op: "open", Path: filepath.Join(staging, "wheel-torch", "torch", "lib", "torch_cpu.dll"), Err: errors.New("Access is denied.")},
		"a wrapped path": fmt.Errorf("%w: %w", ErrBadArchive, &fs.PathError{Op: "mkdir", Path: staging, Err: errors.New("The filename or extension is too long.")}),
		"quoted in text": fmt.Errorf("could not read %q", filepath.Join(staging, "model", "x.json")),
	}
	for name, cause := range cases {
		detail := (&StepError{Step: StepUnpack, File: "torch.whl", Err: cause, staging: staging}).Detail()
		if strings.Contains(detail, "Narrator Name") || strings.Contains(detail, staging) {
			t.Errorf("%s: the detail %q names a folder of this computer", name, detail)
		}
		if !strings.HasPrefix(detail, "Unpacking torch.whl: ") {
			t.Errorf("%s: Detail = %q", name, detail)
		}
	}
	if got := (&StepError{Step: StepUnpack, File: "t.whl", Err: cases["a path error"], staging: staging}).Detail(); got != "Unpacking t.whl: open: Access is denied." {
		t.Errorf("Detail = %q, want the operation and the reason", got)
	}
}
