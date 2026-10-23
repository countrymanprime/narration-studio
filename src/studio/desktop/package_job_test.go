package main

import (
	"context"
	"desktop/internal/brand"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/contractfile"
	"desktop/internal/packager"
)

// packageHost is a host with an export job already holding encoded files, ready to package.
func packageHost(t *testing.T, encodedPaths ...string) *Host {
	t.Helper()
	host := NewHost()
	job := &exportJob{id: "export-1", phase: "success"}
	for _, path := range encodedPaths {
		job.files = append(job.files, ExportFileResult{Kind: string(packager.KindChapter), Title: filepath.Base(path), Path: path, EncodedPath: path, Status: exportFileDone})
	}
	host.exportJob = job
	return host
}

func TestPackageRefusesWithoutAPriorExport(t *testing.T) {
	host := NewHost()
	_, err := host.startPackage(PackageRequest{ProfileID: "acx", Items: []PackageItem{{Kind: string(packager.KindChapter), Path: "C:/x.mp3"}}})
	if err == nil || !strings.Contains(err.Error(), "export the files") {
		t.Fatalf("expected an export-first refusal, got %v", err)
	}
}

func TestPackageRefusesAPathThatWasNotEncoded(t *testing.T) {
	host := packageHost(t, filepath.Join(t.TempDir(), "01.mp3"))
	_, err := host.startPackage(PackageRequest{ProfileID: "acx", Items: []PackageItem{{Kind: string(packager.KindChapter), Path: "C:/not-encoded.mp3"}}})
	if err == nil || !strings.Contains(err.Error(), "not encoded") {
		t.Fatalf("expected a not-encoded refusal, got %v", err)
	}
}

func TestPackageRefusesAnUnknownProfile(t *testing.T) {
	dir := t.TempDir()
	encoded := filepath.Join(dir, "01.mp3")
	writeFixtureFile(t, encoded, "encoded")
	host := packageHost(t, encoded)
	host.pickPackageFolder = func() (string, error) { return t.TempDir(), nil }
	_, err := host.startPackage(PackageRequest{ProfileID: "not-a-real-profile", Items: []PackageItem{{Kind: string(packager.KindChapter), Title: "01", Path: encoded}}})
	if err == nil || !strings.Contains(err.Error(), "no delivery profile") {
		t.Fatalf("expected an unknown-profile refusal, got %v", err)
	}
}

func TestPackageRefusesAnOutputFolderInsideTheProjectsSidecarTree(t *testing.T) {
	project := t.TempDir()
	encoded := filepath.Join(project, brand.ProjectFolder, "render-encode-master", "encoded", "01.mp3")
	writeFixtureFile(t, encoded, "encoded")
	host := packageHost(t, encoded)
	host.config.projectFolder = project
	host.pickPackageFolder = func() (string, error) {
		return filepath.Join(project, brand.ProjectFolder, "render-encode-master", "package"), nil
	}
	items := []PackageItem{{Kind: string(packager.KindChapter), Title: "01", Path: encoded}, {Kind: string(packager.KindRetailSample), Path: encoded}, {Kind: string(packager.KindCreditsOpening), Path: encoded}, {Kind: string(packager.KindCreditsClosing), Path: encoded}}
	_, err := host.startPackage(PackageRequest{ProfileID: "acx", Items: items})
	if err == nil || !strings.Contains(err.Error(), "the app's folder in the project") {
		t.Fatalf("expected a sidecar-tree refusal, got %v", err)
	}
}

// TestPackageAssemblesARealPackage runs the real packager.Assemble over an export's own encoded files,
// end to end: the job answers the manifest and checklist Assemble built.
func TestPackageAssemblesARealPackage(t *testing.T) {
	dir := t.TempDir()
	ch1, ch2, credits, sample := filepath.Join(dir, "1.mp3"), filepath.Join(dir, "2.mp3"), filepath.Join(dir, "c.mp3"), filepath.Join(dir, "s.mp3")
	for _, path := range []string{ch1, ch2, credits, sample} {
		writeFixtureFile(t, path, "encoded "+path)
	}
	host := packageHost(t, ch1, ch2, credits, sample)
	outDir := filepath.Join(t.TempDir(), "package")
	host.pickPackageFolder = func() (string, error) { return outDir, nil }

	// ACX requires both an opening and closing credits file; give it only one to prove the checklist reports it
	// missing rather than the whole request refusing, since ACX also requires a retail sample which this request
	// does supply.
	items := []PackageItem{
		{Kind: string(packager.KindChapter), Title: "Chapter One", Path: ch1},
		{Kind: string(packager.KindChapter), Title: "Chapter Two", Path: ch2},
		{Kind: string(packager.KindCreditsOpening), Path: credits},
		{Kind: string(packager.KindRetailSample), Path: sample},
	}
	if _, err := host.startPackage(PackageRequest{ProfileID: "acx", Items: items}); err != nil {
		t.Fatal(err)
	}
	job := waitPackage(t, host)
	if job.Phase != "error" {
		t.Fatalf("expected a refusal (missing closing credits), got %q (%s)", job.Phase, job.Message)
	}
}

func TestPackageWithEveryItemBuildsTheACXBookChecklist(t *testing.T) {
	dir := t.TempDir()
	ch1, opening, closing, sample := filepath.Join(dir, "1.mp3"), filepath.Join(dir, "o.mp3"), filepath.Join(dir, "c.mp3"), filepath.Join(dir, "s.mp3")
	for _, path := range []string{ch1, opening, closing, sample} {
		writeFixtureFile(t, path, "encoded "+path)
	}
	host := packageHost(t, ch1, opening, closing, sample)
	outDir := filepath.Join(t.TempDir(), "package")
	host.pickPackageFolder = func() (string, error) { return outDir, nil }

	items := []PackageItem{
		{Kind: string(packager.KindChapter), Title: "Chapter One", Path: ch1},
		{Kind: string(packager.KindCreditsOpening), Path: opening},
		{Kind: string(packager.KindCreditsClosing), Path: closing},
		{Kind: string(packager.KindRetailSample), Path: sample},
	}
	if _, err := host.startPackage(PackageRequest{ProfileID: "acx", Items: items}); err != nil {
		t.Fatal(err)
	}
	job := waitPackage(t, host)
	if job.Phase != "success" {
		t.Fatalf("expected success, got %q (%s)", job.Phase, job.Message)
	}
	if len(job.Files) != 4 {
		t.Fatalf("expected 4 packaged files, got %d (%+v)", len(job.Files), job.Files)
	}
	if job.OutputDir != outDir {
		t.Fatalf("expected outputDir %q, got %q", outDir, job.OutputDir)
	}
	for _, item := range job.Checklist {
		if item.Status == string(packager.ChecklistMissing) {
			t.Fatalf("expected no missing checklist item, got %+v", item)
		}
	}
}

func TestPackageCancelStopsBeforeWritingMore(t *testing.T) {
	dir := t.TempDir()
	ch1 := filepath.Join(dir, "1.mp3")
	writeFixtureFile(t, ch1, "encoded")
	host := packageHost(t, ch1)
	outDir := filepath.Join(t.TempDir(), "package")
	host.pickPackageFolder = func() (string, error) { return outDir, nil }
	host.assemblePackage = func(ctx context.Context, req packager.Request) (packager.Manifest, error) {
		<-ctx.Done()
		return packager.Manifest{}, ctx.Err()
	}

	items := []PackageItem{{Kind: string(packager.KindChapter), Title: "Chapter One", Path: ch1}, {Kind: string(packager.KindRetailSample), Path: ch1}}
	if _, err := host.startPackage(PackageRequest{ProfileID: "acx", Items: items}); err != nil {
		t.Fatal(err)
	}
	job := host.cancelPackage()
	if job.Phase != "running" {
		t.Fatalf("cancel should not itself change the phase synchronously, got %q", job.Phase)
	}
	job = waitPackage(t, host)
	if job.Phase != "cancelled" {
		t.Fatalf("expected cancelled, got %q (%s)", job.Phase, job.Message)
	}
}

func TestPackageEmptyFolderChoiceLeavesTheJobIdle(t *testing.T) {
	dir := t.TempDir()
	ch1 := filepath.Join(dir, "1.mp3")
	writeFixtureFile(t, ch1, "encoded")
	host := packageHost(t, ch1)
	host.pickPackageFolder = func() (string, error) { return "", nil }
	items := []PackageItem{{Kind: string(packager.KindChapter), Title: "Chapter One", Path: ch1}, {Kind: string(packager.KindRetailSample), Path: ch1}, {Kind: string(packager.KindCreditsOpening), Path: ch1}, {Kind: string(packager.KindCreditsClosing), Path: ch1}}
	job, err := host.startPackage(PackageRequest{ProfileID: "acx", Items: items})
	if err != nil {
		t.Fatal(err)
	}
	if job.Phase == "running" {
		t.Fatalf("closing the folder picker should not start a job, got %q", job.Phase)
	}
}

func TestPackageRefusesASecondBuildWhileOneRuns(t *testing.T) {
	dir := t.TempDir()
	ch1 := filepath.Join(dir, "1.mp3")
	writeFixtureFile(t, ch1, "encoded")
	host := packageHost(t, ch1)
	host.pickPackageFolder = func() (string, error) { return filepath.Join(t.TempDir(), "out"), nil }
	release := make(chan struct{})
	host.assemblePackage = func(ctx context.Context, req packager.Request) (packager.Manifest, error) {
		<-release
		return packager.Assemble(ctx, req)
	}
	items := []PackageItem{{Kind: string(packager.KindChapter), Title: "Chapter One", Path: ch1}, {Kind: string(packager.KindRetailSample), Path: ch1}, {Kind: string(packager.KindCreditsOpening), Path: ch1}, {Kind: string(packager.KindCreditsClosing), Path: ch1}}
	if _, err := host.startPackage(PackageRequest{ProfileID: "acx", Items: items}); err != nil {
		t.Fatal(err)
	}
	if _, err := host.startPackage(PackageRequest{ProfileID: "acx", Items: items}); err == nil || !strings.Contains(err.Error(), "already being built") {
		t.Fatalf("expected an already-building refusal, got %v", err)
	}
	close(release)
	waitPackage(t, host)
}

func waitPackage(t *testing.T, host *Host) PackageJob {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		job := host.packageState()
		if job.Phase != "running" {
			return job
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("package build did not finish in time")
	return PackageJob{}
}

func TestDeliveryOpenPackageFolderOpensTheLastBuiltFolderAndRefusesWithoutOne(t *testing.T) {
	host := NewHost()
	var opened []string
	host.openFolder = func(dir string) error { opened = append(opened, dir); return nil }

	// Nothing built yet: refused, and nothing is opened.
	if _, err := host.DeliveryOpenPackageFolder(); err == nil || !strings.Contains(err.Error(), "build a package first") {
		t.Fatalf("expected a build-first refusal, got %v", err)
	}
	// A build that failed has no folder to show either.
	host.packageJob = &packageJobState{id: "package-1", phase: "error", outputDir: t.TempDir(), cancel: func() {}}
	if _, err := host.DeliveryOpenPackageFolder(); err == nil || !strings.Contains(err.Error(), "build a package first") {
		t.Fatalf("expected a build-first refusal after a failed build, got %v", err)
	}

	built := t.TempDir()
	host.packageJob = &packageJobState{id: "package-2", phase: "success", outputDir: built, cancel: func() {}}
	raw, err := host.DeliveryOpenPackageFolder()
	if err != nil {
		t.Fatal(err)
	}
	var result PackageFolderResult
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		t.Fatal(err)
	}
	if result.Folder != built || len(opened) != 1 || opened[0] != built {
		t.Fatalf("answered %+v and opened %v, want the built folder %q once", result, opened, built)
	}

	// The folder was deleted since the build: refused with a sentence naming it, and nothing is opened.
	if err := os.RemoveAll(built); err != nil {
		t.Fatal(err)
	}
	if _, err := host.DeliveryOpenPackageFolder(); err == nil || !strings.Contains(err.Error(), "no longer there") {
		t.Fatalf("expected a folder-gone refusal, got %v", err)
	}
	if len(opened) != 1 {
		t.Fatalf("opened %v after the folder went away", opened)
	}

	contractfile.Check(t, "delivery-open-folder", PackageFolderResult{Folder: `C:\Users\Narrator\Desktop\Wonderland ACX`})
}

// TestInSidecarTreeComparesResolvedPaths is the state matrix for the sidecar-tree refusal: every spelling of the
// app's folder in the project that names the same place is refused, and a sibling that only shares a prefix is not.
func TestInSidecarTreeComparesResolvedPaths(t *testing.T) {
	project := t.TempDir()
	sidecar := filepath.Join(project, brand.ProjectFolder)
	if err := os.MkdirAll(filepath.Join(sidecar, "package"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(project, brand.ProjectFolder+"-copy"), 0o755); err != nil {
		t.Fatal(err)
	}
	elsewhere := t.TempDir()

	linkTo := func(t *testing.T, target string) string {
		t.Helper()
		link := filepath.Join(t.TempDir(), "link")
		if err := os.Symlink(target, link); err != nil {
			t.Fatalf("cannot create a symlink (Windows needs Developer Mode or an elevated shell): %v", err)
		}
		return link
	}
	cases := []struct {
		name string
		dir  func(t *testing.T) string
		want bool
	}{
		{"the sidecar folder", func(*testing.T) string { return sidecar }, true},
		{"inside it", func(*testing.T) string { return filepath.Join(sidecar, "package") }, true},
		{"inside it, not made yet", func(*testing.T) string { return filepath.Join(sidecar, "new", "deeper") }, true},
		{"spelled with dot segments", func(*testing.T) string { return filepath.Join(project, "x", "..", brand.ProjectFolder, "package") }, true},
		{"through a symlink to it", func(t *testing.T) string { return linkTo(t, sidecar) }, true},
		{"through a symlink to it, not made yet", func(t *testing.T) string { return filepath.Join(linkTo(t, sidecar), "new") }, true},
		{"through a symlink to the project", func(t *testing.T) string { return filepath.Join(linkTo(t, project), brand.ProjectFolder, "package") }, true},
		{"the project folder", func(*testing.T) string { return project }, false},
		{"a sibling sharing the prefix", func(*testing.T) string { return filepath.Join(project, brand.ProjectFolder+"-copy") }, false},
		{"a symlink to a sibling", func(t *testing.T) string { return linkTo(t, filepath.Join(project, brand.ProjectFolder+"-copy")) }, false},
		{"another folder", func(*testing.T) string { return elsewhere }, false},
		{"a folder that does not exist", func(*testing.T) string { return filepath.Join(elsewhere, "nope", "deeper") }, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := tc.dir(t)
			if got := inSidecarTree(project, dir); got != tc.want {
				t.Fatalf("inSidecarTree(project, %q) = %v, want %v", dir, got, tc.want)
			}
		})
	}
	t.Run("a sidecar folder that is itself a symlink", func(t *testing.T) {
		realProject, realSidecar := t.TempDir(), t.TempDir()
		if err := os.Symlink(realSidecar, filepath.Join(realProject, brand.ProjectFolder)); err != nil {
			t.Fatalf("cannot create a symlink (Windows needs Developer Mode or an elevated shell): %v", err)
		}
		if !inSidecarTree(realProject, filepath.Join(realSidecar, "package")) {
			t.Fatal("the real folder behind a linked app folder was not refused")
		}
	})
	t.Run("no open project", func(t *testing.T) {
		if inSidecarTree("", sidecar) {
			t.Fatal("refused with no project open")
		}
	})
}

func TestStripExtendedPrefix(t *testing.T) {
	for in, want := range map[string]string{
		`\\?\C:\Users\me\Book`:      `C:\Users\me\Book`,
		`\\?\UNC\server\share\Book`: `\\server\share\Book`,
		`C:\Users\me`:               `C:\Users\me`,
		`\\server\share`:            `\\server\share`,
		`\\.\C:\x`:                  `\\.\C:\x`,
		``:                          ``,
	} {
		if got := stripExtendedPrefix(in); got != want {
			t.Errorf("stripExtendedPrefix(%q) = %q, want %q", in, got, want)
		}
	}
}
