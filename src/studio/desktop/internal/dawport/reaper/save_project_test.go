package reaper

import (
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

func saverAnswering(t *testing.T, answer func(command []string) [][]string) dawport.ProjectSaver {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	return adapter.Role(dawport.CapSaveProject).(dawport.ProjectSaver)
}

func TestSaveProjectIsAnExperimentalNonDestructiveCommandOfItsOwnCapability(t *testing.T) {
	if declares[dawport.CapSaveProject] != dawport.Experimental || !bridge.Experimental("save_project") ||
		commandCapability["save_project"] != dawport.CapSaveProject || depthOf(dawport.CapSaveProject).Destructive {
		t.Fatal("save_project must be an Experimental, non-destructive command of the save_project capability")
	}
}

func TestSaveProjectSendsTheLinkedFileAndSaysWhatWasSaved(t *testing.T) {
	saver := saverAnswering(t, func(command []string) [][]string {
		if command[0] != "save_project" || len(command) != 3 || command[2] != "C:/Books/Book.rpp" {
			t.Errorf("command = %v", command)
		}
		return [][]string{{"SAVED", command[1], "3", "1"}}
	})
	got, err := saver.SaveProject(t.Context(), "C:/Books/Book.rpp")
	if err != nil || !got.OK || got.Changed || got.UndoSteps != 0 || got.Message != "Saved the project in REAPER: 3 tracks and 1 item." {
		t.Fatalf("SaveProject = %+v, %v", got, err)
	}
}

func TestSaveProjectRefusalsAreSentencesNotErrors(t *testing.T) {
	never := "This REAPER project has never been saved, and saving it would open a file dialog in REAPER. Save it once in REAPER (File > Save project), then read again."
	for _, test := range []struct{ name, answer, want string }{
		{"never saved", never, never},
		{"recording", "REAPER is recording. Stop recording first.", "REAPER is recording. Stop recording first."},
		{"older script", "Unsupported workspace command", messageSaveOutdated},
		{"read only", "REAPER could not save the project. Its file may be read-only or its folder may be missing.", "REAPER could not save the project. Its file may be read-only or its folder may be missing."},
	} {
		saver := saverAnswering(t, func(command []string) [][]string { return [][]string{{"ERROR", command[1], test.answer}} })
		got, err := saver.SaveProject(t.Context(), "Book.rpp")
		if err != nil || got.OK || got.Refused != test.want || got.Message != test.want {
			t.Errorf("%s: SaveProject = %+v, %v; want a refusal %q", test.name, got, err, test.want)
		}
	}
}

func TestSaveProjectWithoutALinkedFileSendsNothing(t *testing.T) {
	saver := saverAnswering(t, func(command []string) [][]string {
		t.Errorf("sent %v with no linked file", command)
		return nil
	})
	got, err := saver.SaveProject(t.Context(), "")
	if err != nil || got.OK || got.Refused != messageSaveNoFile {
		t.Fatalf("SaveProject = %+v, %v", got, err)
	}
}

func TestSaveProjectAsksTheCapabilityFirst(t *testing.T) {
	adapter, _ := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonUnsupported, Message: "off"}}
	})
	saver := adapter.Role(dawport.CapSaveProject).(dawport.ProjectSaver)
	got, err := saver.SaveProject(t.Context(), "Book.rpp")
	if err != nil || got.OK || got.Refused != "off" {
		t.Fatalf("SaveProject = %+v, %v; want the capability's sentence", got, err)
	}
}

func TestSavedMessageCountsOneAndMany(t *testing.T) {
	if got := savedMessage(bridge.ProjectSaved{Tracks: 1, Items: 0}); !strings.Contains(got, "1 track and 0 items") {
		t.Fatalf("savedMessage = %q", got)
	}
}
