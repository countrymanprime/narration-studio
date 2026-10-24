package recordingcoverage

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"desktop/internal/compare"
)

// The schema versions of the files the check reads, coverage_mode.py's.
const (
	ManifestSchemaVersion = 1
	WordsSchemaVersion    = 1
	ResultSchemaVersion   = 1
	manuscriptSchema      = 1
)

// rangeTolerance is RANGE_TOLERANCE_SECONDS: the slack at either edge of a
// played range a words file must cover.
const rangeTolerance = 0.001

// sentence makes an error whose text is a sentence for the narrator, shown as
// written in the check's failure message (the sidecar's own wording), so it
// starts with a capital and ends with a full stop: ST1005's rule is for errors
// wrapped into other messages.
func sentence(format string, args ...any) error {
	return fmt.Errorf(format, args...)
}

// wordsFileName is WORDS_FILE_NAME: a plain file name, never a path.
var wordsFileName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$`)

// Chapter is one narration chapter of the canonical manuscript.
type Chapter = compare.Chapter

// LoadChapter is the narration chapter chapterID of the canonical manuscript
// at path, read and validated as the sidecar's load_manuscript_chapters reads
// it; the errors are the sidecar's own sentences.
func LoadChapter(path, chapterID string) (Chapter, error) {
	chapters, err := compare.LoadManuscriptChapters(path)
	if err != nil {
		return Chapter{}, err
	}
	for _, chapter := range chapters {
		if chapter.ID == chapterID {
			return chapter, nil
		}
	}
	return Chapter{}, sentence("Chapter '%s' is not a narration chapter of the manuscript.", chapterID)
}

// EquivalencesPath is compare.py's project_data_path(manuscript,
// "equivalences.csv"): TranscriptCompare/equivalences.csv two folders above
// the manuscript's own.
func EquivalencesPath(manuscriptPath string) (string, error) {
	resolved, err := filepath.Abs(manuscriptPath)
	if err != nil {
		return "", err
	}
	if real, err := filepath.EvalSymlinks(resolved); err == nil {
		resolved = real
	}
	folder := filepath.Dir(filepath.Dir(filepath.Dir(resolved)))
	return filepath.Join(folder, "TranscriptCompare", "equivalences.csv"), nil
}

// ProjectEquivalences is register_project_equivalences: the project's own
// equivalence groups and, when it has any, the "sha256:<hex>" of the file
// that holds them (the results' analysis.equivalencesHash). A missing or
// unreadable file has no groups.
func ProjectEquivalences(manuscriptPath string) (groups [][]string, hash *string, err error) {
	path, err := EquivalencesPath(manuscriptPath)
	if err != nil {
		return nil, nil, nil
	}
	raw, readErr := compare.ReadBounded(path)
	if readErr != nil {
		return nil, nil, nil
	}
	if !utf8.Valid(raw) {
		return nil, nil, sentence("The project's equivalences file %s is not UTF-8 text.", path)
	}
	groups = compare.LoadEquivalenceGroups(string(raw))
	if len(groups) == 0 {
		return nil, nil, nil
	}
	sum := sha256.Sum256(raw)
	text := "sha256:" + hex.EncodeToString(sum[:])
	return groups, &text, nil
}

// ManifestItem is one item's active take: the played range of its source, in
// source seconds.
type ManifestItem struct {
	Index       int
	ItemGUID    string
	SourceFile  string
	StartOffset float64
	Length      float64
	WordsFile   string
	Muted       bool
}

// End is where the played range ends in the source.
func (m ManifestItem) End() float64 { return m.StartOffset + m.Length }

func readJSONFile(path string) (map[string]json.RawMessage, error) {
	raw, err := compare.ReadBounded(path)
	if err != nil {
		return nil, err
	}
	if !utf8.Valid(raw) {
		return nil, errors.New("not UTF-8 text")
	}
	var fields map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if err := decoder.Decode(&fields); err != nil {
		return nil, err
	}
	if decoder.More() {
		return nil, errors.New("extra data after the JSON value")
	}
	return fields, nil
}

var manifestItemKeys = []string{"index", "itemGuid", "sourceFile", "startOffset", "length", "wordsFile", "muted"}

func manifestItem(raw json.RawMessage, position int) (ManifestItem, error) {
	where := fmt.Sprintf("manifest item %d", position)
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return ManifestItem{}, fmt.Errorf("%s is not an object", where)
	}
	var missing, unknown []string
	for _, key := range manifestItemKeys {
		if _, ok := fields[key]; !ok {
			missing = append(missing, "'"+key+"'")
		}
	}
	for key := range fields {
		if !contains(manifestItemKeys, key) {
			unknown = append(unknown, "'"+key+"'")
		}
	}
	if len(missing) > 0 || len(unknown) > 0 {
		sort.Strings(missing)
		sort.Strings(unknown)
		return ManifestItem{}, sentence("%s: missing [%s], unknown [%s]", where, strings.Join(missing, ", "), strings.Join(unknown, ", "))
	}
	item := ManifestItem{}
	index, integer, ok := compare.JSONNumber(fields["index"])
	if !ok || !integer || index < 0 || index > math.MaxInt32 {
		return item, sentence("%s: index must be a whole number, 0 or more", where)
	}
	item.Index = int(index)
	for _, key := range []string{"itemGuid", "sourceFile"} {
		value, ok := compare.JSONString(fields[key])
		if !ok || value == "" {
			return item, sentence("%s: %s must be a non-empty string", where, key)
		}
		if key == "itemGuid" {
			item.ItemGUID = value
		} else {
			item.SourceFile = value
		}
	}
	if value, _, ok := compare.JSONNumber(fields["startOffset"]); !ok || value < 0 {
		return item, sentence("%s: startOffset must be a finite number of seconds, 0 or more", where)
	} else {
		item.StartOffset = value
	}
	if value, _, ok := compare.JSONNumber(fields["length"]); !ok || value <= 0 {
		return item, sentence("%s: length must be a finite number of seconds above 0", where)
	} else {
		item.Length = value
	}
	if item.WordsFile, _ = compare.JSONString(fields["wordsFile"]); !wordsFileName.MatchString(item.WordsFile) {
		return item, sentence("%s: wordsFile must be a plain file name (letters, digits, '.', '_', '-')", where)
	}
	if text := string(fields["muted"]); text != "true" && text != "false" {
		return item, sentence("%s: muted must be true or false", where)
	}
	item.Muted = string(fields["muted"]) == "true"
	return item, nil
}

func contains(list []string, value string) bool {
	for _, element := range list {
		if element == value {
			return true
		}
	}
	return false
}

// ReadManifest is coverage_mode.read_manifest: the manifest's items in play
// order (by index), checked field by field. The host writes the manifest (a
// trust boundary, docs/architecture/threat-model.md row 4e).
func ReadManifest(path string) ([]ManifestItem, error) {
	fields, err := readJSONFile(path)
	if err != nil {
		return nil, sentence("The coverage manifest could not be read: %v", err)
	}
	if !compare.IsVersionOne(fields["schemaVersion"]) {
		return nil, sentence("The coverage manifest is not schema version %d", ManifestSchemaVersion)
	}
	var rawItems []json.RawMessage
	if json.Unmarshal(fields["items"], &rawItems) != nil || rawItems == nil {
		return nil, sentence("The coverage manifest's items must be a list")
	}
	if len(rawItems) == 0 {
		return nil, sentence("The coverage manifest has no items")
	}
	items := make([]ManifestItem, len(rawItems))
	for position, raw := range rawItems {
		if items[position], err = manifestItem(raw, position); err != nil {
			return nil, err
		}
	}
	seen := map[int]bool{}
	for _, item := range items {
		if seen[item.Index] {
			return nil, sentence("The coverage manifest lists item index %d twice", item.Index)
		}
		seen[item.Index] = true
	}
	sort.SliceStable(items, func(x, y int) bool { return items[x].Index < items[y].Index })
	return items, nil
}

// ItemWords is the part of a words file the alignment reads: the words said
// in [SourceStart, SourceEnd] of a source, in source seconds, and the model
// and language that made them.
type ItemWords struct {
	Words       []compare.Word
	SourceStart float64
	SourceEnd   float64
	Model       string
	Language    *string
}

// parseWords is coverage_mode._parse_words: nil for anything that is not a
// words file of this schema.
func parseWords(fields map[string]json.RawMessage) *ItemWords {
	if !compare.IsVersionOne(fields["schemaVersion"]) {
		return nil
	}
	start, _, okStart := compare.JSONNumber(fields["sourceStart"])
	end, _, okEnd := compare.JSONNumber(fields["sourceEnd"])
	var rawWords []json.RawMessage
	var transcription map[string]json.RawMessage
	if !okStart || !okEnd || json.Unmarshal(fields["words"], &rawWords) != nil || rawWords == nil ||
		json.Unmarshal(fields["transcription"], &transcription) != nil || transcription == nil {
		return nil
	}
	words := &ItemWords{SourceStart: start, SourceEnd: end, Words: make([]compare.Word, 0, len(rawWords))}
	model, ok := compare.JSONString(transcription["model"])
	if !ok {
		return nil
	}
	words.Model = model
	if language, ok := compare.JSONString(transcription["language"]); ok {
		words.Language = &language
	}
	for _, rawWord := range rawWords {
		var parts []json.RawMessage
		if json.Unmarshal(rawWord, &parts) != nil || (len(parts) != 3 && len(parts) != 4) {
			return nil
		}
		text, ok := compare.JSONString(parts[0])
		if !ok {
			return nil
		}
		wordStart, _, ok1 := compare.JSONNumber(parts[1])
		wordEnd, _, ok2 := compare.JSONNumber(parts[2])
		if !ok1 || !ok2 {
			return nil
		}
		if len(parts) == 4 && string(parts[3]) != "null" {
			if _, _, ok := compare.JSONNumber(parts[3]); !ok {
				return nil
			}
		}
		words.Words = append(words.Words, compare.Word{Text: text, Start: wordStart, End: wordEnd})
	}
	if rawSpans, ok := fields["spans"]; ok {
		var spans []map[string]json.RawMessage
		if json.Unmarshal(rawSpans, &spans) != nil || spans == nil {
			return nil
		}
		for _, span := range spans {
			_, _, ok1 := compare.JSONNumber(span["start"])
			_, _, ok2 := compare.JSONNumber(span["end"])
			if _, ok3 := compare.JSONString(span["model"]); span == nil || !ok1 || !ok2 || !ok3 {
				return nil
			}
		}
	}
	return words
}

// ReadWordsFile is coverage_mode.read_words_file: nil when the file is
// absent, unreadable or not this schema, each a cache miss.
func ReadWordsFile(path string) *ItemWords {
	fields, err := readJSONFile(path)
	if err != nil || fields == nil {
		return nil
	}
	return parseWords(fields)
}

// Covers is coverage_mode.covers: the words transcribed all of the item's
// played range and, with model given, that model made them.
func (w *ItemWords) Covers(item ManifestItem, model string) bool {
	inRange := w.SourceStart <= item.StartOffset+rangeTolerance && w.SourceEnd >= item.End()-rangeTolerance
	return inRange && (model == "" || w.Model == model)
}

// Played is coverage_mode.played_words: the words whose midpoint lies in the
// item's played range.
func (w *ItemWords) Played(item ManifestItem) []compare.Word {
	out := []compare.Word{}
	for _, word := range w.Words {
		if middle := (word.Start + word.End) / 2; item.StartOffset <= middle && middle <= item.End() {
			out = append(out, word)
		}
	}
	return out
}

// The sources of an analyzed item's words.
const (
	SourceReused      = "reused"
	SourceTranscribed = "transcribed"
)

// WordsReport is what the sidecar's coverage mode writes once it has every
// playing item's words: per item index whether it reused a cached words file
// or transcribed one, and the COVERAGE_UNSURE and COVERAGE_RECHECKED payloads,
// which the results carry as written.
type WordsReport struct {
	Sources   map[int]string
	Unsure    []compare.RawJSON
	Rechecked []compare.RawJSON
}

// ReadWordsReport reads the sidecar's words report (docs/utilities/recording-coverage.md,
// "The sidecar's words report"). An unknown tag or a malformed line is an error: the
// host never guesses at what the sidecar meant.
func ReadWordsReport(path string) (WordsReport, error) {
	raw, err := compare.ReadBounded(path)
	if err != nil {
		return WordsReport{}, sentence("The recording check's words report could not be read: %w", err)
	}
	report := WordsReport{Sources: map[int]string{}}
	for number, line := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
		if line == "" {
			continue
		}
		tag, payload, found := strings.Cut(line, "|")
		if !found || !json.Valid([]byte(payload)) {
			return WordsReport{}, sentence("The recording check's words report has a malformed line %d.", number+1)
		}
		switch tag {
		case "COVERAGE_WORDS":
			var entry struct {
				Index *int    `json:"index"`
				Words *string `json:"words"`
			}
			if json.Unmarshal([]byte(payload), &entry) != nil || entry.Index == nil || entry.Words == nil ||
				(*entry.Words != SourceReused && *entry.Words != SourceTranscribed) {
				return WordsReport{}, sentence("The recording check's words report has a malformed line %d.", number+1)
			}
			report.Sources[*entry.Index] = *entry.Words
		case "COVERAGE_UNSURE":
			report.Unsure = append(report.Unsure, compare.RawJSON(payload))
		case "COVERAGE_RECHECKED":
			report.Rechecked = append(report.Rechecked, compare.RawJSON(payload))
		default:
			return WordsReport{}, sentence("The recording check's words report has an unknown line %q.", tag)
		}
	}
	return report, nil
}
