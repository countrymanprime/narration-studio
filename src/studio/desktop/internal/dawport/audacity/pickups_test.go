package audacity

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	abt "desktop/internal/audacitybridge/audacitybridgetest"
	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

type pickupsFixture struct {
	pickups *Pickups
	server  *abt.Server
	dir     string
	got     []bridge.Event
}

func newPickupsFixture(t *testing.T) *pickupsFixture {
	t.Helper()
	session, server := newSession(t)
	server.With(func(p *abt.Project) { p.AddWaveTrack("Chapter 1", 0, 600) })
	f := &pickupsFixture{pickups: NewPickups(session), server: server, dir: t.TempDir()}
	f.pickups.Subscribe(dawport.Subscription{Tags: []string{"PICKUP*", "ERROR"}, Handle: func(e bridge.Event) { f.got = append(f.got, e) }})
	return f
}

// wait dispatches until an event with tag arrives, takes it off the list and returns it.
func (f *pickupsFixture) wait(t *testing.T, tag string) bridge.Event {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		_ = f.pickups.Dispatch()
		for i, e := range f.got {
			if e.Tag == tag {
				f.got = append(f.got[:i], f.got[i+1:]...)
				return e
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("no %s event; got %v", tag, f.got)
	return bridge.Event{}
}

func (f *pickupsFixture) payload(t *testing.T, lines ...string) string {
	t.Helper()
	path := filepath.Join(f.dir, "payload.txt")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func (f *pickupsFixture) labels() []string {
	var out []string
	f.server.With(func(p *abt.Project) {
		for _, l := range p.AllLabels() {
			out = append(out, l.Text)
		}
	})
	return out
}

func TestPickupLabelTextRoundTrips(t *testing.T) {
	for _, c := range []struct {
		open      bool
		tag, note string
		text      string
		wantTag   string
		wantNote  string
	}{
		{true, "", "re-read the second sentence", "[nu:pickup open] re-read the second sentence", "", "re-read the second sentence"},
		{false, "proofer", `breath at "the"`, "[nu:pickup done] [proofer] breath at ”the”", "proofer", "breath at ”the”"},
		{true, "", "  spaced   out\n note ", "[nu:pickup open] spaced out note", "", "spaced out note"},
		{true, "שלום", "مرحبا 🦎 😀", "[nu:pickup open] [שלום] مرحبا 🦎 😀", "שלום", "مرحبا 🦎 😀"},
	} {
		text, err := PickupLabelText(c.open, c.tag, c.note)
		if err != nil || text != c.text {
			t.Fatalf("%+v: %q, %v", c, text, err)
		}
		open, tag, note, ok := ParsePickupLabel(text)
		if !ok || open != c.open || tag != c.wantTag || note != c.wantNote {
			t.Errorf("%q: parsed open=%v tag=%q note=%q ok=%v", text, open, tag, note, ok)
		}
	}
	if _, err := PickupLabelText(true, "tag", "   "); err == nil {
		t.Error("a pickup with no note was accepted")
	}
	long, _ := PickupLabelText(true, "", strings.Repeat("word ", 100))
	if len(long) > maxLabelBytes {
		t.Errorf("label is %d bytes", len(long))
	}
	for _, other := range []string{"", "[nu:f1] words", "[nu:project abcdef]", "[nu:pickup open]", "[nu:pickup open]x", "PICKUP: x", "my own note"} {
		if _, _, _, ok := ParsePickupLabel(other); ok {
			t.Errorf("%q read as a pickup", other)
		}
	}
	if _, _, _, ok := ParseFindingLabel("[nu:pickup open] x"); ok {
		t.Error("a pickup was read as a finding")
	}
}

func TestImportAddsEachNewPickupOnceAndCountsTheRest(t *testing.T) {
	f := newPickupsFixture(t)
	f.server.With(func(p *abt.Project) {
		p.AddLabelTrack("My notes", abt.Label{Start: 5, End: 5, Text: "my own note"})
	})
	payload := f.payload(t, "12.500000|proofer|re-read 'this'", "40|| a second one", "40.05||a second one", "bad|x|y", "-1||negative", "30|tag|", "", "75.25|a|b|c with pipes")
	if err := f.pickups.ImportPickups("run1", payload); err != nil {
		t.Fatal(err)
	}
	e := f.wait(t, "PICKUPS_IMPORTED")
	// run, added, existing, invalid: the 40.05 row is the 40 row again; three rows are not usable
	if !reflect.DeepEqual(e.Fields, []string{"PICKUPS_IMPORTED", "run1", "3", "1", "3"}) {
		t.Fatalf("imported = %v", e.Fields)
	}
	want := []string{"my own note", "[nu:pickup open] [proofer] re-read 'this'", "[nu:pickup open] a second one", "[nu:pickup open] [a] b|c with pipes"}
	if got := f.labels(); !reflect.DeepEqual(got, want) {
		t.Fatalf("labels = %q\nwant %q", got, want)
	}
	// A second import of the same list adds nothing.
	if err := f.pickups.ImportPickups("run2", payload); err != nil {
		t.Fatal(err)
	}
	again := f.wait(t, "PICKUPS_IMPORTED")
	if again.Fields[2] != "0" || again.Fields[3] != "4" {
		t.Errorf("second import = %v", again.Fields)
	}
}

func TestImportOfAMissingListIsAnError(t *testing.T) {
	f := newPickupsFixture(t)
	_ = f.pickups.ImportPickups("run1", filepath.Join(f.dir, "none.txt"))
	if e := f.wait(t, "ERROR"); e.Fields[2] != "The pickup list was not found." {
		t.Errorf("error = %q", e.Fields[2])
	}
}

func seedPickups(t *testing.T, f *pickupsFixture) {
	t.Helper()
	f.server.With(func(p *abt.Project) {
		p.AddLabelTrack(LabelTrackName,
			abt.Label{Start: 10, End: 10, Text: "[nu:pickup open] [proofer] first"},
			abt.Label{Start: 20, End: 20, Text: "[nu:pickup done] second"},
			abt.Label{Start: 30, End: 30, Text: "[nu:pickup open] third"},
			abt.Label{Start: 35, End: 35, Text: "[nu:f1] a finding"},
			abt.Label{Start: 40, End: 40, Text: "[nu:pickup open] fourth"},
		)
	})
}

func TestExportWritesOnlyTheOpenPickupsInTheShapeImportReads(t *testing.T) {
	f := newPickupsFixture(t)
	seedPickups(t, f)
	out := filepath.Join(f.dir, "export.txt")
	_ = f.pickups.ExportPickups("run1", out)
	e := f.wait(t, "PICKUPS_EXPORTED")
	if !reflect.DeepEqual(e.Fields, []string{"PICKUPS_EXPORTED", "run1", out, "3"}) {
		t.Fatalf("exported = %v", e.Fields)
	}
	raw, _ := os.ReadFile(out)
	want := "10.000000|proofer|first\n30.000000||third\n40.000000||fourth\n"
	if string(raw) != want {
		t.Errorf("file = %q, want %q", raw, want)
	}
	// Export then import round-trips: importing the file into the same project adds nothing.
	_ = f.pickups.ImportPickups("run2", out)
	if again := f.wait(t, "PICKUPS_IMPORTED"); again.Fields[2] != "0" || again.Fields[3] != "3" {
		t.Errorf("re-import = %v", again.Fields)
	}
}

func TestNextGoesToTheNextOpenPickupAfterTheCursorAndWraps(t *testing.T) {
	f := newPickupsFixture(t)
	seedPickups(t, f)
	for _, c := range []struct{ cursor, want float64 }{{0, 10}, {10, 30}, {25, 30}, {30, 40}, {40, 10}, {500, 10}} {
		f.server.With(func(p *abt.Project) { p.SelStart, p.SelEnd = c.cursor, c.cursor })
		_ = f.pickups.NextPickup("run")
		e := f.wait(t, "PICKUP_NEXT")
		f.server.With(func(p *abt.Project) {
			if p.SelStart != c.want || p.SelEnd != c.want {
				t.Errorf("cursor %v: the cursor went to %v-%v, want %v", c.cursor, p.SelStart, p.SelEnd, c.want)
			}
		})
		if e.Fields[2] != f6(c.want) {
			t.Errorf("cursor %v: event position %q", c.cursor, e.Fields[2])
		}
	}
	empty := newPickupsFixture(t)
	_ = empty.pickups.NextPickup("run")
	if e := empty.wait(t, "ERROR"); e.Fields[2] != "No pickups remain." {
		t.Errorf("no pickups = %q", e.Fields[2])
	}
}

func TestResolveAndReopenRewriteOnlyThePrefixOfTheNearestPickup(t *testing.T) {
	f := newPickupsFixture(t)
	seedPickups(t, f)
	_ = f.pickups.ResolvePickup("r1", 10.1)
	e := f.wait(t, "PICKUP_RESOLVED")
	if !reflect.DeepEqual(e.Fields, []string{"PICKUP_RESOLVED", "r1", "10.000000", "proofer", "first"}) {
		t.Fatalf("resolved = %v", e.Fields)
	}
	if got := f.labels()[0]; got != "[nu:pickup done] [proofer] first" {
		t.Errorf("label = %q", got)
	}
	// Resolving it again finds no open pickup there.
	_ = f.pickups.ResolvePickup("r2", 10)
	if e := f.wait(t, "ERROR"); e.Fields[2] != "No open pickup was found at that position." {
		t.Errorf("again = %q", e.Fields[2])
	}
	// Too far from any pickup.
	_ = f.pickups.ResolvePickup("r3", 25)
	f.wait(t, "ERROR")
	_ = f.pickups.ReopenPickup("r4", 20)
	if e := f.wait(t, "PICKUP_REOPENED"); e.Fields[3] != "" || e.Fields[4] != "second" {
		t.Errorf("reopened = %v", e.Fields)
	}
	if got := f.labels()[1]; got != "[nu:pickup open] second" {
		t.Errorf("label = %q", got)
	}
	_ = f.pickups.ReopenPickup("r5", 30)
	if e := f.wait(t, "ERROR"); e.Fields[2] != "No resolved pickup was found at that position." {
		t.Errorf("reopen of an open one = %q", e.Fields[2])
	}
	// The finding label and the narrator's own are never touched.
	if got := f.labels(); got[3] != "[nu:f1] a finding" {
		t.Errorf("labels = %q", got)
	}
	if err := f.pickups.ResolvePickup("r6", -1); err == nil {
		t.Error("a negative position was accepted")
	}
}

func TestListAndCountReadTheState(t *testing.T) {
	f := newPickupsFixture(t)
	seedPickups(t, f)
	out := filepath.Join(f.dir, "markers.txt")
	_ = f.pickups.ListPickupMarkers("r1", out)
	e := f.wait(t, "PICKUP_MARKERS_LISTED")
	if !reflect.DeepEqual(e.Fields, []string{"PICKUP_MARKERS_LISTED", "r1", out, "3", "1"}) {
		t.Fatalf("listed = %v", e.Fields)
	}
	raw, _ := os.ReadFile(out)
	want := "10.000000|open|proofer|first\n20.000000|done||second\n30.000000|open||third\n40.000000|open||fourth\n"
	if string(raw) != want {
		t.Errorf("file = %q", raw)
	}
	_ = f.pickups.CountPickups("r2")
	if c := f.wait(t, "PICKUPS_COUNTED"); !reflect.DeepEqual(c.Fields, []string{"PICKUPS_COUNTED", "r2", "3", "4"}) {
		t.Errorf("counted = %v", c.Fields)
	}
}

func TestPickupRequestsSayWhyWhenAudacityIsNotThere(t *testing.T) {
	f := newPickupsFixture(t)
	seedPickups(t, f)
	f.server.SetDown(true)
	_ = f.pickups.CountPickups("r1")
	if e := f.wait(t, "ERROR"); !strings.Contains(e.Fields[2], "not reachable") {
		t.Errorf("closed Audacity = %q", e.Fields[2])
	}
	f.server.SetDown(false)
	f.server.With(func(p *abt.Project) { p.NoProject = true })
	_ = f.pickups.CountPickups("r2")
	if e := f.wait(t, "ERROR"); !strings.Contains(e.Fields[2], "no project") {
		t.Errorf("no project = %q", e.Fields[2])
	}
	if err := f.pickups.CountPickups(""); err == nil {
		t.Error("a request with no run id was accepted")
	}
}

func TestOneHubServesEveryAsynchronousRole(t *testing.T) {
	session, _ := newSession(t)
	adapter := NewWithBackups(session.client, BackupsConfig{})
	review := adapter.Role(dawport.CapReview).(dawport.ReviewSession)
	pickups := adapter.Role(dawport.CapPickups).(dawport.PickupList)
	var seen []string
	review.Subscribe(dawport.Subscription{Tags: []string{"PICKUPS_COUNTED"}, Handle: func(e bridge.Event) { seen = append(seen, e.Tag) }})
	adapter.pickups.emit("PICKUPS_COUNTED", "r", "0", "0")
	if err := pickups.Dispatch(); err != nil || !reflect.DeepEqual(seen, []string{"PICKUPS_COUNTED"}) {
		t.Errorf("a subscriber through the review role heard %v, %v", seen, err)
	}
}
