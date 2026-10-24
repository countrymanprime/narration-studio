package takedivergence

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"desktop/internal/compare"
	"desktop/internal/recordingcoverage"
)

// The schema versions of the manifest the host writes and of the results.
const (
	ManifestSchemaVersion = 1
	ResultSchemaVersion   = 1
)

// sentence makes an error whose text is a sentence for the narrator (the
// sidecar's own wording), shown as written: ST1005's rule is for errors
// wrapped into other messages.
func sentence(format string, args ...any) error { return fmt.Errorf(format, args...) }

// Take is one take's range of its source file, in source seconds.
type Take struct {
	ItemGUID, TakeGUID, SourceFile string
	StartOffset, Length            float64
}

// Manifest is a --take-divergence manifest: a chapter, a span of its sentence
// units or of its paragraphs (exactly one of the two), and the takes.
type Manifest struct {
	ChapterID                     string
	FirstUnit, LastUnit           *int
	FirstParagraph, LastParagraph *int
	Takes                         []Take
}

func keys(raw json.RawMessage, expected []string, where string) (map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return nil, sentence("%s is not an object", where)
	}
	var missing, unknown []string
	for _, key := range expected {
		if _, ok := fields[key]; !ok {
			missing = append(missing, "'"+key+"'")
		}
	}
	for key := range fields {
		found := false
		for _, e := range expected {
			found = found || e == key
		}
		if !found {
			unknown = append(unknown, "'"+key+"'")
		}
	}
	if len(missing) > 0 || len(unknown) > 0 {
		sort.Strings(missing)
		sort.Strings(unknown)
		return nil, sentence("%s: missing [%s], unknown [%s]", where, strings.Join(missing, ", "), strings.Join(unknown, ", "))
	}
	return fields, nil
}

func whole(raw json.RawMessage) (int, bool) {
	value, integer, ok := compare.JSONNumber(raw)
	if !ok || !integer || value < 0 || value > math.MaxInt32 {
		return 0, false
	}
	return int(value), true
}

func take(raw json.RawMessage, position int) (Take, error) {
	where := fmt.Sprintf("manifest take %d", position)
	fields, err := keys(raw, []string{"itemGuid", "takeGuid", "sourceFile", "startOffset", "length"}, where)
	if err != nil {
		return Take{}, err
	}
	var out Take
	for _, key := range []string{"itemGuid", "takeGuid", "sourceFile"} {
		value, ok := compare.JSONString(fields[key])
		if !ok || value == "" {
			return Take{}, sentence("%s: %s must be a non-empty string", where, key)
		}
		switch key {
		case "itemGuid":
			out.ItemGUID = value
		case "takeGuid":
			out.TakeGUID = value
		default:
			out.SourceFile = value
		}
	}
	start, _, ok := compare.JSONNumber(fields["startOffset"])
	if !ok || start < 0 {
		return Take{}, sentence("%s: startOffset must be a finite number of seconds, 0 or more", where)
	}
	length, _, ok := compare.JSONNumber(fields["length"])
	if !ok || length <= 0 {
		return Take{}, sentence("%s: length must be a finite number of seconds above 0", where)
	}
	out.StartOffset, out.Length = start, length
	return out, nil
}

// ReadManifest is take_divergence_mode.read_manifest: the manifest, checked
// field by field; takes keep manifest order.
func ReadManifest(path string) (Manifest, error) {
	raw, err := compare.ReadBounded(path)
	if err == nil && !json.Valid(raw) {
		err = fmt.Errorf("not JSON")
	}
	if err != nil {
		return Manifest{}, sentence("The take-divergence manifest could not be read: %v", err)
	}
	data, err := keys(raw, []string{"schemaVersion", "chapterId", "span", "takes"}, "The take-divergence manifest")
	if err != nil {
		return Manifest{}, err
	}
	if !compare.IsVersionOne(data["schemaVersion"]) {
		return Manifest{}, sentence("The take-divergence manifest is not schema version %d", ManifestSchemaVersion)
	}
	var manifest Manifest
	var ok bool
	if manifest.ChapterID, ok = compare.JSONString(data["chapterId"]); !ok || manifest.ChapterID == "" {
		return Manifest{}, sentence("The manifest's chapterId must be a non-empty string")
	}
	var span map[string]json.RawMessage
	_ = json.Unmarshal(data["span"], &span)
	_, hasUnit1 := span["firstUnit"]
	_, hasUnit2 := span["lastUnit"]
	_, hasPara1 := span["firstParagraph"]
	_, hasPara2 := span["lastParagraph"]
	if (hasUnit1 || hasUnit2) && (hasPara1 || hasPara2) {
		return Manifest{}, sentence("The manifest's span names sentences or paragraphs, not both")
	}
	byParagraph := hasPara1 || hasPara2
	names, noun, order := []string{"firstUnit", "lastUnit"}, "sentence", "firstUnit <= lastUnit"
	if byParagraph {
		names, noun, order = []string{"firstParagraph", "lastParagraph"}, "paragraph", "firstParagraph <= lastParagraph"
	}
	fields, err := keys(data["span"], names, "The manifest's span")
	if err != nil {
		return Manifest{}, err
	}
	first, ok1 := whole(fields[names[0]])
	last, ok2 := whole(fields[names[1]])
	if !ok1 || !ok2 {
		return Manifest{}, sentence("The manifest's span must be two whole %s numbers", noun)
	}
	if first > last {
		return Manifest{}, sentence("The manifest's span must have %s", order)
	}
	var takes []json.RawMessage
	if json.Unmarshal(data["takes"], &takes) != nil || len(takes) == 0 {
		return Manifest{}, sentence("The manifest's takes must be a non-empty list")
	}
	for position, raw := range takes {
		t, err := take(raw, position)
		if err != nil {
			return Manifest{}, err
		}
		manifest.Takes = append(manifest.Takes, t)
	}
	if byParagraph {
		manifest.FirstParagraph, manifest.LastParagraph = ptr(first), ptr(last)
	} else {
		manifest.FirstUnit, manifest.LastUnit = ptr(first), ptr(last)
	}
	return manifest, nil
}

// Prepared is a manifest's chapter and span, found and checked before
// anything is transcribed.
type Prepared struct {
	Manifest  Manifest
	Chapter   compare.Chapter
	Span      Span
	Tokenizer compare.Tokenizer
}

// Prepare reads the manifest, the project's equivalences and the chapter, and
// builds the span: everything take_divergence_mode.run checks before the first
// transcription, so a bad span fails before any take is decoded.
func Prepare(manifestPath, manuscriptPath string) (Prepared, error) {
	manifest, err := ReadManifest(manifestPath)
	if err != nil {
		return Prepared{}, err
	}
	groups, _, err := recordingcoverage.ProjectEquivalences(manuscriptPath)
	if err != nil {
		return Prepared{}, err
	}
	chapters, err := compare.LoadManuscriptChapters(manuscriptPath)
	if err != nil {
		return Prepared{}, err
	}
	p := Prepared{Manifest: manifest, Tokenizer: compare.NewTokenizer(groups)}
	found := false
	for _, chapter := range chapters {
		if chapter.ID == manifest.ChapterID {
			p.Chapter, found = chapter, true
			break
		}
	}
	if !found {
		return Prepared{}, sentence("The manuscript has no narratable chapter with id '%s'", manifest.ChapterID)
	}
	if manifest.FirstParagraph != nil {
		p.Span, err = BuildParagraphSpan(p.Tokenizer, p.Chapter.Paragraphs, *manifest.FirstParagraph, *manifest.LastParagraph)
	} else {
		p.Span, err = BuildSpan(p.Tokenizer, p.Chapter.Paragraphs, *manifest.FirstUnit, *manifest.LastUnit)
	}
	return p, err
}

// WordsReport is what the sidecar's --take-divergence mode writes: the model
// and language it transcribed with, and each take's words, timed in seconds
// from the start of the take's range.
type WordsReport struct {
	Model    string
	Language *string
	Takes    map[int][]compare.Word
	// TakeGUIDs is the take each TAKE_WORDS line names, checked against the manifest.
	TakeGUIDs map[int]string
}

// ReadWordsReport reads the sidecar's words report: a TAKE_TRANSCRIPTION line,
// then one TAKE_WORDS line per take. An unknown tag or a malformed line is an
// error.
func ReadWordsReport(path string) (WordsReport, error) {
	raw, err := compare.ReadBounded(path)
	if err != nil {
		return WordsReport{}, sentence("The take aligner's words report could not be read: %v", err)
	}
	report := WordsReport{Takes: map[int][]compare.Word{}, TakeGUIDs: map[int]string{}}
	transcription := false
	for number, line := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
		if line == "" {
			continue
		}
		malformed := sentence("The take aligner's words report has a malformed line %d.", number+1)
		tag, payload, _ := strings.Cut(line, "|")
		switch tag {
		case "TAKE_TRANSCRIPTION":
			var fields map[string]json.RawMessage
			if json.Unmarshal([]byte(payload), &fields) != nil {
				return WordsReport{}, malformed
			}
			model, ok := compare.JSONString(fields["model"])
			if !ok {
				return WordsReport{}, malformed
			}
			report.Model, transcription = model, true
			if language, ok := compare.JSONString(fields["language"]); ok {
				report.Language = &language
			}
		case "TAKE_WORDS":
			var entry struct {
				Index    *int     `json:"index"`
				TakeGUID string   `json:"takeGuid"`
				Words    [][3]any `json:"words"`
			}
			if json.Unmarshal([]byte(payload), &entry) != nil || entry.Index == nil || entry.Words == nil {
				return WordsReport{}, malformed
			}
			words := make([]compare.Word, len(entry.Words))
			for k, word := range entry.Words {
				text, ok1 := word[0].(string)
				start, ok2 := word[1].(float64)
				end, ok3 := word[2].(float64)
				if !ok1 || !ok2 || !ok3 {
					return WordsReport{}, malformed
				}
				words[k] = compare.Word{Text: text, Start: start, End: end}
			}
			report.Takes[*entry.Index] = words
			if entry.TakeGUID != "" {
				report.TakeGUIDs[*entry.Index] = entry.TakeGUID
			}
		default:
			return WordsReport{}, sentence("The take aligner's words report has an unknown line %q.", tag)
		}
	}
	if !transcription {
		return WordsReport{}, sentence("The take aligner's words report does not say how it transcribed.")
	}
	return report, nil
}

func seconds(value *float64, offset float64) any {
	if value == nil {
		return nil
	}
	return compare.PyRound(*value+offset, timeDecimals)
}

func intOrNil(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

// alignmentJSON is take_divergence.to_json, its keys in Python's order.
func alignmentJSON(a Alignment, offset float64) []compare.PyField {
	counts := compare.PyOrdered{}
	for _, status := range WordStatuses {
		counts = append(counts, compare.PyField{Key: status, Value: a.Count(status)})
	}
	counts = append(counts, compare.PyField{Key: "extraWords", Value: a.ExtraWords})
	words := make([]any, len(a.Words))
	for k, w := range a.Words {
		words[k] = compare.PyOrdered{{Key: "index", Value: w.Index}, {Key: "status", Value: w.Status}, {Key: "start", Value: seconds(w.Start, offset)}, {Key: "end", Value: seconds(w.End, offset)}}
	}
	divergences := make([]any, len(a.Divergences))
	for k, d := range a.Divergences {
		divergences[k] = compare.PyOrdered{
			{Key: "kind", Value: d.Kind}, {Key: "position", Value: d.Position}, {Key: "firstWord", Value: intOrNil(d.FirstWord)},
			{Key: "lastWord", Value: intOrNil(d.LastWord)}, {Key: "manuscriptText", Value: d.ManuscriptText}, {Key: "audioText", Value: d.AudioText},
			{Key: "start", Value: seconds(d.Start, offset)}, {Key: "end", Value: seconds(d.End, offset)},
		}
	}
	return []compare.PyField{
		{Key: "fidelity", Value: compare.PyRound(a.Fidelity(), 4)}, {Key: "counts", Value: counts},
		{Key: "words", Value: words}, {Key: "divergences", Value: divergences},
	}
}

// Results is the results file take_divergence_mode.run wrote: a SUMMARY line,
// the DIVERGENCE_SPAN line naming the span, and one TAKE_DIVERGENCE line per
// take in manifest order, every time in the take's source seconds.
func Results(p Prepared, report WordsReport) (string, error) {
	var out strings.Builder
	lines := []string{}
	for index, t := range p.Manifest.Takes {
		words, ok := report.Takes[index]
		if !ok {
			return "", sentence("The take aligner has no words for take %d.", index)
		}
		if guid, named := report.TakeGUIDs[index]; named && guid != t.TakeGUID {
			return "", sentence("The take aligner's words for take %d are of take %s, not %s.", index, guid, t.TakeGUID)
		}
		payload := compare.PyOrdered{
			{Key: "index", Value: index}, {Key: "itemGuid", Value: t.ItemGUID}, {Key: "takeGuid", Value: t.TakeGUID},
			{Key: "sourceFile", Value: t.SourceFile}, {Key: "startOffset", Value: t.StartOffset}, {Key: "length", Value: t.Length},
		}
		payload = append(payload, alignmentJSON(AlignTake(p.Tokenizer, p.Span, words), t.StartOffset)...)
		lines = append(lines, "TAKE_DIVERGENCE|"+compare.DumpPy(payload, true)+"\n")
	}
	spanWords := make([]any, len(p.Span.Words))
	for k, w := range p.Span.Words {
		spanWords[k] = compare.PyOrdered{{Key: "index", Value: w.Index}, {Key: "text", Value: w.Text}, {Key: "unit", Value: w.Unit}, {Key: "paragraph", Value: w.Paragraph}}
	}
	header := compare.PyOrdered{
		{Key: "schemaVersion", Value: ResultSchemaVersion}, {Key: "chapterId", Value: p.Chapter.ID}, {Key: "chapterTitle", Value: p.Chapter.Title},
		{Key: "span", Value: compare.PyOrdered{
			{Key: "firstUnit", Value: p.Span.FirstUnit}, {Key: "lastUnit", Value: p.Span.LastUnit},
			{Key: "firstParagraph", Value: p.Span.FirstParagraph}, {Key: "lastParagraph", Value: p.Span.LastParagraph},
			{Key: "words", Value: spanWords},
		}},
		{Key: "model", Value: report.Model}, {Key: "language", Value: report.Language},
	}
	fmt.Fprintf(&out, "SUMMARY|Aligned %d take(s) to sentences %d-%d of '%s'\n", len(p.Manifest.Takes), p.Span.FirstUnit, p.Span.LastUnit, compare.CleanMarkerField(compare.DisplayTitle(p.Chapter.Title)))
	out.WriteString("DIVERGENCE_SPAN|" + compare.DumpPy(header, true) + "\n")
	out.WriteString(strings.Join(lines, ""))
	return out.String(), nil
}

// Run aligns every take of the manifest to its span from the sidecar's words
// report and writes the results file atomically.
func Run(manifestPath, manuscriptPath, wordsReport, out string) error {
	p, err := Prepare(manifestPath, manuscriptPath)
	if err != nil {
		return err
	}
	report, err := ReadWordsReport(wordsReport)
	if err != nil {
		return err
	}
	text, err := Results(p, report)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return err
	}
	temporary := out + ".tmp"
	if err := os.WriteFile(temporary, []byte(text), 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, out)
}
