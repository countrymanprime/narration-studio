package importer

import (
	"math"
	"strconv"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
)

// ExampleJSON and ExampleCSV are the same Story Bible in both formats. They are shown beside the format, put into the
// prompt, and printed in docs/architecture/storybible-import-format.md, where a test keeps the three equal.
const ExampleJSON = `{
  "entries": [
    {
      "name": "The Mad Hatter",
      "type": "Character",
      "aliases": ["Hatter"],
      "description": "Hosts the tea-party.",
      "appears_in": ["7"],
      "confidence": 0.9,
      "properties": [
        {"key": "Habit", "value": "Always has tea", "evidence": "It’s the stupidest tea-party", "paragraph": "7-1", "confidence": 0.7}
      ],
      "relationships": [
        {"to": "Alice", "relation": "hosts", "confidence": 0.8}
      ],
      "claims": [
        {"kind": "talk", "text": "Asks riddles", "evidence": "Who are you?", "chapter": "5", "paragraph": "5-2", "confidence": 0.6}
      ]
    }
  ],
  "speakers": [
    {"quote": "“Who are you?”", "speaker": "The Caterpillar", "paragraph": "5-2", "confidence": 0.95}
  ]
}`

// ExampleCSV is ExampleJSON as a sheet.
const ExampleCSV = `record,name,type,aliases,description,appears_in,key,value,to,relation,kind,text,evidence,chapter,paragraph,quote,speaker,confidence
entry,The Mad Hatter,Character,Hatter,Hosts the tea-party.,7,,,,,,,,,,,,0.9
property,The Mad Hatter,,,,,Habit,Always has tea,,,,,It’s the stupidest tea-party,,7-1,,,0.7
relationship,The Mad Hatter,,,,,,,Alice,hosts,,,,,,,,0.8
claim,The Mad Hatter,,,,,,,,,talk,Asks riddles,Who are you?,5,5-2,,,0.6
speaker,,,,,,,,,,,,,,5-2,“Who are you?”,The Caterpillar,0.95`

const jsonDescription = `JSON: {"entries": [{"name", "type", "aliases": [], "description", "appears_in": [], "confidence",
  "properties": [{"key", "value", "evidence", "chapter", "paragraph", "confidence"}],
  "relationships": [{"to", "relation", "confidence"}],
  "claims": [{"kind": "talk" | "act" | "know", "text", "evidence", "chapter", "paragraph", "confidence"}]}],
 "speakers": [{"quote", "speaker", "paragraph", "confidence"}]}`

func csvDescription() string {
	names := make([]string, len(Records))
	for i, r := range Records {
		names[i] = string(r)
	}
	return "CSV with this header row: " + strings.Join(CSVColumns, ",") + "\nOne record per row; record is one of " + strings.Join(names, ", ") +
		". For property, relationship and claim rows, name is the entry they belong to; to is the other entry. List cells (aliases, appears_in) separate items with semicolons. Quote any cell that has a comma."
}

// PromptTemplate is the prompt a narrator copies into any LLM, followed by the manuscript. {{...}} marks what Prompt
// fills in from the format and the threshold, so the prompt and the importer cannot disagree.
const PromptTemplate = `You are helping an audiobook narrator prepare a Story Bible from a book manuscript.
Read the manuscript I paste after the line MANUSCRIPT and answer with {{FORMAT}} only, no commentary, in exactly this format.

{{DESCRIPTION}}

Rules:
- One entry for each character, place, item or event that matters. Put every other name for it in aliases.
- properties are facts about an entry (appearance, role, habits). claims say what a character says (talk), does (act) or knows (know).
- evidence is a short quote copied exactly, character for character, from the manuscript. Never paraphrase it. If you cannot quote it, leave evidence empty.
- paragraph and chapter are optional; give them if the manuscript numbers them.
- speakers: for quoted lines, give the quote exactly and who says it.
- confidence is a number from 0 to 1 for how sure you are. Be honest. Leave it empty if you do not know. The narrator checks anything under {{THRESHOLD}}%.
- Do not invent anything the manuscript does not say.

Example:
{{EXAMPLE}}

MANUSCRIPT
`

// Prompt returns the prompt for one format with the example and the threshold filled in. The dialog shows this text and
// Copy puts the same text on the clipboard.
func Prompt(f Format) string {
	format, desc, example := "JSON", jsonDescription, ExampleJSON
	if f == FormatCSV {
		format, desc, example = "CSV", csvDescription(), ExampleCSV
	}
	threshold := strconv.Itoa(int(math.Round(extraction.VerifyBelow * 100)))
	// A Replacer substitutes in one pass, so a placeholder inside the example is never filled again.
	return strings.NewReplacer("{{FORMAT}}", format, "{{DESCRIPTION}}", desc, "{{THRESHOLD}}", threshold, "{{EXAMPLE}}", example).Replace(PromptTemplate)
}

// Copy returns the text the Copy button puts on the clipboard: the same text Prompt gives for the dialog.
func Copy(f Format) string { return Prompt(f) }
