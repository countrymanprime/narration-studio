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
