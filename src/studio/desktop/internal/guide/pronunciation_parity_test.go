package guide

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type pronunciationCase struct {
	Command   string          `json:"command"`
	Start     string          `json:"start"`
	Arguments map[string]any  `json:"arguments"`
	After     json.RawMessage `json:"after"`
	Error     string          `json:"error"`
}

// run calls the Service method the case's sidecar command became.
func (c pronunciationCase) run(s *Service) error {
	id, _ := c.Arguments["entity_id"].(string)
	var aliasIndex *int
	if value, ok := c.Arguments["alias_index"].(float64); ok {
		whole := int(value)
		aliasIndex = &whole
	}
	switch c.Command {
	case "pronounce-user":
		ipa, _ := c.Arguments["ipa"].(string)
		return s.PronounceUser(id, aliasIndex, ipa)
	case "pronunciation-use-alternate":
		return s.UsePronunciationAlternate(id, aliasIndex)
	}
	return fmt.Errorf("no such command %q", c.Command)
}

// TestPronunciationsMatchTheSidecarCases replays every case sidecars/manuscript-guide/tests/test_pronunciation_parity.py recorded from
// the sidecar's pronounce-user and pronunciation-use-alternate: the same file after it, or the same reason with the file untouched (or
// still missing). One Service runs them all, so the held document must notice every new starting file.
func TestPronunciationsMatchTheSidecarCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "pronunciation-parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var recorded struct {
		Starts map[string]json.RawMessage `json:"starts"`
		Cases  []pronunciationCase        `json:"cases"`
	}
	if err := json.Unmarshal(raw, &recorded); err != nil {
		t.Fatal(err)
	}
	if len(recorded.Cases) == 0 {
		t.Fatal("no recorded cases")
	}
	s := hostEditService(t)
	for index, c := range recorded.Cases {
		if err := os.Remove(s.guidePath()); err != nil && !os.IsNotExist(err) {
			t.Fatal(err)
		}
		var start []byte
		if stored := recorded.Starts[c.Start]; string(stored) != "null" {
			start = sidecarText(t, decodeExactly(t, stored))
			if err := os.WriteFile(s.guidePath(), start, 0o600); err != nil {
				t.Fatal(err)
			}
		}
		err := c.run(s)
		written := readOrNone(t, s.guidePath())
		label := fmt.Sprintf("case %d %s %s %q", index, c.Command, c.Start, c.Arguments)
		switch {
		case c.Error != "":
			if err == nil || !sameReason(err.Error(), c.Error) {
				t.Errorf("%s: error = %v, want %q", label, err, c.Error)
			}
			if !bytes.Equal(written, start) {
				t.Errorf("%s: a refused command changed the file", label)
			}
		case err != nil:
			t.Errorf("%s: %v", label, err)
		case !reflect.DeepEqual(decodeExactly(t, written), decodeExactly(t, c.After)):
			t.Errorf("%s: the file differs from the sidecar's\n got: %s\nwant: %s", label, written, c.After)
		}
	}
}

// Two switches put the first pronunciation and its alternate back, through the held document: the file is parsed at the start, after
// another writer changed it (the refusal before that dropped the held document too), and not for the switches.
func TestSwitchingToTheAlternateTwiceComesBack(t *testing.T) {
	s := heldService(t)
	if err := s.PronounceUser("a", nil, "ˈeɪdə"); err != nil {
		t.Fatal(err)
	}
	holder := func() map[string]any { return entityField(t, s, "a", "pronunciation").(map[string]any) }
	typed := holder()
	if err := s.UsePronunciationAlternate("a", nil); err == nil {
		t.Fatal("a pronunciation with nothing of the other kind switched")
	}
	// Give it a dictionary pronunciation to switch with, as a build would, then switch there and back.
	raw, _ := os.ReadFile(s.guidePath())
	raw = bytes.Replace(raw, []byte(`"ipa": "ˈeɪdə",`), []byte(`"ipa": "ˈeɪdə", "alternate": {"ipa": "ˈɑdə", "source": "cmu", "confidence": "high"},`), 1)
	if err := os.WriteFile(s.guidePath(), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := s.UsePronunciationAlternate("a", nil); err != nil {
		t.Fatal(err)
	}
	if got := holder(); got["ipa"] != "ˈɑdə" || got["alternate"].(map[string]any)["ipa"] != "ˈeɪdə" {
		t.Fatalf("after one switch: %v", got)
	}
	if err := s.UsePronunciationAlternate("a", nil); err != nil {
		t.Fatal(err)
	}
	if got := holder(); got["ipa"] != typed["ipa"] || got["source"] != ManualSource || got["alternate"].(map[string]any)["ipa"] != "ˈɑdə" {
		t.Fatalf("after two switches: %v", got)
	}
	if got := s.parses.Load(); got != 2 {
		t.Fatalf("parses = %d, want 2", got)
	}
}
