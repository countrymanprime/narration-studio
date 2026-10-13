package findings

import (
	"testing"
)

func threadStore(t *testing.T) *Store {
	t.Helper()
	store := NewStore(t.TempDir())
	if _, err := store.SaveAnalyzerFindings("transcript_compare", "c-0001", []Finding{testFinding("f1", "c-0001", "v1")}); err != nil {
		t.Fatal(err)
	}
	return store
}

func texts(thread []ThreadMessage) []string {
	out := make([]string, 0, len(thread))
	for _, message := range thread {
		out = append(out, message.Who+":"+message.Text)
	}
	return out
}

func sameTexts(got []ThreadMessage, want ...string) bool {
	have := texts(got)
	if len(have) != len(want) {
		return false
	}
	for i := range want {
		if have[i] != want[i] {
			return false
		}
	}
	return true
}

func TestAThreadMessageIsAnAppendOnlyHistoryLine(t *testing.T) {
	store := threadStore(t)
	first, found, err := store.RecordThread("f1", ThreadEntry{Op: ThreadAdd, Who: ThreadYou, Text: "Check the breath"}, "t1")
	if err != nil || !found || !sameTexts(first.Review.Thread, "you:Check the breath") {
		t.Fatalf("add = %+v, %v, %v", first.Review.Thread, found, err)
	}
	if first.Review.Thread[0].ID == "" || first.Review.Thread[0].At != "t1" {
		t.Fatalf("message = %+v, want an id and the time", first.Review.Thread[0])
	}
	second, _, err := store.RecordThread("f1", ThreadEntry{Op: ThreadAdd, Who: ThreadProofer, Text: "Agreed, re-record"}, "t2")
	if err != nil || !sameTexts(second.Review.Thread, "you:Check the breath", "proofer:Agreed, re-record") {
		t.Fatalf("second add = %+v (%v)", second.Review.Thread, err)
	}
	if second.Review.Thread[0].ID == second.Review.Thread[1].ID {
		t.Fatalf("two messages share the id %q", second.Review.Thread[0].ID)
	}
	history, err := store.readHistory()
	if err != nil || len(history.Thread) != 2 || len(history.Decisions) != 0 {
		t.Fatalf("history = %+v (%v), want two thread lines and no decision", history, err)
	}
	// A new store over the same folder reads the same thread.
	again, _, err := NewStore(store.project).Get("f1")
	if err != nil || !sameTexts(again.Review.Thread, "you:Check the breath", "proofer:Agreed, re-record") {
		t.Fatalf("re-read thread = %+v (%v)", again.Review.Thread, err)
	}
}

func TestEditDeleteAndRestoreAreLinesAndUndoBringsAMessageBackInPlace(t *testing.T) {
	store := threadStore(t)
	added, _, err := store.RecordThread("f1", ThreadEntry{Op: ThreadAdd, Who: ThreadYou, Text: "one"}, "t1")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.RecordThread("f1", ThreadEntry{Op: ThreadAdd, Who: ThreadYou, Text: "two"}, "t2"); err != nil {
		t.Fatal(err)
	}
	id := added.Review.Thread[0].ID

	edited, _, err := store.RecordThread("f1", ThreadEntry{Op: ThreadEdit, MessageID: id, Text: "one, edited"}, "t3")
	if err != nil || !sameTexts(edited.Review.Thread, "you:one, edited", "you:two") || edited.Review.Thread[0].At != "t1" {
		t.Fatalf("edit = %+v (%v), want the text changed and the time kept", edited.Review.Thread, err)
	}
	if edited.Review.Thread[0].EditedAt != "t3" {
		t.Fatalf("edited at = %q, want t3", edited.Review.Thread[0].EditedAt)
	}
	deleted, _, err := store.RecordThread("f1", ThreadEntry{Op: ThreadDelete, MessageID: id}, "t4")
	if err != nil || !sameTexts(deleted.Review.Thread, "you:two") {
		t.Fatalf("delete = %+v (%v)", deleted.Review.Thread, err)
	}
	restored, _, err := store.RecordThread("f1", ThreadEntry{Op: ThreadRestore, MessageID: id}, "t5")
	if err != nil || !sameTexts(restored.Review.Thread, "you:one, edited", "you:two") {
		t.Fatalf("restore = %+v (%v), want the message back where it was", restored.Review.Thread, err)
	}
	history, _ := store.readHistory()
	if len(history.Thread) != 5 {
		t.Fatalf("history has %d thread lines, want 5 (nothing edited in place)", len(history.Thread))
	}
}

func TestThreadEntriesAreRefusedWhenTheyCannotApply(t *testing.T) {
	store := threadStore(t)
	cases := map[string]ThreadEntry{
		"empty text":      {Op: ThreadAdd, Who: ThreadYou, Text: "   "},
		"unknown author":  {Op: ThreadAdd, Who: "author", Text: "hi"},
		"unknown op":      {Op: "move", MessageID: "m1"},
		"missing message": {Op: ThreadEdit, MessageID: "m9", Text: "hi"},
		"delete unknown":  {Op: ThreadDelete, MessageID: "m9"},
		"restore unknown": {Op: ThreadRestore, MessageID: "m9"},
	}
	for name, entry := range cases {
		if _, _, err := store.RecordThread("f1", entry, "t"); err == nil {
			t.Errorf("%s: expected a refusal", name)
		}
	}
	if _, _, err := store.RecordThread("", ThreadEntry{Op: ThreadAdd, Who: ThreadYou, Text: "hi"}, "t"); err == nil {
		t.Error("an empty finding id: expected a refusal")
	}
	history, _ := store.readHistory()
	if len(history.Thread) != 0 {
		t.Fatalf("a refused entry was written: %+v", history.Thread)
	}
}

func TestTheThreadSurvivesADecisionARetypeAndARerun(t *testing.T) {
	store := threadStore(t)
	if _, _, err := store.RecordThread("f1", ThreadEntry{Op: ThreadAdd, Who: ThreadProofer, Text: "kept"}, "t1"); err != nil {
		t.Fatal(err)
	}
	decided, _, err := store.RecordDecision("f1", "v1", StatusAccepted, "", "t2")
	if err != nil || !sameTexts(decided.Review.Thread, "proofer:kept") {
		t.Fatalf("after a decision = %+v (%v)", decided.Review.Thread, err)
	}
	retyped, _, _ := store.RecordType("f1", "v1", NotePron, "t3")
	if !sameTexts(retyped.Review.Thread, "proofer:kept") {
		t.Fatalf("after a retype = %+v", retyped.Review.Thread)
	}
	// A re-check that changes the evidence resets the decision; the conversation about the spot stays.
	rerun, _ := store.SaveAnalyzerFindings("transcript_compare", "c-0001", []Finding{testFinding("f1", "c-0001", "v2")})
	if !sameTexts(rerun[0].Review.Thread, "proofer:kept") || rerun[0].Review.Status != StatusUnreviewed {
		t.Fatalf("after a re-run = %+v", rerun[0].Review)
	}
}
