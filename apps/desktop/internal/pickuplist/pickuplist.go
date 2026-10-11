// Package pickuplist is the host's pickup list (ADR 0840): every line the narrator has to record again, merged from
// four sources the host already holds, each with a stable id, minus the ones the narrator removed.
//
//   - speech: the gaps of a chapter's current recording check (coverage.ClassifyGaps, ADR 0830). The unread start and
//     end are unfinished recording, not pickups, and a stale or absent check adds nothing (its gaps no longer describe
//     the recording); the answer names those chapters and why.
//   - proof: findings the narrator decided "Needs pickup": status accepted and a fix that is a pickup (fixKindOf, the
//     Proof page's own rule, ADR 0470).
//   - audio: the same decision on a finding whose kind is a sound (mouth, plosive, noise or breath, ADR 0844).
//   - you: lines the narrator added by hand.
//
// The narrator's own changes (lines added, pickups removed, pickups left out of a session, and the done state of a
// pickup the DAW could not be told about) are kept in narration-utils/pickups/pickup-list.json, narrator data read
// through persist. The DAW's pickup markers stay the DAW-side truth for done: when the DAW answers and a listed marker
// sits at a pickup's position, its name (PICKUP: or PICKUP_DONE:) says whether the pickup is done.
package pickuplist

import (
	"cmp"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/findings"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
	"github.com/countrymanprime/narration-utils/shell/internal/proofing"
)

// Source is where a pickup came from.
type Source string

const (
	SourceSpeech Source = "speech"
	SourceProof  Source = "proof"
	SourceAudio  Source = "audio"
	SourceYou    Source = "you"
)

// ConfAddedByHand is the confidence reason of a line the narrator added: nothing measured it.
const ConfAddedByHand = "added_by_hand"

// MaxLineRunes bounds a line added by hand.
const MaxLineRunes = 500

// matchRunes is how much of a hand-added line is compared with the start of each paragraph.
const matchRunes = 24

// markerTolerance is how far apart a pickup's position and a marker's may be and still be the same pickup, in seconds
// (narration_pickups.lua's tolerance, and the DAW port's).
const markerTolerance = 0.15

// idPattern bounds an id the UI sends back: the ids this package makes, never a path.
var idPattern = regexp.MustCompile(`^(speech|finding|you):[A-Za-z0-9:._-]{1,240}$`)

// Pickup is one line of the list.
type Pickup struct {
	ID          string  `json:"id"`
	ChapterID   string  `json:"chapterId"`
	ParagraphID *string `json:"paragraphId"`
	// Paragraph is the line's index in the manuscript, or nil when the pickup names no line that is still there.
	Paragraph *int `json:"paragraph"`
	// Time is seconds into the chapter's recording: the check's source time, or the time the narrator typed.
	Time *float64 `json:"time"`
	// At is where the pickup's marker is, or would be, in the DAW project, in seconds; nil when the host cannot place it.
	At *float64 `json:"at"`
	// Type is the gap kind for a speech pickup, the finding's note type for proof and audio, and misread for a hand-added line.
	Type   string           `json:"type"`
	Gap    coverage.GapKind `json:"gap,omitempty"`
	Script string           `json:"script"`
	// Context is the paragraph's text, or the line itself when it names no paragraph.
	Context string `json:"context"`
	Source  Source `json:"source"`
	// Confidence is the source's own number or nil; ConfReason always says why when it is nil.
	Confidence *float64 `json:"confidence"`
	ConfReason string   `json:"confReason"`
	// FindingID is the finding the pickup came from, or the one an accepted gap became.
	FindingID string `json:"findingId,omitempty"`
	Included  bool   `json:"included"`
	Done      bool   `json:"done"`
	// Waiting says the done state is the app's and has not been written to the DAW's marker yet.
	Waiting bool `json:"waiting"`
}

// LeftOutChapter is a chapter whose recording check added no speech pickups, and why.
type LeftOutChapter struct {
	ChapterID string   `json:"chapterId"`
	State     string   `json:"state"`
	Reasons   []string `json:"reasons"`
}

// List is PickupsList's answer.
type List struct {
	Pickups []Pickup         `json:"pickups"`
	LeftOut []LeftOutChapter `json:"leftOut"`
}

// Paragraph is one line of a chapter as the manuscript has it now.
type Paragraph struct {
	ID    string
	Index int
	Text  string
}

// Chapter is one manuscript chapter. Seconds is its recorded length when the host knows it.
type Chapter struct {
	ID         string
	Paragraphs []Paragraph
	Seconds    *float64
}

// Speech is a chapter's recording check as the list needs it. State is current, stale or never (or why the result
// could not be read); only a current one has gaps that count.
type Speech struct {
	State    string
	Reasons  []string
	RecordID string
	Gaps     []coverage.GapLine
}

// Marker is one pickup marker the DAW listed: where it is and whether its name says done.
type Marker struct {
	At   float64
	Done bool
}

// DAW is the pickup markers as the list sees them. Markers answers the markers of the latest listing, and false when
// none is held. SetDone writes a done state through to the marker at a position (SN-D44's write-through); its error is
// the refusal, and nothing is stored then.
type DAW interface {
	Reachable() bool
	Markers() ([]Marker, bool)
	SetDone(at float64, done bool) error
}

// FindingsReader is the read-only part of the findings store the list needs.
type FindingsReader interface {
	List(query findings.Query) ([]findings.Finding, error)
}

// Config is what a Service reads.
type Config struct {
	// Project is the project folder; empty means no project is open.
	Project string
	// Chapters answers the manuscript's chapters in reading order.
	Chapters func() ([]Chapter, error)
	// Speech answers a chapter's recording check.
	Speech func(chapterID string) Speech
	// Findings is the project's findings store; nil adds no proof or audio pickups.
	Findings FindingsReader
	// Locate places a point of the recording in the DAW project; nil, or false, leaves At nil.
	Locate func(chapterID string, position coverage.RegionPosition) (float64, bool)
	// DAW is the pickup markers; nil is a DAW that never answers.
	DAW DAW
	// Reporter tells the narrator about a file that cannot be read (ADR 0069).
	Reporter *persist.Reporter
}

// Service builds the list and keeps the narrator's changes. It holds no state: the host builds one per call.
type Service struct {
	config Config
	now    func() time.Time
}

// New returns the service for config.
func New(config Config) *Service { return &Service{config: config, now: time.Now} }

// ErrUnknownPickup is the refusal for an id that is not in the list.
var ErrUnknownPickup = errors.New("that pickup is not in the list")

// List answers the merged list. When the DAW answers, it first finishes the done states that waited for it.
func (s *Service) List() (List, error) {
	if s.config.Project == "" {
		return emptyList(), nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return List{}, err
	}
	list, err := s.build(file)
	if err != nil {
		return List{}, err
	}
	if s.flushWaiting(&file, list.Pickups) {
		if err := s.write(file); err != nil {
			return List{}, err
		}
	}
	return s.finish(file, list, nil), nil
}

// Add stores a line the narrator typed, in a chapter at a time in its recording, and answers the list. The line is
// text only, never opened; the same line in the same chapter is one pickup, and adding a removed one shows it again.
func (s *Service) Add(chapterID string, at float64, line string) (List, error) {
	if s.config.Project == "" {
		return List{}, errors.New("save the project first")
	}
	line, err := cleanLine(line)
	if err != nil {
		return List{}, err
	}
	chapters, err := s.chapters()
	if err != nil {
		return List{}, err
	}
	index := slices.IndexFunc(chapters, func(c Chapter) bool { return c.ID == chapterID })
	if index < 0 {
		return List{}, errors.New("that chapter is not in the manuscript")
	}
	chapter := chapters[index]
	if math.IsNaN(at) || math.IsInf(at, 0) || at < 0 || (chapter.Seconds != nil && at > *chapter.Seconds) {
		return List{}, errors.New("the time is outside the chapter's recording")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return List{}, err
	}
	id := handID(chapterID, line)
	if !slices.ContainsFunc(file.Added, func(a added) bool { return a.ID == id }) {
		entry := added{ID: id, ChapterID: chapterID, Time: at, Line: line, At: s.now().UTC().Format(time.RFC3339)}
		if paragraph, found := paragraphStartingLike(chapter.Paragraphs, line); found {
			entry.ParagraphID = paragraph.ID
		}
		file.Added = append(file.Added, entry)
	}
	file.Removed = without(file.Removed, id)
	if err := s.write(file); err != nil {
		return List{}, err
	}
	return s.listLocked(file, nil)
}

// Remove hides a pickup of any source from the list. A proof or speech pickup stays in its own store; only the list
// drops it. Removing one already removed changes nothing.
func (s *Service) Remove(id string) (List, error) {
	return s.change(id, true, func(file *listFile) {
		file.Removed = with(file.Removed, id)
		file.LeftOut = without(file.LeftOut, id)
		file.Done = without(file.Done, id)
		file.Waiting = without(file.Waiting, id)
	})
}

// SetIncluded puts a pickup in or leaves it out of the next session.
func (s *Service) SetIncluded(id string, included bool) (List, error) {
	return s.change(id, false, func(file *listFile) {
		if included {
			file.LeftOut = without(file.LeftOut, id)
		} else {
			file.LeftOut = with(file.LeftOut, id)
		}
	})
}

// SetDone marks a pickup done or open. When the DAW answers and holds the pickup's marker, the change is written to
// the marker and the DAW's refusal is the answer; otherwise the done state is kept here, and a pickup with a position
// waits for a later List to write it to the DAW.
func (s *Service) SetDone(id string, done bool) (List, error) {
	if err := checkID(id); err != nil {
		return List{}, err
	}
	if s.config.Project == "" {
		return List{}, errors.New("save the project first")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return List{}, err
	}
	list, err := s.build(file)
	if err != nil {
		return List{}, err
	}
	index := slices.IndexFunc(list.Pickups, func(p Pickup) bool { return p.ID == id })
	if index < 0 || slices.Contains(file.Removed, id) {
		return List{}, ErrUnknownPickup
	}
	pickup := list.Pickups[index]
	file.Waiting = without(file.Waiting, id)
	if done {
		file.Done = with(file.Done, id)
	} else {
		file.Done = without(file.Done, id)
	}
	if markers, listed := s.markers(); listed && pickup.At != nil && markerAt(markers, *pickup.At) != nil {
		if err := s.config.DAW.SetDone(*pickup.At, done); err != nil {
			return List{}, err
		}
		if err := s.write(file); err != nil {
			return List{}, err
		}
		return s.finish(file, list, map[string]bool{id: done}), nil
	}
	if pickup.At != nil {
		file.Waiting = with(file.Waiting, id)
	}
	if err := s.write(file); err != nil {
		return List{}, err
	}
	return s.finish(file, list, nil), nil
}

// change applies edit to the stored file after checking the id is in the list (or, when removedOK, already removed).
func (s *Service) change(id string, removedOK bool, edit func(*listFile)) (List, error) {
	if err := checkID(id); err != nil {
		return List{}, err
	}
	if s.config.Project == "" {
		return List{}, errors.New("save the project first")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return List{}, err
	}
	list, err := s.build(file)
	if err != nil {
		return List{}, err
	}
	removed := slices.Contains(file.Removed, id)
	if !(removed && removedOK) && (removed || !slices.ContainsFunc(list.Pickups, func(p Pickup) bool { return p.ID == id })) {
		return List{}, ErrUnknownPickup
	}
	edit(&file)
	if err := s.write(file); err != nil {
		return List{}, err
	}
	return s.finish(file, list, nil), nil
}

func (s *Service) listLocked(file listFile, override map[string]bool) (List, error) {
	list, err := s.build(file)
	if err != nil {
		return List{}, err
	}
	return s.finish(file, list, override), nil
}

func emptyList() List { return List{Pickups: []Pickup{}, LeftOut: []LeftOutChapter{}} }

func checkID(id string) error {
	if !idPattern.MatchString(id) {
		return ErrUnknownPickup
	}
	return nil
}

// cleanLine trims a typed line and refuses an empty one, one too long, and one with control characters.
func cleanLine(line string) (string, error) {
	line = strings.TrimSpace(line)
	switch {
	case line == "":
		return "", errors.New("type the line first")
	case !utf8.ValidString(line):
		return "", errors.New("the line is not readable text")
	case utf8.RuneCountInString(line) > MaxLineRunes:
		return "", fmt.Errorf("a line can be at most %d characters", MaxLineRunes)
	case strings.IndexFunc(line, unicode.IsControl) >= 0:
		return "", errors.New("the line must be one line of plain text")
	}
	return line, nil
}

// handID is a hand-added line's id: the same line in the same chapter is the same pickup.
func handID(chapterID, line string) string {
	sum := sha256.Sum256([]byte(chapterID + "\x00" + strings.ToLower(line)))
	return "you:" + hex.EncodeToString(sum[:8])
}

// paragraphStartingLike finds the paragraph whose text starts like the line: its first 24 characters, ignoring case.
func paragraphStartingLike(paragraphs []Paragraph, line string) (Paragraph, bool) {
	needle := prefix(strings.ToLower(line), matchRunes)
	for _, paragraph := range paragraphs {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(paragraph.Text)), needle) {
			return paragraph, true
		}
	}
	return Paragraph{}, false
}

func prefix(text string, runes int) string {
	r := []rune(text)
	if len(r) > runes {
		r = r[:runes]
	}
	return string(r)
}

func with(ids []string, id string) []string {
	if slices.Contains(ids, id) {
		return ids
	}
	return append(ids, id)
}

func without(ids []string, id string) []string {
	return slices.DeleteFunc(slices.Clone(ids), func(x string) bool { return x == id })
}

func (s *Service) chapters() ([]Chapter, error) {
	if s.config.Chapters == nil {
		return nil, nil
	}
	return s.config.Chapters()
}

func (s *Service) markers() ([]Marker, bool) {
	if s.config.DAW == nil || !s.config.DAW.Reachable() {
		return nil, false
	}
	return s.config.DAW.Markers()
}

// markerAt is the listed marker nearest at, within the tolerance, or nil.
func markerAt(markers []Marker, at float64) *Marker {
	var best *Marker
	for i := range markers {
		gap := math.Abs(markers[i].At - at)
		if gap <= markerTolerance && (best == nil || gap < math.Abs(best.At-at)) {
			best = &markers[i]
		}
	}
	return best
}

// flushWaiting writes the done states that waited for the DAW to the markers it now lists, and reports whether the
// file changed. A write the DAW refuses keeps waiting.
func (s *Service) flushWaiting(file *listFile, pickups []Pickup) bool {
	markers, listed := s.markers()
	if !listed || len(file.Waiting) == 0 {
		return false
	}
	changed := false
	for _, pickup := range pickups {
		if !slices.Contains(file.Waiting, pickup.ID) || pickup.At == nil {
			continue
		}
		marker := markerAt(markers, *pickup.At)
		if marker == nil {
			continue
		}
		want := slices.Contains(file.Done, pickup.ID)
		if marker.Done != want {
			if err := s.config.DAW.SetDone(*pickup.At, want); err != nil {
				continue
			}
			marker.Done = want
		}
		file.Waiting = without(file.Waiting, pickup.ID)
		changed = true
	}
	return changed
}

// finish drops the removed pickups and fills included, done and waiting. override holds done states just written to
// the DAW, whose listed markers do not show them yet.
func (s *Service) finish(file listFile, list List, override map[string]bool) List {
	markers, listed := s.markers()
	kept := make([]Pickup, 0, len(list.Pickups))
	for _, pickup := range list.Pickups {
		if slices.Contains(file.Removed, pickup.ID) {
			continue
		}
		pickup.Included = !slices.Contains(file.LeftOut, pickup.ID)
		pickup.Waiting = slices.Contains(file.Waiting, pickup.ID)
		pickup.Done = slices.Contains(file.Done, pickup.ID)
		if done, written := override[pickup.ID]; written {
			pickup.Done = done
		} else if !pickup.Waiting && listed && pickup.At != nil {
			if marker := markerAt(markers, *pickup.At); marker != nil {
				pickup.Done = marker.Done
			}
		}
		kept = append(kept, pickup)
	}
	list.Pickups = kept
	return list
}

// build merges the four sources, removed pickups included (finish drops them), in reading order.
func (s *Service) build(file listFile) (List, error) {
	list := emptyList()
	chapters, err := s.chapters()
	if err != nil {
		return List{}, err
	}
	order := map[string]int{}
	byChapter := map[string]Chapter{}
	for i, chapter := range chapters {
		order[chapter.ID] = i
		byChapter[chapter.ID] = chapter
	}
	gapFinding := map[string]bool{}
	for _, chapter := range chapters {
		speech := Speech{State: "never", Reasons: []string{}}
		if s.config.Speech != nil {
			speech = s.config.Speech(chapter.ID)
		}
		if speech.State != "current" {
			reasons := speech.Reasons
			if reasons == nil {
				reasons = []string{}
			}
			list.LeftOut = append(list.LeftOut, LeftOutChapter{ChapterID: chapter.ID, State: speech.State, Reasons: reasons})
			continue
		}
		for _, gap := range speech.Gaps {
			list.Pickups = append(list.Pickups, s.speechPickup(chapter, gap))
			gapFinding[speechID(chapter.ID, gap.ID)+"\x00"+speech.RecordID] = true
		}
	}
	found, err := s.acceptedFindings()
	if err != nil {
		return List{}, err
	}
	for _, finding := range found {
		chapterID := ""
		if finding.Manuscript != nil {
			chapterID = finding.Manuscript.ChapterID
		}
		chapter, known := byChapter[chapterID]
		if !known {
			continue
		}
		if key, fromGap := gapKey(finding); fromGap && gapFinding[key] {
			attachFinding(list.Pickups, key, finding.ID)
			continue
		}
		list.Pickups = append(list.Pickups, findingPickup(chapter, finding))
	}
	for _, entry := range file.Added {
		if chapter, known := byChapter[entry.ChapterID]; known {
			list.Pickups = append(list.Pickups, handPickup(chapter, entry))
		}
	}
	slices.SortStableFunc(list.Pickups, func(a, b Pickup) int {
		if c := cmp.Compare(order[a.ChapterID], order[b.ChapterID]); c != 0 {
			return c
		}
		if c := cmp.Compare(paragraphOrder(a), paragraphOrder(b)); c != 0 {
			return c
		}
		if c := cmp.Compare(timeOrder(a), timeOrder(b)); c != 0 {
			return c
		}
		return cmp.Compare(a.ID, b.ID)
	})
	return list, nil
}

func paragraphOrder(p Pickup) int {
	if p.Paragraph == nil {
		return math.MaxInt
	}
	return *p.Paragraph
}

func timeOrder(p Pickup) float64 {
	if p.Time == nil {
		return math.Inf(1)
	}
	return *p.Time
}

// acceptedFindings are the findings the narrator decided need a pickup, still open by the stage engine's own
// definition (proofing.PickupItem.Open, DQ-16).
func (s *Service) acceptedFindings() ([]findings.Finding, error) {
	if s.config.Findings == nil {
		return nil, nil
	}
	found, err := s.config.Findings.List(findings.Query{Status: findings.StatusAccepted})
	if err != nil {
		return nil, err
	}
	kept := found[:0]
	for _, finding := range found {
		item := proofing.PickupItem{FindingID: finding.ID, Category: finding.Category, Status: finding.Review.Status, NotInLatestRun: finding.NotInLatestRun}
		if FixKind(finding) == FixPickup && item.Open() {
			kept = append(kept, finding)
		}
	}
	return kept, nil
}

func speechID(chapterID, gapID string) string { return "speech:" + chapterID + ":" + gapID }

// gapKey is the speech pickup an accepted recording-check gap became a finding of, keyed with its check's record.
func gapKey(finding findings.Finding) (string, bool) {
	if finding.Analyzer != "recording-check" || finding.Manuscript == nil {
		return "", false
	}
	gapID, _ := finding.Evidence["gap_id"].(string)
	record, _ := finding.Evidence["evidence_key"].(string)
	if gapID == "" {
		return "", false
	}
	return speechID(finding.Manuscript.ChapterID, gapID) + "\x00" + record, true
}

func attachFinding(pickups []Pickup, key, findingID string) {
	id, _, _ := strings.Cut(key, "\x00")
	for i := range pickups {
		if pickups[i].ID == id {
			pickups[i].FindingID = findingID
		}
	}
}

func (s *Service) speechPickup(chapter Chapter, gap coverage.GapLine) Pickup {
	pickup := Pickup{
		ID: speechID(chapter.ID, gap.ID), ChapterID: chapter.ID, Type: string(gap.Kind), Gap: gap.Kind, Source: SourceSpeech,
		Confidence: gap.Confidence, ConfReason: gap.ConfReason,
	}
	if len(gap.ParagraphIDs) > 0 {
		place(&pickup, chapter, gap.ParagraphIDs[0])
	}
	position := gap.Position
	if position == nil {
		position = gap.Before
	}
	if position != nil {
		seconds := position.SourceTime
		pickup.Time = &seconds
		if s.config.Locate != nil {
			if at, ok := s.config.Locate(chapter.ID, *position); ok {
				pickup.At = &at
			}
		}
	}
	switch {
	case gap.Text != nil:
		pickup.Script = *gap.Text
	case gap.LastWord != "" && gap.LastWord != gap.FirstWord:
		pickup.Script = gap.FirstWord + " … " + gap.LastWord
	default:
		pickup.Script = gap.FirstWord
	}
	if pickup.Context == "" {
		pickup.Context = pickup.Script
	}
	return pickup
}

func findingPickup(chapter Chapter, finding findings.Finding) Pickup {
	source := SourceProof
	noteType := finding.Review.Type
	if noteType == "" {
		noteType = findings.DefaultNoteType(finding)
	}
	if audioTypes[noteType] {
		source = SourceAudio
	}
	pickup := Pickup{
		ID: "finding:" + finding.ID, ChapterID: chapter.ID, Type: string(noteType), Source: source,
		Confidence: finding.Confidence, ConfReason: finding.ConfidenceReason, FindingID: finding.ID,
	}
	if span := finding.Manuscript.Span; span != nil && span.ParagraphID != "" {
		place(&pickup, chapter, span.ParagraphID)
	}
	if r := finding.TimeRange; r != nil {
		seconds, at := r.Start, r.Start
		if r.SourceStart != nil {
			seconds = *r.SourceStart
		}
		pickup.Time, pickup.At = &seconds, &at
	}
	pickup.Script = finding.Manuscript.Expected
	if pickup.Script == "" {
		pickup.Script = finding.Manuscript.Recorded
	}
	if pickup.Context == "" {
		pickup.Context = pickup.Script
	}
	return pickup
}

func handPickup(chapter Chapter, entry added) Pickup {
	seconds := entry.Time
	pickup := Pickup{
		ID: entry.ID, ChapterID: chapter.ID, Time: &seconds, Type: string(findings.NoteMisread), Script: entry.Line,
		Source: SourceYou, ConfReason: ConfAddedByHand,
	}
	if entry.ParagraphID != "" {
		place(&pickup, chapter, entry.ParagraphID)
	}
	if pickup.Context == "" {
		pickup.Context = entry.Line
	}
	return pickup
}

// place sets the pickup's paragraph and context when the paragraph is still in the chapter.
func place(pickup *Pickup, chapter Chapter, paragraphID string) {
	id := paragraphID
	pickup.ParagraphID = &id
	for _, paragraph := range chapter.Paragraphs {
		if paragraph.ID == paragraphID {
			index := paragraph.Index
			pickup.Paragraph = &index
			pickup.Context = paragraph.Text
			return
		}
	}
}

// audioTypes are the note types that are a sound rather than words (ADR 0844's ten words).
var audioTypes = map[findings.NoteType]bool{
	findings.NoteMouth: true, findings.NotePlosive: true, findings.NoteNoise: true, findings.NoteBreath: true,
}
