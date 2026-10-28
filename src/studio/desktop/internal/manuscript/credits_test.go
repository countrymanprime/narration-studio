package manuscript

import "testing"

func ids(chapters []map[string]any) []string {
	out := []string{}
	for _, chapter := range chapters {
		out = append(out, text(chapter, "id"))
	}
	return out
}

func TestTheCreditsAreChaptersOpeningFirstAndClosingLast(t *testing.T) {
	service, _, _ := importReaderFixture(t)
	plain, err := service.Chapters()
	if err != nil {
		t.Fatal(err)
	}
	service.SetCredits(func() []CreditsChapter {
		return []CreditsChapter{{Kind: "closing", Words: 12, Status: "recording"}, {Kind: "opening", Words: 40}}
	})
	service.SetRecordedLengths(func() map[string]RecordedLength {
		return map[string]RecordedLength{OpeningCreditsID: {Seconds: 31.5}, ClosingCreditsID: {Unavailable: RecordedUnlinked}}
	})
	for _, list := range [][]map[string]any{mustChapters(t, service.Chapters), mustChapters(t, service.ChaptersUnmeasured)} {
		got := ids(list)
		if len(got) != len(plain)+2 || got[0] != OpeningCreditsID || got[len(got)-1] != ClosingCreditsID {
			t.Fatalf("ids = %v", got)
		}
		if !IsCredits(list[0]) || IsCredits(list[1]) || !IsCredits(list[len(list)-1]) {
			t.Fatalf("isCredits marks wrong in %v", got)
		}
	}
	list := mustChapters(t, service.Chapters)
	if list[0]["wordCount"] != 40 || list[0]["recordedSeconds"] != 31.5 || list[0]["status"] != "not_started" {
		t.Fatalf("opening = %#v", list[0])
	}
	closing := list[len(list)-1]
	if closing["status"] != "recording" || closing["recordedUnavailable"] != "unlinked" {
		t.Fatalf("closing = %#v", closing)
	}
	if !IsCreditsID(OpeningCreditsID) || IsCreditsID("c1") {
		t.Fatal("IsCreditsID")
	}
}

func TestACreditsFileIsListedOnlyWhenTheProviderHasIt(t *testing.T) {
	service, _, _ := importReaderFixture(t)
	service.SetCredits(func() []CreditsChapter { return []CreditsChapter{{Kind: "closing"}} })
	got := ids(mustChapters(t, service.Chapters))
	if got[len(got)-1] != ClosingCreditsID || got[0] == OpeningCreditsID {
		t.Fatalf("ids = %v", got)
	}
}

func TestAnImportedOpeningCreditsChapterStandsInForTheOpeningEntry(t *testing.T) {
	for title, owns := range map[string]bool{"Opening Credits": true, "Intro credits!": true, "Dedication": false, "Opening Credits and Thanks": false} {
		if got := ownsOpeningCredits([]map[string]any{{"contentKind": "opening", "title": title}}); got != owns {
			t.Errorf("%q: %v", title, got)
		}
	}
	if ownsOpeningCredits([]map[string]any{{"contentKind": "narration", "title": "Opening Credits"}}) {
		t.Error("a narration chapter is not the credits")
	}
}

func mustChapters(t *testing.T, read func() ([]map[string]any, error)) []map[string]any {
	t.Helper()
	list, err := read()
	if err != nil {
		t.Fatal(err)
	}
	return list
}
