package main

import (
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/guide"
	"github.com/countrymanprime/narration-utils/shell/internal/pronunciationonline"
	"github.com/countrymanprime/narration-utils/shell/internal/pronunciationonline/pronunciationonlinetest"
	"github.com/countrymanprime/narration-utils/shell/internal/wiktextract"
)

func sourcesOf(t *testing.T, host *Host) PronunciationSourceList {
	t.Helper()
	raw, err := host.PronunciationSources()
	return decodeOnline[PronunciationSourceList](t, raw, err)
}

func candidateOf(t *testing.T, host *Host, word, source string) guide.Candidate {
	t.Helper()
	raw, err := host.PronunciationCandidate(word, source)
	return decodeOnline[guide.Candidate](t, raw, err)
}

func sourceIDs(list PronunciationSourceList) []string {
	ids := []string{}
	for _, source := range list.Sources {
		ids = append(ids, source.ID)
	}
	return ids
}

// A host whose Wiktextract index is not installed: the manager is a seam that answers an empty cache.
func withoutWiktextract(host *Host) {
	host.wiktextractManager = func() (*wiktextract.Manager, error) {
		catalog := filepath.Join(filepath.Dir(recentProjectsPath()), "no-catalog.json")
		return wiktextract.New(catalog, filepath.Join(filepath.Dir(catalog), "no-cache"))
	}
}

func TestPronunciationSourcesListTheRegisteredSourcesTheKeyedOnlineOneAndManual(t *testing.T) {
	host, _, _ := onlineHost(t)
	withoutWiktextract(host)
	list := sourcesOf(t, host)
	if got, want := sourceIDs(list), []string{"cmu", "wiktextract", "espeak", "manual"}; !slices.Equal(got, want) {
		t.Fatalf("no key: sources = %v, want %v", got, want)
	}
	for _, source := range list.Sources {
		if source.ID == "wiktextract" && (source.Available || source.Reason == "" || source.Needs != "localDictionary") {
			t.Fatalf("wiktextract = %+v, want unavailable with a reason, needing the local dictionary", source)
		}
		if source.ID != "wiktextract" && (!source.Available || source.Reason != "") {
			t.Fatalf("%s = %+v, want available", source.ID, source)
		}
	}
	if _, err := host.PronunciationOnlineKeySet(onlineTestKey); err != nil {
		t.Fatal(err)
	}
	list = sourcesOf(t, host)
	if got, want := sourceIDs(list), []string{"cmu", "wiktextract", "espeak", "merriam_webster", "manual"}; !slices.Equal(got, want) {
		t.Fatalf("with a key: sources = %v, want %v", got, want)
	}
	if online := list.Sources[3]; online.Kind != "lookup" || online.Needs != "network" || !online.Available {
		t.Fatalf("online = %+v", online)
	}
	if manual := list.Sources[4]; manual.Kind != "manual" || manual.Needs != "" {
		t.Fatalf("manual = %+v", manual)
	}
}

func TestPronunciationDefaultIsTheNarratorsSettingNeverAnUnavailableSource(t *testing.T) {
	host, _, _ := onlineHost(t)
	withoutWiktextract(host)
	if got := sourcesOf(t, host).Default; got != "cmu" {
		t.Fatalf("unset default = %q, want cmu (ADR 0405 order)", got)
	}
	set := func(value string) {
		t.Helper()
		if err := host.settings.Save("ManuscriptGuide", "global", map[string]*string{"default_pronunciation_source": &value}); err != nil {
			t.Fatal(err)
		}
	}
	set("espeak")
	if got := sourcesOf(t, host).Default; got != "espeak" {
		t.Fatalf("set default = %q, want espeak", got)
	}
	set("wiktextract")
	if got := sourcesOf(t, host).Default; got != "cmu" {
		t.Fatalf("an unavailable default fell back to %q, want cmu", got)
	}
	set("manual")
	if got := sourcesOf(t, host).Default; got == "manual" {
		t.Fatal("manual is never the default")
	}
}

func TestPronunciationCandidateReturnsSayOrAReason(t *testing.T) {
	host, fake, _ := onlineHost(t)
	withoutWiktextract(host)
	if _, err := host.PronunciationOnlineKeySet(onlineTestKey); err != nil {
		t.Fatal(err)
	}
	ok := candidateOf(t, host, "croquet", "merriam_webster")
	if !ok.OK || ok.Say != "krō-ˈkā" || ok.Reason != "" {
		t.Fatalf("hit = %+v", ok)
	}
	misses := map[string][2]string{
		"unregistered": {"croquet", "forvo"},
		"unavailable":  {"croquet", "wiktextract"},
		"miss":         {"quorlen", "merriam_webster"},
		"manual":       {"croquet", "manual"},
		"empty":        {"   ", "merriam_webster"},
		"over long":    {strings.Repeat("a", 81), "merriam_webster"},
	}
	for name, args := range misses {
		got := candidateOf(t, host, args[0], args[1])
		if got.OK || got.Say != "" || !strings.HasSuffix(got.Reason, ".") {
			t.Errorf("%s = %+v, want ok:false with a sentence", name, got)
		}
	}
	if got := candidateOf(t, host, "croquet", "manual"); got.Reason != "Type it in." {
		t.Fatalf("manual reason = %q", got.Reason)
	}
	fake.Errs = map[string]error{"wren": pronunciationonline.ErrUnreachable}
	if got := candidateOf(t, host, "wren", "merriam_webster"); got.OK || !strings.Contains(got.Reason, "could not be reached") {
		t.Fatalf("offline = %+v, want ok:false saying it could not be reached", got)
	}
}

func TestPronunciationCandidateSendsOneWordAndOnlyWhenAsked(t *testing.T) {
	host, fake, _ := onlineHost(t)
	if _, err := host.PronunciationOnlineKeySet(onlineTestKey); err != nil {
		t.Fatal(err)
	}
	if _, err := host.PronunciationSources(); err != nil {
		t.Fatal(err)
	}
	if calls := fake.Calls(); len(calls) != 0 {
		t.Fatalf("listing the sources sent %v", calls)
	}
	if _, err := host.PronunciationCandidate("  Wren ", "merriam_webster"); err != nil {
		t.Fatal(err)
	}
	if calls := fake.Calls(); len(calls) != 1 || calls[0] != (pronunciationonlinetest.Call{Word: "Wren", Key: onlineTestKey}) {
		t.Fatalf("calls = %+v, want exactly the one word and the key", calls)
	}
	// A cmu candidate and a manual one never reach the online service.
	_, _ = host.PronunciationCandidate("Alice", "manual")
	if calls := fake.Calls(); len(calls) != 1 {
		t.Fatalf("calls = %+v", calls)
	}
}

func TestPronunciationCandidateTakesNoPathAndNoBatch(t *testing.T) {
	host, fake, _ := onlineHost(t)
	if _, err := host.PronunciationOnlineKeySet(onlineTestKey); err != nil {
		t.Fatal(err)
	}
	for _, word := range []string{`C:\Users\me\secret.txt`, "/etc/passwd", "../x", "one\ntwo"} {
		got := candidateOf(t, host, word, "merriam_webster")
		if got.OK || got.Reason == "" {
			t.Errorf("%q = %+v, want ok:false", word, got)
		}
	}
	if calls := fake.Calls(); len(calls) != 0 {
		t.Fatalf("a path-shaped word reached the dictionary: %+v", calls)
	}
	// A path-shaped word for a sidecar source goes as one --word=VALUE argument and is looked up as text.
	service, calls := countingGuide(t)
	host.guide = service
	got := candidateOf(t, host, "/etc/passwd", "cmu")
	if got.OK || got.Reason == "" {
		t.Fatalf("cmu = %+v", got)
	}
	recorded := calls()
	if len(recorded) != 1 || recorded[0][0] != "candidate" || !slices.Contains(recorded[0], "--word=/etc/passwd") {
		t.Fatalf("sidecar calls = %v, want one candidate with the word as one argument", recorded)
	}
}

func TestPronunciationBindingsHaveNoBatchForm(t *testing.T) {
	host := reflect.TypeOf(&Host{})
	for _, name := range []string{"PronunciationSourcesBatch", "PronunciationCandidateBatch", "PronunciationCandidates"} {
		if _, found := host.MethodByName(name); found {
			t.Errorf("Host has %s: the candidate bindings take one word and one source", name)
		}
	}
	for _, name := range []string{"PronunciationSources", "PronunciationCandidate"} {
		method, found := host.MethodByName(name)
		if !found {
			t.Fatalf("Host has no %s", name)
		}
		for i := 1; i < method.Type.NumIn(); i++ {
			if method.Type.In(i).Kind().String() != "string" {
				t.Errorf("%s argument %d is %s, want a string word or source id", name, i, method.Type.In(i))
			}
		}
	}
}
