package main

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/masteringport"
	"desktop/internal/masteringport/masteringporttest"
	"desktop/internal/packager"
	"desktop/internal/port"
)

func oneChapter(path string) []ExportItem {
	return []ExportItem{{Kind: string(packager.KindChapter), Title: "Chapter 1", Path: path}}
}

// The approval reaches the DAW row: the export masters the chapter's region through the project's DAW (the fake DAW the
// conformance suite uses, which refuses what the bridge refuses: no approval, a used token, a folder outside the project), the
// job names the row it masters with, and the file is Judge's.
func TestAnApprovedExportMastersThroughTheDAWRow(t *testing.T) {
	source := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, source, "wav")
	host := masteringExportHost(t, masteringport.DAW, source)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))

	job, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: &MasteringApproval{Provider: masteringport.DAW}})
	if err != nil {
		t.Fatal(err)
	}
	if job.Provider != masteringport.DAW {
		t.Fatalf("job provider = %q, want daw", job.Provider)
	}
	job = waitExport(t, host)
	if job.Phase != "success" {
		t.Fatalf("phase %q (%s), file %+v, DAW refusals %q", job.Phase, job.Message, job.Files[0], daw.Refusals())
	}
	renders := daw.Renders()
	if len(renders) != 1 || len(renders[0].Regions) != 1 || renders[0].Regions[0] != "Chapter 1" || renders[0].Approval == "" {
		t.Fatalf("renders = %+v, want one approved render of the chapter's region", renders)
	}
	if job.Provider != masteringport.DAW || job.Files[0].MasteredPath == "" || job.Files[0].Mastering != nil {
		t.Fatalf("job = %+v", job)
	}
}

// An approval holds for the one call that carries it: the next export without one is refused again, before anything runs.
func TestAnApprovalIsNotRememberedForTheNextExport(t *testing.T) {
	source := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, source, "wav")
	host := masteringExportHost(t, masteringport.DAW, source)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
	if _, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: &MasteringApproval{Provider: masteringport.DAW}}); err != nil {
		t.Fatal(err)
	}
	waitExport(t, host)
	if _, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source)}); !errors.Is(err, masteringport.ErrNotApproved) {
		t.Fatalf("second export without approval: err = %v, want ErrNotApproved", err)
	}
	if len(daw.Renders()) != 1 {
		t.Fatalf("renders = %d, want only the approved one", len(daw.Renders()))
	}
}

// An approval names the row the narrator saw. When the project masters with another row by the time it arrives (its choice
// changed, or the chosen row stopped being available), the approval is stale: refused before a job starts, with both rows named.
func TestAStaleApprovalIsRefusedBeforeAnythingRuns(t *testing.T) {
	for _, c := range []struct{ choice, approved, want string }{
		{masteringport.DAW, masteringport.Audacity, "you approved Audacity's effect macro, but this project now masters with Your DAW's FX chain"},
		{masteringport.Builtin, masteringport.DAW, "you approved Your DAW's FX chain, but this project now masters with Built-in chain"},
		{"", "retired-row", `you approved retired-row, but this project now masters with Built-in chain`},
	} {
		t.Run(c.choice+"/"+c.approved, func(t *testing.T) {
			source := filepath.Join(t.TempDir(), "ch1.wav")
			writeFixtureFile(t, source, "wav")
			host := masteringExportHost(t, c.choice, source)
			_, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: &MasteringApproval{Provider: c.approved, Macro: "Loud"}})
			if !errors.Is(err, errStaleApproval) || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("err = %v, want a stale refusal naming %q", err, c.want)
			}
			if state := host.exportState(); state.Phase != "idle" {
				t.Fatalf("a refused export left a job: %+v", state)
			}
		})
	}
}

// A row that needs a macro gets the narrator's macro name, trimmed, with its approval; no name, or a name Audacity's pipe cannot
// carry, is refused before a job starts.
func TestAMacroRowNeedsTheMacroNamedWithItsApproval(t *testing.T) {
	source := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, source, "wav")
	row, asked := recordingRow(t, "macro")
	row.caps = masteringport.Capabilities{Level: port.Experimental, NeedsApproval: true, NeedsMacro: true}

	for _, bad := range []string{"", "   ", `Loud"; Delete`} {
		host := masteringExportHost(t, "", source)
		host.masteringRows = masterRows(row)
		_, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: &MasteringApproval{Provider: "macro", Macro: bad}})
		if err == nil || (strings.TrimSpace(bad) == "" && !errors.Is(err, masteringport.ErrNoMacro)) {
			t.Fatalf("macro %q: err = %v, want a refusal (ErrNoMacro when it is blank)", bad, err)
		}
		if state := host.exportState(); state.Phase != "idle" {
			t.Fatalf("macro %q left a job: %+v", bad, state)
		}
	}
	host := masteringExportHost(t, "", source)
	host.masteringRows = masterRows(row)
	if _, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: &MasteringApproval{Provider: "macro", Macro: "  Book Loudness  "}}); err != nil {
		t.Fatal(err)
	}
	if job := waitExport(t, host); job.Phase != "success" {
		t.Fatalf("phase %q (%s)", job.Phase, job.Message)
	}
	if got := asked(); len(got) != 1 || got[0].Macro != "Book Loudness" || !got[0].Approved {
		t.Fatalf("requests = %+v, want one approved request with the trimmed macro", got)
	}
}

// An approval of the row the project masters with does no harm when that row does not need one, and an export that does not
// master ignores it: neither is a stale refusal, and the job names its row or none.
func TestAnApprovalOfTheBuiltInRowOrWithoutMasteringIsAccepted(t *testing.T) {
	source := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, source, "wav")
	host := masteringExportHost(t, "", source)
	host.masteringRows = fakeMaster(t)
	job, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: &MasteringApproval{Provider: "fake"}})
	if err != nil || job.Provider != "fake" {
		t.Fatalf("job %+v, err %v", job, err)
	}
	waitExport(t, host)

	job, err = host.startExport(ExportRequest{Items: oneChapter(source), Approval: &MasteringApproval{Provider: "elsewhere"}})
	if err != nil || job.Provider != "" {
		t.Fatalf("encode-only: job %+v, err %v", job, err)
	}
	waitExport(t, host)
}

// The DAW row's own refusal (no DAW connected) reaches the file's error in the row's words, and the job ends in error.
func TestAnApprovedDAWMasterWithNoDAWFailsTheFileWithTheReason(t *testing.T) {
	source := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, source, "wav")
	host := masteringExportHost(t, masteringport.DAW, source)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return masteringport.Session{}, masteringport.ErrNoDAW }))
	if _, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: &MasteringApproval{Provider: masteringport.DAW}}); err != nil {
		t.Fatal(err)
	}
	job := waitExportEnded(t, host)
	if job.Phase != "error" || job.Files[0].Error != masteringport.ErrNoDAW.Error() {
		t.Fatalf("job %+v", job)
	}
}
