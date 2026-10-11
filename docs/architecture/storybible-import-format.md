# Story Bible import format (`storybible-import` v1)

A narrator can bring a Story Bible in from a spreadsheet or from a JSON file made by any tool or LLM. The parser, the preview plan and the copyable prompt are in `apps/desktop/internal/extraction/importer`. The file is untrusted input: the package only parses bytes it is given, and it opens no file, path or URL.

## Rows

A file is a list of rows. Each row is one of five records.

| Record | Fields (required in bold) |
| --- | --- |
| `entry` | **name**, type, aliases, description, appears_in, confidence |
| `property` | **name** (the entry), **key**, **value**, evidence, chapter, paragraph, confidence |
| `relationship` | **name** (the entry), **to**, **relation**, confidence |
| `claim` | **name** (the entry), **kind** (`talk`, `act` or `know`), **text**, evidence, chapter, paragraph, confidence |
| `speaker` | **quote**, **speaker**, paragraph, confidence |

- `confidence` is a number from 0 to 1. A CSV cell may also say `85%`. Empty means "not given" and needs verification, the same as under 75%.
- List cells (`aliases`, `appears_in`) separate items with `;` or `|`.
- `evidence` is a quote copied from the manuscript. The host finds it in the manuscript itself and computes the offsets; a quote it cannot find is flagged for verification, never accepted.
- Every value is stored as text. A cell that starts with `=`, `+`, `-` or `@`, or that looks like a path or URL, is data and is never followed.

## CSV

The first row is the header. It must have a `record` column; the other columns may come in any order and any may be left out. The delimiter is the comma, semicolon or tab that splits the header into the most cells. Quoted cells may hold the delimiter, doubled quotes and line breaks. Each row is numbered by the line it starts on. The columns are:

`record, name, type, aliases, description, appears_in, key, value, to, relation, kind, text, evidence, chapter, paragraph, quote, speaker, confidence`

## JSON

An object with `entries` and/or `speakers` (a bare list is read as `entries`). An entry carries its own `properties` (a list, or a `{key: value}` map whose properties take the entry's confidence), `relationships` and `claims`. Rows are numbered in the order they are read.

## Examples

The same Story Bible in both formats. A test extracts these blocks, parses them without errors and checks that they give the same rows, and that they are the examples in the prompt.

```json example
{
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
}
```

```csv example
record,name,type,aliases,description,appears_in,key,value,to,relation,kind,text,evidence,chapter,paragraph,quote,speaker,confidence
entry,The Mad Hatter,Character,Hatter,Hosts the tea-party.,7,,,,,,,,,,,,0.9
property,The Mad Hatter,,,,,Habit,Always has tea,,,,,It’s the stupidest tea-party,,7-1,,,0.7
relationship,The Mad Hatter,,,,,,,Alice,hosts,,,,,,,,0.8
claim,The Mad Hatter,,,,,,,,,talk,Asks riddles,Who are you?,5,5-2,,,0.6
speaker,,,,,,,,,,,,,,5-2,“Who are you?”,The Caterpillar,0.95
```

## Limits

A file over a limit is refused with a sentence before any row is built.

| Limit | Value |
| --- | --- |
| File size | 2 MiB |
| Rows | 5000 |
| One field | 8 KiB |
| Encoding | UTF-8 with no NUL byte; a leading byte order mark is removed |

## The preview

`PlanImport` works out what accepting the file would do, against the Story Bible it is given:

- An `entry` row about a known entry (by name or alias, ignoring case) **merges**: it adds the aliases the entry lacks. If it adds none, it is skipped as already in the Story Bible. A new entry is **added**.
- A row about an entry that is in neither the Story Bible nor the file is an error naming the row.
- A row offered or rejected before is skipped.
- A locked entry is never edited (ADR 0007): a row that would change it is skipped.
- Nothing is deleted.
- Status comes from the shared rule (ADR 0803): no confidence, or under 75%, or a quote not found in the manuscript, or a property or claim with no quote, is `needs-verification`; otherwise `accepted-auto`.

## The bindings

The page reads the file the narrator chose, or takes what was pasted, and sends its text. It checks a chosen file against `maxBytes` before reading it. No binding takes a path, so the host opens and fetches nothing (`apps/desktop/bindings_extraction_import.go`).

| Binding | Takes | Does |
| --- | --- | --- |
| `ExtractionImportPreview` | the text, a format hint (`csv`, `json`, or empty to work it out) | Parses and plans against the Story Bible, the manuscript and every stored suggestion. Returns the lines (row, where, kind, label, action, status, confidence, note), the row errors and the count of lines that add or merge. Writes nothing. A file refused for a limit comes back as one error with row 0 |
| `ExtractionImportCommit` | the same text and hint | Parses and plans the text again, so it never takes the page's word for the preview. Stores the lines that add or merge as suggestions with source `imported`, in one write. When the write fails, none are stored. Applies the ones the rule accepts, flagged for Review. If applying fails after the write, the call returns the error; the stored suggestions stay listed and the next scan or decision applies them. Returns the stored suggestions, the ids of the entries it changed and the count skipped: one undo step. A refused file is refused with the importer's sentence |
| `ExtractionImportPrompt` | `csv` or `json` | `Prompt`'s text (exactly what Copy puts on the clipboard), the example in it, and `maxBytes` (2 MiB) |

The stored evidence is the manuscript's own text, found by the evidence check; the file's quote is only what is searched for.
