package bridge

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestReadMasterChainIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.ReadMasterChain(context.Background()); !errors.Is(err, errGateRefused) {
		t.Fatalf("ReadMasterChain: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if !Experimental("master_chain_read") {
		t.Error("master_chain_read must stay experimental until the verification pass")
	}
}

// The fingerprints REAPER answers (master_render_test.lua pins how they are made); the host binds them as text.
const (
	noParams   = "0:7:11"
	eqParams   = "2:1031854743:1991403497"
	defaultMix = "7:825649450:779707780"
	quietMix   = "7:1741980508:1004297306"
)

func TestReadMasterChainGroupsEveryTracksFXAndKeepsTheMasterApart(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	const voice, room, bare = "{00000001-0000-4000-8000-000000000001}", "{00000002-0000-4000-8000-000000000002}", "{00000003-0000-4000-8000-000000000003}"
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"MASTER_CHAIN_TRACK", run(command), voice, "Voice", "0", "0", defaultMix},
			{"MASTER_CHAIN_FX", run(command), voice, "Voice", "VST: ReaEQ (Cockos)", "1", eqParams},
			{"MASTER_CHAIN_FX", run(command), voice, "Voice", "VST: ReaComp (Cockos)", "0", noParams},
			{"MASTER_CHAIN_TRACK", run(command), room, "Room", "1", "2", quietMix},
			{"MASTER_CHAIN_FX", run(command), room, "Room", "JS: Noise gate", "1", noParams},
			{"MASTER_CHAIN_TRACK", run(command), bare, "Bare", "0", "0", defaultMix},
			{"MASTER_CHAIN_TRACK", run(command), "master", "MASTER", "0", "0", defaultMix},
			{"MASTER_CHAIN_FX", run(command), "master", "MASTER", "VST: ReaLimit (Cockos)", "1", noParams},
			{"MASTER_CHAIN_READ", run(command), "4", "0", "4"},
		}
	})
	got, err := actions.ReadMasterChain(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	// Every track is listed, a track with no FX too: its mute, solo and mix are bound like the others' (#2995).
	want := MasterChain{
		Tracks: []TrackFX{
			{TrackGUID: voice, Name: "Voice", Mix: TrackMix{Mix: defaultMix},
				FX: []FXSlot{{Name: "VST: ReaEQ (Cockos)", Enabled: true, Params: eqParams}, {Name: "VST: ReaComp (Cockos)", Params: noParams}}},
			{TrackGUID: room, Name: "Room", Mix: TrackMix{Mute: true, Solo: 2, Mix: quietMix}, FX: []FXSlot{{Name: "JS: Noise gate", Enabled: true, Params: noParams}}},
			{TrackGUID: bare, Name: "Bare", Mix: TrackMix{Mix: defaultMix}, FX: []FXSlot{}},
		},
		Master:    []FXSlot{{Name: "VST: ReaLimit (Cockos)", Enabled: true, Params: noParams}},
		MasterMix: TrackMix{Mix: defaultMix},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if command := fake.commands()[0]; !reflect.DeepEqual(command[1:], []string{"master_chain_read", run(command)}) {
		t.Fatalf("command = %v", command)
	}
}

func TestReadMasterChainAnswersAnEmptyChainWithEmptyLists(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"MASTER_CHAIN_TRACK", run(command), "master", "MASTER", "0", "0", defaultMix},
			{"MASTER_CHAIN_READ", run(command), "0", "0", "1"},
		}
	})
	got, err := actions.ReadMasterChain(context.Background())
	if err != nil || got.Tracks == nil || got.Master == nil || len(got.Tracks)+len(got.Master) != 0 || got.MasterMix.Mix != defaultMix {
		t.Fatalf("got %+v, %v; want empty, non-nil lists and the master's mix", got, err)
	}
}

// The narrator approves a render after seeing its whole chain, so a list REAPER cut short is refused rather than shown in part.
func TestReadMasterChainRefusesAListREAPERCutShort(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"MASTER_CHAIN_TRACK", run(command), "master", "MASTER", "0", "0", defaultMix},
			{"MASTER_CHAIN_FX", run(command), "master", "MASTER", "VST: ReaLimit (Cockos)", "1", noParams},
			{"MASTER_CHAIN_READ", run(command), "500", "1", "1"},
		}
	})
	if _, err := actions.ReadMasterChain(context.Background()); !errors.Is(err, ErrChainTooLong) {
		t.Fatalf("err = %v, want ErrChainTooLong", err)
	}
}

func TestReadMasterChainPassesOnREAPERsRefusal(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "This REAPER version cannot list FX."}}
	})
	if _, err := actions.ReadMasterChain(context.Background()); err == nil || err.Error() != "This REAPER version cannot list FX." {
		t.Fatalf("err = %v", err)
	}
}

// A script older than #2995 answers names and on/off only. The chain still reads, as it did, for the Editing page's Effects tab,
// which shows names; it is marked SettingsUnread, and the mastering row refuses such a chain rather than approve it with the
// settings, routing and mute unbound (masteringport).
func TestReadMasterChainMarksAnOlderScriptsChainAsSettingsUnread(t *testing.T) {
	const voice = "{00000001-0000-4000-8000-000000000001}"
	for name, c := range map[string]struct {
		lines func(string) [][]string
		want  MasterChain
	}{
		"no track lines, no parameters": {
			lines: func(r string) [][]string {
				return [][]string{
					{"MASTER_CHAIN_FX", r, voice, "Voice", "VST: ReaEQ (Cockos)", "1"},
					{"MASTER_CHAIN_FX", r, "master", "MASTER", "VST: ReaLimit (Cockos)", "1"},
					{"MASTER_CHAIN_READ", r, "2", "0"},
				}
			},
			want: MasterChain{
				Tracks:         []TrackFX{{TrackGUID: voice, Name: "Voice", FX: []FXSlot{{Name: "VST: ReaEQ (Cockos)", Enabled: true}}}},
				Master:         []FXSlot{{Name: "VST: ReaLimit (Cockos)", Enabled: true}},
				SettingsUnread: true,
			},
		},
		"an empty chain": {
			lines: func(r string) [][]string { return [][]string{{"MASTER_CHAIN_READ", r, "0", "0"}} },
			want:  MasterChain{Tracks: []TrackFX{}, Master: []FXSlot{}, SettingsUnread: true},
		},
		"an FX without its parameters": {
			lines: func(r string) [][]string {
				return [][]string{
					{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", defaultMix},
					{"MASTER_CHAIN_FX", r, "master", "MASTER", "VST: ReaLimit (Cockos)", "1"},
					{"MASTER_CHAIN_READ", r, "1", "0", "1"},
				}
			},
			want: MasterChain{Tracks: []TrackFX{}, Master: []FXSlot{{Name: "VST: ReaLimit (Cockos)", Enabled: true}}, MasterMix: TrackMix{Mix: defaultMix},
				SettingsUnread: true},
		},
	} {
		t.Run(name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			startFakeReaper(t, client, dir, func(command []string) [][]string { return c.lines(run(command)) })
			got, err := actions.ReadMasterChain(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Fatalf("got %+v\nwant %+v", got, c.want)
			}
		})
	}
}

// A fingerprint is "<count>:<a>:<b>" in digits. Anything else (a tab, a newline, a word) would reach the digest's lines, so it is
// refused.
func TestReadMasterChainRefusesAFingerprintThatIsNotDigits(t *testing.T) {
	for _, bad := range []string{"1:2", "1:2:x", "1:2:3\tfx", "-1:2:3", "1:2:3:4"} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", run(command), "master", "MASTER", "0", "0", bad},
				{"MASTER_CHAIN_READ", run(command), "0", "0", "1"},
			}
		})
		if _, err := actions.ReadMasterChain(context.Background()); !errors.Is(err, ErrChainFingerprint) {
			t.Fatalf("mix %q: err = %v, want ErrChainFingerprint", bad, err)
		}
	}
}
