package recents

import (
	"testing"

	"desktop/internal/contractfile"
)

type openFile string

func (f openFile) Matches(file string) bool { return file == string(f) }

func TestMatchRunningFindsTheLinkedRecentOtherThanTheOpenOne(t *testing.T) {
	entries := []Entry{{Path: "C:/Projects/Alice", Name: "Alice"}, {Path: "C:/Projects/Voltage", Name: "Voltage"}}
	linked := map[string]string{"C:/Projects/Alice": "C:/Daw/alice.rpp", "C:/Projects/Voltage": "C:/Daw/voltage.rpp"}
	lookup := func(folder string) (string, bool) { file, ok := linked[folder]; return file, ok }

	got := MatchRunning(openFile("C:/Daw/voltage.rpp"), "C:/Projects/Alice", entries, lookup)
	if !got.Linked || got.Name != "Voltage" || got.Path != "C:/Projects/Voltage" {
		t.Fatalf("got %#v, want Voltage", got)
	}
	if got := MatchRunning(openFile("C:/Daw/voltage.rpp"), "C:/Projects/Voltage", entries, lookup); got.Linked {
		t.Fatalf("the open project is not offered: %#v", got)
	}
	if got := MatchRunning(openFile("C:/Daw/other.rpp"), "", entries, lookup); got.Linked {
		t.Fatalf("an unlinked file matched: %#v", got)
	}
}

func TestContractProjectRunningDaw(t *testing.T) {
	contractfile.Check(t, "project-running-daw", Running{Linked: true, Path: "C:/Projects/Alice", Name: "Alice"})
	contractfile.Check(t, "project-running-daw-none", Running{})
}
