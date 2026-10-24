package main

import (
	"maps"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
	"desktop/internal/passagetakes"
)

// WorkspacePreviewTake: a take the Takes panel offers, heard through the DAW's preview so a linked DAW's output is the only one
// (#2251 item 32). The file and range come from the saved project, never from the page.

// previewTakeHost is useTakeHost with the file_preview capability set to toggle and role standing in for the DAW's file role.
func previewTakeHost(t *testing.T, role *fakeFiles, toggle string) *Host {
	t.Helper()
	host := useTakeHost(t, &fakeTakeSelector{}, "on")
	if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapFilePreview): &toggle}); err != nil {
		t.Fatal(err)
	}
	host.mu.Lock()
	host.filePreviewer = role
	host.mu.Unlock()
	return host
}

func TestWorkspacePreviewTakePlaysTheOfferedTakesOwnRangeThroughTheDaw(t *testing.T) {
	role := &fakeFiles{}
	host := previewTakeHost(t, role, "on")

	got := decodeDawResult(t)(host.WorkspacePreviewTake("c-0001", 0, 0, hideKeepA))

	if !got.OK || got.Changed {
		t.Fatalf("WorkspacePreviewTake = %+v", got)
	}
	if len(role.previews) != 1 {
		t.Fatalf("sent %v", role.previews)
	}
	sent := role.previews[0]
	if !filepath.IsAbs(sent.Path) || filepath.Base(sent.Path) != "a.wav" || sent.Start != 0 || sent.Length != 4 {
		t.Fatalf("sent %+v, want take A's own file from 0 for 4 s", sent)
	}
}

func TestWorkspacePreviewTakeRefusesATakeItDidNotOfferAndSendsNothing(t *testing.T) {
	role := &fakeFiles{}
	host := previewTakeHost(t, role, "on")

	got := decodeDawResult(t)(host.WorkspacePreviewTake("c-0001", 0, 0, "take:{NOT-OFFERED}:{TAKE}"))

	if want := dawport.RefusedStale(takePreviewNotOfferedSentence); !reflect.DeepEqual(got, want) || role.sent() != 0 {
		t.Fatalf("WorkspacePreviewTake = %+v, sent %d", got, role.sent())
	}
}

func TestWorkspacePreviewTakeWithFilePreviewOffRefusesWithTheResolversSentence(t *testing.T) {
	role := &fakeFiles{}
	host := previewTakeHost(t, role, "off")

	got := decodeDawResult(t)(host.WorkspacePreviewTake("c-0001", 0, 0, hideKeepA))

	resolver, _ := host.dawResolverFor(host.services())
	support := resolver.Support(dawport.CapFilePreview)
	if support.Available || !reflect.DeepEqual(got, dawport.Refused(support.Message)) || role.sent() != 0 {
		t.Fatalf("WorkspacePreviewTake = %+v, sent %d", got, role.sent())
	}
}

func TestWorkspacePreviewTakeWithNoProjectIsAnError(t *testing.T) {
	if _, err := NewHost().WorkspacePreviewTake("c-0001", 0, 0, hideKeepA); err == nil {
		t.Fatal("no error")
	}
}

func TestTakePreviewStretchPlaysAnUnusableTakeNeverAndALongTakesFirstMinute(t *testing.T) {
	long := passagetakes.Candidate{Usable: true, SourceFile: "/m/a.wav", SourceStart: 3, SourceLength: 95}
	if path, start, length, why := takePreviewStretch(long); path != filepath.Clean("/m/a.wav") || start != 3 || length != bridge.MaxPreviewSeconds || why != "" {
		t.Fatalf("long take: %q %v %v %q", path, start, length, why)
	}
	unusable := passagetakes.Candidate{Usable: false, Reason: "The take's file is gone.", SourceFile: "/m/a.wav", SourceLength: 2}
	if _, _, _, why := takePreviewStretch(unusable); why != "The take's file is gone." {
		t.Fatalf("unusable take: %q", why)
	}
	empty := passagetakes.Candidate{Usable: true, SourceFile: "/m/a.wav", SourceLength: 0}
	if _, _, _, why := takePreviewStretch(empty); why != takePreviewEmptySentence {
		t.Fatalf("empty take: %q", why)
	}
}

func TestWorkspacePreviewTakeContractGoldenIsCurrent(t *testing.T) {
	cases := map[string]string{"workspace-preview-take-playing": hideKeepA, "workspace-preview-take-refused-not-offered": "take:{NOT-OFFERED}:{TAKE}"}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		t.Run(name, func(t *testing.T) {
			host := previewTakeHost(t, &fakeFiles{}, "on")
			contractfile.Check(t, name, decodeDawResult(t)(host.WorkspacePreviewTake("c-0001", 0, 0, cases[name])))
		})
	}
}
