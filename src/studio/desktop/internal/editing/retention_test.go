package editing

import (
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
	"time"

	"desktop/internal/evidence"
	"desktop/internal/tracks"
)

// retentionKeys is the keys of this package's analyzers.
var retentionKeys = map[string]evidence.RetentionKey{
	AnalyzerSilence: ItemRetentionKey, AnalyzerClick: ItemRetentionKey, AnalyzerBreath: ItemRetentionKey,
	AnalyzerEditingRender: RenderRetentionKey,
}

var retentionStart = time.Date(2026, 5, 1, 8, 0, 0, 0, time.UTC)

// mixedOutcome is one of the three outcomes, picked by a seed and a position, so a loop over seeds covers every mix of
// its first three positions.
func mixedOutcome(seed, position int) evidence.LedgerOutcome {
	outcomes := []evidence.LedgerOutcome{evidence.LedgerComplete, evidence.LedgerPartial, evidence.LedgerFailed}
	for range position % 3 {
		seed /= 3
	}
	return outcomes[(seed+position/3)%3]
}

func retainAll(t *testing.T, ledger *evidence.LedgerStore, keys map[string]evidence.RetentionKey) []evidence.LedgerRecord {
	t.Helper()
	dropped, err := ledger.Retain(keys, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	return dropped
}

// CurrentItemRecord answers the same for every item and class before Retain and after it: a ledger of two items that
// share a GUID and a third, each analysed several times with every mix of outcomes, in two chapters.
func TestRetainLeavesCurrentItemRecordItsAnswer(t *testing.T) {
	first, second := twinScopes()
	third := scopeFor(itemWith(func(item *tracks.Item, _ *tracks.Take) { item.GUID, item.Position = "solo", 60 }))
	elsewhere := third
	elsewhere.ChapterID = "chapter-2"
	scopes := []ItemScopeInput{first, second, third, elsewhere}
	analyzers := []string{AnalyzerSilence, AnalyzerClick, AnalyzerBreath}

	dropped := 0
	for seed := range 27 {
		ledger := evidence.NewLedgerStore(t.TempDir())
		at := retentionStart
		for pass := range 4 {
			for index, scope := range scopes {
				for _, analyzer := range analyzers {
					at = at.Add(time.Second)
					if _, err := WriteLedgerRecord(ledger, analyzer, "v1", "params-1", scope, evidence.LedgerProjectFile{}, at, at, mixedOutcome(seed, pass+index), nil); err != nil {
						t.Fatal(err)
					}
				}
			}
		}
		// A record no reader of this package matches: its scope names two items.
		if _, err := ledger.Write(evidence.LedgerRecord{ID: "two-items", AnalyzerID: AnalyzerSilence, Outcome: evidence.LedgerComplete, StartedAt: at.Add(time.Hour),
			Scope: evidence.LedgerScope{DocumentID: "doc-1", ChapterID: "chapter-1", ItemGUIDs: []string{"dup", "solo"}}}); err != nil {
			t.Fatal(err)
		}

		read := func() map[string]ItemStaleness {
			answers := map[string]ItemStaleness{}
			for index, scope := range scopes {
				for _, analyzer := range analyzers {
					staleness, err := CurrentItemRecord(ledger, analyzer, "v1", "params-1", scope)
					if err != nil {
						t.Fatal(err)
					}
					answers[fmt.Sprintf("%s item %d", analyzer, index)] = staleness
				}
			}
			return answers
		}
		before := read()
		dropped += len(retainAll(t, ledger, retentionKeys))
		if after := read(); !reflect.DeepEqual(after, before) {
			t.Fatalf("mix %d: CurrentItemRecord answers\n%+v\nafter Retain, was\n%+v", seed, after, before)
		}
		if _, kept := ledger.Get("two-items"); !kept {
			t.Fatalf("mix %d: the record that names two items is gone", seed)
		}
	}
	if dropped == 0 {
		t.Fatal("Retain dropped nothing in any mix, so the test compared nothing")
	}
}

// CurrentRenderRecord answers the same for every render before Retain and after it, and the chapter still has a record
// (what tells a render scanned before from one never scanned, in RenderService): two renders, two documents and a
// record whose payload does not decode.
func TestRetainLeavesCurrentRenderRecordItsAnswer(t *testing.T) {
	type render struct{ document, chapter, key string }
	renders := []render{
		{"doc-1", "chapter-1", "key-a"}, {"doc-1", "chapter-1", "key-b"}, {"doc-2", "chapter-1", "key-a"}, {"doc-1", "chapter-2", "key-a"},
	}
	dropped := 0
	for seed := range 27 {
		ledger := evidence.NewLedgerStore(t.TempDir())
		at := retentionStart
		for pass := range 4 {
			for index, r := range renders {
				at = at.Add(time.Second)
				if _, err := WriteRenderRecord(ledger, r.document, r.chapter, r.key, "/renders/a.wav", evidence.LedgerProjectFile{}, at, at, mixedOutcome(seed, pass+index), &RenderScan{}, nil); err != nil {
					t.Fatal(err)
				}
			}
		}
		for index, payload := range []json.RawMessage{nil, json.RawMessage(`"not a payload"`)} {
			at = at.Add(time.Second)
			if _, err := ledger.Write(evidence.LedgerRecord{ID: fmt.Sprintf("undecodable-%d", index), AnalyzerID: AnalyzerEditingRender, Outcome: evidence.LedgerComplete, StartedAt: at, Payload: payload,
				Scope: evidence.LedgerScope{DocumentID: "doc-1", ChapterID: "chapter-1"}}); err != nil {
				t.Fatal(err)
			}
		}

		read := func() map[render]string {
			answers := map[render]string{}
			for _, r := range append(renders, render{"doc-1", "chapter-1", "never-scanned"}) {
				record, _, ok, err := CurrentRenderRecord(ledger, r.document, r.chapter, r.key)
				if err != nil {
					t.Fatal(err)
				}
				scanned, err := ledger.List(AnalyzerEditingRender, r.chapter)
				if err != nil {
					t.Fatal(err)
				}
				answers[r] = fmt.Sprintf("%s %v, chapter scanned %v", record.ID, ok, len(scanned) > 0)
			}
			return answers
		}
		before := read()
		dropped += len(retainAll(t, ledger, retentionKeys))
		if after := read(); !reflect.DeepEqual(after, before) {
			t.Fatalf("mix %d: CurrentRenderRecord answers\n%v\nafter Retain, was\n%v", seed, after, before)
		}
		for _, id := range []string{"undecodable-0", "undecodable-1"} {
			if _, kept := ledger.Get(id); !kept {
				t.Fatalf("mix %d: %s, whose payload does not decode, is gone", seed, id)
			}
		}
	}
	if dropped == 0 {
		t.Fatal("Retain dropped nothing in any mix, so the test compared nothing")
	}
}

func TestRetentionKeysNameWhatTheirReadersMatchOn(t *testing.T) {
	item := func(guids ...string) evidence.LedgerRecord {
		return evidence.LedgerRecord{Scope: evidence.LedgerScope{ItemGUIDs: guids}}
	}
	for name, c := range map[string]struct {
		key    evidence.RetentionKey
		record evidence.LedgerRecord
		group  string
		ok     bool
	}{
		"one item":            {ItemRetentionKey, item("{A}"), "{A}", true},
		"a twin":              {ItemRetentionKey, item("{A}#2"), "{A}#2", true},
		"no item":             {ItemRetentionKey, item(), "", false},
		"two items":           {ItemRetentionKey, item("{A}", "{B}"), "", false},
		"a render":            {RenderRetentionKey, evidence.LedgerRecord{Payload: json.RawMessage(`{"renderKey":"key-a","path":"a.wav"}`)}, "key-a", true},
		"no payload":          {RenderRetentionKey, evidence.LedgerRecord{}, "", false},
		"a payload not JSON":  {RenderRetentionKey, evidence.LedgerRecord{Payload: json.RawMessage(`{`)}, "", false},
		"a payload not a map": {RenderRetentionKey, evidence.LedgerRecord{Payload: json.RawMessage(`[1]`)}, "", false},
	} {
		t.Run(name, func(t *testing.T) {
			if group, ok := c.key(c.record); group != c.group || ok != c.ok {
				t.Fatalf("key = %q, %v; want %q, %v", group, ok, c.group, c.ok)
			}
		})
	}
}
