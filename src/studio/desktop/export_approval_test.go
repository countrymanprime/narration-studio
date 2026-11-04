package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"desktop/internal/audacitybridge"
	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
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

	job, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: shownApproval(t, host, oneChapter(source))})
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
	if _, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: shownApproval(t, host, oneChapter(source))}); err != nil {
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
	if _, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source), Approval: &MasteringApproval{Provider: masteringport.DAW, ChainDigest: "sha256:shown"}}); err != nil {
		t.Fatal(err)
	}
	job := waitExportEnded(t, host)
	if job.Phase != "error" || job.Files[0].Error != masteringport.ErrNoDAW.Error() {
		t.Fatalf("job %+v", job)
	}
}

// A chapter title of spaces is no title: refused by the plan and the start before a job starts, never sent as a DAW region of
// spaces (qa B1, B2 on #2879).
func TestAWhitespaceChapterTitleIsRefusedBeforeAnythingRuns(t *testing.T) {
	source := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, source, "wav")
	host := masteringExportHost(t, masteringport.DAW, source)
	for _, title := range []string{"", "   ", "\t"} {
		req := ExportRequest{Master: true, Items: []ExportItem{{Kind: string(packager.KindChapter), Title: title, Path: source}}, Approval: &MasteringApproval{Provider: masteringport.DAW}}
		if _, err := host.exportPlan(req); err == nil || !strings.Contains(err.Error(), "no chapter title") {
			t.Fatalf("plan with title %q: err = %v", title, err)
		}
		if _, err := host.startExport(req); err == nil || !strings.Contains(err.Error(), "no chapter title") {
			t.Fatalf("start with title %q: err = %v", title, err)
		}
	}
	if state := host.exportState(); state.Phase != "idle" {
		t.Fatalf("a refused export left a job: %+v", state)
	}
}

// A row that needs a macro but not approval, asked with no approval at all, is refused for want of a macro; it does not
// dereference the missing approval (qa G2 on #2879).
func TestAMacroRowWithNoApprovalIsRefusedNotPanicking(t *testing.T) {
	source := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, source, "wav")
	row, _ := recordingRow(t, "macro-only")
	row.caps = masteringport.Capabilities{Level: port.Experimental, NeedsMacro: true}
	host := masteringExportHost(t, "", source)
	host.masteringRows = masterRows(row)
	if _, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(source)}); !errors.Is(err, masteringport.ErrNoMacro) {
		t.Fatalf("err = %v, want ErrNoMacro", err)
	}
}

// ExportPlan answers the row, what it needs, and each item as the host will export it (the title trimmed, the DAW region it
// renders from), and changes nothing: no job, and no approval is asked of it.
func TestExportPlanAnswersTheRowAndEachItemsRegion(t *testing.T) {
	dir := t.TempDir()
	chapter, opening := filepath.Join(dir, "ch1.wav"), filepath.Join(dir, "open.wav")
	writeFixtureFile(t, chapter, "wav")
	writeFixtureFile(t, opening, "wav")
	host := masteringExportHost(t, masteringport.DAW, chapter, opening)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
	plan, err := host.exportPlan(ExportRequest{Master: true, Items: []ExportItem{
		{Kind: string(packager.KindCreditsOpening), Path: opening},
		{Kind: string(packager.KindChapter), Title: " Chapter 1 ", Path: chapter},
	}})
	if err != nil {
		t.Fatal(err)
	}
	want := ExportPlan{Master: true, Provider: masteringport.DAW, Label: "Your DAW's FX chain", NeedsApproval: true, Items: []ExportPlanItem{
		{Kind: string(packager.KindCreditsOpening), Path: opening, Region: "Opening credits"},
		{Kind: string(packager.KindChapter), Title: "Chapter 1", Path: chapter, Region: "Chapter 1"},
	}, Chain: []ExportPlanTrack{
		{Name: "Voice", FX: []ExportPlanFX{{Name: "VST: ReaEQ (Cockos)", Enabled: true}}},
		{Name: "Master", Master: true, FX: []ExportPlanFX{{Name: "VST: ReaLimit (Cockos)", Enabled: true}}},
	}}
	// TestExportPlanAnswersTheDigestOfTheChainItLists checks the digest itself.
	want.ChainDigest = plan.ChainDigest
	if !reflect.DeepEqual(plan, want) {
		t.Fatalf("plan = %+v\nwant %+v", plan, want)
	}
	if state := host.exportState(); state.Phase != "idle" {
		t.Fatalf("a plan started a job: %+v", state)
	}
	plain, err := host.exportPlan(ExportRequest{Items: []ExportItem{{Kind: string(packager.KindChapter), Title: "Chapter 1", Path: chapter}}})
	if err != nil || plain.Master || plain.Provider != "" || plain.Items[0].Region != "" || plain.Chain == nil || len(plain.Chain) != 0 {
		t.Fatalf("encode-only plan = %+v, %v", plain, err)
	}
}

// The approval shows the DAW chain the render would run (threat model row 5o, #2932): a chain the DAW cannot list whole, or no DAW,
// refuses the plan, so the dialog never asks to approve a chain the narrator was not shown.
func TestExportPlanIsRefusedWhenTheDAWChainCannotBeRead(t *testing.T) {
	chapter := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, chapter, "wav")
	host := masteringExportHost(t, masteringport.DAW, chapter)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	cut := errors.New("this project has more FX than this app can list")
	daw.SetChain(dawport.MasterChain{}, cut)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
	if _, err := host.exportPlan(ExportRequest{Master: true, Items: oneChapter(chapter)}); !errors.Is(err, cut) {
		t.Fatalf("err = %v, want the DAW's refusal", err)
	}
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return masteringport.Session{}, masteringport.ErrNoDAW }))
	if _, err := host.exportPlan(ExportRequest{Master: true, Items: oneChapter(chapter)}); !errors.Is(err, masteringport.ErrNoDAW) {
		t.Fatalf("err = %v, want ErrNoDAW", err)
	}
}

// TestExportPlanGoldenIsCurrent pins ExportPlan's answer for the DAW row and the Audacity row. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/export-plan-*.json.
func TestExportPlanGoldenIsCurrent(t *testing.T) {
	items := []ExportItem{
		{Kind: string(packager.KindCreditsOpening), Path: "C:/Renders/00 Opening credits.wav"},
		{Kind: string(packager.KindChapter), Title: "Chapter 1", Path: "C:/Renders/Chapter 01.wav"},
	}
	for name, choice := range map[string]string{"export-plan-daw": masteringport.DAW, "export-plan-audacity": masteringport.Audacity} {
		t.Run(name, func(t *testing.T) {
			entry, err := masteringport.Rows.Lookup(choice)
			if err != nil {
				t.Fatal(err)
			}
			plan := exportPlanned{master: true, items: items, regions: make([]string, len(items)), row: entry, caps: entry.New().Capabilities()}
			if choice == masteringport.DAW {
				plan.listed = true
				// #2995: each track's mute, solo and mix, each plug-in's parameters, and a track with no FX.
				plan.chain = []masteringport.ChainTrack{
					{Name: "Voice", Mix: "7:825649450:779707780", FX: []masteringport.ChainFX{{Name: "VST: ReaEQ (Cockos)", Enabled: true, Params: "2:1031854743:1991403497"},
						{Name: "JS: De-esser", Params: "0:7:11"}}},
					{Name: "Room tone", Mute: true, Solo: 2, Mix: "7:1741980508:1004297306", FX: []masteringport.ChainFX{}},
					{Name: "Master", Master: true, Mix: "7:825649450:779707780", FX: []masteringport.ChainFX{{Name: "VST: ReaLimit (Cockos)", Enabled: true, Params: "0:7:11"}}},
				}
			}
			if !entry.Descriptor.Supports(masteringport.ModeWAV) {
				for i, item := range items {
					plan.regions[i] = exportRegion(item)
				}
			}
			raw, err := encodeBinding(exportPlanPayload(plan), nil)
			if err != nil {
				t.Fatal(err)
			}
			var decoded map[string]any
			if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
				t.Fatal(err)
			}
			contractfile.Check(t, name, decoded)
		})
	}
}

// TestMacroNameRuleGoldenIsCurrent pins audacitybridge.CheckMacroName's verdict on names a narrator might type, so the approval
// dialog's own check of a macro name (src/studio/ui/src/api/macroName.ts) is tested against the host's rule rather than a copy of
// it. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/macro-names.json.
func TestMacroNameRuleGoldenIsCurrent(t *testing.T) {
	names := []string{
		"Book loudness", "ACX_Master-2", "  spaced  ", "a", strings.Repeat("x", 64), strings.Repeat("x", 65), strings.Repeat("x ", 64),
		"", "   ", "ACX \u2013 Master", "\u00dcn\u00efcode", "\u0645\u0631\u062d\u0628\u0627", "loud \U0001F50A", `../../evil"; rm -rf /`, "back\\slash", "dot.name", "tab\tname",
	}
	verdicts := make([]any, 0, len(names))
	for _, name := range names {
		verdicts = append(verdicts, map[string]any{"name": name, "ok": audacitybridge.CheckMacroName(name) == nil})
	}
	contractfile.Check(t, "macro-names", map[string]any{"names": verdicts})
}

// A title with no character a narrator can see (a zero-width space, a direction mark, an override) is no title: refused like an
// empty one by the plan and the start, and the refusal names the file, not its whole path (qa on #2929).
func TestATitleWithNoVisibleCharacterIsRefusedNamingTheFile(t *testing.T) {
	source := filepath.Join(t.TempDir(), "Chapter 01.wav")
	writeFixtureFile(t, source, "wav")
	host := masteringExportHost(t, masteringport.Builtin, source)
	for _, title := range []string{"\u200b", "\u200b \u200b", "\u202e", "\u00a0\u3000", "\u2066\u2069"} {
		req := ExportRequest{Master: true, Items: []ExportItem{{Kind: string(packager.KindChapter), Title: title, Path: source}}}
		for name, call := range map[string]func() error{
			"plan":  func() error { _, err := host.exportPlan(req); return err },
			"start": func() error { _, err := host.startExport(req); return err },
		} {
			err := call()
			if err == nil || !strings.Contains(err.Error(), `"Chapter 01.wav" has no chapter title`) || strings.Contains(err.Error(), filepath.Dir(source)) {
				t.Fatalf("%s with title %q: err = %v, want a refusal naming only the file", name, title, err)
			}
		}
	}
	if _, err := host.exportPlan(ExportRequest{Items: []ExportItem{{Kind: string(packager.KindChapter), Title: "\u200bChapter 1", Path: source}}}); err != nil {
		t.Fatalf("a title with visible characters was refused: %v", err)
	}
}

// shownApproval is the narrator's approval of what ExportPlan showed for items: the row and the digest of the chain listed.
func shownApproval(t *testing.T, host *Host, items []ExportItem) *MasteringApproval {
	t.Helper()
	plan, err := host.exportPlan(ExportRequest{Master: true, Items: items})
	if err != nil {
		t.Fatal(err)
	}
	if plan.ChainDigest == "" {
		t.Fatalf("the plan for the %s row carries no chain digest", plan.Provider)
	}
	return &MasteringApproval{Provider: plan.Provider, ChainDigest: plan.ChainDigest}
}

// The plan answers the digest of the chain it lists; the approval sends it back (#2932's review).
func TestExportPlanAnswersTheDigestOfTheChainItLists(t *testing.T) {
	chapter := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, chapter, "wav")
	host := masteringExportHost(t, masteringport.DAW, chapter)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
	plan, err := host.exportPlan(ExportRequest{Master: true, Items: oneChapter(chapter)})
	if err != nil {
		t.Fatal(err)
	}
	listed, err := masteringport.Rows.Lookup(masteringport.DAW)
	if err != nil {
		t.Fatal(err)
	}
	chain, err := listed.New().(masteringport.ChainLister).Chain(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if plan.ChainDigest != masteringport.ChainDigest(chain) {
		t.Fatalf("plan digest %q is not the listed chain's %q", plan.ChainDigest, masteringport.ChainDigest(chain))
	}
	plain, err := host.exportPlan(ExportRequest{Items: oneChapter(chapter)})
	if err != nil || plain.ChainDigest != "" {
		t.Fatalf("an encode-only plan carries a digest: %+v, %v", plain, err)
	}
}

// Fail closed: an approval of the DAW row that does not say which chain was shown is refused before a job starts.
func TestAnApprovalWithoutTheChainDigestIsRefusedBeforeAnythingRuns(t *testing.T) {
	chapter := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, chapter, "wav")
	host := masteringExportHost(t, masteringport.DAW, chapter)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
	_, err := host.startExport(ExportRequest{Master: true, Items: oneChapter(chapter), Approval: &MasteringApproval{Provider: masteringport.DAW}})
	if !errors.Is(err, masteringport.ErrNoChainDigest) {
		t.Fatalf("err = %v, want ErrNoChainDigest", err)
	}
	if state := host.exportState(); state.Phase != "idle" || len(daw.Renders()) != 0 {
		t.Fatalf("a refused start ran: %+v, renders %+v", state, daw.Renders())
	}
}

// The chain changed in REAPER between the dialog and the start: the first render refuses it, so nothing renders, and the export
// stops with a message naming the file.
func TestAChainChangedAfterTheApprovalRendersNothing(t *testing.T) {
	dir := t.TempDir()
	one, two := filepath.Join(dir, "ch1.wav"), filepath.Join(dir, "ch2.wav")
	writeFixtureFile(t, one, "wav")
	writeFixtureFile(t, two, "wav")
	host := masteringExportHost(t, masteringport.DAW, one, two)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
	items := []ExportItem{{Kind: string(packager.KindChapter), Title: "Chapter 1", Path: one}, {Kind: string(packager.KindChapter), Title: "Chapter 2", Path: two}}
	approval := shownApproval(t, host, items)
	daw.SetChain(dawport.MasterChain{Master: []dawport.FXSlot{{Name: "VST: ReaLimit (Cockos)", Enabled: false}}}, nil)
	if _, err := host.startExport(ExportRequest{Master: true, Items: items, Approval: approval}); err != nil {
		t.Fatal(err)
	}
	job := waitExportEnded(t, host)
	if len(daw.Renders()) != 0 {
		t.Fatalf("a chain the narrator did not approve rendered: %+v", daw.Renders())
	}
	if job.Phase != "error" || !strings.Contains(job.Message, "ch1.wav") || !strings.Contains(job.Message, masteringport.ErrChainChanged.Error()) {
		t.Fatalf("phase %q, message %q", job.Phase, job.Message)
	}
	if job.Files[0].Status != exportFileFailed || job.Files[1].Status != exportFileCancelled {
		t.Fatalf("files %+v, want the first failed and the rest not started", job.Files)
	}
}

// The chain changed part way through: the files already rendered stay, the export stops at the file whose render refused the
// new chain, naming it, and no later file renders.
func TestAChainChangedMidExportStopsCleanlyKeepingWhatWasDone(t *testing.T) {
	dir := t.TempDir()
	paths := []string{filepath.Join(dir, "ch1.wav"), filepath.Join(dir, "ch2.wav"), filepath.Join(dir, "ch3.wav")}
	items := make([]ExportItem, 0, len(paths))
	for i, path := range paths {
		writeFixtureFile(t, path, "wav")
		items = append(items, ExportItem{Kind: string(packager.KindChapter), Title: fmt.Sprintf("Chapter %d", i+1), Path: path})
	}
	host := masteringExportHost(t, masteringport.DAW, paths...)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
	approval := shownApproval(t, host, items)
	daw.SwapChainAfter(1, dawport.MasterChain{Master: []dawport.FXSlot{{Name: "JS: Something else", Enabled: true}}})
	if _, err := host.startExport(ExportRequest{Master: true, Items: items, Approval: approval}); err != nil {
		t.Fatal(err)
	}
	job := waitExportEnded(t, host)
	if renders := daw.Renders(); len(renders) != 1 || renders[0].Regions[0] != "Chapter 1" {
		t.Fatalf("renders %+v, want only the first file's", renders)
	}
	if job.Files[0].Status != exportFileDone || job.Files[0].EncodedPath == "" {
		t.Fatalf("the file rendered before the change was not kept: %+v", job.Files[0])
	}
	if job.Files[1].Status != exportFileFailed || job.Files[1].Error != masteringport.ErrChainChanged.Error() || job.Files[2].Status != exportFileCancelled {
		t.Fatalf("files %+v, want the second refused and the third not started", job.Files)
	}
	if job.Phase != "error" || !strings.Contains(job.Message, "ch2.wav") || !strings.Contains(job.Message, "1 of 3 files were prepared") {
		t.Fatalf("phase %q, message %q", job.Phase, job.Message)
	}
}

// A chain the plan cannot read is refused with what to do instead (#2932's walkthrough): the bridge cutting the list short, REAPER
// not answering, or the read running out of time, each with the DAW's own reason kept.
func TestExportPlanRefusalsForAnUnreadableChainSayWhatToDo(t *testing.T) {
	chapter := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, chapter, "wav")
	host := masteringExportHost(t, masteringport.DAW, chapter)
	short := exportChainWait
	exportChainWait = 50 * time.Millisecond
	t.Cleanup(func() { exportChainWait = short })
	for name, set := range map[string]struct {
		arrange func(*masteringporttest.FakeDAW)
		want    error
	}{
		"cut short":   {func(d *masteringporttest.FakeDAW) { d.SetChain(dawport.MasterChain{}, bridge.ErrChainTooLong) }, bridge.ErrChainTooLong},
		"no answer":   {func(d *masteringporttest.FakeDAW) { d.SetChain(dawport.MasterChain{}, bridge.ErrNoAnswer) }, bridge.ErrNoAnswer},
		"out of time": {func(d *masteringporttest.FakeDAW) { d.ChainNeverAnswers() }, context.DeadlineExceeded},
	} {
		t.Run(name, func(t *testing.T) {
			daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
			set.arrange(daw)
			t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
			_, err := host.exportPlan(ExportRequest{Master: true, Items: oneChapter(chapter)})
			if !errors.Is(err, set.want) {
				t.Fatalf("err = %v, want %v", err, set.want)
			}
			// Short enough for a toast to show whole: the reason and what to do (round 2 walkthrough and qa N7 on #2932).
			if want := "Your DAW's FX chain couldn't be read, so it can't be approved. Choose the built-in chain, or untick Master before encoding."; err.Error() != want {
				t.Errorf("refusal = %q\nwant      %q", err, want)
			}
		})
	}
}

// A script in REAPER older than #2995 cannot answer the settings, routing and mute an approval binds, so the plan is refused with
// what to do: import the script again (the bridge's ErrScriptOutdated), not the generic "couldn't be read".
func TestExportPlanRefusesAChainFromAnOlderScriptWithWhatToDo(t *testing.T) {
	chapter := filepath.Join(t.TempDir(), "ch1.wav")
	writeFixtureFile(t, chapter, "wav")
	host := masteringExportHost(t, masteringport.DAW, chapter)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	daw.SetChain(dawport.MasterChain{Master: []dawport.FXSlot{{Name: "VST: ReaLimit (Cockos)", Enabled: true}}, SettingsUnread: true}, nil)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
	_, err := host.exportPlan(ExportRequest{Master: true, Items: oneChapter(chapter)})
	if !errors.Is(err, bridge.ErrScriptOutdated) {
		t.Fatalf("err = %v, want ErrScriptOutdated", err)
	}
	if want := "Your DAW's FX chain can't be checked: the app's script in REAPER is older than this app. Import it again from this app's REAPER folder, or choose the built-in chain."; err.Error() != want {
		t.Errorf("refusal = %q\nwant      %q", err, want)
	}
}

// REAPER not answering the chain read before a render stops the export at that file with a plain sentence, instead of waiting the
// read's whole bound again for every file after it (round 3 Go review on #2932). The real bridge gives up on its own, with
// bridge.ErrNoAnswer, before the read's bound runs out (round 4 qa, N1): that is the same silence and stops the export too.
func TestAChainReadThatGoesUnansweredStopsTheExportAtTheFirstFile(t *testing.T) {
	for name, silence := range map[string]func(*masteringporttest.FakeDAW){
		"the read's own bound runs out": func(d *masteringporttest.FakeDAW) { d.ChainNeverAnswers() },
		"the bridge gives up first":     func(d *masteringporttest.FakeDAW) { d.SetChain(dawport.MasterChain{}, bridge.ErrNoAnswer) },
	} {
		t.Run(name, func(t *testing.T) { unansweredChainReadStopsTheExport(t, silence) })
	}
}

func unansweredChainReadStopsTheExport(t *testing.T, silence func(*masteringporttest.FakeDAW)) {
	t.Helper()
	dir := t.TempDir()
	paths := []string{filepath.Join(dir, "ch1.wav"), filepath.Join(dir, "ch2.wav"), filepath.Join(dir, "ch3.wav")}
	items := make([]ExportItem, 0, len(paths))
	for i, path := range paths {
		writeFixtureFile(t, path, "wav")
		items = append(items, ExportItem{Kind: string(packager.KindChapter), Title: fmt.Sprintf("Chapter %d", i+1), Path: path})
	}
	host := masteringExportHost(t, masteringport.DAW, paths...)
	daw := masteringporttest.NewFakeDAW(host.config.projectFolder)
	t.Cleanup(masteringport.UseSession(func() (masteringport.Session, error) { return daw.Session(), nil }))
	approval := shownApproval(t, host, items)
	silence(daw)
	t.Cleanup(masteringport.UseRenderChainWait(200 * time.Millisecond))
	began := time.Now()
	if _, err := host.startExport(ExportRequest{Master: true, Items: items, Approval: approval}); err != nil {
		t.Fatal(err)
	}
	job := waitExportEnded(t, host)
	if took := time.Since(began); took > 2*time.Second {
		t.Fatalf("the export took %v: it waited on each file", took)
	}
	if job.Phase != "error" || !strings.Contains(job.Message, "Stopped at ch1.wav: "+masteringport.ErrChainNoAnswer.Error()) {
		t.Fatalf("phase %q, message %q", job.Phase, job.Message)
	}
	if job.Files[1].Status != exportFileCancelled || job.Files[2].Status != exportFileCancelled || len(daw.Renders()) != 0 {
		t.Fatalf("files %+v, renders %+v", job.Files, daw.Renders())
	}
}
