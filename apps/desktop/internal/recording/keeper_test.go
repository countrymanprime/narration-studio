package recording_test

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/recording"
	"github.com/countrymanprime/narration-utils/shell/internal/recording/recordingtest"
)

func writeTake(t *testing.T, folder, name string) {
	t.Helper()
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := recordingtest.WriteWav(filepath.Join(folder, name+".wav"), 24000); err != nil {
		t.Fatal(err)
	}
}

func TestSetTakeKeeperMarksAndPersists(t *testing.T) {
	fake := &recordingtest.Fake{}
	r := newRecorder(t, fake)
	writeTake(t, r.folder(), "Take 001")

	if err := r.service.SetTakeKeeper("Take 001", true); err != nil {
		t.Fatalf("SetTakeKeeper: %v", err)
	}

	state := r.service.Snapshot()
	if len(state.Takes) != 1 || !state.Takes[0].Keeper {
		t.Fatalf("Takes = %+v, want Take 001 marked keeper", state.Takes)
	}

	// A fresh service over the same folder reads the same mark back: project-owned state, not process-owned.
	other := recording.New(recording.Config{Project: r.project}, fake, nil, nil)
	if !other.Snapshot().Takes[0].Keeper {
		t.Fatal("a fresh service over the same folder did not read the keeper mark back")
	}
}

func TestSetTakeKeeperUndoesByMarkingFalse(t *testing.T) {
	r := newRecorder(t, &recordingtest.Fake{})
	writeTake(t, r.folder(), "Take 001")
	if err := r.service.SetTakeKeeper("Take 001", true); err != nil {
		t.Fatal(err)
	}

	if err := r.service.SetTakeKeeper("Take 001", false); err != nil {
		t.Fatalf("undoing: %v", err)
	}
	if r.service.Snapshot().Takes[0].Keeper {
		t.Fatal("Keeper = true, want false after undoing")
	}
}

func TestSetTakeKeeperIsExclusiveWithinALine(t *testing.T) {
	r := newRecorder(t, &recordingtest.Fake{})
	writeTake(t, r.folder(), "Take 001")
	writeTake(t, r.folder(), "Take 002")
	writeTake(t, r.folder(), "Take 003")
	// Take 001 and 002 share a line; Take 003 is on a different one.
	if err := r.service.SetTakeLine("Take 001", "p-000001", "sha-1"); err != nil {
		t.Fatal(err)
	}
	if err := r.service.SetTakeLine("Take 002", "p-000001", "sha-1"); err != nil {
		t.Fatal(err)
	}
	if err := r.service.SetTakeLine("Take 003", "p-000002", "sha-1"); err != nil {
		t.Fatal(err)
	}

	if err := r.service.SetTakeKeeper("Take 001", true); err != nil {
		t.Fatal(err)
	}
	if err := r.service.SetTakeKeeper("Take 003", true); err != nil {
		t.Fatal(err)
	}
	byName := map[string]bool{}
	for _, take := range r.service.Snapshot().Takes {
		byName[take.Name] = take.Keeper
	}
	if byName["Take 001"] != true || byName["Take 002"] != false || byName["Take 003"] != true {
		t.Fatalf("keeper marks = %+v, want only Take 001 and Take 003 (each the keeper of its own line)", byName)
	}

	// Marking Take 002 the keeper takes over from Take 001, since they share a line; Take 003 (a different line)
	// is untouched.
	if err := r.service.SetTakeKeeper("Take 002", true); err != nil {
		t.Fatal(err)
	}
	byName = map[string]bool{}
	for _, take := range r.service.Snapshot().Takes {
		byName[take.Name] = take.Keeper
	}
	if byName["Take 001"] != false || byName["Take 002"] != true || byName["Take 003"] != true {
		t.Fatalf("keeper marks after handoff = %+v, want Take 002 and Take 003 the keepers", byName)
	}
}

func TestSetTakeKeeperWithNoLineHasNoGroupToClear(t *testing.T) {
	r := newRecorder(t, &recordingtest.Fake{})
	writeTake(t, r.folder(), "Take 001")
	writeTake(t, r.folder(), "Take 002")

	if err := r.service.SetTakeKeeper("Take 001", true); err != nil {
		t.Fatal(err)
	}
	if err := r.service.SetTakeKeeper("Take 002", true); err != nil {
		t.Fatal(err)
	}
	byName := map[string]bool{}
	for _, take := range r.service.Snapshot().Takes {
		byName[take.Name] = take.Keeper
	}
	if !byName["Take 001"] || !byName["Take 002"] {
		t.Fatalf("keeper marks = %+v, want both takes marked (neither has a line to share)", byName)
	}
}

func TestSetTakeKeeperRefusesAnEmptyTakeName(t *testing.T) {
	r := newRecorder(t, &recordingtest.Fake{})
	if err := os.MkdirAll(r.folder(), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := r.service.SetTakeKeeper("", true); err == nil {
		t.Fatal("want an error for an empty take name")
	}
}

func TestSetTakeKeeperWithoutAProjectIsRefused(t *testing.T) {
	svc := recording.New(recording.Config{}, &recordingtest.Fake{}, nil, nil)
	if err := svc.SetTakeKeeper("Take 001", true); err == nil {
		t.Fatal("want an error without a project")
	}
}

// TestTakeListingSurvivesACorruptKeeperFile mirrors TestTakeListingSurvivesACorruptIdentityFile: a malformed keeper
// sidecar never blocks the take listing itself.
func TestTakeListingSurvivesACorruptKeeperFile(t *testing.T) {
	r := newRecorder(t, &recordingtest.Fake{})
	writeTake(t, r.folder(), "Take 001")
	if err := os.WriteFile(filepath.Join(r.folder(), "keeper.json"), []byte("not json"), 0o600); err != nil {
		t.Fatal(err)
	}

	state := r.service.Snapshot()
	if len(state.Takes) != 1 {
		t.Fatalf("takes = %d, want 1 despite the corrupt sidecar", len(state.Takes))
	}
	if state.Takes[0].Keeper {
		t.Fatal("Keeper = true, want false (a corrupt sidecar yields no marks)")
	}
}

func lineOf(t *testing.T, r *recorder, takes ...string) {
	t.Helper()
	for _, name := range takes {
		writeTake(t, r.folder(), name)
		if err := r.service.SetTakeLine(name, "p-000001", "sha-1"); err != nil {
			t.Fatal(err)
		}
	}
}

func TestBuiltinRecorderHidesTheOtherTakesAndKeepsTheirFiles(t *testing.T) {
	r := newRecorder(t, &recordingtest.Fake{})
	lineOf(t, r, "Take 001", "Take 002", "Take 003")
	writeTake(t, r.folder(), "Take 004") // another line's take, with none assigned
	before := map[string][]byte{}
	for _, name := range []string{"Take 001", "Take 002", "Take 003", "Take 004"} {
		raw, err := os.ReadFile(filepath.Join(r.folder(), name+".wav"))
		if err != nil {
			t.Fatal(err)
		}
		before[name] = raw
	}

	hid, err := r.service.HideOtherTakes("Take 002")
	if err != nil || hid != 2 {
		t.Fatalf("HideOtherTakes = %d, %v; want 2 hidden", hid, err)
	}
	got := map[string][2]bool{}
	for _, take := range r.service.Snapshot().Takes {
		got[take.Name] = [2]bool{take.Keeper, take.Hidden}
	}
	want := map[string][2]bool{"Take 001": {false, true}, "Take 002": {true, false}, "Take 003": {false, true}, "Take 004": {false, false}}
	for name, w := range want {
		if got[name] != w {
			t.Errorf("%s (keeper, hidden) = %v, want %v", name, got[name], w)
		}
	}
	for name, raw := range before {
		now, err := os.ReadFile(filepath.Join(r.folder(), name+".wav"))
		if err != nil || !bytes.Equal(now, raw) {
			t.Errorf("%s: file changed or gone (%v); a hidden take is kept as recorded", name, err)
		}
	}
	// A fresh service reads the same marks; choosing a hidden take as keeper shows it again.
	other := recording.New(recording.Config{Project: r.project}, &recordingtest.Fake{}, nil, nil)
	if !other.Snapshot().Takes[0].Hidden {
		t.Error("a fresh service did not read the hidden mark back")
	}
	if hid, err := r.service.HideOtherTakes("Take 001"); err != nil || hid != 1 {
		t.Fatalf("HideOtherTakes(Take 001) = %d, %v; want 1 newly hidden", hid, err)
	}
	if r.service.Snapshot().Takes[0].Hidden {
		t.Error("Take 001 stays hidden after becoming the keeper")
	}
	if _, err := r.service.HideOtherTakes("Take 099"); err == nil {
		t.Error("a take that is not in the folder was accepted")
	}
}

func TestBuiltinRecorderCutsAGapByItsEditListAndLeavesTheTakeFile(t *testing.T) {
	r := newRecorder(t, &recordingtest.Fake{})
	writeTake(t, r.folder(), "Take 001")
	path := filepath.Join(r.folder(), "Take 001.wav")
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range [][2]float64{{0.5, 0.75}, {0.2, 0.3}, {0.7, 0.9}} {
		if err := r.service.CutTakeRange("Take 001", c[0], c[1], "gap"); err != nil {
			t.Fatalf("CutTakeRange %v: %v", c, err)
		}
	}
	cuts := r.service.Snapshot().Takes[0].Cuts
	want := []recording.TakeCut{{Start: 0.2, End: 0.3, Mode: "gap"}, {Start: 0.5, End: 0.9, Mode: "gap"}}
	if len(cuts) != 2 || cuts[0] != want[0] || cuts[1] != want[1] {
		t.Errorf("Cuts = %+v, want %+v (overlaps merged, in order)", cuts, want)
	}
	if after, err := os.ReadFile(path); err != nil || !bytes.Equal(after, before) {
		t.Errorf("the take file changed (%v); a cut is an edit list, never a rewrite", err)
	}
	for _, bad := range []struct {
		take, mode string
		a, b       float64
	}{{"Take 001", "gap", 1, 1}, {"Take 001", "gap", -1, 1}, {"Take 001", "fade", 0, 1}, {"Take 009", "gap", 0, 1}} {
		if err := r.service.CutTakeRange(bad.take, bad.a, bad.b, bad.mode); err == nil {
			t.Errorf("CutTakeRange(%+v) = nil, want a refusal", bad)
		}
	}
}
