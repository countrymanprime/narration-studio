package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/project"
	"github.com/countrymanprime/narration-utils/shell/internal/recording/recordingtest"
)

func decodeDawChoice(t *testing.T) func(string, error) DawChoice {
	return func(raw string, err error) DawChoice {
		t.Helper()
		if err != nil {
			t.Fatalf("binding error = %v", err)
		}
		var choice DawChoice
		if err := json.Unmarshal([]byte(raw), &choice); err != nil {
			t.Fatalf("payload %q is not JSON: %v", raw, err)
		}
		return choice
	}
}

// choiceHost is a project host acting as Windows, whose REAPER is found (or not) without reading the registry.
func choiceHost(t *testing.T, reaperFound bool) *Host {
	t.Helper()
	host := recorderHost(t, &recordingtest.Fake{})
	host.reaperLocate = func() (string, string, error) {
		if reaperFound {
			return `C:\Program Files\REAPER (x64)\reaper.exe`, "uninstall_registry", nil
		}
		return "", "", errors.New("reaper.exe was not found on this machine")
	}
	host.audacityLocate = func() (string, string, error) {
		return "", "", errors.New("Audacity.exe was not found on this machine")
	}
	return host
}

func option(t *testing.T, choice DawChoice, name string) DawChoiceOption {
	t.Helper()
	for _, o := range choice.Options {
		if o.Daw == name {
			return o
		}
	}
	t.Fatalf("no %s option in %+v", name, choice.Options)
	return DawChoiceOption{}
}

// every-engine-is-listed: Settings > Recording always lists REAPER, Audacity and the built-in recorder, each with its honest
// state, whatever the project records with.
func TestDawChoiceListsEveryEngine(t *testing.T) {
	host := choiceHost(t, false)
	choice := decodeDawChoice(t)(host.DawChoice())
	if len(choice.Options) != 3 || choice.Options[0].Daw != "REAPER" || choice.Options[1].Daw != "Audacity" || choice.Options[2].Daw != "Built-in" {
		t.Fatalf("options = %+v", choice.Options)
	}
	if reaper := option(t, choice, "REAPER"); reaper.Installed == nil || *reaper.Installed {
		t.Errorf("REAPER installed = %v, want false", reaper.Installed)
	}
	if audacity := option(t, choice, "Audacity"); audacity.Installed == nil || *audacity.Installed {
		t.Errorf("Audacity installed = %v, want false", audacity.Installed)
	}
	if builtin := option(t, choice, "Built-in"); builtin.Installed == nil || !*builtin.Installed || builtin.Record["level"] != "experimental" {
		t.Errorf("Built-in = %+v", builtin)
	}
	if choice.Daw != "Built-in" || choice.Source != "default" || choice.State != "app" || choice.Chosen != nil {
		t.Errorf("empty folder: %+v", choice)
	}
	foundHost := choiceHost(t, true)
	foundHost.audacityLocate = func() (string, string, error) {
		return `C:\Program Files\Audacity\Audacity.exe`, "uninstall_registry", nil
	}
	found := decodeDawChoice(t)(foundHost.DawChoice())
	if *option(t, found, "REAPER").Installed != true || *option(t, found, "Audacity").Installed != true {
		t.Error("an engine found by its locator reads as not installed")
	}
}

// rpp-defaults-to-reaper: a Start-menu launch of a folder holding one .rpp is REAPER, not linked, with the file named so the page
// can offer to link it; DawLinkFound links it in one call and the state becomes linked.
func TestAFolderWithOneRppIsREAPERAndLinksInOneCall(t *testing.T) {
	host := choiceHost(t, true)
	rppFolder(t, host)
	choice := decodeDawChoice(t)(host.DawChoice())
	if choice.Daw != "REAPER" || choice.Source != "found" || choice.State != "not_linked" || len(choice.FoundFiles) != 1 || choice.FoundFiles[0] != "Book.rpp" || choice.LinkedFile != nil {
		t.Fatalf("before linking: %+v", choice)
	}
	if record := option(t, choice, "REAPER").Record; record["available"] != false || record["reason"] == nil {
		t.Errorf("REAPER record with no bridge = %v, want a reason", record)
	}
	linked := decodeDawChoice(t)(host.DawLinkFound())
	if linked.Daw != "REAPER" || linked.State != "linked" || linked.LinkedFile == nil || *linked.LinkedFile != "Book.rpp" || linked.Chosen == nil || *linked.Chosen != "REAPER" {
		t.Fatalf("after linking: %+v", linked)
	}
	manifest, ok, err := project.Load(nil, host.config.projectFolder)
	if err != nil || !ok || manifest.DawProjectFile == nil {
		t.Fatalf("manifest = %+v, %v, %v", manifest, ok, err)
	}
	host.chapterSyncEmits.Wait()
}

func TestDawLinkFoundRefusesNoneOrSeveral(t *testing.T) {
	host := choiceHost(t, true)
	if _, err := host.DawLinkFound(); err == nil || !strings.Contains(err.Error(), "no REAPER project file") {
		t.Fatalf("empty folder: %v", err)
	}
	rppFolder(t, host)
	writeFile(t, filepath.Join(host.config.projectFolder, "Book v2.rpp"), "")
	host.dawFolder.forget()
	if _, err := host.DawLinkFound(); err == nil || !strings.Contains(err.Error(), "2 REAPER project files") {
		t.Fatalf("two files: %v", err)
	}
	if choice := decodeDawChoice(t)(host.DawChoice()); choice.Daw != "REAPER" || choice.State != "not_linked" {
		t.Fatalf("two files are still REAPER, not linked: %+v", choice)
	}
}

// explicit-choice-wins: the narrator's choice beats what the folder holds, persists in the project's settings, and switches
// without a restart; a launch's --daw still overrides it while that launch runs.
func TestDawChooseWinsAndPersists(t *testing.T) {
	host := choiceHost(t, true)
	rppFolder(t, host)
	if choice := decodeDawChoice(t)(host.DawChoose("Built-in")); choice.Daw != "Built-in" || choice.Source != "chosen" || choice.State != "app" {
		t.Fatalf("built-in over an .rpp: %+v", choice)
	}
	if host.recordingEngine(host.services()) != engineBuiltin {
		t.Fatal("the record path does not follow the choice")
	}
	raw, err := os.ReadFile(filepath.Join(host.config.projectFolder, "narration-utils", "settings.json"))
	if err != nil || !strings.Contains(string(raw), `"engine": "builtin"`) {
		t.Fatalf("project settings = %s, %v", raw, err)
	}
	if choice := decodeDawChoice(t)(host.DawChoose("Audacity")); choice.Daw != "Audacity" || choice.State != "not_running" {
		t.Fatalf("Audacity: %+v", choice)
	}
	if review := host.services().transcript; review == nil {
		t.Fatal("the project was not attached again for Audacity")
	}
	if choice := decodeDawChoice(t)(host.DawChoose("reaper")); choice.Daw != "REAPER" || choice.Chosen == nil || *choice.Chosen != "REAPER" {
		t.Fatalf("REAPER: %+v", choice)
	}
	if _, err := host.DawChoose("Pro Tools"); err == nil {
		t.Fatal("an unknown engine was saved")
	}
	if _, err := host.DawChoose("none"); err == nil {
		t.Fatal("no engine was saved")
	}
	host.mu.Lock()
	host.config.daw = "Audacity"
	host.mu.Unlock()
	if choice := decodeDawChoice(t)(host.DawChoice()); choice.Daw != "Audacity" || choice.Source != "launch" || *choice.Chosen != "REAPER" {
		t.Fatalf("an Audacity launch: %+v", choice)
	}
}

func TestDawChooseRefusesTheBuiltInRecorderWhereItDoesNotRun(t *testing.T) {
	host := choiceHost(t, true)
	host.platform = "linux"
	if _, err := host.DawChoose("Built-in"); err == nil {
		t.Fatal("chose the built-in recorder off Windows")
	}
	if _, err := NewHost().DawChoose("REAPER"); err == nil {
		t.Fatal("chose without a project")
	}
}

// dawChoiceState: the chip's words for each state of the project's DAW.
func TestDawChoiceState(t *testing.T) {
	host := choiceHost(t, true)
	rppFolder(t, host)
	if state := decodeDawChoice(t)(host.DawChoice()).State; state != "not_linked" {
		t.Fatalf("state = %q", state)
	}
	host.mu.Lock()
	host.config.daw = "REAPER"
	host.reachability = liveReachability()
	host.mu.Unlock()
	if choice := decodeDawChoice(t)(host.DawChoice()); choice.State != "connected" || !choice.Reachable {
		t.Fatalf("live REAPER: %+v", choice)
	}
}

// dawchoice-golden: the payloads for an empty folder (the built-in recorder by default), a folder with one .rpp not yet linked, and
// a linked one. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-choice-*.json.
func TestDawChoiceGoldensAreCurrent(t *testing.T) {
	check := func(name string, host *Host, raw string, err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var decoded map[string]any
		if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, decoded)
	}
	empty := choiceHost(t, true)
	raw, err := empty.DawChoice()
	check("daw-choice-default", empty, raw, err)
	found := choiceHost(t, true)
	rppFolder(t, found)
	raw, err = found.DawChoice()
	check("daw-choice-found", found, raw, err)
	raw, err = found.DawLinkFound()
	check("daw-choice-linked", found, raw, err)
	found.chapterSyncEmits.Wait()
}

// link-by-dialog-chooses-reaper: linking a file through the dialog's path (linkDawFile, as ProjectLinkDawFile does after the
// pick) reads at once, and chooses REAPER over an earlier Audacity choice.
func TestLinkingByTheDialogChoosesREAPER(t *testing.T) {
	host := choiceHost(t, true)
	rppFolder(t, host)
	decodeDawChoice(t)(host.DawChoose("Audacity"))
	if choice := decodeDawChoice(t)(host.DawChoice()); choice.State != "not_running" {
		t.Fatalf("Audacity chosen: %+v", choice)
	}
	if _, err := host.linkPickedDawFile(filepath.Join(host.config.projectFolder, "Book.rpp")); err != nil {
		t.Fatal(err)
	}
	choice := decodeDawChoice(t)(host.DawChoice())
	if choice.Daw != "REAPER" || choice.State != "linked" || choice.LinkedFile == nil || *choice.LinkedFile != "Book.rpp" {
		t.Fatalf("after the dialog's link: %+v", choice)
	}
	host.chapterSyncEmits.Wait()
}
