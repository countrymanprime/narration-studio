package main

import "testing"

// The payloads of the user dictionary and pronunciation candidate bindings, the goldens the UI's schemas are checked against.
func TestUserDictionaryContractGoldens(t *testing.T) {
	host, _, project := candidatesHost(t)
	mustImport(t, project)
	payload, err := host.UserDictionarySave("Tulgey", "TOOL-gay")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "user-dictionary-entry", payload)
	if _, err := host.UserDictionarySave("Bandersnatch", "BAN-der-snatch"); err != nil {
		t.Fatal(err)
	}
	payload, err = host.UserDictionaryList()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "user-dictionary-list", payload)
	payload, err = host.UserDictionaryRemove("Bandersnatch", "user_dictionary", "BAN-der-snatch")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "user-dictionary-entry-removed", payload)

	payload, err = host.PronunciationCandidates("Tulgey")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "pronunciation-candidates", payload)
	t.Setenv(fakeGuideCandidatesEnv, "")
	payload, err = host.PronunciationCandidates("Quorlen")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "pronunciation-candidates-misses", payload)
}

func TestPronunciationPreviewContractGolden(t *testing.T) {
	rig := newPreviewHost(t, "wav")
	rig.install(t)
	payload, err := rig.host.PronunciationPreview("Tulgey", "ˈtʌlɡi")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "pronunciation-preview-ready", payload)
}
