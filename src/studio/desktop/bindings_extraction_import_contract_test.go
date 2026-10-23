package main

import (
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/apply"
	"github.com/countrymanprime/narration-utils/shell/internal/extraction/store"
)

// The payloads the UI's import schemas are checked against: the preview of a file with every action and a row error, the preview of a
// file refused before parsing with a row that cannot be read, what a commit answers, what its undo answers, and the JSON prompt.
func TestExtractionImportContractGoldens(t *testing.T) {
	host, bible := importHost(t)
	payload, err := host.ExtractionImportPreview(importFile, "")
	checkBindingContract(t, "extraction-import-preview", payload)
	if plan := decodeImportPlan(t)(payload, err); len(plan.Lines) == 0 || len(plan.Errors) == 0 {
		t.Fatalf("the golden preview lacks lines or errors: %s", payload)
	}

	bad := "record,name,confidence\nentry,Bill,lots\nproperty,Nobody\n"
	payload, err = host.ExtractionImportPreview(bad, "csv")
	checkBindingContract(t, "extraction-import-preview-errors", payload)
	if plan := decodeImportPlan(t)(payload, err); len(plan.Lines) != 0 || len(plan.Errors) < 2 {
		t.Fatalf("the golden error preview = %s", payload)
	}

	payload, err = host.ExtractionImportCommit(importFile, "")
	checkBindingContract(t, "extraction-import-commit", payload)
	result := decodeImportResult(t)(payload, err)
	if len(result.Suggestions) == 0 || len(result.EntryIDs) == 0 {
		t.Fatalf("the golden commit = %s", payload)
	}

	// A scan's claim about the entry the import made attaches to it; the undo takes the entry and the claim waits again.
	scanned, err := host.extractionStore().Ingest(store.SourceRules, []store.Raw{{Payload: store.Payload{Kind: extraction.KindClaim, Entry: "The Cheshire Cat",
		Claim: extraction.ClaimTalk, Text: "Speaks in riddles"}, Confidence: extractionConfidence(0.9), Quotes: extractionQuote("p-000001", "Oh dear!")}},
		store.Context{Paragraphs: extractionParagraphs, Bible: storeBibleOf(bible.Entities), At: time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := apply.New(host.extractionStore(), bible).Settle(); err != nil {
		t.Fatal(err)
	}
	payload, err = host.ExtractionImportUndo(importedIDs(result))
	checkBindingContract(t, "extraction-import-undo", payload)
	undone := decodeImportUndo(t)(payload, err)
	if len(undone.Removed) == 0 || len(undone.EntryIDs) == 0 || len(undone.Settled) != 1 || undone.Settled[0].ID != scanned.Added[0].ID ||
		undone.Settled[0].EntryID != nil || undone.Settled[0].Applied != nil {
		t.Fatalf("the golden undo = %s", payload)
	}

	payload, err = host.ExtractionImportPrompt("json")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "extraction-import-prompt", payload)
}
