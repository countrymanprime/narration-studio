package main

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/recording/recordingtest"
)

// The two bindings' payloads, the goldens the UI's schema is checked against: a recorded run stamped with the built-in
// recorder's take name, and a chapter's list after a re-import removed a paragraph, with the marks on it stale.
func TestPassageMapContractGoldens(t *testing.T) {
	host := recorderHost(t, &recordingtest.Fake{})
	recorderOf(t)(host.RecorderChooseEngine(engineBuiltin))
	recorderOf(t)(host.RecorderStart("Mic"))
	recorderOf(t)(host.RecorderStop())
	waitRecorderIdle(t, host)

	payload, err := host.PassageMapRecordRun("c-0001", passageMapRun())
	checkBindingContract(t, "passagemap-record", payload)
	decodePassageMarks(t)(payload, err)

	// The narrator re-imports without a reset and the first paragraph is gone: the start and the roll (whose previous
	// place was in it) are stale, never moved; the stop still fits.
	edited := strings.Replace(previewManuscriptOK, `{"id":"p-000001","chapterId":"c-0001","index":0,"text":"Alice walked through the forest, alone with her thoughts."},`, "", 1)
	writeNested(t, filepath.Join(host.config.projectFolder, "narration-utils", "manuscript", "manuscript.json"), edited)
	payload, err = host.PassageMapList("c-0001")
	checkBindingContract(t, "passagemap-list", payload)
	list := decodePassageMarks(t)(payload, err)
	if len(list) != 3 || !list[0].Stale || !list[1].Stale || list[2].Stale || list[0].StaleReason != "paragraph_missing" {
		t.Fatalf("list = %s", payload)
	}
}
