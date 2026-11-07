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
	noParams   = "1:912281302:1180657038"
	eqParams   = "3:45416079:345875843"
	defaultMix = "14:901518076:553555570"
	quietMix   = "14:424772828:127370515"
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
		for where, lines := range map[string]func(string) [][]string{
			"a track's mix": func(r string) [][]string {
				return [][]string{
					{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", bad},
					{"MASTER_CHAIN_READ", r, "0", "0", "1"},
				}
			},
			"an FX's parameters": func(r string) [][]string {
				return [][]string{
					{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", defaultMix},
					{"MASTER_CHAIN_FX", r, "master", "MASTER", "VST: ReaLimit (Cockos)", "1", bad},
					{"MASTER_CHAIN_READ", r, "1", "0", "1"},
				}
			},
		} {
			actions, client, dir := newActionsSession(t, true)
			startFakeReaper(t, client, dir, func(command []string) [][]string { return lines(run(command)) })
			if _, err := actions.ReadMasterChain(context.Background()); !errors.Is(err, ErrChainFingerprint) {
				t.Fatalf("%s %q: err = %v, want ErrChainFingerprint", where, bad, err)
			}
		}
	}
}

// Mute is 0 or 1 and solo is I_SOLO's own range, 0 to 6 (soloed, in place, safe): anything else is not REAPER's answer (#3017
// review, G3).
func TestReadMasterChainRefusesAMuteOrSoloOutsideREAPERsValues(t *testing.T) {
	// Not a number at all is refused before the parse, by the wire table (a count field), with the script's own message.
	for _, bad := range [][2]string{{"0", "x"}, {"yes", "0"}} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", run(command), "master", "MASTER", bad[0], bad[1], defaultMix},
				{"MASTER_CHAIN_READ", run(command), "0", "0", "1"},
			}
		})
		if _, err := actions.ReadMasterChain(context.Background()); err == nil {
			t.Fatalf("mute %q solo %q was read", bad[0], bad[1])
		}
	}
	for _, bad := range [][2]string{{"2", "0"}, {"-1", "0"}, {"0", "-1"}, {"0", "7"}} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", run(command), "master", "MASTER", bad[0], bad[1], defaultMix},
				{"MASTER_CHAIN_READ", run(command), "0", "0", "1"},
			}
		})
		if _, err := actions.ReadMasterChain(context.Background()); !errors.Is(err, ErrChainFingerprint) {
			t.Fatalf("mute %q solo %q: err = %v, want ErrChainFingerprint", bad[0], bad[1], err)
		}
	}
	for _, solo := range []string{"0", "1", "2", "5", "6"} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", run(command), "master", "MASTER", "1", solo, defaultMix},
				{"MASTER_CHAIN_READ", run(command), "0", "0", "1"},
			}
		})
		if got, err := actions.ReadMasterChain(context.Background()); err != nil || !got.MasterMix.Mute {
			t.Fatalf("solo %q: %+v, %v", solo, got, err)
		}
	}
}

// The close counts what was sent: a line the host never received (dropped as invalid, or lost) leaves the chain incomplete, and
// an incomplete chain is never approved (#3017 review, G1).
func TestReadMasterChainRefusesAnAnswerThatDoesNotMatchItsOwnCounts(t *testing.T) {
	const voice = "{00000001-0000-4000-8000-000000000001}"
	for name, lines := range map[string]func(string) [][]string{
		"a track line missing": func(r string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", r, voice, "Voice", "0", "0", defaultMix},
				{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", defaultMix},
				{"MASTER_CHAIN_READ", r, "0", "0", "3"},
			}
		},
		"an FX line missing": func(r string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", r, voice, "Voice", "0", "0", defaultMix},
				{"MASTER_CHAIN_FX", r, voice, "Voice", "VST: ReaEQ (Cockos)", "1", eqParams},
				{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", defaultMix},
				{"MASTER_CHAIN_READ", r, "2", "0", "2"},
			}
		},
		"an older script's FX line missing": func(r string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_FX", r, voice, "Voice", "VST: ReaEQ (Cockos)", "1"},
				{"MASTER_CHAIN_READ", r, "2", "0"},
			}
		},
	} {
		t.Run(name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			startFakeReaper(t, client, dir, func(command []string) [][]string { return lines(run(command)) })
			if _, err := actions.ReadMasterChain(context.Background()); !errors.Is(err, ErrChainIncomplete) {
				t.Fatalf("err = %v, want ErrChainIncomplete", err)
			}
		})
	}
}

// Past the bridge's settings budget the script refuses the read (truncated 2): too many plug-in settings to check, never a chain
// with some of them unbound (#3017 review, L1).
func TestReadMasterChainRefusesAChainWithTooManySettings(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"MASTER_CHAIN_TRACK", run(command), "{1}", "Voice", "0", "0", defaultMix},
			{"MASTER_CHAIN_READ", run(command), "0", "2", "1"},
		}
	})
	if _, err := actions.ReadMasterChain(context.Background()); !errors.Is(err, ErrChainTooManySettings) {
		t.Fatalf("err = %v, want ErrChainTooManySettings", err)
	}
}

// A script that sends track lines for some tracks and not others (part new, part old) has not read every setting: its chain is
// SettingsUnread, as an older script's is (#3017 review, G3).
func TestReadMasterChainMarksAPartlyNewAnswerAsSettingsUnread(t *testing.T) {
	const a, b = "{0000000A-0000-4000-8000-00000000000A}", "{0000000B-0000-4000-8000-00000000000B}"
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"MASTER_CHAIN_TRACK", run(command), a, "A", "0", "0", defaultMix},
			{"MASTER_CHAIN_FX", run(command), a, "A", "VST: ReaEQ (Cockos)", "1", eqParams},
			{"MASTER_CHAIN_FX", run(command), b, "B", "VST: ReaComp (Cockos)", "1", noParams},
			{"MASTER_CHAIN_TRACK", run(command), "master", "MASTER", "0", "0", defaultMix},
			{"MASTER_CHAIN_READ", run(command), "2", "0", "2"},
		}
	})
	got, err := actions.ReadMasterChain(context.Background())
	if err != nil || !got.SettingsUnread || len(got.Tracks) != 2 {
		t.Fatalf("got %+v, %v; want both tracks, marked SettingsUnread", got, err)
	}
}

// Only truncated 0 is a whole answer: a code this app does not know is not read as one (#3017 qa round 2, B1).
func TestReadMasterChainRefusesAnUnknownTruncatedCode(t *testing.T) {
	for _, code := range []string{"3", "02", "9"} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", run(command), "master", "MASTER", "0", "0", defaultMix},
				{"MASTER_CHAIN_READ", run(command), "0", code, "1"},
			}
		})
		if _, err := actions.ReadMasterChain(context.Background()); !errors.Is(err, ErrChainIncomplete) {
			t.Fatalf("truncated %q: err = %v, want ErrChainIncomplete", code, err)
		}
	}
}

// The script lists each track once, its FX right after it, and the master last: an answer out of that shape keeps its totals and
// still is not the chain REAPER has (#3017 qa round 2, B2 and B3).
func TestReadMasterChainRefusesLinesOutOfTheirShape(t *testing.T) {
	const a, b = "{0000000A-0000-4000-8000-00000000000A}", "{0000000B-0000-4000-8000-00000000000B}"
	for name, lines := range map[string]func(string) [][]string{
		"the master listed twice": func(r string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "1", "0", defaultMix},
				{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", defaultMix},
				{"MASTER_CHAIN_READ", r, "0", "0", "2"},
			}
		},
		"a track listed twice": func(r string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", r, a, "A", "0", "0", defaultMix},
				{"MASTER_CHAIN_TRACK", r, a, "A", "1", "0", defaultMix},
				{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", defaultMix},
				{"MASTER_CHAIN_READ", r, "0", "0", "3"},
			}
		},
		"an FX after the next track's line": func(r string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", r, a, "A", "0", "0", defaultMix},
				{"MASTER_CHAIN_TRACK", r, b, "B", "0", "0", defaultMix},
				{"MASTER_CHAIN_FX", r, a, "A", "VST: ReaEQ (Cockos)", "1", eqParams},
				{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", defaultMix},
				{"MASTER_CHAIN_READ", r, "1", "0", "3"},
			}
		},
		"an FX before its track's line": func(r string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_FX", r, a, "A", "VST: ReaEQ (Cockos)", "1", eqParams},
				{"MASTER_CHAIN_TRACK", r, a, "A", "0", "0", defaultMix},
				{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", defaultMix},
				{"MASTER_CHAIN_READ", r, "1", "0", "2"},
			}
		},
		"a track after the master": func(r string) [][]string {
			return [][]string{
				{"MASTER_CHAIN_TRACK", r, "master", "MASTER", "0", "0", defaultMix},
				{"MASTER_CHAIN_TRACK", r, a, "A", "0", "0", defaultMix},
				{"MASTER_CHAIN_READ", r, "0", "0", "2"},
			}
		},
	} {
		t.Run(name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			startFakeReaper(t, client, dir, func(command []string) [][]string { return lines(run(command)) })
			if _, err := actions.ReadMasterChain(context.Background()); !errors.Is(err, ErrChainIncomplete) {
				t.Fatalf("err = %v, want ErrChainIncomplete", err)
			}
		})
	}
}
