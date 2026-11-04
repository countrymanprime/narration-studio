package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"

	"desktop/internal/dawport"
	"desktop/internal/mastering"
	"desktop/internal/masteringport"
	"desktop/internal/packager"
	"desktop/internal/port"
	"desktop/internal/settings"
)

// masteringExportHost is renderExportHost with a project settings store holding choice as the project's mastering row ("" for
// none), every path picked, and a fake encoder.
func masteringExportHost(t *testing.T, choice string, paths ...string) *Host {
	t.Helper()
	host, _ := renderExportHost(t, paths...)
	host.settings = settings.New(t.TempDir(), host.config.projectFolder)
	if choice != "" {
		if err := host.settings.Save(masteringSettingsTool, "project", map[string]*string{masteringProviderKey: &choice}); err != nil {
			t.Fatal(err)
		}
	}
	host.encodeFile = fakeEncode(t)
	pickAllExport(t, host)
	return host
}

// recordingRow is a Supported row that writes a stand-in file, recording each request it was given.
func recordingRow(t *testing.T, name string, modes ...string) (masterRow, func() []masteringport.Request) {
	var mu sync.Mutex
	var asked []masteringport.Request
	row := masterRow{name: name, modes: modes, caps: masteringport.Capabilities{Level: port.Supported},
		master: func(_ context.Context, req masteringport.Request) (masteringport.Result, error) {
			mu.Lock()
			asked = append(asked, req)
			mu.Unlock()
			writeFixtureFile(t, req.Destination, name+" "+req.Region)
			return masteringport.Result{Provider: name, Destination: req.Destination}, nil
		}}
	return row, func() []masteringport.Request {
		mu.Lock()
		defer mu.Unlock()
		return slices.Clone(asked)
	}
}

func readBytes(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path) //nolint:gosec // G304: a file this test's export wrote
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// The built-in row is internal/mastering's chain unchanged: an export through it writes exactly the bytes mastering.Master
// writes for the same source and profile, and reports the same summary, whether the project chose it, has no choice, or chose
// a row this version does not have.
func TestExportThroughTheBuiltInRowWritesTheChainsOwnBytes(t *testing.T) {
	for _, choice := range []string{"", masteringport.Builtin, "dolby-atmos"} {
		t.Run("choice="+choice, func(t *testing.T) {
			source := filepath.Join(t.TempDir(), "ch1.wav")
			if err := os.WriteFile(source, sineWAV(3), 0o600); err != nil {
				t.Fatal(err)
			}
			host := masteringExportHost(t, choice, source)
			profile, _, _ := host.selectedDeliveryProfile(host.services())
			direct := filepath.Join(t.TempDir(), "direct.wav")
			want, err := mastering.Master(context.Background(), mastering.Request{Source: source, Destination: direct, Profile: profile}, mastering.Options{})
			if err != nil {
				t.Fatal(err)
			}

			if _, err := host.startExport(ExportRequest{Master: true, Items: []ExportItem{{Kind: string(packager.KindChapter), Title: "01", Path: source}}}); err != nil {
				t.Fatal(err)
			}
			job := waitExport(t, host)
			if job.Phase != "success" {
				t.Fatalf("phase %q (%s)", job.Phase, job.Message)
			}
			file := job.Files[0]
			if !bytes.Equal(readBytes(t, file.MasteredPath), readBytes(t, direct)) {
				t.Fatal("the export's mastered file differs from mastering.Master's for the same source and profile")
			}
			if wantSummary := summarizeMastering(want); file.Mastering == nil || !reflect.DeepEqual(*file.Mastering, wantSummary) {
				t.Fatalf("summary = %+v, want %+v", file.Mastering, wantSummary)
			}
			if !slices.Contains(job.Logs, "Mastering with Built-in chain (EQ, limiter, gain).") {
				t.Fatalf("logs %q do not name the built-in chain", job.Logs)
			}
		})
	}
}

// The export masters with the project's own row, the one MasteringProviders calls effective; a row that is not the built-in
// chain reports no gain or high-pass of the app's.
func TestExportMastersWithTheProjectsChosenRow(t *testing.T) {
	source := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, source, "wav")
	first, firstAsked := recordingRow(t, "first")
	chosen, chosenAsked := recordingRow(t, "chosen")
	host := masteringExportHost(t, "chosen", source)
	host.masteringRows = masterRows(first, chosen)

	if _, err := host.startExport(ExportRequest{Master: true, Items: []ExportItem{{Kind: string(packager.KindChapter), Title: "One", Path: source}}}); err != nil {
		t.Fatal(err)
	}
	job := waitExport(t, host)
	if job.Phase != "success" {
		t.Fatalf("phase %q (%s)", job.Phase, job.Message)
	}
	if len(firstAsked()) != 0 || len(chosenAsked()) != 1 {
		t.Fatalf("first row asked %d times, chosen row %d, want 0 and 1", len(firstAsked()), len(chosenAsked()))
	}
	if req := chosenAsked()[0]; req.Source != source || req.Approved || req.Destination != job.Files[0].MasteredPath {
		t.Fatalf("request = %+v", req)
	}
	if job.Files[0].Mastering != nil {
		t.Fatalf("a row other than the built-in chain reported the built-in chain's numbers: %+v", job.Files[0].Mastering)
	}
	if !slices.Contains(job.Logs, "Mastering with chosen chain.") {
		t.Fatalf("logs %q do not name the chosen row", job.Logs)
	}
}

// A row that renders a region from the DAW masters a chapter from the region named for its title and the credits from theirs.
func TestExportMastersADAWRegionRowFromEachItemsRegion(t *testing.T) {
	dir := t.TempDir()
	paths := []string{filepath.Join(dir, "open.wav"), filepath.Join(dir, "ch1.wav"), filepath.Join(dir, "close.wav")}
	for _, path := range paths {
		writeFixtureFile(t, path, "wav")
	}
	row, asked := recordingRow(t, "region", masteringport.ModeDAWRegion)
	host := masteringExportHost(t, "", paths...)
	host.masteringRows = masterRows(row)

	items := []ExportItem{
		{Kind: string(packager.KindCreditsOpening), Path: paths[0]},
		{Kind: string(packager.KindChapter), Title: "  Chapter One ", Path: paths[1]},
		{Kind: string(packager.KindCreditsClosing), Path: paths[2]},
	}
	if _, err := host.startExport(ExportRequest{Master: true, Items: items}); err != nil {
		t.Fatal(err)
	}
	job := waitExportEnded(t, host)
	regions := []string{}
	for _, req := range asked() {
		regions = append(regions, req.Region)
	}
	if !reflect.DeepEqual(regions, []string{"Opening credits", "Chapter One", "Closing credits"}) {
		t.Fatalf("regions = %q", regions)
	}
	if job.Phase != "success" {
		t.Fatalf("phase %q (%s)", job.Phase, job.Message)
	}
}

// An item with no region (a retail sample) cannot be mastered by a row that renders regions: the whole export is refused before
// a job starts, naming it, rather than approved and then failing that file (walkthrough of #2879, finding 2).
func TestADAWRegionExportWithAnItemThatHasNoRegionIsRefusedUpFront(t *testing.T) {
	dir := t.TempDir()
	chapter, sample := filepath.Join(dir, "ch1.wav"), filepath.Join(dir, "Retail sample.wav")
	writeFixtureFile(t, chapter, "wav")
	writeFixtureFile(t, sample, "wav")
	row, asked := recordingRow(t, "region", masteringport.ModeDAWRegion)
	host := masteringExportHost(t, "", chapter, sample)
	host.masteringRows = masterRows(row)
	req := ExportRequest{Master: true, Items: []ExportItem{
		{Kind: string(packager.KindChapter), Title: "Chapter One", Path: chapter},
		{Kind: string(packager.KindRetailSample), Path: sample},
	}}
	for name, call := range map[string]func() error{
		"plan":  func() error { _, err := host.exportPlan(req); return err },
		"start": func() error { _, err := host.startExport(req); return err },
	} {
		if err := call(); err == nil || !strings.Contains(err.Error(), "Retail sample.wav has no region") {
			t.Fatalf("%s: err = %v, want a refusal naming the retail sample", name, err)
		}
	}
	if state := host.exportState(); state.Phase != "idle" || len(asked()) != 0 {
		t.Fatalf("a refused export left a job or a master: %+v, %d", state, len(asked()))
	}
	// Without mastering, the same files encode.
	if _, err := host.startExport(ExportRequest{Items: req.Items}); err != nil {
		t.Fatal(err)
	}
	waitExport(t, host)
}

// The DAW and Audacity rows need the narrator's approval for each render, which this request cannot carry: the export refuses
// before a job starts, and nothing is mastered or encoded.
func TestExportRefusesARowThatNeedsApprovalBeforeAnythingRuns(t *testing.T) {
	for _, choice := range []string{masteringport.DAW, masteringport.Audacity} {
		t.Run(choice, func(t *testing.T) {
			source := filepath.Join(t.TempDir(), "ch1.wav")
			writeFixtureFile(t, source, "wav")
			host := masteringExportHost(t, choice, source)
			_, err := host.startExport(ExportRequest{Master: true, Items: []ExportItem{{Kind: string(packager.KindChapter), Title: "01", Path: source}}})
			if !errors.Is(err, masteringport.ErrNotApproved) {
				t.Fatalf("err = %v, want ErrNotApproved", err)
			}
			if state := host.exportState(); state.Phase != "idle" {
				t.Fatalf("a refused export left a job: %+v", state)
			}
		})
	}
}

// Without mastering the project's row is never asked for, so a row that needs approval does not stop an encode-only export.
func TestAnEncodeOnlyExportDoesNotNeedTheRowsApproval(t *testing.T) {
	source := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, source, "wav")
	host := masteringExportHost(t, masteringport.DAW, source)
	if _, err := host.startExport(ExportRequest{Items: []ExportItem{{Kind: string(packager.KindChapter), Title: "01", Path: source}}}); err != nil {
		t.Fatal(err)
	}
	if job := waitExport(t, host); job.Phase != "success" {
		t.Fatalf("phase %q (%s)", job.Phase, job.Message)
	}
}

// masteringSession, which ServiceStartup hands to masteringport.UseSession, is the open project's DAW port resolver and folder,
// and ErrNoDAW without either.
func TestTheMasteringSessionIsTheOpenProjectsDAW(t *testing.T) {
	host := newTestHost(t)
	if _, err := host.masteringSession(); !errors.Is(err, masteringport.ErrNoDAW) {
		t.Fatalf("no project: err = %v, want ErrNoDAW", err)
	}
	host.config.projectFolder = t.TempDir()
	if _, err := host.masteringSession(); !errors.Is(err, masteringport.ErrNoDAW) {
		t.Fatalf("no DAW: err = %v, want ErrNoDAW", err)
	}
	resolver := dawport.NewResolver(dawport.ResolverConfig{})
	host.dawPortResolver = resolver
	session, err := host.masteringSession()
	if err != nil || session.Resolver != resolver || session.ProjectFolder != host.config.projectFolder {
		t.Fatalf("session = %+v, %v", session, err)
	}
}
