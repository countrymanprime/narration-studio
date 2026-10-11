package importer

import (
	"fmt"
	"go/parser"
	"go/token"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
)

func f64(v float64) *float64 { return &v }

func confs(rs []Row) []*float64 {
	var out []*float64
	for _, r := range rs {
		out = append(out, r.Item.Confidence)
	}
	return out
}

func records(rs []Row) []Record {
	var out []Record
	for _, r := range rs {
		out = append(out, r.Item.Record)
	}
	return out
}

func TestCSVReadsQuotedCellsAndNumbersRowsByLine(t *testing.T) {
	tab, err := tokenize("a,b\r\n\"x, y\",\"say \"\"hi\"\"\nthere\"\n\n3,4", ',')
	if err != nil {
		t.Fatal(err)
	}
	var lines []int
	for _, r := range tab {
		lines = append(lines, r.line)
	}
	if !reflect.DeepEqual(lines, []int{1, 2, 5}) {
		t.Fatalf("lines = %v", lines)
	}
	if !reflect.DeepEqual(tab[1].cells, []string{"x, y", "say \"hi\"\nthere"}) {
		t.Fatalf("cells = %q", tab[1].cells)
	}
	if n := len(Parse([]byte("record;name;type\nentry;Zed;Character"), "").Rows); n != 1 {
		t.Fatalf("semicolon sheet rows = %d", n)
	}
	if n := len(Parse([]byte("record\tname\nentry\tZed"), "").Rows); n != 1 {
		t.Fatalf("tab sheet rows = %d", n)
	}
}

func TestCSVParsesEveryRecordType(t *testing.T) {
	r := Parse([]byte(strings.Join([]string{
		"record,name,type,aliases,description,key,value,to,relation,kind,text,evidence,quote,speaker,confidence",
		"entry,Zed,Character,Z;Zee,Tall,,,,,,,,,,0.9",
		"property,Zed,,,,Height,Tall,,,,,\"he, was tall\",,,80%",
		"relationship,Zed,,,,,,Alice,knows,,,,,,",
		"claim,Zed,,,,,,,,act,Runs,,,,0.5",
		"speaker,,,,,,,,,,,,“Hi”,Zed,1",
	}, "\n")), "")
	if len(r.Errors) != 0 {
		t.Fatalf("errors: %v", r.Errors)
	}
	if !reflect.DeepEqual(records(r.Rows), Records) {
		t.Fatalf("records = %v", records(r.Rows))
	}
	want := []*float64{f64(0.9), f64(0.8), nil, f64(0.5), f64(1)}
	if !reflect.DeepEqual(confs(r.Rows), want) {
		t.Fatalf("confidences = %v", confs(r.Rows))
	}
	if !reflect.DeepEqual(r.Rows[0].Item.Aliases, []string{"Z", "Zee"}) || r.Rows[1].Item.Evidence != "he, was tall" {
		t.Fatalf("items: %+v %+v", r.Rows[0].Item, r.Rows[1].Item)
	}
}

func TestEachBadRowIsReportedWithItsRowAndReason(t *testing.T) {
	r := Parse([]byte(strings.Join([]string{
		"record,name,type,kind,text,to,relation,confidence",
		"entry,,Character,,,,,0.9",
		"claim,Zed,,shout,Yells,,,0.9",
		"entry,Zed,Character,,,,,1.4",
		"banana,Zed,,,,,,",
		"relationship,Zed,,,,Alice,,0.5",
		"entry,Fine,Character,,,,,0.9",
	}, "\n")), "")
	if len(r.Rows) != 1 || r.Rows[0].Item.Name != "Fine" {
		t.Fatalf("rows = %+v", r.Rows)
	}
	want := []struct {
		row int
		sub string
	}{{2, "name is required"}, {3, "must be talk, act or know"}, {4, "from 0 to 1"}, {5, "not a record type"}, {6, "relation is required"}}
	if len(r.Errors) != len(want) {
		t.Fatalf("errors = %+v", r.Errors)
	}
	for i, w := range want {
		if r.Errors[i].Row != w.row || !strings.Contains(r.Errors[i].Reason, w.sub) {
			t.Errorf("error %d = %+v, want row %d with %q", i, r.Errors[i], w.row, w.sub)
		}
	}
}

func TestRecordColumnIsRequired(t *testing.T) {
	r := Parse([]byte("name,type\nZed,Character"), "")
	if len(r.Rows) != 0 || len(r.Errors) != 1 || !strings.Contains(r.Errors[0].Reason, "“record” column") {
		t.Fatalf("result = %+v", r)
	}
}

func TestJSONParsesNestedEntries(t *testing.T) {
	r := Parse([]byte(`{"entries":[{"name":"Zed","type":"Character","aliases":"Z; Zee","confidence":0.8,
		"properties":{"Height":"Tall","Age":30},"relationships":[{"to":"Alice","relation":"knows"}],
		"claims":[{"kind":"know","text":"A secret","evidence":"q","confidence":0.4}]}],
		"speakers":[{"quote":"“Hi”","speaker":"Zed"}]}`), "")
	if len(r.Errors) != 0 {
		t.Fatalf("errors: %v", r.Errors)
	}
	want := []Record{RecordEntry, RecordProperty, RecordProperty, RecordRelationship, RecordClaim, RecordSpeaker}
	if !reflect.DeepEqual(records(r.Rows), want) {
		t.Fatalf("records = %v", records(r.Rows))
	}
	for i, row := range r.Rows {
		if row.Row != i+1 {
			t.Errorf("row %d numbered %d", i+1, row.Row)
		}
	}
	if !reflect.DeepEqual(r.Rows[0].Item.Aliases, []string{"Z", "Zee"}) {
		t.Errorf("aliases = %v", r.Rows[0].Item.Aliases)
	}
	// The map is read in key order: Age before Height. Both take the entry's confidence.
	if p := r.Rows[1].Item; p.Key != "Age" || p.Value != "30" || *p.Confidence != 0.8 {
		t.Errorf("property = %+v", p)
	}
	if r.Rows[5].Where != "speakers[0]" {
		t.Errorf("where = %q", r.Rows[5].Where)
	}
}

func TestJSONNamesTheRowAndPlaceOfEachError(t *testing.T) {
	r := Parse([]byte(`{"entries":[{"name":"Zed","confidence":"high","claims":[{"kind":"talk"}]},"nope"]}`), "")
	want := [][2]any{{1, "entries[0]"}, {2, "entries[0].claims[0]"}, {3, "entries[1]"}}
	if len(r.Errors) != 3 {
		t.Fatalf("errors = %+v", r.Errors)
	}
	for i, w := range want {
		if r.Errors[i].Row != w[0] || r.Errors[i].Where != w[1] {
			t.Errorf("error %d = %+v", i, r.Errors[i])
		}
	}
	if !strings.Contains(r.Errors[0].Reason, "confidence") || !strings.Contains(r.Errors[1].Reason, "text is required") {
		t.Errorf("reasons = %q, %q", r.Errors[0].Reason, r.Errors[1].Reason)
	}
}

func TestJSONBadJSONAndWrongShapeSaySo(t *testing.T) {
	for in, sub := range map[string]string{"{ nope": "Not valid JSON", `{"a":1}`: "entries", `{"entries":[]} x`: "Not valid JSON", "   ": "Nothing to import."} {
		r := Parse([]byte(in), "")
		if len(r.Rows) != 0 || len(r.Errors) != 1 || !strings.Contains(r.Errors[0].Reason, sub) {
			t.Errorf("%q: %+v", in, r)
		}
	}
}

func TestFormatIsToldApartByHowItOpensOrByAHint(t *testing.T) {
	if f := Parse([]byte(`{"entries":[]}`), "").Format; f != FormatJSON {
		t.Errorf("object = %v", f)
	}
	if f := Parse([]byte("\uFEFF  [{\"name\":\"A\"}]"), "").Format; f != FormatJSON {
		t.Errorf("BOM and list = %v", f)
	}
	if f := Parse([]byte("record,name\nentry,A"), "").Format; f != FormatCSV {
		t.Errorf("sheet = %v", f)
	}
	r := Parse([]byte("record,name\nentry,A"), FormatJSON)
	if r.Format != FormatJSON || !strings.Contains(r.Errors[0].Reason, "Not valid JSON") {
		t.Errorf("hinted = %+v", r)
	}
}

// fenced returns the body of the first fenced block whose info string is lang.
func fenced(t *testing.T, doc, lang string) string {
	t.Helper()
	_, after, ok := strings.Cut(doc, "```"+lang+"\n")
	if !ok {
		t.Fatalf("no ```%s block", lang)
	}
	body, _, _ := strings.Cut(after, "\n```")
	return body
}

func TestDocumentedExamplesParseCleanInBothFormats(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "docs", "architecture", "storybible-import-format.md"))
	if err != nil {
		t.Fatal(err)
	}
	doc := strings.ReplaceAll(string(b), "\r\n", "\n") // a Windows checkout may give the doc CRLF line ends
	j, c := fenced(t, doc, "json example"), fenced(t, doc, "csv example")
	if j != ExampleJSON || c != ExampleCSV {
		t.Fatal("the examples in the format doc differ from ExampleJSON and ExampleCSV")
	}
	rj, rc := Parse([]byte(j), ""), Parse([]byte(c), "")
	if len(rj.Errors) != 0 || len(rc.Errors) != 0 {
		t.Fatalf("errors: %v %v", rj.Errors, rc.Errors)
	}
	if rj.Format != FormatJSON || rc.Format != FormatCSV || len(rj.Rows) != 5 {
		t.Fatalf("formats %v %v, %d rows", rj.Format, rc.Format, len(rj.Rows))
	}
	for i := range rj.Rows {
		if !reflect.DeepEqual(rj.Rows[i].Item, rc.Rows[i].Item) {
			t.Errorf("row %d differs:\n json %+v\n csv  %+v", i, rj.Rows[i].Item, rc.Rows[i].Item)
		}
	}
}

var manuscript = []extraction.Paragraph{
	{ID: "5-2", ChapterID: "5", Text: "“Who are you?” said the Caterpillar."},
	{ID: "7-1", ChapterID: "7", Text: "It’s the stupidest tea-party I was ever at in all my life!"},
}

func testBook() Book {
	return Book{
		Entries: []Entry{
			{ID: "queen-of-hearts", Name: "Queen of Hearts", Aliases: []string{"The Queen"}},
			{ID: "alice", Name: "Alice"},
			{ID: "cat", Name: "Cheshire Cat", Locked: true},
		},
		Chapters:   []Chapter{{ID: "5", Number: 5, Title: "Advice from a Caterpillar"}},
		Paragraphs: manuscript,
	}
}

func plan(t *testing.T, book Book, in string) Plan {
	t.Helper()
	r := Parse([]byte(in), "")
	return PlanImport(book, r.Rows, r.Errors)
}

func TestPlanMergesAddsAndSkips(t *testing.T) {
	book := testBook()
	p := plan(t, book, `{"entries":[
		{"name":"the queen","aliases":["Her Majesty"],"confidence":0.9},
		{"name":"Hatter","type":"Character","confidence":0.9},
		{"name":"Alice","aliases":["alice"],"confidence":0.9},
		{"name":"Cheshire Cat","aliases":["Grin"],"confidence":0.9}],
		"speakers":[{"quote":"hi","speaker":"Nobody"}]}`)
	got := map[string]Action{}
	for _, l := range p.Lines {
		got[l.Item.Name] = l.Action
	}
	want := map[string]Action{"the queen": ActionMerge, "Hatter": ActionAdd, "Alice": ActionSkip, "Cheshire Cat": ActionSkip}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("actions = %v", got)
	}
	if !strings.Contains(p.Lines[0].Note, "Her Majesty") || strings.Contains(p.Lines[0].Note, "the queen") {
		t.Errorf("merge note = %q", p.Lines[0].Note)
	}
	if !strings.Contains(p.Lines[3].Note, "Locked") {
		t.Errorf("locked note = %q", p.Lines[3].Note)
	}
	if len(p.Errors) != 1 || p.Errors[0].Row != 5 || !strings.Contains(p.Errors[0].Reason, "No entry “Nobody”") {
		t.Errorf("errors = %+v", p.Errors)
	}
	if n := len(p.Offered()); n != 2 {
		t.Errorf("offered = %d", n)
	}
	// Rows about a locked entry are never offered; rows about an entry in the file or the Story Bible are.
	p = plan(t, book, "record,name,key,value,kind,text,confidence\nproperty,Cheshire Cat,Grin,Wide,,,0.9\nclaim,alice,,,act,Waits,0.9\nclaim,Fine,,,act,Waits,0.9\nentry,Fine,,,,,0.9")
	var acts []Action
	for _, l := range p.Lines {
		acts = append(acts, l.Action)
	}
	if !reflect.DeepEqual(acts, []Action{ActionSkip, ActionAdd, ActionAdd, ActionAdd}) || len(p.Errors) != 0 {
		t.Errorf("actions = %v errors = %v", acts, p.Errors)
	}
}

func TestPlanSkipsWhatWasOfferedOrRejectedBefore(t *testing.T) {
	book := testBook()
	in := "record,name,type,confidence\nentry,Hatter,Character,0.9\nentry,HATTER,,0.9\nentry,Mock Turtle,,0.9"
	book.Seen = map[string]extraction.Status{
		extraction.Fingerprint(extraction.Payload{Kind: extraction.KindEntry, Name: "Mock Turtle"}): extraction.StatusRejected,
	}
	p := plan(t, book, in)
	notes := []string{p.Lines[0].Note, p.Lines[1].Note, p.Lines[2].Note}
	if !reflect.DeepEqual(notes, []string{"", "Already suggested", "Rejected before"}) {
		t.Fatalf("notes = %q", notes)
	}
}

func TestStatusFollowsTheSharedRule(t *testing.T) {
	p := plan(t, testBook(), "record,name,type,confidence\nentry,Aa,Item,\nentry,Bb,Item,0.74\nentry,Cc,Item,0.75\nentry,Dd,Item,75%")
	var got []extraction.Status
	for _, l := range p.Lines {
		got = append(got, l.Status)
	}
	nv, ok := extraction.StatusNeedsVerification, extraction.StatusAcceptedAuto
	if !reflect.DeepEqual(got, []extraction.Status{nv, nv, ok, ok}) {
		t.Fatalf("statuses = %v", got)
	}
	// A quote the manuscript does not hold is flagged; one it holds is found, with offsets computed here.
	p = plan(t, testBook(), "record,name,kind,text,evidence,paragraph,confidence\nclaim,Alice,talk,Says it,nobody wrote this,5-2,0.99\nclaim,Alice,talk,Asks,Who are you?,5-2,0.99")
	if p.Lines[0].Status != nv || !strings.Contains(p.Lines[0].Note, string(extraction.ReasonQuoteNotFound)) {
		t.Errorf("unfound quote = %+v", p.Lines[0])
	}
	if p.Lines[1].Status != ok || len(p.Lines[1].Evidence) != 1 || p.Lines[1].Evidence[0].ParagraphID != "5-2" {
		t.Errorf("found quote = %+v", p.Lines[1])
	}
	// A property with no quote at all needs one, and a chapter that is not there is said.
	p = plan(t, testBook(), "record,name,key,value,chapter,confidence\nproperty,Alice,Hair,Blonde,9,0.99")
	if p.Lines[0].Status != nv || !strings.Contains(p.Lines[0].Note, "chapter “9” not found") {
		t.Errorf("no evidence = %+v", p.Lines[0])
	}
}

func TestLimitsAreEnforced(t *testing.T) {
	big := []byte("record,name\n" + strings.Repeat("entry,A\n", MaxBytes/8+1))
	cases := map[string][]byte{
		"limit is":     big,
		"UTF-8":        []byte("record,name\nentry,\xff\xfe"),
		"NUL":          []byte("record,name\nentry,a\x00b"),
		"more than":    []byte("record,name\n" + strings.Repeat("entry,A\n", MaxRows+1)),
		"one field":    []byte("record,name\nentry," + strings.Repeat("x", MaxFieldBytes+1)),
		"quoted field": []byte("record,name\nentry,\"" + strings.Repeat("x", MaxFieldBytes+1) + "\""),
		"JSON rows":    []byte(`{"speakers":[` + strings.Repeat(`{"quote":"q","speaker":"s"},`, MaxRows+1) + `{"quote":"q","speaker":"s"}]}`),
		"JSON field":   []byte(`{"entries":[{"name":"` + strings.Repeat("x", MaxFieldBytes+1) + `"}]}`),
	}
	for name, in := range cases {
		r := Parse(in, "")
		if len(r.Rows) != 0 || len(r.Errors) != 1 || r.Errors[0].Row != 0 || !strings.HasSuffix(r.Errors[0].Reason, ".") {
			t.Errorf("%s: %d rows, errors %+v", name, len(r.Rows), r.Errors)
		}
	}
	if r := Parse([]byte("\uFEFFrecord,name\nentry,A"), ""); len(r.Errors) != 0 || len(r.Rows) != 1 {
		t.Errorf("BOM not stripped: %+v", r)
	}
	// The caps are exact: MaxRows rows and a field of MaxFieldBytes are accepted.
	ok := "record,name\n" + strings.Repeat("entry,A\n", MaxRows-1) + "entry," + strings.Repeat("x", MaxFieldBytes)
	if r := Parse([]byte(ok), ""); len(r.Rows) == 0 {
		t.Errorf("at the caps: %+v", r.Errors)
	}
}

func TestNoFormulaOrPathIsEverFollowed(t *testing.T) {
	r := Parse([]byte("record,name,type\nentry,=1+1,+SUM(A1)\nentry,-2,@cmd\nentry,/etc/passwd,https://example.com/x\nentry,C:\\Windows\\win.ini,file:///etc/hosts"), "")
	if len(r.Errors) != 0 || len(r.Rows) != 4 {
		t.Fatalf("result = %+v", r)
	}
	want := [][2]string{{"=1+1", "+SUM(A1)"}, {"-2", "@cmd"}, {"/etc/passwd", "https://example.com/x"}, {`C:\Windows\win.ini`, "file:///etc/hosts"}}
	for i, w := range want {
		if r.Rows[i].Item.Name != w[0] || r.Rows[i].Item.Type != w[1] {
			t.Errorf("row %d = %+v", i, r.Rows[i].Item)
		}
	}
	// The package never reaches the file system, a process or the network.
	banned := map[string]bool{"os": true, "os/exec": true, "io/fs": true, "io/ioutil": true, "net": true, "net/http": true, "path/filepath": true, "syscall": true, "plugin": true}
	files, _ := filepath.Glob("*.go")
	for _, name := range files {
		if strings.HasSuffix(name, "_test.go") {
			continue
		}
		f, err := parser.ParseFile(token.NewFileSet(), name, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		for _, imp := range f.Imports {
			if p := strings.Trim(imp.Path.Value, `"`); banned[p] {
				t.Errorf("%s imports %s", name, p)
			}
		}
	}
}

func TestPromptCarriesTheFormatAndTheThreshold(t *testing.T) {
	j, c := Prompt(FormatJSON), Prompt(FormatCSV)
	for _, p := range []string{j, c} {
		if strings.Contains(p, "{{") || !strings.Contains(p, "75%") || !strings.HasSuffix(p, "MANUSCRIPT\n") {
			t.Errorf("prompt: %q", p)
		}
	}
	if !strings.Contains(j, `"claims"`) || !strings.Contains(j, ExampleJSON) || !strings.Contains(j, "answer with JSON only") {
		t.Error("JSON prompt is missing the format or the example")
	}
	for _, col := range CSVColumns {
		if !strings.Contains(c, col) {
			t.Errorf("CSV prompt lacks column %s", col)
		}
	}
	if !strings.Contains(c, ExampleCSV) {
		t.Error("CSV prompt lacks the example")
	}
	if Copy(FormatJSON) != j || Copy(FormatCSV) != c {
		t.Error("Copy differs from the text the dialog shows")
	}
	if want := fmt.Sprintf("%d%%", int(math.Round(extraction.VerifyBelow*100))); !strings.Contains(j, want) {
		t.Errorf("threshold %s missing", want)
	}
}
