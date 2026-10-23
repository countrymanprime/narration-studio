package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
	"github.com/countrymanprime/narration-utils/shell/internal/voicesample"
)

const (
	voiceCharacter = "entity-ab12cd34ef56"
	voiceTake      = "{TAKE-1}"
)

// sineWAV is seconds of a 200 Hz tone at 8 kHz, 16-bit mono: a zero every 20 frames, so a cut at a multiple of 20 frames stays put.
func sineWAV(seconds int) []byte {
	const rate = 8000
	var data bytes.Buffer
	for i := 0; i < seconds*rate; i++ {
		_ = binary.Write(&data, binary.LittleEndian, int16(math.Round(0.5*math.Sin(2*math.Pi*200*float64(i)/rate)*32767)))
	}
	var out bytes.Buffer
	out.WriteString("RIFF")
	_ = binary.Write(&out, binary.LittleEndian, uint32(36+data.Len()))
	out.WriteString("WAVEfmt ")
	for _, value := range []any{uint32(16), uint16(1), uint16(1), uint32(rate), uint32(rate * 2), uint16(2), uint16(16)} {
		_ = binary.Write(&out, binary.LittleEndian, value)
	}
	out.WriteString("data")
	_ = binary.Write(&out, binary.LittleEndian, uint32(data.Len()))
	out.Write(data.Bytes())
	return out.Bytes()
}

// voiceSamplesHost is coverageProject with a real recording, a take GUID and a finished, aligned recording check of chapter
// c-0001: "Alice." heard from 0 to 0.5 s of item {ITEM-1}.
func voiceSamplesHost(t *testing.T) (*Host, string) {
	t.Helper()
	project := coverageProject(t)
	writeNested(t, filepath.Join(project, "media", "take.wav"), string(sineWAV(6)))
	rpp, err := os.ReadFile(filepath.Join(project, "book.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	withTake := strings.Replace(string(rpp), "      SOFFS 0\n", "      SOFFS 0\n      GUID "+voiceTake+"\n", 1)
	writeNested(t, filepath.Join(project, "book.rpp"), withTake)
	host := coverageHost(t, project, true, fakeAlignedCoverageSidecar())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()
	return host, project
}

// currentRecordID is the id of the chapter's current recording check, the one a page's word times come from.
func currentRecordID(t *testing.T, host *Host) string {
	t.Helper()
	svc := host.services()
	result, err := svc.coverage.Result("c-0001", coverageSettings(svc.settings).Alignment)
	if err != nil || !result.Current() {
		t.Fatalf("result = %+v, %v", result, err)
	}
	return result.Result.RecordID
}

func aliceRequest(record, character string) voicesample.MarkRequest {
	return voicesample.MarkRequest{
		ChapterID: "c-0001", ItemGUID: "{ITEM-1}", TakeGUID: voiceTake, SourceStart: 0, SourceEnd: 0.5,
		StartKey: "p-000001:0", EndKey: "p-000001:0", CharacterID: character, Label: "Alice, calm", Note: "Before the rabbit hole.", AlignmentRecordID: record,
	}
}

func decodeVoiceAnswer(t *testing.T, payload string, err error) voiceSampleAnswer {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
	var answer voiceSampleAnswer
	if err := json.Unmarshal([]byte(payload), &answer); err != nil {
		t.Fatalf("%v: %s", err, payload)
	}
	return answer
}

func decodeVoiceList(t *testing.T, payload string, err error) voicesample.List {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
	var list voicesample.List
	if err := json.Unmarshal([]byte(payload), &list); err != nil {
		t.Fatalf("%v: %s", err, payload)
	}
	return list
}

// The bindings' payloads, the goldens the UI's schemas are checked against: an empty list, a saved mark, a refused mark, the list
// with two samples, an update that saved, an update that was refused, the list after a primary change, a remove, a remove-all and
// the live event.
func TestVoiceSamplesContractGoldens(t *testing.T) {
	host, _ := voiceSamplesHost(t)
	record := currentRecordID(t, host)

	payload, err := host.VoiceSamplesList()
	checkBindingContract(t, "voice-samples-list-empty", payload)
	if list := decodeVoiceList(t, payload, err); len(list.Samples) != 0 || list.Limits.PerCharacter != 20 {
		t.Fatalf("empty list = %s", payload)
	}

	payload, err = host.VoiceSampleMark(aliceRequest(record, voiceCharacter))
	checkBindingContract(t, "voice-sample-mark", payload)
	first := decodeVoiceAnswer(t, payload, err)
	if first.Status != "saved" || first.Sample == nil || !first.Sample.Primary || first.Sample.DurationMs != 650 || first.Sample.ClipState != voicesample.ClipOK {
		t.Fatalf("mark = %s", payload)
	}

	payload, err = host.VoiceSampleMark(aliceRequest("an-older-record", voiceCharacter))
	checkBindingContract(t, "voice-sample-mark-refused", payload)
	if refused := decodeVoiceAnswer(t, payload, err); refused.Status != "refused" || refused.Reason != voicesample.ReasonStaleAlignment || refused.Sample != nil || refused.Message == "" {
		t.Fatalf("refused mark = %s", payload)
	}

	second := voiceAnswerOf(t)(host.VoiceSampleMark(aliceRequest(record, voicesample.NarrationCharacterID)))
	third := aliceRequest(record, voiceCharacter)
	third.Label = ""
	third.SourceStart = 0.5
	third.SourceEnd = 1
	third.Note = ""
	// Words 0 to 0 only exist once: the second range of the same character is the same word, a different range of the take.
	thirdAnswer := voiceAnswerOf(t)(host.VoiceSampleMark(third))
	if thirdAnswer.Status != "saved" || thirdAnswer.Sample.Primary {
		t.Fatalf("a second sample of a character took the primary mark: %+v", thirdAnswer)
	}
	payload, err = host.VoiceSamplesList()
	checkBindingContract(t, "voice-samples-list", payload)
	list := decodeVoiceList(t, payload, err)
	if len(list.Samples) != 3 || list.Totals.Count != 3 || list.Samples[0].CharacterID != voiceCharacter || !list.Samples[0].Primary {
		t.Fatalf("list = %s", payload)
	}

	payload, err = host.VoiceSampleUpdate(thirdAnswer.Sample.ID, voicesample.Change{CharacterID: voiceCharacter, Label: "Alice, tired", Note: "Late in the chapter."})
	checkBindingContract(t, "voice-sample-update", payload)
	if updated := decodeVoiceAnswer(t, payload, err); updated.Status != "saved" || updated.Sample.Label != "Alice, tired" {
		t.Fatalf("update = %s", payload)
	}
	payload, err = host.VoiceSampleUpdate(strings.Repeat("a", 32), voicesample.Change{CharacterID: voiceCharacter})
	checkBindingContract(t, "voice-sample-update-refused", payload)
	if refused := decodeVoiceAnswer(t, payload, err); refused.Status != "refused" || refused.Reason != voicesample.ReasonNotFound {
		t.Fatalf("refused update = %s", payload)
	}

	payload, err = host.VoiceSampleSetPrimary(thirdAnswer.Sample.ID)
	checkBindingContract(t, "voice-samples-set-primary", payload)
	for _, sample := range decodeVoiceList(t, payload, err).Samples {
		if sample.CharacterID == voiceCharacter && sample.Primary != (sample.ID == thirdAnswer.Sample.ID) {
			t.Fatalf("after set primary = %s", payload)
		}
	}

	payload, err = host.VoiceSampleRemove(thirdAnswer.Sample.ID)
	checkBindingContract(t, "voice-samples-removed", payload)
	if err != nil {
		t.Fatal(err)
	}
	var removed voicesample.Removed
	if err := json.Unmarshal([]byte(payload), &removed); err != nil || removed.Removed != 1 || removed.Bytes <= 0 {
		t.Fatalf("removed = %s, %v", payload, err)
	}
	// The primary went, so the character's remaining sample is promoted.
	if list := voiceListOf(t)(host.VoiceSamplesList()); !list.Samples[0].Primary || list.Samples[0].ID != first.Sample.ID {
		t.Fatalf("after the primary was removed = %+v", list.Samples)
	}
	payload, err = host.VoiceSamplesRemoveAll()
	checkBindingContract(t, "voice-samples-removed-all", payload)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(payload), &removed); err != nil || removed.Removed != 2 {
		t.Fatalf("removed all = %s, %v", payload, err)
	}
	_ = second

	event, err := contractfile.Stabilize(voiceSamplesChanged{Revision: 4})
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "voice-samples-changed", event)
}

// The sentence of every refusal reason, as the host words it. The page refuses a few reasons before it asks and shows the host's
// sentence for the rest, so src/studio/ui/src/api/contracts/voiceSamples.ts keeps a table of the same words; this golden is what a test of
// that table compares against, so a rewording here cannot leave the page saying something else.
func TestVoiceSampleRefusalSentencesGolden(t *testing.T) {
	sentences := map[string]string{}
	for _, reason := range voicesample.Reasons() {
		sentences[string(reason)] = (&voicesample.Refusal{Reason: reason}).Sentence()
	}
	payload, err := json.Marshal(sentences)
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "voice-sample-refusal-sentences", string(payload))
}

func voiceAnswerOf(t *testing.T) func(string, error) voiceSampleAnswer {
	return func(payload string, err error) voiceSampleAnswer { return decodeVoiceAnswer(t, payload, err) }
}

func voiceListOf(t *testing.T) func(string, error) voicesample.List {
	return func(payload string, err error) voicesample.List { return decodeVoiceList(t, payload, err) }
}

func TestVoiceSampleEventsCountEveryChangeAndNothingElse(t *testing.T) {
	host, _ := voiceSamplesHost(t)
	record := currentRecordID(t, host)
	revision := func() int64 { return host.voiceSamplesRevision.Load() }

	if _, err := host.VoiceSamplesList(); err != nil || revision() != 0 {
		t.Fatalf("a read changed the revision to %d: %v", revision(), err)
	}
	if answer := voiceAnswerOf(t)(host.VoiceSampleMark(aliceRequest("old", voiceCharacter))); answer.Status != "refused" || revision() != 0 {
		t.Fatalf("a refused mark changed the revision to %d", revision())
	}
	saved := voiceAnswerOf(t)(host.VoiceSampleMark(aliceRequest(record, voiceCharacter)))
	if revision() != 1 {
		t.Fatalf("revision after a mark = %d", revision())
	}
	if _, err := host.VoiceSampleSetPrimary(saved.Sample.ID); err != nil || revision() != 2 {
		t.Fatalf("revision after a primary = %d, %v", revision(), err)
	}
	if _, err := host.VoiceSampleRemove(strings.Repeat("c", 32)); err != nil || revision() != 2 {
		t.Fatalf("removing nothing changed the revision to %d: %v", revision(), err)
	}
	if _, err := host.VoiceSampleRemove(saved.Sample.ID); err != nil || revision() != 3 {
		t.Fatalf("revision after a remove = %d, %v", revision(), err)
	}
	if _, err := host.VoiceSamplesRemoveAll(); err != nil || revision() != 3 {
		t.Fatalf("removing all of nothing changed the revision to %d: %v", revision(), err)
	}
}

// The page gets the words and a state for where a sample came from, never the audio file's path or the item and take GUIDs.
func TestVoiceSampleAnswersNeverCarryAPathOrAGUID(t *testing.T) {
	host, project := voiceSamplesHost(t)
	record := currentRecordID(t, host)
	marked, err := host.VoiceSampleMark(aliceRequest(record, voiceCharacter))
	if err != nil {
		t.Fatal(err)
	}
	listed, err := host.VoiceSamplesList()
	if err != nil {
		t.Fatal(err)
	}
	for name, payload := range map[string]string{"mark": marked, "list": listed} {
		for _, secret := range []string{"{ITEM-1}", voiceTake, "itemGuid", "takeGuid", "sourceFile", "take.wav", filepath.ToSlash(project), "sha256", "sourceStart"} {
			if strings.Contains(payload, secret) || strings.Contains(payload, strings.ReplaceAll(secret, `\`, `\\`)) {
				t.Errorf("%s payload carries %q: %s", name, secret, payload)
			}
		}
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(listed), &decoded); err != nil {
		t.Fatal(err)
	}
	source := decoded["samples"].([]any)[0].(map[string]any)["source"].(map[string]any)
	if source["state"] != "ok" || source["text"] != "Alice." || source["chapterTitle"] != "Chapter One" {
		t.Fatalf("source = %v", source)
	}
}

// Words the narrator cut stay in the recording the check heard; a sample that would copy them back is refused.
func TestVoiceSampleMarkIsRefusedOverAWordTheNarratorCut(t *testing.T) {
	host, _ := voiceSamplesHost(t)
	record := currentRecordID(t, host)
	undo := 0
	cut := editlog.CutRequest{
		ParagraphID: "p-000001", Keys: []string{"p-000001:0"}, Text: "Alice.", A: 0, B: 0.5, Off0: 0, Off1: 0.5,
		Mode: editlog.CutClose, FadeMs: 6, Daw: "built-in", GUID: "c-0001/0-0", UndoSteps: &undo,
	}
	if _, err := host.EditingCutRecord("c-0001", cut); err != nil {
		t.Fatal(err)
	}
	answer := voiceAnswerOf(t)(host.VoiceSampleMark(aliceRequest(record, voiceCharacter)))
	if answer.Status != "refused" || answer.Reason != voicesample.ReasonSpansCut {
		t.Fatalf("answer = %+v", answer)
	}
}

func TestVoiceSampleMarkIsRefusedWhenTheCheckIsStale(t *testing.T) {
	host, project := voiceSamplesHost(t)
	record := currentRecordID(t, host)
	// The manuscript changed after the chapter was checked.
	writeNested(t, filepath.Join(project, "narration-utils", "manuscript", "manuscript.json"),
		`{"schemaVersion":1,"documentId":"doc-1","chapters":[{"id":"c-0001","title":"Chapter One","contentKind":"narration"}],"paragraphs":[{"id":"p-000001","chapterId":"c-0001","index":0,"text":"Alice, again."}]}`)
	answer := voiceAnswerOf(t)(host.VoiceSampleMark(aliceRequest(record, voiceCharacter)))
	if answer.Status != "refused" || answer.Reason != voicesample.ReasonStaleAlignment {
		t.Fatalf("answer = %+v", answer)
	}
}

func TestVoiceSamplesWithNoProjectAreEmptyAndRefuseAMark(t *testing.T) {
	host := NewHost()
	list := voiceListOf(t)(host.VoiceSamplesList())
	if len(list.Samples) != 0 {
		t.Fatalf("list = %+v", list)
	}
	if _, err := host.VoiceSampleMark(aliceRequest("record", voiceCharacter)); err == nil {
		t.Fatal("a sample was marked with no project")
	}
	if removed, err := host.VoiceSamplesRemoveAll(); err != nil || removed == "" {
		t.Fatalf("remove all = %q, %v", removed, err)
	}
}

func TestClearProjectDataRemovesVoiceSamples(t *testing.T) {
	host, project := voiceSamplesHost(t)
	record := currentRecordID(t, host)
	voiceAnswerOf(t)(host.VoiceSampleMark(aliceRequest(record, voiceCharacter)))
	before := host.voiceSamplesRevision.Load()
	if _, err := host.ManuscriptClearProjectData(true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(voicesample.Dir(project)); !os.IsNotExist(err) {
		t.Fatalf("voice samples survived Clear project data: %v", err)
	}
	if host.voiceSamplesRevision.Load() != before+1 {
		t.Fatal("the page was not told the samples are gone")
	}
}

// VoiceSamples.storage accepts only project until the DAW label is built (phase 6): a save of daw or both is refused, and a
// hand-edited file that holds either reads as project.
func TestVoiceSamplesStorageSettingAcceptsOnlyProject(t *testing.T) {
	host, project := voiceSamplesHost(t)
	store := host.services().settings
	if value, source := store.Effective("VoiceSamples", "storage", ""); value != "project" || source != "repo_default" {
		t.Fatalf("storage = %q from %s", value, source)
	}
	for _, choice := range []string{"daw", "both", "", "elsewhere"} {
		if err := host.saveSettings("VoiceSamples", "project", map[string]*string{"storage": &choice}); err == nil {
			t.Errorf("saved storage = %q", choice)
		}
	}
	project1 := "project"
	if err := host.saveSettings("VoiceSamples", "project", map[string]*string{"storage": &project1}); err != nil {
		t.Fatal(err)
	}
	writeNested(t, filepath.Join(project, "narration-utils", "settings.json"), `{"VoiceSamples":{"storage":"daw"}}`)
	if value, _ := store.Effective("VoiceSamples", "storage", ""); value != "project" {
		t.Fatalf("a hand-edited daw reads as %q", value)
	}
}

// A Story Bible merge takes the absorbed entry's voice samples with it, and an undo of the merge gives them back; the page hears
// of each change only when something moved.
func TestAStoryBibleMergeMovesTheSamplesAndItsUndoMovesThemBack(t *testing.T) {
	host, _ := voiceSamplesHost(t)
	record := currentRecordID(t, host)
	const survivor, undo = "entity-0123456789ab", "00000000000000a1"
	revision := func() int64 { return host.voiceSamplesRevision.Load() }
	owners := func() map[string]int {
		counts := map[string]int{}
		for _, sample := range voiceListOf(t)(host.VoiceSamplesList()).Samples {
			counts[sample.CharacterID]++
		}
		return counts
	}
	if answer := voiceAnswerOf(t)(host.VoiceSampleMark(aliceRequest(record, voiceCharacter))); answer.Status != "saved" {
		t.Fatalf("mark = %+v", answer)
	}
	before := revision()

	host.followMerge(undo, "entity-with-no-samples", survivor)
	if revision() != before {
		t.Fatalf("a merge that moved nothing changed the revision to %d", revision())
	}
	host.followMerge(undo, voiceCharacter, survivor)
	if got := owners(); got[survivor] != 1 || got[voiceCharacter] != 0 || revision() != before+1 {
		t.Fatalf("after the merge: owners %v, revision %d", got, revision())
	}
	host.followMerge(undo, voiceCharacter, survivor)
	if revision() != before+1 {
		t.Fatalf("a repeated merge changed the revision to %d", revision())
	}

	host.unfollowMerge("00000000000000b2")
	if revision() != before+1 {
		t.Fatalf("the undo of another merge changed the revision to %d", revision())
	}
	host.unfollowMerge(undo)
	if got := owners(); got[voiceCharacter] != 1 || got[survivor] != 0 || revision() != before+2 {
		t.Fatalf("after the undo: owners %v, revision %d", got, revision())
	}
}

// With no project open there is nowhere the samples could be: a merge is not an error for them, and nothing is reported.
func TestAStoryBibleMergeWithNoProjectOpenLeavesTheSamplesAlone(t *testing.T) {
	host := &Host{}
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("following a merge with no project open panicked: %v", r)
		}
	}()
	host.followMerge("00000000000000a1", "a", "b")
	host.unfollowMerge("00000000000000a1")
}
