package main

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/marks"
)

func decodeDeleted(t *testing.T) func(string, error) marks.Deleted {
	return func(payload string, err error) marks.Deleted {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var deleted marks.Deleted
		if err := json.Unmarshal([]byte(payload), &deleted); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return deleted
	}
}

func TestMarksThreadBindingsRoundtrip(t *testing.T) {
	host, _ := bookmarksHost(t)
	// "the Queen" after the closing curly quote: UTF-16 offsets 21 to 30.
	query := decodeMark(t)(host.MarksAdd("c-0001", "p-000001", 21, 30, "ask", "Shrill, or just loud?"))
	decodeMark(t)(host.MarksReply(query.ID, "author", "Loud."))
	replied := decodeMark(t)(host.MarksReply(query.ID, "you", "Thanks."))
	if len(replied.Thread) != 2 || replied.Thread[0].Who != "author" || replied.Thread[1].At == "" {
		t.Fatalf("after replies = %+v", replied.Thread)
	}
	if edited := decodeMark(t)(host.MarksEditMessage(query.ID, 0, "Loud, not shrill.")); edited.Thread[0].Text != "Loud, not shrill." {
		t.Fatalf("after an edit = %+v", edited.Thread)
	}
	deleted := decodeDeleted(t)(host.MarksDeleteMessage(query.ID, 0))
	if deleted.Message.Text != "Loud, not shrill." || len(deleted.Mark.Thread) != 1 {
		t.Fatalf("after a delete = %+v", deleted)
	}
	if restored := decodeMark(t)(host.MarksRestoreMessage(query.ID, 0, deleted.Message)); len(restored.Thread) != 2 || restored.Thread[0] != deleted.Message {
		t.Fatalf("after a restore = %+v", restored.Thread)
	}
	if resolved := decodeMark(t)(host.MarksSetStatus(query.ID, "resolved")); resolved.Status != "resolved" {
		t.Fatalf("after resolve = %+v", resolved)
	}
	if reopened := decodeMark(t)(host.MarksSetStatus(query.ID, "open")); reopened.Status != "open" {
		t.Fatalf("after reopen = %+v", reopened)
	}

	stress := decodeMark(t)(host.MarksAdd("c-0001", "p-000002", 4, 12, "stress", ""))
	if _, err := host.MarksSetStatus(stress.ID, "resolved"); err == nil || !strings.Contains(err.Error(), "only a question") {
		t.Fatalf("resolving a mark that does not ask = %v", err)
	}
	if _, err := host.MarksReply(query.ID, "you", ""); err == nil {
		t.Fatal("an empty reply was saved")
	}
	if _, err := host.MarksDeleteMessage(query.ID, 5); err == nil {
		t.Fatal("a delete out of range succeeded")
	}
}

// The thread's payloads, the goldens the UI's schemas are checked against: a question with two replies, and what a delete
// answers.
func TestMarksThreadContractGoldens(t *testing.T) {
	host, _ := bookmarksHost(t)
	query := decodeMark(t)(host.MarksAdd("c-0001", "p-000001", 21, 30, "ask", "Shrill, or just loud?"))
	decodeMark(t)(host.MarksReply(query.ID, "author", "Loud, not shrill."))
	payload, err := host.MarksReply(query.ID, "proofer", "The take at 2:14 is clipped.")
	checkBindingContract(t, "marks-thread", payload)
	if mark := decodeMark(t)(payload, err); len(mark.Thread) != 2 {
		t.Fatalf("thread = %s", payload)
	}
	payload, err = host.MarksDeleteMessage(query.ID, 1)
	checkBindingContract(t, "marks-thread-deleted", payload)
	if deleted := decodeDeleted(t)(payload, err); deleted.Message.Who != "proofer" || len(deleted.Mark.Thread) != 1 {
		t.Fatalf("deleted = %s", payload)
	}
}
