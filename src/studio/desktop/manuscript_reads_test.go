package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"desktop/internal/manuscript"
	"desktop/internal/preview"
)

// Every load of the manuscript reads and hashes the whole file, so a binding that loaded it for each chapter read the book
// once per chapter (issue 3896). Each of these reads it the same number of times for a book five times as long.
func TestABindingReadsTheManuscriptAsOftenForALongBookAsForAShortOne(t *testing.T) {
	for _, binding := range []struct {
		name string
		call func(*Host) (string, error)
		want int64 // the reads one call makes today: a lower number is welcome, a higher one needs a reason
	}{
		{"PreviewCandidates", (*Host).PreviewCandidates, 3},
		{"PickupsList", (*Host).PickupsList, 5},
		{"StageRecommendations", (*Host).StageRecommendations, 3},
	} {
		t.Run(binding.name, func(t *testing.T) {
			reads := func(chapters int) int64 {
				host := coverageHost(t, previewBookOf(t, chapters), true, fakeCoverageSidecar(10))
				for i := 1; i <= chapters; i++ { // the recording signal is asked only of a chapter that is being recorded
					if _, err := host.manuscript.SetChapterStatus(fmt.Sprintf("c-%04d", i), "recording"); err != nil {
						t.Fatal(err)
					}
				}
				before := manuscript.Reads()
				if _, err := binding.call(host); err != nil {
					t.Fatal(err)
				}
				return manuscript.Reads() - before
			}
			short, long := reads(5), reads(25)
			if short == 0 || long != short {
				t.Fatalf("%s read the manuscript %d times for 5 chapters and %d for 25, want the same number", binding.name, short, long)
			}
			if short != binding.want {
				t.Fatalf("%s read the manuscript %d times, want %d", binding.name, short, binding.want)
			}
		})
	}
}

// The findings save asks for its manuscript once for a run: the host gives it one book, and nothing at all (never a nil
// book inside the interface) when the manuscript cannot be read.
func TestTheFindingsSaveIsGivenOneBookOrNothing(t *testing.T) {
	text := manuscript.New(previewBook(t))
	before := manuscript.Reads()
	lookup := transcriptManuscript(text)()
	if id, _, ok := lookup.ChapterIDByTitle("Chapter 2"); !ok || id != "c-0002" {
		t.Fatalf("Chapter 2 resolved to %q, %v", id, ok)
	}
	if _, ok := lookup.ParagraphID("c-0002", 0); !ok {
		t.Fatal("c-0002 has no paragraph 0")
	}
	if got := manuscript.Reads() - before; got != 1 {
		t.Fatalf("taking the book and asking it twice read the manuscript %d times, want 1", got)
	}
	if none := transcriptManuscript(manuscript.New(t.TempDir()))(); none != nil {
		t.Fatalf("with no manuscript the lookup is %#v, want nil", none)
	}
}

// Every read binding the pages call, by what it takes. A binding added here is held to the same rule as the three above.
var (
	bookReadBindings = []string{
		"ManuscriptChapters", "ManuscriptReaderState", "ChapterTrackMapList", "ChapterTrackLinks", "ChapterCreateOptions",
		"BookmarksList", "ChapterTagsPreview", "CoverageState", "FindingsSummary", "LineIdentityRead", "LineIdentityState",
		"MarksList", "PickupsList", "PickupsOpenCount", "PickupsCount", "PickupsState", "PreviewCandidates", "PreviewPin",
		"ProductionPlan", "ProductionOverview", "ScriptPrepList", "StageRecommendations", "VoiceSamplesList",
		"ChapterSyncState", "ChapterSyncPreview", "CreditsSetupState", "CreditsRecordedLengths", "CreditsStatuses",
		"CreditsProjectValues", "ExtractionList", "GuideEntities", "TracksList", "EditingState", "CharacterReferences",
		"ChapterFoldersCheck", "ProjectStateCheck", "TranscriptLastCompleted", "GuideDialogueCues", "CharacterListRegions",
		"ExtractionSources", "PickupsListMarkers", "DeliveryProfiles", "RenderConfigState",
	}
	chapterReadBindings = []string{
		"ManuscriptParagraphs", "ManuscriptNotes", "CoverageResult", "WorkspaceAlignment", "CoverageGapReviews",
		"EditingCandidates", "EditingAcceptedList", "EditingCutsList", "PassageMapList", "ProofingRenderState",
		"WorkspaceWordTimes", "ReadAloudReaperState", "ChapterTrackMatch", "BoothVoiceGet", "EditingSourceChoice",
		"EditingStacksList", "EditingReplacementsList",
	}
)

// manuscriptReadsOf calls one binding by name and answers how often it read the manuscript and how it failed, if it did.
func manuscriptReadsOf(t *testing.T, host *Host, project, name string, args ...reflect.Value) string {
	t.Helper()
	method := reflect.ValueOf(host).MethodByName(name)
	if !method.IsValid() || method.Type().NumIn() != len(args) {
		t.Fatalf("%s is not a binding that takes %d arguments: correct the list", name, len(args))
	}
	failure := make(chan string, 1)
	before := manuscript.Reads()
	go func() {
		out := method.Call(args)
		if err, _ := out[len(out)-1].Interface().(error); err != nil {
			failure <- strings.ReplaceAll(err.Error(), project, "")
			return
		}
		failure <- ""
	}()
	select {
	case failed := <-failure:
		return fmt.Sprintf("%d reads, error %q", manuscript.Reads()-before, failed)
	case <-time.After(20 * time.Second):
		t.Fatalf("%s did not answer in 20 seconds", name)
		return ""
	}
}

// The three bindings above were found one at a time. This holds every read binding to the rule: a binding that fails in this
// project still has to fail the same way, after the same number of reads, whatever the length of the book.
func TestNoReadBindingReadsTheManuscriptMoreOftenForALongerBook(t *testing.T) {
	sweep := func(chapters int) map[string]string {
		project := previewBookOf(t, chapters)
		host := coverageHost(t, project, true, fakeCoverageSidecar(10))
		for i := 1; i <= chapters; i++ {
			if _, err := host.manuscript.SetChapterStatus(fmt.Sprintf("c-%04d", i), "recording"); err != nil {
				t.Fatal(err)
			}
		}
		got := map[string]string{}
		for _, name := range bookReadBindings {
			got[name] = manuscriptReadsOf(t, host, project, name)
		}
		for _, name := range chapterReadBindings {
			got[name] = manuscriptReadsOf(t, host, project, name, reflect.ValueOf("c-0002"))
		}
		return got
	}
	short, long := sweep(5), sweep(25)
	for _, name := range slices.Concat(bookReadBindings, chapterReadBindings) {
		if short[name] != long[name] {
			t.Errorf("%s: %s for 5 chapters and %s for 25, want the same", name, short[name], long[name])
		}
	}
}

// A pin is evaluated for one chapter with the book the binding already holds. Given no book, the chapter's check was never
// looked up and the pin lost the pace the candidates list shows for the same chapter.
func TestAPinnedPreviewCarriesItsChaptersAudioEvidence(t *testing.T) {
	host := coverageHost(t, previewBook(t), true, fakeCoverageSidecar(10))
	if _, err := host.PreviewPinSet("c-0001", []string{"p-000001"}); err != nil {
		t.Fatal(err)
	}
	checkRecording(t, host)
	svc := host.services()
	result, err := svc.coverage.Result("c-0001", coverageSettings(svc.settings).Alignment)
	if err != nil {
		t.Fatal(err)
	}
	pace := previewPaceSignal(result)
	if pace.State != preview.AudioMet {
		t.Fatalf("the check gave no pace to carry: %+v", pace)
	}
	payload, err := host.PreviewPin()
	if err != nil {
		t.Fatal(err)
	}
	var pin pinnedPreviewView
	if err := json.Unmarshal([]byte(payload), &pin); err != nil {
		t.Fatal(err)
	}
	if pin.Candidate == nil || !slices.Contains(pin.Candidate.Reasons, "Pace: "+pace.Reason) {
		t.Fatalf("the pin is %s, want the reason %q", payload, "Pace: "+pace.Reason)
	}
}
