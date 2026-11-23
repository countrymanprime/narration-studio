package main

import "testing"

func TestTheChapterListHoldsTheCreditsOpeningFirstAndClosingLast(t *testing.T) {
	host := stagesHost(t, 5)
	list := decodeChaptersAndCredits(t, host)
	if len(list) != 3 || list[0]["id"] != "credits-opening" || list[1]["id"] != "c-0001" || list[2]["id"] != "credits-closing" {
		t.Fatalf("list = %v", list)
	}
	for _, credits := range []map[string]any{list[0], list[2]} {
		if credits["isCredits"] != true || credits["contentKind"] != "narration" || credits["wordCount"].(float64) == 0 || credits["status"] != "not_started" {
			t.Fatalf("credits entry = %v", credits)
		}
	}
	if _, marked := list[1]["isCredits"]; marked {
		t.Fatalf("a manuscript chapter is not marked: %v", list[1])
	}
}

func TestACreditsChapterTakesItsStatusThroughTheChapterBindingAndKeepsItOnTheManifest(t *testing.T) {
	host := stagesHost(t, 5)
	answer := decodeAnswer(t)(host.ManuscriptSetChapterStatus("credits-closing", "editing"))
	if answer["id"] != "credits-closing" || answer["status"] != "editing" {
		t.Fatalf("answer = %v", answer)
	}
	statuses := decodeAnswer(t)(host.CreditsStatuses())
	if statuses["closing"] != "editing" {
		t.Fatalf("manifest statuses = %v", statuses)
	}
	if list := decodeChaptersAndCredits(t, host); list[2]["status"] != "editing" || list[1]["status"] != "recording" {
		t.Fatalf("list = %v", list)
	}
	if _, err := host.ManuscriptSetChapterStatus("credits-closing", "bogus"); err == nil {
		t.Fatal("an unknown status is refused")
	}
}

func TestTheStageEngineLeavesTheCreditsOut(t *testing.T) {
	host := stagesHost(t, 5)
	for _, chapter := range stageChapters(t, host) {
		if id, _ := chapter["chapterId"].(string); id == "credits-opening" || id == "credits-closing" {
			t.Fatalf("stage recommendations hold %v", chapter)
		}
	}
}

func TestACreditsChapterTitleResolvesForTheTakesWorkspace(t *testing.T) {
	host := stagesHost(t, 5)
	title, err := manuscriptChapterTitle(host.services(), "credits-opening")
	if err != nil || title != "Opening credits" {
		t.Fatalf("title = %q, %v", title, err)
	}
}

// The credits provider is bound to the project its service was configured for (#4040): a list read from project A's service after
// the host switched to B still carries A's credit statuses and A's credit values, not B's.
func TestAServiceReadAfterAProjectSwitchKeepsItsOwnProjectsCredits(t *testing.T) {
	host := stagesHost(t, 5)
	if _, err := host.CreditsSaveProjectValues("Alice", "", "Lewis Carroll", "", "", "", "", "", "", "Ada Finch"); err != nil {
		t.Fatal(err)
	}
	if _, err := host.CreditsSetStatus("closing", "finalized"); err != nil {
		t.Fatal(err)
	}
	svcA := host.services().manuscript
	creditsRows := func() map[string]map[string]any {
		t.Helper()
		list, err := svcA.Chapters()
		if err != nil {
			t.Fatal(err)
		}
		rows := map[string]map[string]any{}
		for _, row := range list {
			if id, _ := row["id"].(string); id == "credits-opening" || id == "credits-closing" {
				rows[id] = row
			}
		}
		if len(rows) != 2 {
			t.Fatalf("credits rows = %v", rows)
		}
		return rows
	}
	before := creditsRows()

	host.mu.Lock()
	next := host.config
	next.projectFolder, next.projectName = t.TempDir(), "B"
	attached, reason := host.attachProjectLocked(next)
	host.mu.Unlock()
	if !attached {
		t.Fatalf("attach B failed: %s", reason)
	}
	t.Cleanup(func() { host.waitForBackground(); host.closeRetention() })
	if _, err := host.CreditsSaveProjectValues("The Hitchhiker's Guide to the Galaxy and Beyond", "", "Douglas Noel Adams", "", "", "", "", "", "", "Someone Else Entirely"); err != nil {
		t.Fatal(err)
	}
	if _, err := host.CreditsSetStatus("closing", "editing"); err != nil {
		t.Fatal(err)
	}

	after := creditsRows()
	for _, id := range []string{"credits-opening", "credits-closing"} {
		if after[id]["status"] != before[id]["status"] || after[id]["wordCount"] != before[id]["wordCount"] {
			t.Fatalf("%s read from A's service after the switch = %v, want A's %v", id, after[id], before[id])
		}
	}
	if after["credits-closing"]["status"] != "finalized" {
		t.Fatalf("closing status = %v, want finalized (A's)", after["credits-closing"]["status"])
	}
	// B differs from A, so the assertions above can tell the two projects apart, and the switch built a new service.
	if host.services().manuscript == svcA {
		t.Fatal("the switch kept A's service")
	}
	if b := host.creditTokens()["Title"]; b == "Alice" {
		t.Fatalf("project B's title = %q, want B's own", b)
	}
}
