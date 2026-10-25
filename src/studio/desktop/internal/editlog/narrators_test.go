package editlog

import (
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// leachFile is a file of Eric Leach's on disk, as the host records it after REAPER took it in.
func leachFile(t *testing.T) NarratorFile {
	t.Helper()
	path := filepath.Join(t.TempDir(), "Eric Leach ch1 🎙.mp3")
	if err := os.WriteFile(path, []byte("audio"), 0o600); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	return NarratorFile{Name: filepath.Base(path), Path: path, Size: info.Size(), SHA256: strings.Repeat("a", 64), ModTime: info.ModTime(),
		Daw: "REAPER", Track: "{T-1}", Item: "{I-1}", Length: 796.5}
}

func names(list Narrators) string {
	out := []string{}
	for _, narrator := range list.Narrators {
		out = append(out, narrator.ID+"="+narrator.Name)
	}
	return strings.Join(out, ",")
}

func TestNarratorsAddListRemoveRoundtrip(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if list, err := service.NarratorsList(); err != nil || len(list.Narrators) != 0 {
		t.Fatalf("an empty project lists %+v, %v", list, err)
	}
	added, err := service.NarratorAdd("  Eric Leach ")
	if err != nil || names(added.Narrators) != "n-1=Eric Leach" || strings.Join(added.Changed, ",") != "n-1" {
		t.Fatalf("add = %+v, %v", added, err)
	}
	again, err := service.NarratorAdd("eric leach")
	if err != nil || len(again.Changed) != 0 || len(again.Narrators.Narrators) != 1 {
		t.Fatalf("the same name in another case = %+v, %v", again, err)
	}
	if _, err := service.NarratorAdd("إريك 🎙"); err != nil {
		t.Fatal(err)
	}
	reopened := newService(t, project, &book)
	list, err := reopened.NarratorsList()
	if err != nil || names(list) != "n-1=Eric Leach,n-2=إريك 🎙" {
		t.Fatalf("after a reopen = %+v, %v", list, err)
	}
	removed, err := reopened.NarratorRemove("n-2")
	if err != nil || names(removed.Narrators) != "n-1=Eric Leach" || strings.Join(removed.Changed, ",") != "n-2" {
		t.Fatalf("remove = %+v, %v", removed, err)
	}
	if gone, err := reopened.NarratorRemove("n-9"); err != nil || len(gone.Changed) != 0 {
		t.Fatalf("removing one not there = %+v, %v", gone, err)
	}
}

func TestNarratorNamesAreRefusedOutOfShape(t *testing.T) {
	book := aliceBook()
	service := newService(t, t.TempDir(), &book)
	for _, name := range []string{"", "   ", "Eric | Leach", "Eric\tLeach", "Eric\u0000", strings.Repeat("é", MaxNarratorName+1), string([]byte{0xff})} {
		if _, err := service.NarratorAdd(name); err == nil {
			t.Errorf("%q was added", name)
		}
	}
	if _, err := service.NarratorAdd(strings.Repeat("é", MaxNarratorName)); err != nil {
		t.Errorf("a name of %d characters was refused: %v", MaxNarratorName, err)
	}
	unsaved := newService(t, "", &book)
	if _, err := unsaved.NarratorAdd("Eric"); err == nil {
		t.Error("an unsaved project named a narrator")
	}
}

func TestNarratorFilesAreRecordedFoundAndCheckedAgainstTheDisk(t *testing.T) {
	book := aliceBook()
	service := newService(t, t.TempDir(), &book)
	if _, err := service.NarratorAdd("Eric Leach"); err != nil {
		t.Fatal(err)
	}
	record := leachFile(t)
	change, err := service.NarratorFileAdd("n-1", record)
	if err != nil || strings.Join(change.Changed, ",") != "f-1" {
		t.Fatalf("file add = %+v, %v", change, err)
	}
	view := change.Narrators.Narrators[0].Files[0]
	if view.ID != "f-1" || view.Name != "Eric Leach ch1 🎙.mp3" || view.State != FileOK || view.Length != 796.5 {
		t.Fatalf("file view = %+v", view)
	}
	narrator, stored, ok, err := service.NarratorFileOf("f-1")
	if err != nil || !ok || narrator.Name != "Eric Leach" || stored.Path != record.Path || stored.Item != "{I-1}" {
		t.Fatalf("NarratorFileOf = %+v %+v %v %v", narrator, stored, ok, err)
	}
	if _, _, ok, _ := service.NarratorFileOf("f-9"); ok {
		t.Error("a file that is not recorded was found")
	}
	if _, err := service.NarratorRemove("n-1"); err == nil {
		t.Error("a narrator with a file in the project was removed")
	}
	later := time.Now().Add(time.Hour)
	if err := os.Chtimes(record.Path, later, later); err != nil {
		t.Fatal(err)
	}
	if list, _ := service.NarratorsList(); list.Narrators[0].Files[0].State != FileChanged {
		t.Errorf("a file whose time changed reads %q", list.Narrators[0].Files[0].State)
	}
	if err := os.Remove(record.Path); err != nil {
		t.Fatal(err)
	}
	if list, _ := service.NarratorsList(); list.Narrators[0].Files[0].State != FileMissing {
		t.Errorf("a file that is gone reads %q", list.Narrators[0].Files[0].State)
	}
}

func TestNarratorFileAddRefusesARecordOutOfShape(t *testing.T) {
	book := aliceBook()
	service := newService(t, t.TempDir(), &book)
	if _, err := service.NarratorAdd("Eric Leach"); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*NarratorFile){
		"a relative path":     func(r *NarratorFile) { r.Path = "leach.mp3" },
		"a path with a bar":   func(r *NarratorFile) { r.Path = "/a|b.mp3" },
		"no size":             func(r *NarratorFile) { r.Size = 0 },
		"a short fingerprint": func(r *NarratorFile) { r.SHA256 = "abc" },
		"no DAW":              func(r *NarratorFile) { r.Daw = "" },
		"no track":            func(r *NarratorFile) { r.Track = "" },
		"a zero length":       func(r *NarratorFile) { r.Length = 0 },
		"a length not finite": func(r *NarratorFile) { r.Length = math.Inf(1) },
	} {
		record := leachFile(t)
		change(&record)
		if _, err := service.NarratorFileAdd("n-1", record); err == nil {
			t.Errorf("%s was recorded", name)
		}
	}
	if _, err := service.NarratorFileAdd("n-9", leachFile(t)); err == nil {
		t.Error("a file was recorded for a narrator not on the list")
	}
}

func TestACorruptOrNewerNarratorsFile(t *testing.T) {
	book := aliceBook()
	project := t.TempDir()
	service := newService(t, project, &book)
	writeFile(t, NarratorsFile(project), `{"schemaVersion":1,"narrators":[{"id":"n-1","name":"A|B","files":[]}]}`)
	if list, err := service.NarratorsList(); err != nil || len(list.Narrators) != 0 {
		t.Fatalf("a file that breaks the rules = %+v, %v; want it kept aside and an empty list", list, err)
	}
	writeFile(t, NarratorsFile(project), `{"schemaVersion":99,"narrators":[]}`)
	if _, err := service.NarratorAdd("Eric"); err == nil {
		t.Fatal("a newer app's file was overwritten")
	}
}
