package main

import (
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
)

// The payloads the UI's extraction schemas are checked against: the list with one suggestion of each kind and each
// status, the list of a project with none, and what an accept answers.
func TestExtractionContractGoldens(t *testing.T) {
	payload, err := (&Host{}).ExtractionList()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "extraction-list-empty", payload)

	host, _ := extractionHost(t)
	payload, err = host.ExtractionAccept(suggestionAbout(t, host, "Rabbit").ID, nil)
	checkBindingContract(t, "extraction-accept", payload)
	if decision := decodeDecision(t)(payload, err); decision.Suggestion.Status != extraction.StatusAccepted {
		t.Fatalf("accept = %s", payload)
	}
	decodeDecision(t)(host.ExtractionReject(suggestionAbout(t, host, "The Dodo").ID))

	payload, err = host.ExtractionList()
	checkBindingContract(t, "extraction-list", payload)
	statuses := map[extraction.Status]bool{}
	kinds := map[extraction.Kind]bool{}
	for _, s := range decodeSuggestions(t)(payload, err) {
		statuses[s.Status], kinds[s.Kind] = true, true
	}
	if len(statuses) != 4 || len(kinds) != 6 {
		t.Fatalf("the golden list lacks a kind or a status: %v %v", statuses, kinds)
	}
}
