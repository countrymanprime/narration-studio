package masteringport_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"desktop/internal/dawport"
	"desktop/internal/masteringport"
	"desktop/internal/masteringport/masteringporttest"
)

// The approval dialog shows the narrator the chain a render would run before they approve it (threat model row 5o, #2932): the DAW
// row lists it from the DAW port's master_chain_read, every track with FX in order and then the master, each plug-in as the DAW
// names it and whether it is on.
func TestTheDAWRowListsTheChainItWouldRunInOrder(t *testing.T) {
	daw := masteringporttest.NewFakeDAW(t.TempDir())
	daw.SetChain(dawport.MasterChain{
		Tracks: []dawport.TrackFX{
			{TrackGUID: "{1}", Name: "Voice", FX: []dawport.FXSlot{{Name: "VST: ReaEQ (Cockos)", Enabled: true}, {Name: "JS: De-esser", Enabled: false}}},
			{TrackGUID: "{2}", Name: "", FX: []dawport.FXSlot{{Name: "VST: ReaComp (Cockos)", Enabled: true}}},
		},
		Master: []dawport.FXSlot{{Name: "VST: ReaLimit (Cockos)", Enabled: true}},
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
		{Name: "Voice", FX: []masteringport.ChainFX{{Name: "VST: ReaEQ (Cockos)", Enabled: true}, {Name: "JS: De-esser"}}},
		{Name: "Track", FX: []masteringport.ChainFX{{Name: "VST: ReaComp (Cockos)", Enabled: true}}},
		{Name: "Master", Master: true, FX: []masteringport.ChainFX{{Name: "VST: ReaLimit (Cockos)", Enabled: true}}},
	}
	if !reflect.DeepEqual(chain, want) {
		t.Fatalf("chain = %+v\nwant %+v", chain, want)
	}
}

func TestTheDAWRowListsAnEmptyChainAsNone(t *testing.T) {
	daw := masteringporttest.NewFakeDAW(t.TempDir())
	daw.SetChain(dawport.MasterChain{}, nil)
	useSession(t, func() (masteringport.Session, error) { return daw.Session(), nil })
	chain, err := dawRow(t).(masteringport.ChainLister).Chain(context.Background())
	if err != nil || chain == nil || len(chain) != 0 {
		t.Fatalf("chain = %#v, %v; want an empty, non-nil list", chain, err)
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
