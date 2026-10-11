package marks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// threadService is a service over alice with a fixed clock, so a reply's time can be checked.
func threadService(t *testing.T) (*Service, string, *Book) {
	t.Helper()
	project := t.TempDir()
	book := alice()
	service := newService(t, project, &book)
	service.now = func() time.Time { return time.Date(2026, 10, 11, 9, 30, 0, 0, time.FixedZone("EDT", -4*3600)) }
	return service, project, &book
}

func TestReplyAddsToTheThread(t *testing.T) {
	service, project, book := threadService(t)
	query := mustAdd(t, service, "c1", "p1", 19, 28, "ask", "Shrill, or just loud?")
	reply, err := service.Reply(query.ID, "author", "  Loud.\r\nNot shrill.  ")
	if err != nil {
		t.Fatal(err)
	}
	want := Message{Who: "author", Text: "Loud.\nNot shrill.", At: "2026-10-11T13:30:00Z"}
	if len(reply.Thread) != 1 || reply.Thread[0] != want || reply.Paragraph == nil || reply.Status != StatusOpen {
		t.Fatalf("after a reply = %+v", reply)
	}
	if _, err := service.Reply(query.ID, "you", "Thanks."); err != nil {
		t.Fatal(err)
	}
	// A new service over the same folder reads the thread in order.
	list := mustList(t, newService(t, project, book))
	if len(list.Marks) != 1 || len(list.Marks[0].Thread) != 2 || list.Marks[0].Thread[1].Who != "you" {
		t.Fatalf("thread on read = %+v", list.Marks)
	}
	// A note is a thread too.
	note := mustAdd(t, service, "c2", "p3", 0, 5, "note", "")
	if replied, err := service.Reply(note.ID, "proofer", "Check the take."); err != nil || len(replied.Thread) != 1 {
		t.Fatalf("a reply on a note = %+v, %v", replied, err)
	}

	for _, bad := range []struct{ name, id, who, text, want string }{
		{"empty", query.ID, "you", " \n ", "write the reply or note first"},
		{"unknown author", query.ID, "narrator", "Hi", "not one who can reply"},
		{"unknown mark", "missing", "you", "Hi", "no longer there"},
	} {
		if _, err := service.Reply(bad.id, bad.who, bad.text); err == nil || !strings.Contains(err.Error(), bad.want) {
			t.Errorf("%s: err = %v, want %q", bad.name, err, bad.want)
		}
	}
	if list := mustList(t, service); len(list.Marks[0].Thread) != 2 {
		t.Fatalf("a refused reply changed the thread: %+v", list.Marks[0].Thread)
	}
}

func TestEditAndDeleteAMessage(t *testing.T) {
	service, _, _ := threadService(t)
	query := mustAdd(t, service, "c1", "p1", 19, 28, "ask", "Shrill, or just loud?")
	for _, text := range []string{"one", "two", "three"} {
		if _, err := service.Reply(query.ID, "author", text); err != nil {
			t.Fatal(err)
		}
	}
	edited, err := service.EditMessage(query.ID, 1, " TWO ")
	if err != nil {
		t.Fatal(err)
	}
	if got := texts(edited.Thread); got != "one|TWO|three" || edited.Thread[1].Who != "author" || edited.Thread[1].At != "2026-10-11T13:30:00Z" {
		t.Fatalf("after an edit = %+v", edited.Thread)
	}
	deleted, err := service.DeleteMessage(query.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.Message.Text != "one" || deleted.Message.Who != "author" || texts(deleted.Mark.Thread) != "TWO|three" {
		t.Fatalf("after a delete = %+v", deleted)
	}
	for _, index := range []int{-1, 2, 9} {
		if _, err := service.EditMessage(query.ID, index, "x"); err == nil || !strings.Contains(err.Error(), "no longer there") {
			t.Errorf("edit at %d: %v", index, err)
		}
		if _, err := service.DeleteMessage(query.ID, index); err == nil || !strings.Contains(err.Error(), "no longer there") {
			t.Errorf("delete at %d: %v", index, err)
		}
	}
	if _, err := service.EditMessage(query.ID, 0, "  "); err == nil {
		t.Error("an edit to an empty message was saved")
	}
	if _, err := service.DeleteMessage("missing", 0); err == nil {
		t.Error("a delete on a missing mark succeeded")
	}
	if list := mustList(t, service); texts(list.Marks[0].Thread) != "TWO|three" {
		t.Fatalf("a refused call changed the thread: %+v", list.Marks[0].Thread)
	}
}

func TestRestorePutsAMessageBackWhereItWas(t *testing.T) {
	service, _, _ := threadService(t)
	note := mustAdd(t, service, "c1", "p1", 0, 3, "note", "Big.")
	for _, text := range []string{"one", "two", "three"} {
		if _, err := service.Reply(note.ID, "you", text); err != nil {
			t.Fatal(err)
		}
	}
	deleted, err := service.DeleteMessage(note.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, index := range []int{-1, 3} {
		if _, err := service.RestoreMessage(note.ID, index, deleted.Message); err == nil || !strings.Contains(err.Error(), "no longer there") {
			t.Errorf("restore at %d: %v", index, err)
		}
	}
	for _, bad := range []Message{
		{Who: "editor", Text: "two", At: deleted.Message.At},
		{Who: "you", Text: "", At: deleted.Message.At},
		{Who: "you", Text: "two", At: "yesterday"},
		{Who: "you", Text: "two\x07", At: deleted.Message.At},
	} {
		if _, err := service.RestoreMessage(note.ID, 1, bad); err == nil {
			t.Errorf("restored %+v", bad)
		}
	}
	restored, err := service.RestoreMessage(note.ID, 1, deleted.Message)
	if err != nil {
		t.Fatal(err)
	}
	if texts(restored.Thread) != "one|two|three" || restored.Thread[1] != deleted.Message {
		t.Fatalf("after a restore = %+v", restored.Thread)
	}
	// Restoring at the end is the inverse of deleting the last message, a reply's own undo.
	last, err := service.DeleteMessage(note.ID, 2)
	if err != nil {
		t.Fatal(err)
	}
	if restored, err := service.RestoreMessage(note.ID, 2, last.Message); err != nil || texts(restored.Thread) != "one|two|three" {
		t.Fatalf("restore at the end = %+v, %v", restored, err)
	}
}

func TestResolveAndReopen(t *testing.T) {
	service, _, _ := threadService(t)
	query := mustAdd(t, service, "c1", "p1", 19, 28, "ask", "Shrill, or just loud?")
	resolved, err := service.SetStatus(query.ID, StatusResolved)
	if err != nil || resolved.Status != StatusResolved {
		t.Fatalf("resolve = %+v, %v", resolved, err)
	}
	if list := mustList(t, service); list.Marks[0].Status != StatusResolved {
		t.Fatalf("resolved on read = %+v", list.Marks[0])
	}
	reopened, err := service.SetStatus(query.ID, StatusOpen)
	if err != nil || reopened.Status != StatusOpen {
		t.Fatalf("reopen = %+v, %v", reopened, err)
	}
	if _, err := service.SetStatus(query.ID, "closed"); err == nil {
		t.Error("an unknown status was saved")
	}
	note := mustAdd(t, service, "c1", "p2", 0, 3, "note", "")
	if _, err := service.SetStatus(note.ID, StatusResolved); err == nil || !strings.Contains(err.Error(), "only a question") {
		t.Errorf("resolving a note = %v", err)
	}
	if _, err := service.SetStatus("missing", StatusOpen); err == nil {
		t.Error("a missing mark was resolved")
	}
}

func TestThreadTextCapsHold(t *testing.T) {
	service, _, _ := threadService(t)
	note := mustAdd(t, service, "c1", "p1", 0, 3, "note", "")
	if _, err := service.Reply(note.ID, "you", strings.Repeat("a", MaxTextUnits)); err != nil {
		t.Fatalf("a reply at the cap: %v", err)
	}
	// "𝒜" is two UTF-16 units, so this is one over.
	for _, bad := range []string{strings.Repeat("a", MaxTextUnits+1), strings.Repeat("a", MaxTextUnits-1) + "𝒜", "bell\x07", "nul\x00", "<b>ok</b>\x1b[31m"} {
		if _, err := service.Reply(note.ID, "you", bad); err == nil {
			t.Errorf("a reply of %d bytes was saved", len(bad))
		}
		if _, err := service.EditMessage(note.ID, 0, bad); err == nil {
			t.Errorf("an edit of %d bytes was saved", len(bad))
		}
	}
	// Markup is kept as the narrator typed it: plain text, never interpreted.
	if replied, err := service.Reply(note.ID, "you", "<b>ok</b>"); err != nil || replied.Thread[1].Text != "<b>ok</b>" {
		t.Fatalf("plain text = %+v, %v", replied, err)
	}
}

func TestThreadIsValidatedOnRead(t *testing.T) {
	for name, thread := range map[string]string{
		"unknown author": `[{"who":"you","text":"fine","at":"2026-10-11T00:00:00Z"},{"who":"editor","text":"hi","at":"2026-10-11T00:00:00Z"}]`,
		"no text":        `[{"who":"you","text":"","at":"2026-10-11T00:00:00Z"}]`,
		"bad time":       `[{"who":"you","text":"hi","at":"Oct 11"}]`,
		"control":        `[{"who":"you","text":"hi\u0007","at":"2026-10-11T00:00:00Z"}]`,
	} {
		t.Run(name, func(t *testing.T) {
			service, project, _ := threadService(t)
			file := `{"schemaVersion":1,"migratedNotes":true,"types":[{"key":"a","name":"A","colour":"ok","style":"box","asks":false}],"marks":[` +
				`{"id":"good","chapterId":"c1","paragraphId":"p1","start":0,"end":3,"quote":"Off","type":"a","text":"","thread":[],"createdAt":"2026-10-11T00:00:00Z"},` +
				`{"id":"x","chapterId":"c1","paragraphId":"p1","start":0,"end":3,"quote":"Off","type":"a","text":"","thread":` + thread + `,"createdAt":"2026-10-11T00:00:00Z"}]}`
			if err := os.MkdirAll(filepath.Dir(File(project)), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(File(project), []byte(file), 0o600); err != nil {
				t.Fatal(err)
			}
			// The whole file is refused, never half-read: not even the good mark comes back, and the file is kept aside.
			if list := mustList(t, service); len(list.Marks) != 0 || list.Types[0].Key != "stress" {
				t.Fatalf("a file with a bad thread was read: %+v", list)
			}
			if kept, _ := filepath.Glob(File(project) + ".corrupt-*"); len(kept) != 1 {
				t.Fatalf("the file was not kept aside: %v", kept)
			}
		})
	}
}

func TestThreadCallsNeedAProject(t *testing.T) {
	service := New(Config{})
	if _, err := service.Reply("x", "you", "hi"); err == nil {
		t.Error("a reply without a project succeeded")
	}
	if _, err := service.DeleteMessage("x", 0); err == nil {
		t.Error("a delete without a project succeeded")
	}
	if _, err := service.SetStatus("x", StatusOpen); err == nil {
		t.Error("a resolve without a project succeeded")
	}
}

func texts(thread []Message) string {
	parts := make([]string, 0, len(thread))
	for _, message := range thread {
		parts = append(parts, message.Text)
	}
	return strings.Join(parts, "|")
}
