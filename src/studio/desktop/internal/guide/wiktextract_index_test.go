package guide

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"desktop/internal/settings"
)

// wiktextractIndexFlag is the flag the sidecar reads the installed Wiktextract index from (manuscript_guide.py main).
const wiktextractIndexFlag = "--wiktextract-index"

// installedIndex is an index path as the root package's resolver answers it once the source is installed and verifies.
func installedIndex(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "wiktextract", "index.json")
}

// writeBuildManuscript puts a manuscript with one name the rules find in the rig's project.
func writeBuildManuscript(t *testing.T, rig previewRig) {
	t.Helper()
	manuscript := `{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c1"}], "paragraphs": [{"id": "p1", "chapterId": "c1", "chapterTitle": "One", "text": "Captain Ada said so."}]}`
	if err := os.MkdirAll(filepath.Dir(rig.service.manuscript()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(rig.service.manuscript(), []byte(manuscript), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestPronounceFromWiktextractGivesTheSidecarTheInstalledIndexAndWritesTheValue(t *testing.T) {
	rig := newPreviewRig(t, "build")
	index := installedIndex(t)
	rig.service.SetWiktextractIndex(func() string { return index })
	if err := rig.service.Pronounce("e1", nil, "wiktextract"); err != nil {
		t.Fatal(err)
	}
	commands := readText(t, rig.log)
	if !strings.HasPrefix(commands, "pronunciation --source wiktextract --words-file ") || !strings.Contains(commands, " "+wiktextractIndexFlag+" "+index) {
		t.Fatalf("the sidecar was asked:\n%s", commands)
	}
	entities, err := rig.service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	value, _ := entities[0]["pronunciation"].(map[string]any)
	if value["ipa"] != "ipa:Dawnspire" || value["chosen"] != true {
		t.Fatalf("pronunciation = %v", entities[0]["pronunciation"])
	}
}

func TestPronounceFromWiktextractWithoutAnInstalledIndexLeavesTheFlagOff(t *testing.T) {
	for name, set := range map[string]func(*Service){
		"never set":     func(*Service) {},
		"not installed": func(s *Service) { s.SetWiktextractIndex(func() string { return "" }) },
	} {
		t.Run(name, func(t *testing.T) {
			rig := newPreviewRig(t, "build")
			set(rig.service)
			if err := rig.service.Pronounce("e1", nil, "wiktextract"); err != nil {
				t.Fatal(err)
			}
			if commands := readText(t, rig.log); strings.Contains(commands, wiktextractIndexFlag) {
				t.Fatalf("the sidecar was given an index that is not installed:\n%s", commands)
			}
		})
	}
}

// Another named source never reads the index, so it is not resolved or passed for one.
func TestPronounceFromAnotherSourceDoesNotAskForTheIndex(t *testing.T) {
	rig := newPreviewRig(t, "build")
	asked := 0
	rig.service.SetWiktextractIndex(func() string { asked++; return installedIndex(t) })
	if err := rig.service.Pronounce("e1", nil, "cmu"); err != nil {
		t.Fatal(err)
	}
	if commands := readText(t, rig.log); strings.Contains(commands, wiktextractIndexFlag) || asked != 0 {
		t.Fatalf("asked for the index %d times; the sidecar was asked:\n%s", asked, commands)
	}
}

func TestCandidateFromWiktextractGivesTheSidecarTheInstalledIndex(t *testing.T) {
	rig := newPreviewRig(t, "candidate")
	index := installedIndex(t)
	rig.service.SetWiktextractIndex(func() string { return index })
	if _, err := rig.service.Candidate("Wren", "wiktextract"); err != nil {
		t.Fatal(err)
	}
	if _, err := rig.service.Candidate("Wren", "cmu"); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(readText(t, rig.log)), "\n")
	if len(lines) != 2 || lines[0] != "candidate --word=Wren --source wiktextract "+wiktextractIndexFlag+" "+index || lines[1] != "candidate --word=Wren --source cmu" {
		t.Fatalf("the sidecar was asked:\n%s", strings.Join(lines, "\n"))
	}
}

func TestCandidateFromWiktextractWithoutAnInstalledIndexLeavesTheFlagOff(t *testing.T) {
	rig := newPreviewRig(t, "candidate")
	rig.service.SetWiktextractIndex(func() string { return "" })
	if _, err := rig.service.Candidate("Wren", "wiktextract"); err != nil {
		t.Fatal(err)
	}
	if commands := readText(t, rig.log); strings.Contains(commands, wiktextractIndexFlag) {
		t.Fatalf("the sidecar was asked:\n%s", commands)
	}
}

// The automatic pronunciations (a build's, and a create's or an alias edit's) try every source, Wiktextract among them, so each is given
// the index when it is installed and nothing when it is not.
func TestTheAutomaticPronunciationsCarryTheIndexOnlyWhenItIsInstalled(t *testing.T) {
	for _, model := range []string{RulesOnly, "en_core_web_sm"} {
		for _, installed := range []bool{true, false} {
			t.Run(model+map[bool]string{true: " installed", false: " not installed"}[installed], func(t *testing.T) {
				rig := newPreviewRig(t, "build")
				writeBuildManuscript(t, rig)
				index := ""
				if installed {
					index = installedIndex(t)
				}
				rig.service.SetWiktextractIndex(func() string { return index })
				if _, err := rig.service.Build(filepath.Join(t.TempDir(), "progress"), filepath.Join(t.TempDir(), "log"), model); err != nil {
					t.Fatal(err)
				}
				commands := strings.TrimSpace(readText(t, rig.log))
				command := map[string]string{RulesOnly: "pronunciation --words-file ", "en_core_web_sm": "entities --manuscript "}[model]
				if !strings.HasPrefix(commands, command) || strings.Contains(commands, "\n") {
					t.Fatalf("the sidecar was asked:\n%s", commands)
				}
				if got := strings.Contains(commands, " "+wiktextractIndexFlag+" "+index); got != installed || (!installed && strings.Contains(commands, wiktextractIndexFlag)) {
					t.Fatalf("installed %v; the sidecar was asked:\n%s", installed, commands)
				}
			})
		}
	}
}

func TestTheLookupOfANewNameCarriesTheIndexOnlyWhenItIsInstalled(t *testing.T) {
	root := t.TempDir()
	s := New(root, "unused", "", settings.New(root, root), nil)
	if got := s.lookupArgs([]string{"Wren"}); slices.Contains(got, wiktextractIndexFlag) {
		t.Fatalf("lookup without an index: %#v", got)
	}
	index := installedIndex(t)
	s.SetWiktextractIndex(func() string { return index })
	got := s.lookupArgs([]string{"Wren"})
	if at := slices.Index(got, wiktextractIndexFlag); at < 0 || at+1 >= len(got) || got[at+1] != index {
		t.Fatalf("lookup with an index: %#v", got)
	}
}
