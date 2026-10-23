package main

import "testing"

// The payloads of the two pronunciation-source bindings, the goldens the UI's schemas are checked against: the list with a
// key stored and the default chosen, a candidate that has a pronunciation and one that has nothing.
func TestPronunciationSourcesContractGoldens(t *testing.T) {
	host, _, _ := onlineHost(t)
	withoutWiktextract(host)
	if _, err := host.PronunciationOnlineKeySet(onlineTestKey); err != nil {
		t.Fatal(err)
	}
	payload, err := host.PronunciationSources()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "pronunciation-sources", payload)

	payload, err = host.PronunciationCandidate("croquet", "merriam_webster")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "pronunciation-candidate-ok", payload)

	payload, err = host.PronunciationCandidate("quorlen", "merriam_webster")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "pronunciation-candidate-miss", payload)
}
