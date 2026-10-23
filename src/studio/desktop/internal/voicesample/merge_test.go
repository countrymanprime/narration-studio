package voicesample

// State matrix for following a Story Bible merge (docs/prds/character-voice-samples.prd.md, phase 7), each cell by its test:
//
//	empty (the absorbed entry has none)    TestFollowMergeWithNoSamplesChangesNothing
//	one, many                              TestFollowMergeMovesEverySampleAndTheTargetKeepsItsPrimary
//	the target has none                    TestFollowMergeGivesTheTargetTheAbsorbedPrimary
//	huge (at the per-character limit)      TestFollowMergeStopsAtTheLimitAndLeavesTheRestWhereTheyWere
//	rapid double-fire                      TestFollowMergeTwiceMovesNothingTheSecondTime
//	refused (not a pair of entries)        TestFollowMergeRefusesWhatIsNotAPairOfEntries
//	stale (the narrator moved or deleted)  TestUndoFollowLeavesWhatTheNarratorMovedOrDeleted
//	undo                                   TestUndoFollowPutsEverySampleAndItsPrimaryBack
//	undo when the target would lose its    TestUndoFollowPromotesTheTargetsNewestWhenItsPrimaryLeaves
//	  primary
//	unknown undo id                        TestUndoFollowOfAnUnknownMergeChangesNothing
//	moved by hand                          TestMovingByHandForgetsTheMerge
//	reload (the record is on the row)      TestFollowMergeRecordSurvivesAReload
//	a bad record in the file               TestAMergeRecordWithABadUndoIDQuarantinesTheFile
//	failed (the file cannot be written)    not tested: it is the same writeStore every other change uses
//	long, right-to-left, emoji text        not tested: the merge moves ids, it reads no text
import (
	"errors"
	"testing"
)

const undoOne = "00000000000000a1"

func primaryOf(t *testing.T, r *rig, character string) string {
	t.Helper()
	found := ""
	for _, sample := range r.stored().Samples {
		if sample.CharacterID == character && sample.Primary {
			if found != "" {
				t.Fatalf("%s has two primaries", character)
			}
			found = sample.ID
		}
	}
	return found
}

func characterOf(r *rig, id string) string {
	for _, sample := range r.stored().Samples {
		if sample.ID == id {
			return sample.CharacterID
		}
	}
	return "<gone>"
}

func TestFollowMergeMovesEverySampleAndTheTargetKeepsItsPrimary(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "absorbed", true, 10), row(2, "absorbed", false, 10), row(3, "survivor", true, 10), row(4, "other", true, 10))
	moved, err := r.service.FollowMerge(undoOne, "absorbed", "survivor")
	if err != nil {
		t.Fatal(err)
	}
	if moved.Moved != 2 || moved.Left != 0 {
		t.Fatalf("followed = %+v", moved)
	}
	for _, id := range []string{row(1, "", false, 0).ID, row(2, "", false, 0).ID} {
		if characterOf(r, id) != "survivor" {
			t.Fatalf("%s is with %s", id, characterOf(r, id))
		}
	}
	if got := primaryOf(t, r, "survivor"); got != row(3, "", false, 0).ID {
		t.Fatalf("the survivor's primary = %s, want its own", got)
	}
	if primaryOf(t, r, "other") == "" || countFor(r.stored().Samples, "absorbed") != 0 {
		t.Fatal("another character changed, or the absorbed entry still has samples")
	}
}

func TestFollowMergeGivesTheTargetTheAbsorbedPrimary(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "absorbed", false, 10), row(2, "absorbed", true, 10), row(3, "absorbed", false, 10))
	if _, err := r.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil {
		t.Fatal(err)
	}
	if got := primaryOf(t, r, "survivor"); got != row(2, "", false, 0).ID {
		t.Fatalf("the survivor's primary = %s, want the absorbed entry's primary", got)
	}
}

func TestFollowMergeStopsAtTheLimitAndLeavesTheRestWhereTheyWere(t *testing.T) {
	r := newRig(t)
	rows := []Stored{row(1, "survivor", true, 10)}
	for id := 2; id <= MaxPerCharacter-2; id++ {
		rows = append(rows, row(id, "survivor", false, 10))
	}
	have := len(rows) // MaxPerCharacter - 2, so there is room for two
	rows = append(rows, row(100, "absorbed", false, 10), row(101, "absorbed", true, 10), row(102, "absorbed", false, 10), row(103, "absorbed", false, 10), row(104, "absorbed", false, 10))
	r.seed(rows...)
	if have != MaxPerCharacter-2 {
		t.Fatalf("setup: survivor has %d", have)
	}
	moved, err := r.service.FollowMerge(undoOne, "absorbed", "survivor")
	if err != nil {
		t.Fatal(err)
	}
	if moved.Moved != 2 || moved.Left != 3 {
		t.Fatalf("followed = %+v", moved)
	}
	if got := countFor(r.stored().Samples, "survivor"); got != MaxPerCharacter {
		t.Fatalf("the survivor has %d, want the limit %d", got, MaxPerCharacter)
	}
	// The absorbed primary goes first, then the newest; the other three stay.
	if characterOf(r, row(101, "", false, 0).ID) != "survivor" || characterOf(r, row(104, "", false, 0).ID) != "survivor" {
		t.Fatal("the primary and the newest should have moved")
	}
	for _, stayed := range []int{100, 102, 103} {
		if characterOf(r, row(stayed, "", false, 0).ID) != "absorbed" {
			t.Fatalf("row %d should have stayed with the absorbed entry", stayed)
		}
	}
	// The ones left behind keep a primary of their own.
	if primaryOf(t, r, "absorbed") == "" {
		t.Fatal("the entry that was left with samples has no primary")
	}
}

func TestFollowMergeWithNoSamplesChangesNothing(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "survivor", true, 10))
	before := mustRead(t, r.storePath())
	moved, err := r.service.FollowMerge(undoOne, "absorbed", "survivor")
	if err != nil || moved.Moved != 0 || moved.Left != 0 {
		t.Fatalf("followed = %+v, %v", moved, err)
	}
	if string(mustRead(t, r.storePath())) != string(before) {
		t.Fatal("the file was rewritten though nothing moved")
	}
	// No file at all stays no file.
	empty := newRig(t)
	if moved, err := empty.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil || moved.Moved != 0 {
		t.Fatalf("empty store: %+v, %v", moved, err)
	}
}

func TestFollowMergeTwiceMovesNothingTheSecondTime(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "absorbed", true, 10), row(2, "survivor", true, 10))
	if _, err := r.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil {
		t.Fatal(err)
	}
	again, err := r.service.FollowMerge(undoOne, "absorbed", "survivor")
	if err != nil || again.Moved != 0 {
		t.Fatalf("second call = %+v, %v", again, err)
	}
	if got := countFor(r.stored().Samples, "survivor"); got != 2 {
		t.Fatalf("the survivor has %d", got)
	}
}

func TestFollowMergeRefusesWhatIsNotAPairOfEntries(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "absorbed", true, 10))
	cases := map[string][3]string{
		"empty source":       {undoOne, "", "survivor"},
		"empty target":       {undoOne, "absorbed", ""},
		"the same entry":     {undoOne, "absorbed", "absorbed"},
		"narration source":   {undoOne, NarrationCharacterID, "survivor"},
		"narration target":   {undoOne, "absorbed", NarrationCharacterID},
		"a bad undo id":      {"nope", "absorbed", "survivor"},
		"an uppercase undo":  {"00000000000000A1", "absorbed", "survivor"},
		"a padded entry id":  {undoOne, " absorbed", "survivor"},
		"a control in an id": {undoOne, "absorbed", "sur\x00vivor"},
	}
	for name, c := range cases {
		if _, err := r.service.FollowMerge(c[0], c[1], c[2]); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
	if characterOf(r, row(1, "", false, 0).ID) != "absorbed" {
		t.Fatal("a refused call moved a sample")
	}
	noProject := New(Config{})
	if _, err := noProject.FollowMerge(undoOne, "absorbed", "survivor"); err == nil {
		t.Fatal("with no project open the call should fail")
	}
}

func TestUndoFollowPutsEverySampleAndItsPrimaryBack(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "absorbed", false, 10), row(2, "absorbed", true, 10), row(3, "survivor", true, 10))
	if _, err := r.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil {
		t.Fatal(err)
	}
	back, err := r.service.UndoFollow(undoOne)
	if err != nil {
		t.Fatal(err)
	}
	if back.Moved != 2 {
		t.Fatalf("back = %+v", back)
	}
	if got := countFor(r.stored().Samples, "absorbed"); got != 2 {
		t.Fatalf("the absorbed entry has %d", got)
	}
	if got := primaryOf(t, r, "absorbed"); got != row(2, "", false, 0).ID {
		t.Fatalf("the absorbed primary = %s, want the one it had", got)
	}
	if got := primaryOf(t, r, "survivor"); got != row(3, "", false, 0).ID {
		t.Fatalf("the survivor's primary = %s", got)
	}
	for _, sample := range r.stored().Samples {
		if sample.Merge != nil {
			t.Fatalf("%s still carries a merge record", sample.ID)
		}
	}
}

func TestUndoFollowPromotesTheTargetsNewestWhenItsPrimaryLeaves(t *testing.T) {
	r := newRig(t)
	// The survivor had no samples, so the absorbed primary became its primary; undoing must leave it a primary if it keeps any.
	r.seed(row(1, "absorbed", true, 10), row(2, "absorbed", false, 10))
	if _, err := r.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil {
		t.Fatal(err)
	}
	// The narrator adds a sample of their own to the survivor after the merge.
	file := r.stored()
	own := row(9, "survivor", false, 10)
	file.Samples = append(file.Samples, own)
	r.seed(file.Samples...)
	if _, err := r.service.UndoFollow(undoOne); err != nil {
		t.Fatal(err)
	}
	if got := primaryOf(t, r, "survivor"); got != own.ID {
		t.Fatalf("the survivor's primary = %q, want its own sample %s", got, own.ID)
	}
	if got := primaryOf(t, r, "absorbed"); got != row(1, "", false, 0).ID {
		t.Fatalf("the absorbed primary = %q", got)
	}
}

func TestUndoFollowLeavesWhatTheNarratorMovedOrDeleted(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "absorbed", true, 10), row(2, "absorbed", false, 10), row(3, "absorbed", false, 10), row(4, "survivor", true, 10))
	if _, err := r.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.service.Update(row(2, "", false, 0).ID, Change{CharacterID: "third", Label: "row 2"}); err != nil {
		t.Fatal(err)
	}
	if _, err := r.service.Remove(row(3, "", false, 0).ID); err != nil {
		t.Fatal(err)
	}
	back, err := r.service.UndoFollow(undoOne)
	if err != nil {
		t.Fatal(err)
	}
	if back.Moved != 1 {
		t.Fatalf("back = %+v, want only the untouched sample", back)
	}
	if characterOf(r, row(1, "", false, 0).ID) != "absorbed" || characterOf(r, row(2, "", false, 0).ID) != "third" || characterOf(r, row(3, "", false, 0).ID) != "<gone>" {
		t.Fatal("a sample the narrator moved or deleted was touched")
	}
}

func TestUndoFollowOfAnUnknownMergeChangesNothing(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "absorbed", true, 10), row(2, "survivor", true, 10))
	if _, err := r.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil {
		t.Fatal(err)
	}
	before := mustRead(t, r.storePath())
	back, err := r.service.UndoFollow("00000000000000b2")
	if err != nil || back.Moved != 0 {
		t.Fatalf("back = %+v, %v", back, err)
	}
	if string(mustRead(t, r.storePath())) != string(before) {
		t.Fatal("the file changed for an unknown merge")
	}
	if _, err := r.service.UndoFollow("nope"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a bad undo id: err = %v", err)
	}
}

func TestMovingByHandForgetsTheMerge(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "absorbed", true, 10), row(2, "survivor", true, 10))
	if _, err := r.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.service.Update(row(1, "", false, 0).ID, Change{CharacterID: "third", Label: "row 1"}); err != nil {
		t.Fatal(err)
	}
	for _, sample := range r.stored().Samples {
		if sample.ID == row(1, "", false, 0).ID && sample.Merge != nil {
			t.Fatal("a sample moved by hand still carries the merge record")
		}
	}
	// A rename is not a move: the record stays.
	r.seed(row(1, "absorbed", true, 10), row(2, "survivor", true, 10))
	if _, err := r.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.service.Update(row(1, "", false, 0).ID, Change{CharacterID: "survivor", Label: "renamed"}); err != nil {
		t.Fatal(err)
	}
	if back, err := r.service.UndoFollow(undoOne); err != nil || back.Moved != 1 {
		t.Fatalf("after a rename: %+v, %v", back, err)
	}
}

func TestFollowMergeRecordSurvivesAReload(t *testing.T) {
	r := newRig(t)
	r.seed(row(1, "absorbed", true, 10), row(2, "survivor", true, 10))
	if _, err := r.service.FollowMerge(undoOne, "absorbed", "survivor"); err != nil {
		t.Fatal(err)
	}
	// A new service over the same project, as after a restart.
	fresh := r.build()
	back, err := fresh.UndoFollow(undoOne)
	if err != nil || back.Moved != 1 {
		t.Fatalf("after a reload: %+v, %v", back, err)
	}
}

func TestAMergeRecordWithABadUndoIDQuarantinesTheFile(t *testing.T) {
	r := newRig(t)
	bad := row(1, "survivor", true, 10)
	bad.Merge = &StoredMerge{UndoID: "not-an-undo-id", From: "absorbed", To: "survivor"}
	r.seed(bad)
	list, err := r.service.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Samples) != 0 {
		t.Fatalf("a row with a bad merge record was kept: %+v", list.Samples)
	}
}
