package importer

import (
	"bytes"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
)

// The caps on an imported file. They bound what a hostile file can make the parser allocate.
const (
	MaxBytes      = 2 << 20
	MaxRows       = 5000
	MaxFieldBytes = 8 << 10
)

// Format is how an import file is written.
type Format string

// The two formats.
const (
	FormatCSV  Format = "csv"
	FormatJSON Format = "json"
)

// Record is what one row of an import says.
type Record string

// The record types.
const (
	RecordEntry        Record = "entry"
	RecordProperty     Record = "property"
	RecordRelationship Record = "relationship"
	RecordClaim        Record = "claim"
	RecordSpeaker      Record = "speaker"
)

// Records lists the record types in the order the format documents them.
var Records = []Record{RecordEntry, RecordProperty, RecordRelationship, RecordClaim, RecordSpeaker}

// CSVColumns is the header row of a CSV import.
var CSVColumns = []string{"record", "name", "type", "aliases", "description", "appears_in", "key", "value", "to", "relation", "kind", "text", "evidence", "chapter", "paragraph", "quote", "speaker", "confidence"}

// Item is one validated row. Which fields are set depends on Record:
//
//	entry:        Name, Type, Aliases, Description, AppearsIn
//	property:     Entry, Key, Value, Evidence, Chapter, Paragraph
//	relationship: Entry, To, Relation
//	claim:        Entry, Claim, Text, Evidence, Chapter, Paragraph
//	speaker:      Quote, Speaker, Paragraph
//
// Confidence is nil when the file gave none.
type Item struct {
	Record      Record
	Name        string
	Type        string
	Aliases     []string
	Description string
	AppearsIn   []string
	Entry       string
	Key         string
	Value       string
	To          string
	Relation    string
	Claim       extraction.ClaimKind
	Text        string
	Evidence    string
	Chapter     string
	Paragraph   string
	Quote       string
	Speaker     string
	Confidence  *float64
}

// Row is a parsed row and the place in the file it came from. Row is the 1-based line of a CSV record, or the
// 1-based count of rows in JSON; Where names the place (`row 4`, `entries[0].claims[1]`).
type Row struct {
	Row   int
	Where string
	Item  Item
}

// RowError is a row that could not be read, or a refusal of the whole file (Row 0).
type RowError struct {
	Row    int
	Where  string
	Reason string
}

// Result is what Parse found. A refused or empty file has no Rows.
type Result struct {
	Format Format
	Rows   []Row
	Errors []RowError
}

func refuse(f Format, reason string) Result {
	return Result{Format: f, Errors: []RowError{{Reason: reason}}}
}

// Parse reads an import file. The format is JSON when the text opens like JSON, otherwise CSV, unless hint names one.
// The limits are checked before any row is built.
func Parse(data []byte, hint Format) Result {
	if len(data) > MaxBytes {
		return refuse(hint, fmt.Sprintf("The file is %d KB; the limit is %d KB.", (len(data)+1023)/1024, MaxBytes/1024))
	}
	if !utf8.Valid(data) {
		return refuse(hint, "The file is not valid UTF-8 text. Save it as UTF-8 and try again.")
	}
	if bytes.IndexByte(data, 0) >= 0 {
		return refuse(hint, "The file contains a NUL byte, so it is not a text file.")
	}
	text := strings.TrimPrefix(string(data), "\uFEFF")
	t := strings.TrimLeft(text, " \t\r\n")
	f := hint
	if f == "" {
		f = FormatCSV
		if strings.HasPrefix(t, "{") || strings.HasPrefix(t, "[") {
			f = FormatJSON
		}
	}
	if t == "" {
		return refuse(f, "Nothing to import.")
	}
	if f == FormatJSON {
		return parseJSON(text)
	}
	return parseCSV(text)
}
