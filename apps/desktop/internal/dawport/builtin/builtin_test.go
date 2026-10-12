package builtin

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/dawporttest"
	"github.com/countrymanprime/narration-utils/shell/internal/recording"
)

// recording.Service is the recorder the host hands the adapter; the adapter only names the methods it calls.
var _ Recorder = (*recording.Service)(nil)

// closedRecorder is a recorder that has gone away: every request fails.
type closedRecorder struct{}

var errClosed = errors.New("the recorder is closed")

func (closedRecorder) Start(string) error                                  { return errClosed }
func (closedRecorder) Stop()                                               {}
func (closedRecorder) SetTakeKeeper(string, bool) error                    { return errClosed }
func (closedRecorder) HideOtherTakes(string) (int, error)                  { return 0, errClosed }
func (closedRecorder) CutTakeRange(string, float64, float64, string) error { return errClosed }

// fakeRecorder records what the adapter asked of it.
type fakeRecorder struct {
	started, stopped []string
	keepers          []string
	hidKeeping       []string
	cuts             []string
}

func (f *fakeRecorder) HideOtherTakes(take string) (int, error) {
	f.hidKeeping = append(f.hidKeeping, take)
	return 2, nil
}
func (f *fakeRecorder) CutTakeRange(take string, start, end float64, mode string) error {
	f.cuts = append(f.cuts, fmt.Sprintf("%s %.1f-%.1f %s", take, start, end, mode))
	return nil
}

func (f *fakeRecorder) Start(device string) error { f.started = append(f.started, device); return nil }
func (f *fakeRecorder) Stop()                     { f.stopped = append(f.stopped, "stop") }
func (f *fakeRecorder) SetTakeKeeper(take string, keeper bool) error {
	if keeper {
		f.keepers = append(f.keepers, take)
	}
	return nil
}

// adapter-passes-the-conformance-suite, over a closed recorder and over none at all.
func TestConformance(t *testing.T) {
	t.Run("closed recorder", func(t *testing.T) {
		dawporttest.Run(t, func(testing.TB) dawport.Adapter {
			return New(Config{Recorder: closedRecorder{}, Device: func() string { return "Mic" }})
		})
	})
	t.Run("no recorder", func(t *testing.T) {
		dawporttest.Run(t, func(testing.TB) dawport.Adapter { return New(Config{}) })
	})
}

// It declares only what the recorder does: record (Experimental until the owner's pass), takes (the recorder keeps the keeper
// take of a line), and nothing it cannot do. Every row has a level, and none of them is a REAPER or Audacity one.
func TestDeclaresOnlyWhatTheRecorderDoes(t *testing.T) {
	declared := New(Config{}).Declares()
	want := map[dawport.Capability]dawport.Level{
		dawport.CapRecord:      dawport.Experimental,
		dawport.CapTakes:       dawport.Experimental,
		dawport.CapProjectRead: dawport.Unsupported,
		dawport.CapPunch:       dawport.NotYetAvailable,
		dawport.CapStackTakes:  dawport.NotYetAvailable,
		dawport.CapCutRange:    dawport.Experimental,
		dawport.CapFXRange:     dawport.NotYetAvailable,
	}
	for _, spec := range dawport.Capabilities() {
		c := spec.Capability
		got, ok := declared[c]
		if !ok {
			t.Errorf("%s: not declared; every capability has a row", c)
			continue
		}
		wantLevel, named := want[c]
		if !named {
			wantLevel = dawport.Unsupported
		}
		if got != wantLevel {
			t.Errorf("%s: declared %v, want %v", c, got, wantLevel)
		}
	}
	if kind := New(Config{}).Kind(); kind != dawport.KindBuiltIn {
		t.Errorf("Kind() = %v, want KindBuiltIn", kind)
	}
}

// The declaration-only adapter the host reads declares the same.
func TestDeclarationMatchesTheAdapter(t *testing.T) {
	adapter, declaration := New(Config{}).Declares(), Declaration().Declares()
	for c, level := range adapter {
		if declaration[c] != level {
			t.Errorf("%s: Declaration() declares %v, the adapter %v", c, declaration[c], level)
		}
	}
	if Declaration().Kind() != dawport.KindBuiltIn {
		t.Error("Declaration().Kind() is not KindBuiltIn")
	}
	if rt := Declaration().(interface{ Runtime() dawport.Runtime }).Runtime(); !rt.Bridge || !rt.Reachable {
		t.Errorf("Declaration().Runtime() = %+v; the recorder is the app's own, so it is always there", rt)
	}
}

// depth-is-declared: the app makes take stacking, a cut and an effect on a range itself, so their mode is "app", but only once the
// row has a role; until then the depth is empty and the payload has no mode. Nothing is destructive.
func TestDepthIsAppOnlyForACapabilityWithARole(t *testing.T) {
	for _, spec := range dawport.Capabilities() {
		want := dawport.Depth{}
		if spec.Capability == dawport.CapCutRange {
			want = dawport.Depth{Mode: dawport.ModeApp} // the one app-made row with a role so far
		}
		if d := depthOf(declares, spec.Capability); d != want {
			t.Errorf("%s: depth %+v, want %+v", spec.Capability, d, want)
		}
	}
	promoted := map[dawport.Capability]dawport.Level{dawport.CapStackTakes: dawport.Experimental, dawport.CapCutRange: dawport.Supported, dawport.CapRecord: dawport.Experimental}
	for c, want := range map[dawport.Capability]dawport.Depth{
		dawport.CapStackTakes: {Mode: dawport.ModeApp},
		dawport.CapCutRange:   {Mode: dawport.ModeApp},
		dawport.CapFXRange:    {},
		dawport.CapRecord:     {},
	} {
		if got := depthOf(promoted, c); got != want {
			t.Errorf("%s promoted: depth %+v, want %+v", c, got, want)
		}
	}
	var _ dawport.Describer = New(Config{})
}

// no-saved-project: the recorder keeps its takes in the project folder and no project file of its own, so project_read says so in
// its own sentence, and every refusal is worded for the built-in recorder.
func TestRefusalsAreWordedForTheBuiltInRecorder(t *testing.T) {
	resolver := dawport.NewResolver(dawport.ResolverConfig{
		Adapter: Declaration(),
		Runtime: Declaration().(interface{ Runtime() dawport.Runtime }).Runtime,
	})
	all := resolver.All()
	if got := all[dawport.CapProjectRead]; got.Available || got.Reason != dawport.ReasonUnsupported || got.Message != MessageNoSavedProject {
		t.Errorf("project_read = %+v, want unsupported with %q", got, MessageNoSavedProject)
	}
	if MessageNoSavedProject != "The built-in recorder keeps no saved project." {
		t.Errorf("MessageNoSavedProject = %q", MessageNoSavedProject)
	}
	for c, s := range all {
		if s.Available {
			continue
		}
		for _, leak := range []string{"REAPER", "Audacity", "Built-in"} {
			if strings.Contains(s.Message, leak) {
				t.Errorf("%s: %q names %s", c, s.Message, leak)
			}
		}
	}
	if got := all[dawport.CapMarkers]; got.Message != MessageUnsupported {
		t.Errorf("markers = %+v, want %q", got, MessageUnsupported)
	}
	if got := all[dawport.CapStackTakes]; got.Reason != dawport.ReasonNotYet || got.Message != MessageNotYet || got.Mode != "" {
		t.Errorf("stack_takes = %+v, want not_yet with %q and no mode", got, MessageNotYet)
	}
}

// The roles drive the recorder: a take starts on the narrator's chosen microphone (the built-in recorder needs no track), stops,
// and choosing a line's active take marks it the keeper.
func TestRolesDriveTheRecorder(t *testing.T) {
	ctx := context.Background()
	rec := &fakeRecorder{}
	adapter := New(Config{Recorder: rec, Device: func() string { return "USB Mic" }})
	recorder := adapter.Role(dawport.CapRecord).(dawport.Recorder)
	if _, err := recorder.ArmOnly(ctx, ""); err != nil {
		t.Errorf("ArmOnly with no track = %v, want nil: the built-in recorder needs no track", err)
	}
	if _, err := recorder.RecordStart(ctx, "", dawport.RecordOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, err := recorder.RecordStop(ctx); err != nil {
		t.Fatal(err)
	}
	if len(rec.started) != 1 || rec.started[0] != "USB Mic" || len(rec.stopped) != 1 {
		t.Errorf("started %v, stopped %v; want one take on USB Mic, stopped once", rec.started, rec.stopped)
	}
	takes := adapter.Role(dawport.CapTakes).(dawport.TakeSelector)
	set, err := takes.SetActiveTake(ctx, "chapter-1", "Take 003")
	if err != nil {
		t.Fatal(err)
	}
	if !set.Changed || set.TakeGUID != "Take 003" || len(rec.keepers) != 1 || rec.keepers[0] != "Take 003" {
		t.Errorf("SetActiveTake = %+v, keepers %v; want Take 003 kept", set, rec.keepers)
	}
	hidden, err := takes.HideTakes(ctx, "chapter-1", "Take 003")
	if err != nil || !hidden.OK || !hidden.Changed || len(rec.hidKeeping) != 1 || rec.hidKeeping[0] != "Take 003" {
		t.Errorf("HideTakes = %+v, %v, kept %v; want ok, changed, keeping Take 003", hidden, err, rec.hidKeeping)
	}
	cut, err := adapter.Role(dawport.CapCutRange).(dawport.RangeCutter).DeleteRange(ctx, dawport.DeleteRangeRequest{
		RangeRequest: dawport.RangeRequest{ItemGUID: "Take 003", Start: 1, End: 2}})
	if err != nil || !cut.OK || !cut.Changed || len(rec.cuts) != 1 || rec.cuts[0] != "Take 003 1.0-2.0 gap" {
		t.Errorf("DeleteRange = %+v, %v, cuts %v; want a gap cut on Take 003", cut, err, rec.cuts)
	}
}

func TestRolesRefuseWithoutARecorderOrAfterCancel(t *testing.T) {
	recorder := New(Config{}).Role(dawport.CapRecord).(dawport.Recorder)
	if _, err := recorder.RecordStart(context.Background(), "", dawport.RecordOptions{}); err == nil {
		t.Error("RecordStart with no recorder = nil, want a refusal")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	live := New(Config{Recorder: &fakeRecorder{}}).Role(dawport.CapRecord).(dawport.Recorder)
	if _, err := live.RecordStart(ctx, "", dawport.RecordOptions{}); !errors.Is(err, context.Canceled) {
		t.Errorf("RecordStart after cancel = %v, want context.Canceled", err)
	}
}

func TestFactoryIsRegistered(t *testing.T) {
	factory, ok := dawport.Lookup(dawport.KindBuiltIn)
	if !ok {
		t.Fatal("no factory registered for KindBuiltIn")
	}
	adapter, err := factory(dawport.Env{SessionDir: "ignored"})
	if err != nil || adapter.Kind() != dawport.KindBuiltIn {
		t.Fatalf("factory = (%v, %v), want a built-in adapter", adapter, err)
	}
}
