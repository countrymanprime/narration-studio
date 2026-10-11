package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
)

var at = time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)

func conf(f float64) *float64 { return &f }

func ctx() Context {
	return Context{
		At: at,
		Paragraphs: []extraction.Paragraph{
			{ID: "p1", ChapterID: "c1", Text: "The Rabbit was late, and “very” tired."},
			{ID: "p2", ChapterID: "c1", Text: "😀 Alice yawned."},
			{ID: "p3", ChapterID: "c2", Text: "The Dodo spoke slowly."},
		},
		Bible: Bible{{ID: "rabbit", Name: "White Rabbit", Aliases: []string{"Rabbit"}}, {ID: "alice", Name: "Alice"}},
	}
}

func property(entry, key, value string) Payload {
	return Payload{Kind: extraction.KindProperty, Entry: entry, Key: key, Value: value}
}

func newService(t *testing.T) (*Service, string) {
	t.Helper()
	project := t.TempDir()
	return New(Config{Project: project}), project
}

func ingest(t *testing.T, s *Service, raws ...Raw) Result {
	t.Helper()
	result, err := s.Ingest(SourceRules, raws, ctx())
	if err != nil {
		t.Fatalf("Ingest: %v", err)
	}
	return result
}

func list(t *testing.T, s *Service) []Suggestion {
	t.Helper()
	got, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	return got
}

func TestStoredStatusFollowsTheRuleAtIngest(t *testing.T) {
	s, _ := newService(t)
	quote := []Quote{{Text: "was late"}}
	result := ingest(t, s,
		Raw{Payload: property("Rabbit", "Habit", "Late"), Confidence: conf(0.75), Quotes: quote},
		Raw{Payload: property("Rabbit", "Habit", "Tired"), Confidence: conf(0.74), Quotes: quote},
		Raw{Payload: property("Rabbit", "Habit", "Fast"), Quotes: quote},
		Raw{Payload: property("Rabbit", "Habit", "Quiet"), Confidence: conf(0.9), Quotes: []Quote{{Text: "never said"}}},
		Raw{Payload: property("Rabbit", "Habit", "Calm"), Confidence: conf(0.9)},
		Raw{Payload: Payload{Kind: extraction.KindClaim, Entry: "Rabbit", Claim: extraction.ClaimAct, Text: "Hurries"}, Confidence: conf(0.9)},
		Raw{Payload: Payload{Kind: extraction.KindSpeaker, Quote: "very", Speaker: "Alice"}, Confidence: conf(0.9)},
		Raw{Payload: property("Zed", "Habit", "Odd"), Confidence: conf(0.9), Quotes: quote},
		Raw{Payload: Payload{Kind: extraction.KindEntry, Name: "The Dodo"}, Confidence: conf(0.9)},
	)
	want := []struct {
		status extraction.Status
		reason string
	}{
		{extraction.StatusAcceptedAuto, ""},
		{extraction.StatusNeedsVerification, string(extraction.ReasonLowConfidence)},
		{extraction.StatusNeedsVerification, string(extraction.ReasonNoConfidence)},
		{extraction.StatusNeedsVerification, string(extraction.ReasonQuoteNotFound)},
		{extraction.StatusNeedsVerification, string(extraction.ReasonNoEvidence)},
		{extraction.StatusNeedsVerification, string(extraction.ReasonNoEvidence)},
		{extraction.StatusNeedsVerification, string(extraction.ReasonNoEvidence)},
		{extraction.StatusNeedsVerification, string(extraction.ReasonUnknownEntry)},
		{extraction.StatusAcceptedAuto, ""},
	}
	if len(result.Added) != len(want) {
		t.Fatalf("added %d, want %d", len(result.Added), len(want))
	}
	for i, w := range want {
		got := result.Added[i]
		if got.Status != w.status || got.Reason != w.reason {
			t.Errorf("row %d: %s %q, want %s %q", i, got.Status, got.Reason, w.status, w.reason)
		}
	}
	if id := result.Added[0].EntryID; id == nil || *id != "rabbit" {
		t.Errorf("entry id = %v", id)
	}
	if got := list(t, s); len(got) != len(want) || got[0].Source != SourceRules {
		t.Errorf("stored %d, source %q", len(got), got[0].Source)
	}
}

func TestQuoteOffsetsComeFromTheText(t *testing.T) {
	s, _ := newService(t)
	raw := Raw{Payload: property("Alice", "Act", "Yawns"), Confidence: conf(0.9), Quotes: []Quote{{ParagraphID: "p3", Text: "Alice yawned"}}}
	got := ingest(t, s, raw).Added[0]
	// The hint names p3, which lacks the quote; the book search finds it in p2 after the emoji (2 units) and a space.
	if len(got.Evidence) != 1 || got.Evidence[0] != (Evidence{ParagraphID: "p2", Start: 3, End: 15, Text: "Alice yawned"}) {
		t.Fatalf("evidence = %+v", got.Evidence)
	}
	chapter := Raw{Payload: property("Alice", "Act", "Sleeps"), Confidence: conf(0.9), ChapterID: "c2", Quotes: []Quote{{Text: "Dodo"}}}
	if ev := ingest(t, s, chapter).Added[0].Evidence; len(ev) != 1 || ev[0].ParagraphID != "p3" || ev[0].Start != 4 || ev[0].End != 8 {
		t.Fatalf("chapter evidence = %+v", ev)
	}
	hinted := Raw{Payload: property("Alice", "Act", "Waits"), Confidence: conf(0.9), Quotes: []Quote{{ParagraphID: "p1", Text: "“very”"}}}
	if ev := ingest(t, s, hinted).Added[0].Evidence; len(ev) != 1 || ev[0].ParagraphID != "p1" || ev[0].Text != "“very”" {
		t.Fatalf("hinted evidence = %+v", ev)
	}
}

func TestSameThingOfferedTwiceIsStoredOnce(t *testing.T) {
	s, _ := newService(t)
	first := ingest(t, s, Raw{Payload: property("Rabbit", "Habit", "Is late"), Confidence: conf(0.9), Quotes: []Quote{{Text: "was late"}}}).Added[0]
	again := ingest(t, s, Raw{Payload: property("  rabbit ", "HABIT", "is   LATE"), Confidence: conf(0.2)})
	if len(again.Added) != 0 || len(again.Skipped) != 1 {
		t.Fatalf("second ingest = %+v", again)
	}
	curly := ingest(t, s, Raw{Payload: property("Rabbit", "Habit", "Is “late”")}, Raw{Payload: property("Rabbit", "Habit", "Is \"late\"")})
	if len(curly.Added) != 1 || len(curly.Skipped) != 1 {
		t.Fatalf("typographic quotes: added %d, skipped %d", len(curly.Added), len(curly.Skipped))
	}
	got := list(t, s)
	if len(got) != 2 || got[0].ID != first.ID {
		t.Fatalf("stored = %+v", got)
	}
}

func TestRejectedIsATombstone(t *testing.T) {
	s, _ := newService(t)
	added := ingest(t, s, Raw{Payload: property("Rabbit", "Habit", "Is late"), Confidence: conf(0.9), Quotes: []Quote{{Text: "was late"}}}).Added[0]
	if _, err := s.Reject(added.ID); err != nil {
		t.Fatal(err)
	}
	got := list(t, s)
	if len(got) != 1 || got[0].Status != extraction.StatusRejected || got[0].Fp != added.Fp {
		t.Fatalf("tombstone = %+v", got)
	}
	// Edited text that keeps the fingerprint is still the same thing.
	if again := ingest(t, s, Raw{Payload: property("RABBIT", "habit", "IS LATE"), Confidence: conf(0.99)}); len(again.Added) != 0 {
		t.Fatalf("offered again: %+v", again.Added)
	}
	if other := ingest(t, s, Raw{Payload: property("Rabbit", "Habit", "Is early")}); len(other.Added) != 1 {
		t.Fatalf("a different thing was dropped")
	}
	// An accepted edit changes the payload, not the first fingerprint: the first wording stays recognised.
	second := list(t, s)[1]
	edited := property("Rabbit", "Habit", "Is rarely early")
	if _, err := s.Accept(second.ID, &edited); err != nil {
		t.Fatal(err)
	}
	if again := ingest(t, s, Raw{Payload: property("Rabbit", "Habit", "Is early")}, Raw{Payload: edited}); len(again.Added) != 0 {
		t.Fatalf("an edited suggestion was offered again: %+v", again.Added)
	}
}

func TestDecisionsAreStateChangesOnly(t *testing.T) {
	s, _ := newService(t)
	added := ingest(t, s,
		Raw{Payload: property("Rabbit", "Habit", "A"), Confidence: conf(0.9), Quotes: []Quote{{Text: "was late"}}},
		Raw{Payload: property("Rabbit", "Habit", "B"), Confidence: conf(0.3), Quotes: []Quote{{Text: "was late"}}},
		Raw{Payload: property("Rabbit", "Habit", "C"), Confidence: conf(0.3)},
		Raw{Payload: Payload{Kind: extraction.KindClaim, Entry: "Rabbit", Claim: extraction.ClaimTalk, Text: "Speaks fast"}, Confidence: conf(0.3)},
	).Added
	auto, low, rej, claim := added[0], added[1], added[2], added[3]

	previous, err := s.Review(auto.ID)
	if err != nil || previous.Status != extraction.StatusAcceptedAuto {
		t.Fatalf("Review = %+v, %v", previous, err)
	}
	if _, err := s.Review(low.ID); err == nil || !strings.Contains(err.Error(), " ") {
		t.Fatalf("Review of a needs-verification one = %v", err)
	}
	previous, err = s.Accept(low.ID, nil)
	if err != nil || previous.Status != extraction.StatusNeedsVerification || previous.Reason == "" {
		t.Fatalf("Accept = %+v, %v", previous, err)
	}
	edited := Payload{Kind: extraction.KindClaim, Entry: "Rabbit", Claim: extraction.ClaimTalk, Text: "Speaks fast and high"}
	if _, err := s.Accept(claim.ID, &edited); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Accept(claim.ID, &Payload{Kind: extraction.KindAlias, Entry: "Rabbit", Alias: "R"}); err == nil {
		t.Fatal("the kind changed")
	}
	if _, err := s.Reject(rej.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Accept(rej.ID, nil); err == nil || !strings.Contains(err.Error(), " ") {
		t.Fatalf("Accept of a rejected one = %v", err)
	}
	if _, err := s.Reject("s99"); err == nil {
		t.Fatal("a missing id was rejected")
	}
	got := list(t, s)
	for i, want := range []extraction.Status{extraction.StatusAccepted, extraction.StatusAccepted, extraction.StatusRejected, extraction.StatusAccepted} {
		if got[i].Status != want {
			t.Errorf("row %d status %s, want %s", i, got[i].Status, want)
		}
	}
	if got[3].Payload.Text != "Speaks fast and high" || got[0].Evidence[0] != added[0].Evidence[0] || got[0].Fp != added[0].Fp || got[1].Reason != "" {
		t.Errorf("a decision changed more than the status: %+v", got)
	}
	// The previous value puts it back.
	if err := s.Restore(previous); err != nil {
		t.Fatal(err)
	}
	if now := list(t, s)[1]; now.Status != extraction.StatusNeedsVerification || now.Reason != previous.Reason {
		t.Errorf("restored = %+v", now)
	}
}

func TestSettleAttachesWaitingClaims(t *testing.T) {
	s, _ := newService(t)
	claim := Payload{Kind: extraction.KindClaim, Entry: "Zed", Claim: extraction.ClaimKnow, Text: "Knows a secret"}
	added := ingest(t, s,
		Raw{Payload: claim, Confidence: conf(0.9), Quotes: []Quote{{Text: "was late"}}},
		Raw{Payload: property("Zed", "Habit", "Odd"), Confidence: conf(0.9), Quotes: []Quote{{Text: "was late"}}},
		Raw{Payload: property("Zed", "Habit", "Even"), Confidence: conf(0.9), Quotes: []Quote{{Text: "was late"}}},
	).Added
	if added[0].Status != extraction.StatusNeedsVerification || !strings.Contains(added[0].Reason, "not in the Story Bible") || added[0].EntryID != nil {
		t.Fatalf("waiting claim = %+v", added[0])
	}
	if _, err := s.Accept(added[1].ID, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Reject(added[2].ID); err != nil {
		t.Fatal(err)
	}
	changed, err := s.Settle(Bible{{ID: "zed", Name: "Zed"}})
	if err != nil || len(changed) != 1 {
		t.Fatalf("Settle = %+v, %v", changed, err)
	}
	got := list(t, s)
	if got[0].EntryID == nil || *got[0].EntryID != "zed" || got[0].Status != extraction.StatusAcceptedAuto || got[0].Reason != "" {
		t.Errorf("claim after settle = %+v", got[0])
	}
	if got[1].EntryID != nil || got[1].Status != extraction.StatusAccepted || got[2].EntryID != nil || got[2].Status != extraction.StatusRejected {
		t.Errorf("a decided suggestion was touched: %+v %+v", got[1], got[2])
	}
	if changed, err := s.Settle(Bible{{ID: "zed", Name: "Zed"}}); err != nil || len(changed) != 0 {
		t.Errorf("a second settle changed %+v, %v", changed, err)
	}
}

func TestFileIsNarratorData(t *testing.T) {
	s, project := newService(t)
	path := File(project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := list(t, s); len(got) != 0 {
		t.Fatalf("corrupt file listed %d", len(got))
	}
	matches, _ := filepath.Glob(path + ".corrupt-*")
	if len(matches) != 1 {
		t.Fatalf("corrupt file kept aside: %v", matches)
	}
	ingest(t, s, Raw{Payload: property("Rabbit", "Habit", "A")})
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("temporary file left behind: %v", err)
	}
	var file fileData
	data, _ := os.ReadFile(path)
	if err := json.Unmarshal(data, &file); err != nil || file.Version != Version || len(file.Suggestions) != 1 {
		t.Fatalf("written file = %s (%v)", data, err)
	}

	newer := []byte(`{"version": 2, "suggestions": []}`)
	if err := os.WriteFile(path, newer, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.List(); err == nil {
		t.Fatal("a newer version was read")
	}
	if _, err := s.Ingest(SourceRules, []Raw{{Payload: property("Rabbit", "Habit", "B")}}, ctx()); err == nil {
		t.Fatal("a newer version was written over")
	}
	if after, _ := os.ReadFile(path); string(after) != string(newer) {
		t.Errorf("newer file changed: %s", after)
	}
}

func valid() Suggestion {
	return Suggestion{ID: "s1", Kind: extraction.KindProperty, Payload: property("Rabbit", "Habit", "Late"), Evidence: []Evidence{{ParagraphID: "p1", Start: 0, End: 3, Text: "The"}},
		Confidence: conf(0.8), Source: SourceRules, Status: extraction.StatusAccepted, Fp: "property|rabbit|habit|late", CreatedAt: at}
}

func encode(t *testing.T, suggestions ...Suggestion) []byte {
	t.Helper()
	data, err := json.Marshal(fileData{Version: Version, Suggestions: suggestions})
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestReadChecksEveryField(t *testing.T) {
	if _, err := decode(encode(t, valid())); err != nil {
		t.Fatalf("a valid file was refused: %v", err)
	}
	cases := map[string]func(*Suggestion){
		"unknown kind":        func(s *Suggestion) { s.Kind = "thing"; s.Payload.Kind = "thing" },
		"unknown status":      func(s *Suggestion) { s.Status = "done" },
		"unknown source":      func(s *Suggestion) { s.Source = "oracle" },
		"confidence above 1":  func(s *Suggestion) { s.Confidence = conf(1.5) },
		"confidence below 0":  func(s *Suggestion) { s.Confidence = conf(-0.1) },
		"offset past quote":   func(s *Suggestion) { s.Evidence[0].End = 9 },
		"negative offset":     func(s *Suggestion) { s.Evidence[0].Start, s.Evidence[0].End = -1, 2 },
		"payload of a kind":   func(s *Suggestion) { s.Payload = Payload{Kind: extraction.KindAlias, Entry: "x", Alias: "y"} },
		"payload missing":     func(s *Suggestion) { s.Payload.Value = "" },
		"payload stray field": func(s *Suggestion) { s.Payload.Speaker = "Alice" },
		"bad claim": func(s *Suggestion) {
			s.Kind = extraction.KindClaim
			s.Payload = Payload{Kind: extraction.KindClaim, Entry: "x", Claim: "shout", Text: "y"}
		},
		"no id":            func(s *Suggestion) { s.ID = "" },
		"no fingerprint":   func(s *Suggestion) { s.Fp = "" },
		"unknown flag":     func(s *Suggestion) { s.Flag = "mine" },
		"field too long":   func(s *Suggestion) { s.Note = strings.Repeat("x", MaxFieldBytes+1) },
		"payload too long": func(s *Suggestion) { s.Payload.Value = strings.Repeat("x", MaxFieldBytes+1) },
	}
	for name, mutate := range cases {
		s := valid()
		mutate(&s)
		_, err := decode(encode(t, s))
		if err == nil || !strings.Contains(err.Error(), "suggestion") && !strings.Contains(err.Error(), "payload") {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	if _, err := decode(encode(t, valid(), valid())); err == nil || !strings.Contains(err.Error(), "twice") {
		t.Errorf("repeated id: %v", err)
	}
	many := make([]Suggestion, 0, MaxSuggestions+1)
	for i := 0; i <= MaxSuggestions; i++ {
		many = append(many, Suggestion{ID: "s"})
	}
	if _, err := decode(encode(t, many...)); err == nil || !strings.Contains(err.Error(), "more than") {
		t.Errorf("too many: %v", err)
	}
	if _, err := decode(make([]byte, MaxFileBytes+1)); err == nil || !strings.Contains(err.Error(), "limit") {
		t.Errorf("too large: %v", err)
	}
	// A file that breaks a rule loads nothing and is kept aside, as a corrupt one is.
	s, project := newService(t)
	bad := valid()
	bad.Status = "done"
	if err := os.MkdirAll(filepath.Dir(File(project)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(File(project), encode(t, valid(), bad), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := list(t, s); len(got) != 0 {
		t.Errorf("a file breaking a rule loaded %d", len(got))
	}
}

func TestCapsCoverTheImporter(t *testing.T) {
	// The importer's own limits, repeated here so a change to either shows up; the import of its largest file must fit.
	const importerRows, importerFieldBytes = 5000, 8 << 10
	if MaxSuggestions < importerRows || MaxFieldBytes < importerFieldBytes {
		t.Fatalf("caps %d / %d are under the importer's %d / %d", MaxSuggestions, MaxFieldBytes, importerRows, importerFieldBytes)
	}
}

func TestIngestRefusesWhatBreaksARuleAndStoresNothing(t *testing.T) {
	s, _ := newService(t)
	good := Raw{Payload: property("Rabbit", "Habit", "A")}
	for name, bad := range map[string]Raw{
		"confidence": {Payload: property("Rabbit", "Habit", "B"), Confidence: conf(2)},
		"payload":    {Payload: Payload{Kind: extraction.KindProperty, Entry: "Rabbit"}},
		"long quote": {Payload: property("Rabbit", "Habit", "C"), Quotes: []Quote{{Text: strings.Repeat("q", MaxFieldBytes+1)}}},
	} {
		if _, err := s.Ingest(SourceRules, []Raw{good, bad}, ctx()); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	if _, err := s.Ingest("oracle", []Raw{good}, ctx()); err == nil {
		t.Error("an unknown source was accepted")
	}
	if got := list(t, s); len(got) != 0 {
		t.Errorf("stored %d after refusals", len(got))
	}
}

func TestNoProjectStoresNothing(t *testing.T) {
	s := New(Config{})
	if got, err := s.List(); err != nil || len(got) != 0 {
		t.Errorf("List = %v, %v", got, err)
	}
	if _, err := s.Ingest(SourceRules, []Raw{{Payload: property("a", "b", "c")}}, ctx()); err == nil {
		t.Error("ingest without a project")
	}
}

func TestTextThatLooksLikeAPathOrMarkupIsData(t *testing.T) {
	s, project := newService(t)
	evil := "../../etc/passwd <script>alert(1)</script> https://example.test/x ${HOME} `rm -rf /` [x](file:///etc/hosts)"
	raw := Raw{Payload: Payload{Kind: extraction.KindProperty, Entry: "Rabbit", Key: evil, Value: evil}, Confidence: conf(0.9), Quotes: []Quote{{ParagraphID: "../p1", Text: evil}}, ChapterID: "../c1", Note: evil}
	got := ingest(t, s, raw).Added[0]
	if got.Payload.Value != evil || got.Note != evil || got.UnverifiedQuote != evil {
		t.Fatalf("stored = %+v", got)
	}
	if reread := list(t, s); len(reread) != 1 || reread[0].Payload.Key != evil {
		t.Fatalf("read back = %+v", reread)
	}
	entries, _ := os.ReadDir(project)
	if len(entries) != 1 || entries[0].Name() != "ManuscriptGuide" {
		t.Errorf("project folder = %v", entries)
	}
}
