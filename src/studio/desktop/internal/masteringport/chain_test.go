package masteringport_test

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/deliveryprofile"
	"desktop/internal/masteringport"
	"desktop/internal/masteringport/masteringporttest"
)

// The approval dialog shows the narrator the chain a render would run before they approve it (threat model row 5o, #2932): the DAW
// row lists it from the DAW port's master_chain_read, every track in order and then the master, each plug-in as the DAW names it and
// whether it is on. Since #2995 every track is listed, one with no FX too, with its mute, solo and mix, and each plug-in with its
// parameters, so the digest binds them.
func TestTheDAWRowListsTheChainItWouldRunInOrder(t *testing.T) {
	daw := masteringporttest.NewFakeDAW(t.TempDir())
	daw.SetChain(dawport.MasterChain{
		Tracks: []dawport.TrackFX{
			{TrackGUID: "{1}", Name: "Voice", Mix: dawport.TrackMix{Mix: "7:1:1"},
				FX: []dawport.FXSlot{{Name: "VST: ReaEQ (Cockos)", Enabled: true, Params: "2:3:3"}, {Name: "JS: De-esser", Enabled: false, Params: "0:7:11"}}},
			{TrackGUID: "{2}", Name: "", Mix: dawport.TrackMix{Mute: true, Mix: "7:2:2"}, FX: []dawport.FXSlot{{Name: "VST: ReaComp (Cockos)", Enabled: true, Params: "4:5:5"}}},
			{TrackGUID: "{3}", Name: "Room tone", Mix: dawport.TrackMix{Solo: 2, Mix: "7:4:4"}},
		},
		Master:    []dawport.FXSlot{{Name: "VST: ReaLimit (Cockos)", Enabled: true, Params: "1:6:6"}},
		MasterMix: dawport.TrackMix{Mix: "7:9:9"},
	}, nil)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })

	lister, ok := dawRow(t).(masteringport.ChainLister)
	if !ok {
		t.Fatal("the DAW row does not list its chain")
	}
	chain, err := lister.Chain(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := []masteringport.ChainTrack{
		{Name: "Voice", Mix: "7:1:1", FX: []masteringport.ChainFX{{Name: "VST: ReaEQ (Cockos)", Enabled: true, Params: "2:3:3"}, {Name: "JS: De-esser", Params: "0:7:11"}}},
		{Name: "Track", Mute: true, Mix: "7:2:2", FX: []masteringport.ChainFX{{Name: "VST: ReaComp (Cockos)", Enabled: true, Params: "4:5:5"}}},
		{Name: "Room tone", Solo: 2, Mix: "7:4:4", FX: []masteringport.ChainFX{}},
		{Name: "Master", Master: true, Mix: "7:9:9", FX: []masteringport.ChainFX{{Name: "VST: ReaLimit (Cockos)", Enabled: true, Params: "1:6:6"}}},
	}
	if !reflect.DeepEqual(chain, want) {
		t.Fatalf("chain = %+v\nwant %+v", chain, want)
	}
}

// Ported for #2995: a project with no FX still lists its master, whose mix and mute the digest binds; it has no plug-ins.
func TestTheDAWRowListsAChainWithNoFXAsTheMasterAlone(t *testing.T) {
	daw := masteringporttest.NewFakeDAW(t.TempDir())
	daw.SetChain(dawport.MasterChain{MasterMix: dawport.TrackMix{Mix: "7:9:9"}}, nil)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	chain, err := dawRow(t).(masteringport.ChainLister).Chain(context.Background())
	want := []masteringport.ChainTrack{{Name: "Master", Master: true, Mix: "7:9:9", FX: []masteringport.ChainFX{}}}
	if err != nil || !reflect.DeepEqual(chain, want) {
		t.Fatalf("chain = %#v, %v; want the master alone", chain, err)
	}
}

// A chain the DAW cannot list whole (the bridge's ErrChainTooLong), or no DAW at all, is an error: the narrator never approves a
// chain they were not shown.
func TestTheDAWRowsChainIsAnErrorWhenItCannotBeRead(t *testing.T) {
	cut := errors.New("this project has more FX than this app can list")
	daw := masteringporttest.NewFakeDAW(t.TempDir())
	daw.SetChain(dawport.MasterChain{}, cut)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	if _, err := dawRow(t).(masteringport.ChainLister).Chain(context.Background()); !errors.Is(err, cut) {
		t.Fatalf("err = %v, want the DAW's own", err)
	}

	useSession(t, func() (masteringport.Session, error) { return masteringport.Session{}, masteringport.ErrNoDAW })
	if _, err := dawRow(t).(masteringport.ChainLister).Chain(context.Background()); !errors.Is(err, masteringport.ErrNoDAW) {
		t.Fatalf("err = %v, want ErrNoDAW", err)
	}
}

// shownDigest is the digest of the chain the DAW row lists now: what the approval dialog shows and sends back.
func shownDigest(t *testing.T) string {
	t.Helper()
	chain, err := dawRow(t).(masteringport.ChainLister).Chain(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return masteringport.ChainDigest(chain)
}

// The digest binds an approval to the chain shown (#2932's review): every name, on/off, the master flag and the order count.
func TestChainDigestChangesWithAnythingTheNarratorWasShown(t *testing.T) {
	base := []masteringport.ChainTrack{
		{Name: "Voice", Mix: "7:1:1", FX: []masteringport.ChainFX{{Name: "EQ", Enabled: true, Params: "2:3:3"}, {Name: "Comp", Enabled: true, Params: "0:7:11"}}},
		{Name: "Room tone", Mix: "7:2:2", FX: []masteringport.ChainFX{}},
		{Name: "Master", Master: true, Mix: "7:9:9", FX: []masteringport.ChainFX{{Name: "Limit", Enabled: true, Params: "1:6:6"}}},
	}
	clone := func(edit func(c []masteringport.ChainTrack)) []masteringport.ChainTrack {
		out := make([]masteringport.ChainTrack, len(base))
		for i, track := range base {
			out[i] = track
			out[i].FX = append([]masteringport.ChainFX(nil), track.FX...)
		}
		edit(out)
		return out
	}
	digest := masteringport.ChainDigest(base)
	if !regexp.MustCompile(`^sha256:[0-9a-f]{64}$`).MatchString(digest) {
		t.Fatalf("digest %q is not sha256:<hex>", digest)
	}
	if again := masteringport.ChainDigest(clone(func([]masteringport.ChainTrack) {})); again != digest {
		t.Fatalf("the same chain digests differently: %q, %q", digest, again)
	}
	for name, edit := range map[string]func(c []masteringport.ChainTrack){
		"a plug-in switched off": func(c []masteringport.ChainTrack) { c[0].FX[1].Enabled = false },
		"plug-ins reordered":     func(c []masteringport.ChainTrack) { c[0].FX[0], c[0].FX[1] = c[0].FX[1], c[0].FX[0] },
		"a plug-in renamed":      func(c []masteringport.ChainTrack) { c[0].FX[0].Name = "EQ2" },
		"a track renamed":        func(c []masteringport.ChainTrack) { c[0].Name = "Narration" },
		"the master flag":        func(c []masteringport.ChainTrack) { c[2].Master = false },
		"a plug-in moved across": func(c []masteringport.ChainTrack) { c[2].FX = append(c[2].FX, c[0].FX[1]); c[0].FX = c[0].FX[:1] },
		// #2995: what the render does besides names and order.
		"a plug-in's parameters":        func(c []masteringport.ChainTrack) { c[0].FX[0].Params = "2:3:4" },
		"a track muted":                 func(c []masteringport.ChainTrack) { c[0].Mute = true },
		"a track soloed":                func(c []masteringport.ChainTrack) { c[0].Solo = 1 },
		"the solo mode":                 func(c []masteringport.ChainTrack) { c[0].Solo = 2 },
		"the mix of a track with no FX": func(c []masteringport.ChainTrack) { c[1].Mix = "8:2:2" },
		"a track with no FX muted":      func(c []masteringport.ChainTrack) { c[1].Mute = true },
		"the master's mix":              func(c []masteringport.ChainTrack) { c[2].Mix = "7:9:8" },
		"a track with no FX taken away": func(c []masteringport.ChainTrack) {
			copy(c[1:], c[2:])
			c[len(c)-1] = masteringport.ChainTrack{Name: "Extra"}
		},
		"a master plug-in's parameters": func(c []masteringport.ChainTrack) { c[2].FX[0].Params = "1:6:7" },
	} {
		if masteringport.ChainDigest(clone(edit)) == digest {
			t.Errorf("%s left the digest unchanged", name)
		}
	}
	if masteringport.ChainDigest(nil) == masteringport.ChainDigest([]masteringport.ChainTrack{{Name: "Voice", FX: []masteringport.ChainFX{}}}) {
		t.Error("no chain and an empty track digest alike")
	}
}

// The chain's names are the narrator's project's text, shown in a dialog: control, newline and bidi-override characters are dropped,
// spaces collapsed and the length bounded, as bridge.DeviceName does for REAPER's device names (#2932's review).
func TestTheDAWRowCleansTheNamesItLists(t *testing.T) {
	daw := masteringporttest.NewFakeDAW(t.TempDir())
	long := strings.Repeat("x", 300)
	daw.SetChain(dawport.MasterChain{
		Tracks: []dawport.TrackFX{{TrackGUID: "{1}", Name: "Voice\u202e lav\n2\x00", FX: []dawport.FXSlot{{Name: "VST:\tReaEQ\u200f", Enabled: true}, {Name: long}}}},
		Master: []dawport.FXSlot{{Name: "\u2066Limit\u2069", Enabled: true}},
	}, nil)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	chain, err := dawRow(t).(masteringport.ChainLister).Chain(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got := chain[0].Name; got != "Voice lav 2" {
		t.Errorf("track name = %q", got)
	}
	if got := chain[0].FX[0].Name; got != "VST: ReaEQ" {
		t.Errorf("plug-in name = %q", got)
	}
	if got := []rune(chain[0].FX[1].Name); len(got) != 120 || got[119] != '…' {
		t.Errorf("a 300-character name was kept as %d runes ending %q", len(got), string(got[len(got)-1]))
	}
	if got := chain[1].FX[0].Name; got != "Limit" {
		t.Errorf("master plug-in name = %q", got)
	}
}

// A zero-width or format character inside a name is dropped, not spaced, so two names that look alike are alike; a plug-in with
// nothing readable left is "(unnamed)" (qa on #2932, B2 and B3).
func TestTheDAWRowDropsInvisibleCharactersAndNamesTheUnnamed(t *testing.T) {
	daw := masteringporttest.NewFakeDAW(t.TempDir())
	daw.SetChain(dawport.MasterChain{
		Tracks: []dawport.TrackFX{{TrackGUID: "{1}", Name: "\u200b\u2060", FX: []dawport.FXSlot{
			{Name: "Re\u200bEQ", Enabled: true}, {Name: "Secret\u202e)ffo(", Enabled: true}, {Name: " \u200b\ufeff ", Enabled: true}, {Name: ""},
		}}},
	}, nil)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	chain, err := dawRow(t).(masteringport.ChainLister).Chain(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if chain[0].Name != "Track" {
		t.Errorf("an invisible track name = %q, want Track", chain[0].Name)
	}
	var names []string
	for _, fx := range chain[0].FX {
		names = append(names, fx.Name)
	}
	if want := []string{"ReEQ", "Secret)ffo(", "(unnamed)", "(unnamed)"}; !reflect.DeepEqual(names, want) {
		t.Errorf("names = %q, want %q", names, want)
	}
}

// Each render checks the chain it is about to run against the digest the narrator approved: none is refused (fail closed), another
// chain is refused as stale, and either way nothing renders (#2932's review).
func TestTheDAWRowRendersOnlyTheChainTheNarratorApproved(t *testing.T) {
	project := t.TempDir()
	daw := masteringporttest.NewFakeDAW(project)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	request := func(name, digest string) masteringport.Request {
		return masteringport.Request{Region: "Chapter 1", Destination: filepath.Join(project, name), Profile: deliveryprofile.ACX(), Approved: true, ChainDigest: digest}
	}
	if _, err := dawRow(t).Master(context.Background(), request("none.wav", "")); !errors.Is(err, masteringport.ErrNoChainDigest) {
		t.Fatalf("with no digest: %v, want ErrNoChainDigest", err)
	}
	shown := shownDigest(t)
	daw.SetChain(dawport.MasterChain{Master: []dawport.FXSlot{{Name: "VST: ReaLimit (Cockos)", Enabled: false}}}, nil)
	if _, err := dawRow(t).Master(context.Background(), request("changed.wav", shown)); !errors.Is(err, masteringport.ErrChainChanged) {
		t.Fatalf("with the chain changed since: %v, want ErrChainChanged", err)
	}
	if renders := daw.Renders(); len(renders) != 0 {
		t.Fatalf("a refused master rendered: %+v", renders)
	}
	if _, err := dawRow(t).Master(context.Background(), request("now.wav", shownDigest(t))); err != nil {
		t.Fatalf("with the chain shown now: %v", err)
	}
}

// The chain each render reads before it renders has its own time bound, like the plan's: a DAW that never answers fails the master
// with the deadline instead of holding the export forever, and nothing renders (round 2 Go review on #2932).
func TestTheDAWRowsPerRenderChainReadIsBounded(t *testing.T) {
	project := t.TempDir()
	daw := masteringporttest.NewFakeDAW(project)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	digest := shownDigest(t)
	daw.ChainNeverAnswers()
	t.Cleanup(masteringport.UseRenderChainWait(50 * time.Millisecond))
	done := make(chan error, 1)
	go func() {
		_, err := dawRow(t).Master(context.Background(), masteringport.Request{Region: "Chapter 1", Destination: filepath.Join(project, "out.wav"),
			Profile: deliveryprofile.ACX(), Approved: true, ChainDigest: digest})
		done <- err
	}()
	select {
	case err := <-done:
		// A plain sentence, not "context deadline exceeded" (round 3 Go review), and still the deadline underneath.
		if !errors.Is(err, masteringport.ErrChainNoAnswer) || !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("err = %v, want ErrChainNoAnswer over the read's deadline", err)
		}
		if err.Error() != masteringport.ErrChainNoAnswer.Error() {
			t.Fatalf("message = %q", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the master waited on a chain read that never answers")
	}
	if renders := daw.Renders(); len(renders) != 0 {
		t.Fatalf("rendered without the chain read: %+v", renders)
	}
}

// The real bridge stops waiting on its own (bridge.DefaultAnswerTimeout) before renderChainWait runs out, and says so with
// bridge.ErrNoAnswer: that is REAPER not answering too, so the export stops instead of failing each file in turn (round 4 qa, N1).
func TestTheDAWRowsPerRenderChainReadBridgeNoAnswerStopsTheExport(t *testing.T) {
	project := t.TempDir()
	daw := masteringporttest.NewFakeDAW(project)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	digest := shownDigest(t)
	daw.SetChain(dawport.MasterChain{}, bridge.ErrNoAnswer)
	_, err := dawRow(t).Master(context.Background(), masteringport.Request{Region: "Chapter 1", Destination: filepath.Join(project, "out.wav"),
		Profile: deliveryprofile.ACX(), Approved: true, ChainDigest: digest})
	if !errors.Is(err, masteringport.ErrChainNoAnswer) || !errors.Is(err, bridge.ErrNoAnswer) {
		t.Fatalf("err = %v, want ErrChainNoAnswer over the bridge's own no-answer", err)
	}
	if err.Error() != masteringport.ErrChainNoAnswer.Error() {
		t.Fatalf("message = %q", err)
	}
	if renders := daw.Renders(); len(renders) != 0 {
		t.Fatalf("rendered without the chain read: %+v", renders)
	}
}

// The narrator's Cancel during that read is a cancel, not a DAW that did not answer (round 3 Go review).
func TestACancelDuringThePerRenderChainReadIsACancel(t *testing.T) {
	project := t.TempDir()
	daw := masteringporttest.NewFakeDAW(project)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	digest := shownDigest(t)
	daw.ChainNeverAnswers()
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(30*time.Millisecond, cancel)
	_, err := dawRow(t).Master(ctx, masteringport.Request{Region: "Chapter 1", Destination: filepath.Join(project, "out.wav"),
		Profile: deliveryprofile.ACX(), Approved: true, ChainDigest: digest})
	if !errors.Is(err, context.Canceled) || errors.Is(err, masteringport.ErrChainNoAnswer) {
		t.Fatalf("err = %v, want the cancel", err)
	}
}

// A rename in REAPER that only adds blank-looking characters at a name's ends changes nothing the narrator can see, so it keeps the
// digest (round 3, M3).
func TestABlankOnlyRenameKeepsTheDigest(t *testing.T) {
	daw := masteringporttest.NewFakeDAW(t.TempDir())
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	chain := func(name string) dawport.MasterChain {
		return dawport.MasterChain{Tracks: []dawport.TrackFX{{TrackGUID: "{1}", Name: "Voice", FX: []dawport.FXSlot{{Name: name, Enabled: true}}}}}
	}
	daw.SetChain(chain("EQ"), nil)
	plain := shownDigest(t)
	daw.SetChain(chain("\u2800EQ\u3164"), nil)
	if shownDigest(t) != plain {
		t.Fatal("a blank-only rename changed the digest")
	}
}

// Every row that needs the DAW port's chain read lists it, so the approval can show and bind it.
func TestEveryRowThatReadsTheDAWChainListsIt(t *testing.T) {
	for _, entry := range masteringport.Rows.Entries() {
		row := entry.New()
		if slices.Contains(row.Capabilities().Needs, dawport.CapMasterChainRead) {
			if _, ok := row.(masteringport.ChainLister); !ok {
				t.Errorf("%s needs master_chain_read but does not list its chain", entry.Name)
			}
		}
	}
}

// The built-in chain declares its own steps and Audacity's macro is named in the dialog: neither has a DAW chain to list.
func TestOnlyTheDAWRowListsADAWChain(t *testing.T) {
	for _, name := range []string{masteringport.Builtin, masteringport.Audacity} {
		entry, err := masteringport.Rows.Lookup(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, ok := entry.New().(masteringport.ChainLister); ok {
			t.Errorf("%s lists a DAW chain", name)
		}
	}
}

// A render refuses a chain whose settings, routing or mute moved after the approval, as it refuses a renamed or reordered one
// (#2995): nothing renders.
func TestTheDAWRowRefusesARenderWhoseSettingsRoutingOrMuteMoved(t *testing.T) {
	base := func() dawport.MasterChain {
		return dawport.MasterChain{
			Tracks: []dawport.TrackFX{
				{TrackGUID: "{1}", Name: "Voice", Mix: dawport.TrackMix{Mix: "7:1:1"}, FX: []dawport.FXSlot{{Name: "EQ", Enabled: true, Params: "2:3:3"}}},
				{TrackGUID: "{2}", Name: "Bus", Mix: dawport.TrackMix{Mix: "15:2:2"}},
			},
			Master:    []dawport.FXSlot{{Name: "Limit", Enabled: true, Params: "1:6:6"}},
			MasterMix: dawport.TrackMix{Mix: "7:9:9"},
		}
	}
	for name, move := range map[string]func(*dawport.MasterChain){
		"an EQ setting":         func(c *dawport.MasterChain) { c.Tracks[0].FX[0].Params = "2:3:4" },
		"the limiter's ceiling": func(c *dawport.MasterChain) { c.Master[0].Params = "1:6:7" },
		"a send to the bus":     func(c *dawport.MasterChain) { c.Tracks[0].Mix.Mix = "15:5:5"; c.Tracks[1].Mix.Mix = "23:6:6" },
		"the voice muted":       func(c *dawport.MasterChain) { c.Tracks[0].Mix.Mute = true },
		"the bus soloed":        func(c *dawport.MasterChain) { c.Tracks[1].Mix.Solo = 1 },
		"the master's volume":   func(c *dawport.MasterChain) { c.MasterMix.Mix = "7:9:8" },
	} {
		t.Run(name, func(t *testing.T) {
			project := t.TempDir()
			daw := masteringporttest.NewFakeDAW(project)
			useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
			chain := base()
			daw.SetChain(chain, nil)
			digest := shownDigest(t)
			moved := base()
			move(&moved)
			daw.SetChain(moved, nil)
			_, err := dawRow(t).Master(context.Background(), masteringport.Request{Region: "Chapter 1", Destination: filepath.Join(project, "out.wav"),
				Profile: deliveryprofile.ACX(), Approved: true, ChainDigest: digest})
			if !errors.Is(err, masteringport.ErrChainChanged) {
				t.Fatalf("err = %v, want ErrChainChanged", err)
			}
			if renders := daw.Renders(); len(renders) != 0 {
				t.Fatalf("rendered a chain that moved: %+v", renders)
			}
		})
	}
}

// A chain from a script older than #2995 has no settings, routing or mute to bind: the DAW row neither lists it for an approval
// nor renders through it, and says to import the script again (bridge.ErrScriptOutdated).
func TestTheDAWRowRefusesAChainWhoseSettingsAnOlderScriptCouldNotRead(t *testing.T) {
	project := t.TempDir()
	daw := masteringporttest.NewFakeDAW(project)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	digest := shownDigest(t)
	daw.SetChain(dawport.MasterChain{Master: []dawport.FXSlot{{Name: "Limit", Enabled: true}}, SettingsUnread: true}, nil)
	if _, err := dawRow(t).(masteringport.ChainLister).Chain(context.Background()); !errors.Is(err, bridge.ErrScriptOutdated) {
		t.Fatalf("Chain: err = %v, want ErrScriptOutdated", err)
	}
	_, err := dawRow(t).Master(context.Background(), masteringport.Request{Region: "Chapter 1", Destination: filepath.Join(project, "out.wav"),
		Profile: deliveryprofile.ACX(), Approved: true, ChainDigest: digest})
	if !errors.Is(err, bridge.ErrScriptOutdated) {
		t.Fatalf("Master: err = %v, want ErrScriptOutdated", err)
	}
	if renders := daw.Renders(); len(renders) != 0 {
		t.Fatalf("rendered a chain whose settings were not read: %+v", renders)
	}
}
