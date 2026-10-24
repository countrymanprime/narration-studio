package recordingcoverage

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
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

// maxInputBytes bounds every file the check reads: a words file for an
// hour-long item is well under a megabyte.
const maxInputBytes = 64 << 20

// readBounded reads a whole file of at most maxInputBytes.
func readBounded(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = file.Close() }()
	raw, err := io.ReadAll(io.LimitReader(file, maxInputBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > maxInputBytes {
		return nil, fmt.Errorf("%s is larger than %d bytes", filepath.Base(path), maxInputBytes)
	}
	return raw, nil
}

// wordsFileName is WORDS_FILE_NAME: a plain file name, never a path.
var wordsFileName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$`)

// Chapter is one narration chapter of the canonical manuscript, as
// compare.py's load_manuscript_chapters reads it.
type Chapter struct {
	ID           string
	Title        string
	Subtitle     string
	Paragraphs   []string
	ParagraphIDs []string
}

// Heading is the heading a narrator may read first: the title and the
// subtitle, the empty ones left out.
func (c Chapter) Heading() string {
	parts := []string{}
	for _, part := range []string{c.Title, c.Subtitle} {
		if part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, " ")
}

// LoadChapter reads the canonical manuscript at path the way
// narration_common.manuscript.load_file validates it and returns its
// narration chapter chapterID. The errors are the sidecar's own sentences.
func LoadChapter(path, chapterID string) (Chapter, error) {
	raw, err := readBounded(path)
	if err != nil {
		if info, statErr := os.Stat(path); statErr != nil || !info.Mode().IsRegular() {
			return Chapter{}, sentence("Import a manuscript first.")
		}
		return Chapter{}, sentence("The canonical manuscript data could not be read.")
	}
	var data struct {
		SchemaVersion json.RawMessage   `json:"schemaVersion"`
		DocumentID    json.RawMessage   `json:"documentId"`
		Chapters      []json.RawMessage `json:"chapters"`
		Paragraphs    []json.RawMessage `json:"paragraphs"`
	}
	if !utf8.Valid(raw) || json.Unmarshal(raw, &data) != nil {
		return Chapter{}, sentence("The canonical manuscript data could not be read.")
	}
	if !isVersionOne(data.SchemaVersion) {
		return Chapter{}, sentence("This manuscript data uses an unsupported schema version.")
	}
	if _, ok := jsonString(data.DocumentID); !ok || data.Chapters == nil || data.Paragraphs == nil {
		return Chapter{}, sentence("The canonical manuscript data is invalid.")
	}
	type chapterRecord struct {
		ID          *string         `json:"id"`
		Title       json.RawMessage `json:"title"`
		Subtitle    json.RawMessage `json:"subtitle"`
		ContentKind json.RawMessage `json:"contentKind"`
	}
	chapterIDs := map[string]bool{}
	records := make([]chapterRecord, len(data.Chapters))
	for k, rawChapter := range data.Chapters {
		if json.Unmarshal(rawChapter, &records[k]) == nil && records[k].ID != nil {
			chapterIDs[*records[k].ID] = true
		}
	}
	type paragraphRecord struct {
		ID        string `json:"id"`
		ChapterID string `json:"chapterId"`
		Text      string `json:"text"`
	}
	paragraphs := make([]paragraphRecord, len(data.Paragraphs))
	seen := map[string]bool{}
	for k, rawParagraph := range data.Paragraphs {
		var fields map[string]json.RawMessage
		invalid := json.Unmarshal(rawParagraph, &fields) != nil || fields == nil
		for _, key := range []string{"id", "chapterId", "text"} {
			if _, ok := jsonString(fields[key]); invalid || !ok {
				invalid = true
				break
			}
		}
		if !invalid {
			_ = json.Unmarshal(rawParagraph, &paragraphs[k])
			invalid = seen[paragraphs[k].ID] || !chapterIDs[paragraphs[k].ChapterID]
		}
		if invalid {
			return Chapter{}, sentence("The canonical manuscript has invalid paragraph records.")
		}
		seen[paragraphs[k].ID] = true
	}

	narration := map[string]*Chapter{}
	order := []string{}
	for _, record := range records {
		if record.ID == nil {
			return Chapter{}, sentence("The canonical manuscript data is invalid.")
		}
		if kind := record.ContentKind; kind != nil && string(kind) != `"narration"` {
			continue
		}
		title, ok := jsonString(record.Title)
		if !ok {
			return Chapter{}, sentence("The chapter %q has no title.", *record.ID)
		}
		subtitle, _ := jsonString(record.Subtitle)
		if _, again := narration[*record.ID]; !again {
			order = append(order, *record.ID)
		}
		narration[*record.ID] = &Chapter{ID: *record.ID, Title: title, Subtitle: subtitle}
	}
	for _, paragraph := range paragraphs {
		if chapter := narration[paragraph.ChapterID]; chapter != nil {
			chapter.Paragraphs = append(chapter.Paragraphs, paragraph.Text)
			chapter.ParagraphIDs = append(chapter.ParagraphIDs, paragraph.ID)
		}
	}
	any := false
	for _, id := range order {
		if len(narration[id].Paragraphs) > 0 {
			any = true
		}
	}
	if !any {
		return Chapter{}, sentence("The canonical manuscript has no narratable chapters.")
	}
	if chapter := narration[chapterID]; chapter != nil && len(chapter.Paragraphs) > 0 {
		return *chapter, nil
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
	raw, readErr := readBounded(path)
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

// jsonNumber reports whether raw is a finite JSON number (not a boolean), and
// whether it is an integer as Python's json reads it (no fraction, no
// exponent).
func jsonNumber(raw json.RawMessage) (value float64, integer, ok bool) {
	text := strings.TrimSpace(string(raw))
	if text == "" || text[0] != '-' && (text[0] < '0' || text[0] > '9') {
		return 0, false, false
	}
	if err := json.Unmarshal(raw, &value); err != nil || math.IsInf(value, 0) {
		return 0, false, false
	}
	return value, !strings.ContainsAny(text, ".eE"), true
}

// jsonString is a JSON string value (null and every other type are not).
func jsonString(raw json.RawMessage) (string, bool) {
	var value string
	if len(raw) == 0 || raw[0] != '"' || json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}

// isVersionOne is Python's `value == 1` for a JSON value: the number 1 (1.0
// included) and, since Python's True equals 1, true.
func isVersionOne(raw json.RawMessage) bool {
	if string(raw) == "true" {
		return true
	}
	value, _, ok := jsonNumber(raw)
	return ok && value == 1
}

func readJSONFile(path string) (map[string]json.RawMessage, error) {
	raw, err := readBounded(path)
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
	index, integer, ok := jsonNumber(fields["index"])
	if !ok || !integer || index < 0 || index > math.MaxInt32 {
		return item, sentence("%s: index must be a whole number, 0 or more", where)
	}
	item.Index = int(index)
	for _, key := range []string{"itemGuid", "sourceFile"} {
		value, ok := jsonString(fields[key])
		if !ok || value == "" {
			return item, sentence("%s: %s must be a non-empty string", where, key)
		}
		if key == "itemGuid" {
			item.ItemGUID = value
		} else {
			item.SourceFile = value
		}
	}
	if value, _, ok := jsonNumber(fields["startOffset"]); !ok || value < 0 {
		return item, sentence("%s: startOffset must be a finite number of seconds, 0 or more", where)
	} else {
		item.StartOffset = value
	}
	if value, _, ok := jsonNumber(fields["length"]); !ok || value <= 0 {
		return item, sentence("%s: length must be a finite number of seconds above 0", where)
	} else {
		item.Length = value
	}
	if item.WordsFile, _ = jsonString(fields["wordsFile"]); !wordsFileName.MatchString(item.WordsFile) {
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
	if !isVersionOne(fields["schemaVersion"]) {
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
	if !isVersionOne(fields["schemaVersion"]) {
		return nil
	}
	start, _, okStart := jsonNumber(fields["sourceStart"])
	end, _, okEnd := jsonNumber(fields["sourceEnd"])
	var rawWords []json.RawMessage
	var transcription map[string]json.RawMessage
	if !okStart || !okEnd || json.Unmarshal(fields["words"], &rawWords) != nil || rawWords == nil ||
		json.Unmarshal(fields["transcription"], &transcription) != nil || transcription == nil {
		return nil
	}
	words := &ItemWords{SourceStart: start, SourceEnd: end, Words: make([]compare.Word, 0, len(rawWords))}
	model, ok := jsonString(transcription["model"])
	if !ok {
		return nil
	}
	words.Model = model
	if language, ok := jsonString(transcription["language"]); ok {
		words.Language = &language
	}
	for _, rawWord := range rawWords {
		var parts []json.RawMessage
		if json.Unmarshal(rawWord, &parts) != nil || (len(parts) != 3 && len(parts) != 4) {
			return nil
		}
		text, ok := jsonString(parts[0])
		if !ok {
			return nil
		}
		wordStart, _, ok1 := jsonNumber(parts[1])
		wordEnd, _, ok2 := jsonNumber(parts[2])
		if !ok1 || !ok2 {
			return nil
		}
		if len(parts) == 4 && string(parts[3]) != "null" {
			if _, _, ok := jsonNumber(parts[3]); !ok {
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
			_, _, ok1 := jsonNumber(span["start"])
			_, _, ok2 := jsonNumber(span["end"])
			if _, ok3 := jsonString(span["model"]); span == nil || !ok1 || !ok2 || !ok3 {
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
	raw, err := readBounded(path)
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
