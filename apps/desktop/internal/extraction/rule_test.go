package extraction

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func conf(c float64) *float64 { return &c }

func TestThresholdLivesInOnePlace(t *testing.T) {
	if VerifyBelow != 0.75 {
		t.Fatalf("VerifyBelow = %v, want 0.75", VerifyBelow)
	}
	files, err := filepath.Glob("*.go")
	if err != nil || len(files) == 0 {
		t.Fatalf("no package source: %v", err)
	}
	literals := 0
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := parser.ParseFile(token.NewFileSet(), f, src, 0); err != nil {
			t.Fatal(err)
		}
		literals += strings.Count(string(src), "0.75")
	}
	if literals != 1 {
		t.Fatalf("the package source spells 0.75 %d times, want exactly once (the VerifyBelow declaration)", literals)
	}
}

func TestExactlyThreeQuartersIsAcceptedAuto(t *testing.T) {
	base := Candidate{Kind: KindEntry}
	cases := []struct {
		name string
		c    *float64
		want Status
	}{
		{"exactly 0.75", conf(0.75), StatusAcceptedAuto},
		{"just under", conf(0.7499), StatusNeedsVerification},
		{"one", conf(1), StatusAcceptedAuto},
		{"zero", conf(0), StatusNeedsVerification},
		{"null", nil, StatusNeedsVerification},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := base
			s.Confidence = tc.c
			if got := AutoStatus(s); got != tc.want {
				t.Fatalf("AutoStatus = %q, want %q", got, tc.want)
			}
			if got := Confident(tc.c); got != (tc.want == StatusAcceptedAuto) {
				t.Fatalf("Confident = %v", got)
			}
		})
	}
	if got := ReasonsOf(Candidate{Kind: KindEntry}); !reflect.DeepEqual(got, []Reason{"No confidence was given."}) {
		t.Fatalf("null confidence reasons = %q", got)
	}
}

func TestReasonsFollowTheMock(t *testing.T) {
	found := []Evidence{{ParagraphID: "p", Start: 0, End: 1, Text: "x"}}
	cases := []struct {
		name string
		in   Candidate
		want []Reason
	}{
		{"all good", Candidate{Kind: KindClaim, Confidence: conf(0.9), Evidence: found, EntryID: "e"}, nil},
		{"no confidence", Candidate{Kind: KindEntry}, []Reason{"No confidence was given."}},
		{"low confidence", Candidate{Kind: KindEntry, Confidence: conf(0.5)}, []Reason{"Confidence is under the threshold."}},
		{"quote not found", Candidate{Kind: KindClaim, Confidence: conf(0.9), UnverifiedQuote: "q", EntryID: "e"}, []Reason{"quote not found"}},
		{"quote not found on a kind that needs none", Candidate{Kind: KindEntry, Confidence: conf(0.9), UnverifiedQuote: "q"}, []Reason{"quote not found"}},
		{"no evidence property", Candidate{Kind: KindProperty, Confidence: conf(0.9), EntryID: "e"}, []Reason{"No evidence quote."}},
		{"no evidence claim", Candidate{Kind: KindClaim, Confidence: conf(0.9), EntryID: "e"}, []Reason{"No evidence quote."}},
		{"no evidence speaker", Candidate{Kind: KindSpeaker, Confidence: conf(0.9)}, []Reason{"No evidence quote."}},
		{"no evidence entry is fine", Candidate{Kind: KindEntry, Confidence: conf(0.9)}, nil},
		{"unknown entry alias", Candidate{Kind: KindAlias, Confidence: conf(0.9)}, []Reason{"The entry is not in the Story Bible."}},
		{"unknown entry property", Candidate{Kind: KindProperty, Confidence: conf(0.9), Evidence: found}, []Reason{"The entry is not in the Story Bible."}},
		{"unknown entry relationship", Candidate{Kind: KindRelationship, Confidence: conf(0.9)}, []Reason{"The entry is not in the Story Bible."}},
		{"unknown entry claim", Candidate{Kind: KindClaim, Confidence: conf(0.9), Evidence: found}, []Reason{"The entry is not in the Story Bible."}},
		{"speaker needs no entry", Candidate{Kind: KindSpeaker, Confidence: conf(0.9), Evidence: found}, nil},
		{"several in a fixed order", Candidate{Kind: KindClaim, Confidence: conf(0.1), UnverifiedQuote: "q"},
			[]Reason{"Confidence is under the threshold.", "quote not found", "The entry is not in the Story Bible."}},
		{"every reason a claim can have", Candidate{Kind: KindClaim},
			[]Reason{"No confidence was given.", "No evidence quote.", "The entry is not in the Story Bible."}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ReasonsOf(tc.in); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("ReasonsOf = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestStatusFollowsReasons(t *testing.T) {
	kinds := []Kind{KindEntry, KindAlias, KindProperty, KindRelationship, KindClaim, KindSpeaker}
	confs := []*float64{nil, conf(0), conf(0.7499), conf(0.75), conf(1)}
	evs := [][]Evidence{nil, {{ParagraphID: "p"}}}
	quotes := []string{"", "q"}
	entries := []string{"", "e"}
	for _, k := range kinds {
		for _, c := range confs {
			for _, ev := range evs {
				for _, q := range quotes {
					for _, e := range entries {
						s := Candidate{Kind: k, Confidence: c, Evidence: ev, UnverifiedQuote: q, EntryID: e}
						want := StatusAcceptedAuto
						if len(ReasonsOf(s)) > 0 {
							want = StatusNeedsVerification
						}
						if got := AutoStatus(s); got != want {
							t.Fatalf("AutoStatus(%+v) = %q, want %q", s, got, want)
						}
					}
				}
			}
		}
	}
}
