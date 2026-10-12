package main

import (
	"testing"
)

// The payloads the UI's import schemas are checked against: the preview of a file with every action and a row error, the preview of a
// file refused before parsing with a row that cannot be read, what a commit answers, and the JSON prompt.
func TestExtractionImportContractGoldens(t *testing.T) {
	host, _ := importHost(t)
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
	if result := decodeImportResult(t)(payload, err); len(result.Suggestions) == 0 || len(result.EntryIDs) == 0 {
		t.Fatalf("the golden commit = %s", payload)
	}

	payload, err = host.ExtractionImportPrompt("json")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "extraction-import-prompt", payload)
}
