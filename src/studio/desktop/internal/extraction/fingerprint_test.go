package extraction

import "testing"

func TestFingerprintRecognisesTheSameThing(t *testing.T) {
	same := [][2]Payload{
		{{Kind: KindEntry, Name: "The Dodo"}, {Kind: KindEntry, Name: "  the   DODO "}},
		{{Kind: KindAlias, Entry: "Alice", Alias: "Al"}, {Kind: KindAlias, Entry: "ALICE", Alias: "al"}},
		{{Kind: KindProperty, Entry: "Alice", Key: "Habit", Value: "it\u2019s late"}, {Kind: KindProperty, Entry: "alice", Key: "habit", Value: "it's\u00a0late"}},
		{{Kind: KindRelationship, Entry: "Alice", Relation: "sister of", To: "Ada"}, {Kind: KindRelationship, Entry: "alice", Relation: "Sister  of", To: "ada"}},
		{{Kind: KindClaim, Entry: "Alice", Claim: ClaimTalk, Text: "Says \u201chi\u201d"}, {Kind: KindClaim, Entry: "alice", Claim: ClaimTalk, Text: "says \"hi\""}},
		{{Kind: KindSpeaker, Quote: "\u201cNo.\u201d", Speaker: "Alice"}, {Kind: KindSpeaker, Quote: "\"No.\"", Speaker: "alice"}},
	}
	for _, pair := range same {
		if a, b := Fingerprint(pair[0]), Fingerprint(pair[1]); a != b || a == "" {
			t.Errorf("%s: %q != %q", pair[0].Kind, a, b)
		}
	}
}

func TestFingerprintTellsDifferentThingsApart(t *testing.T) {
	base := Payload{Kind: KindClaim, Entry: "Alice", Claim: ClaimTalk, Text: "Sits"}
	differ := []Payload{
		{Kind: KindClaim, Entry: "Alice", Claim: ClaimAct, Text: "Sits"},
		{Kind: KindClaim, Entry: "Alice", Claim: ClaimTalk, Text: "Stands"},
		{Kind: KindClaim, Entry: "Ada", Claim: ClaimTalk, Text: "Sits"},
	}
	for _, d := range differ {
		if Fingerprint(d) == Fingerprint(base) {
			t.Errorf("%+v matches the base", d)
		}
	}
	if Fingerprint(Payload{Kind: KindProperty, Entry: "A", Key: "k", Value: "v1"}) == Fingerprint(Payload{Kind: KindProperty, Entry: "A", Key: "k", Value: "v2"}) {
		t.Error("a different value matches")
	}
	if Fingerprint(Payload{Kind: KindRelationship, Entry: "A", Relation: "r1", To: "B"}) == Fingerprint(Payload{Kind: KindRelationship, Entry: "A", Relation: "r2", To: "B"}) {
		t.Error("a different relation matches")
	}
	if Fingerprint(Payload{Kind: KindSpeaker, Quote: "q", Speaker: "A"}) == Fingerprint(Payload{Kind: KindSpeaker, Quote: "q", Speaker: "B"}) {
		t.Error("a different speaker matches")
	}
	// Fields run together must not collide across the separator.
	if Fingerprint(Payload{Kind: KindAlias, Entry: "a b", Alias: "c"}) == Fingerprint(Payload{Kind: KindAlias, Entry: "a", Alias: "b c"}) {
		t.Error("the entry and alias blur together")
	}
}

func TestFingerprintPrefixIsStablePerKind(t *testing.T) {
	want := map[Kind]string{
		KindEntry:        "entry|the dodo",
		KindAlias:        "alias|a|b",
		KindProperty:     "property|a|k|v",
		KindRelationship: "relationship|a|r|b",
		KindClaim:        "claim|a|know|t",
		KindSpeaker:      "speaker|q|s",
	}
	in := map[Kind]Payload{
		KindEntry:        {Kind: KindEntry, Name: "The Dodo"},
		KindAlias:        {Kind: KindAlias, Entry: "A", Alias: "B"},
		KindProperty:     {Kind: KindProperty, Entry: "A", Key: "K", Value: "V"},
		KindRelationship: {Kind: KindRelationship, Entry: "A", Relation: "R", To: "B"},
		KindClaim:        {Kind: KindClaim, Entry: "A", Claim: ClaimKnow, Text: "T"},
		KindSpeaker:      {Kind: KindSpeaker, Quote: "Q", Speaker: "S"},
	}
	for k, w := range want {
		if got := Fingerprint(in[k]); got != w {
			t.Errorf("%s: %q, want %q", k, got, w)
		}
	}
	if got := Fingerprint(Payload{Kind: "bogus", Name: "x"}); got != "" {
		t.Errorf("unknown kind: %q", got)
	}
}
