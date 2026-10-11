package guide

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/countrymanprime/narration-utils/shell/internal/findings"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
	"github.com/countrymanprime/narration-utils/shell/internal/pronunciationport"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
)

type Service struct {
	persist        atomic.Pointer[persist.Reporter]
	project        string
	python         string
	backend        string
	settings       *settings.Store
	sidecars       *process.Supervisor
	previewTimeout time.Duration
	previewLocksMu sync.Mutex
	// +checklocks:previewLocksMu
	previewLocks map[string]*sync.Mutex
	// findingsStore is nil until app.go opts in with SetFindings; every
	// existing caller, including every test in this package, leaves it nil
	// and SaveFindings is then a no-op.
	findingsStore atomic.Pointer[findings.Store]
}

func New(project, python, backend string, store *settings.Store, sidecars *process.Supervisor) *Service {
	return &Service{project: project, python: python, backend: backend, settings: store, sidecars: sidecars, previewTimeout: previewTimeout}
}
func (s *Service) guidePath() string {
	return filepath.Join(s.project, "ManuscriptGuide", "manuscript_guide.json")
}
func (s *Service) manuscript() string {
	return filepath.Join(s.project, "narration-utils", "manuscript", "manuscript.json")
}

// SetPersist says where to report a Story Bible file that cannot be read (ADR 0069).
func (s *Service) SetPersist(reporter *persist.Reporter) { s.persist.Store(reporter) }

// SetFindings opts this service into producing findings.Finding records for
// entities that still need review. store persists them. Called once at service
// construction, the same way SetPersist is; never called means
// SaveFindings is a no-op.
func (s *Service) SetFindings(store *findings.Store) { s.findingsStore.Store(store) }

// SaveFindings reads the current Story Bible entities and saves the
// findings BuildFindings derives from them, replacing
// the analyzer's whole "entities" scope in one call so an entity that no
// longer qualifies - because it became reviewed or locked - naturally drops
// out of the fresh set findings.Store.SaveAnalyzerFindings is given, and its
// finding is marked "not in latest run" rather than deleted (resolved
// upstream). It only reads the guide file (Entities); it never
// calls a sidecar command that could change it. Best-effort: a problem here
// is reported through the same channel as any other derived-data failure
// (SetPersist's reporter) but never fails the caller (a build, an edit).
func (s *Service) SaveFindings() error {
	store := s.findingsStore.Load()
	if store == nil {
		return nil
	}
	entities, err := s.Entities()
	if err != nil {
		s.persist.Load().Warn("findings_build_failed", fmt.Sprintf("Story Bible findings were not built: %v", err))
		return err
	}
	fresh := BuildFindings(entities, findings.Project{Path: s.project, OutputPath: s.guidePath()})
	valid := make([]findings.Finding, 0, len(fresh))
	for _, f := range fresh {
		if verr := f.Validate(); verr != nil {
			s.persist.Load().Warn("findings_invalid", fmt.Sprintf("Story Bible produced an invalid finding, skipped: %v", verr))
			continue
		}
		valid = append(valid, f)
	}
	// valid is saved even when empty: an empty fresh set is how every
	// previously-open Story Bible finding resolves upstream at once (every
	// flagged entity got reviewed or locked since the last save).
	if _, err := store.SaveAnalyzerFindings(analyzerName, scopeName, valid); err != nil {
		s.persist.Load().Warn("findings_save_failed", fmt.Sprintf("Story Bible findings were not saved: %v", err))
		return err
	}
	return nil
}

// schemaVersion is the newest Story Bible file this host reads; the Python sidecar writes it (manuscript_guide.py SCHEMA_VERSION).
const schemaVersion = 2

// document reads and version-checks the Story Bible file, returning its raw
// JSON object - a missing file reads as an empty object, exactly the shape
// Entities and DialogueCues both build their own key's default from. The
// entries carry the narrator's edits and locks, so a file that cannot be
// read is kept aside and the narrator told, and a file from a newer version
// is refused with a message and left exactly as it is.
func (s *Service) document() (map[string]any, error) {
	var document map[string]any
	var versionErr error
	outcome := s.persist.Load().ReadJSON(s.guidePath(), "Story Bible", persist.NarratorData, func(bytes []byte) error {
		var decoded map[string]any
		if err := json.Unmarshal(bytes, &decoded); err != nil {
			return err
		}
		if decoded == nil {
			return fmt.Errorf("not a JSON object")
		}
		version, _ := decoded["schema_version"].(float64)
		if versionErr = persist.CheckVersion(int(version), schemaVersion, "Story Bible"); versionErr != nil {
			return nil
		}
		document = decoded
		return nil
	})
	if versionErr != nil {
		return nil, versionErr
	}
	if outcome == persist.Unreadable {
		return nil, fmt.Errorf("the Story Bible file could not be read")
	}
	if document == nil {
		return map[string]any{}, nil
	}
	return document, nil
}

// Entities is the Story Bible as the UI reads it: a stored pronunciation status is not returned (ADR 0792).
func (s *Service) Entities() ([]map[string]any, error) { return s.readEntities(false) }

// entitiesWithStatus is Entities with each pronunciation left as stored (status and source), for the query export and import that still work
// on it (queries.go) until SN-B8 removes them.
func (s *Service) entitiesWithStatus() ([]map[string]any, error) { return s.readEntities(true) }

func (s *Service) readEntities(keepStatus bool) ([]map[string]any, error) {
	document, err := s.document()
	if err != nil {
		return nil, err
	}
	raw, present := document["entities"]
	if !present || raw == nil {
		return []map[string]any{}, nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("the Story Bible entities data is invalid")
	}
	out := []map[string]any{}
	for _, x := range items {
		if m, ok := x.(map[string]any); ok {
			if err := normalizeEntity(m, keepStatus); err != nil {
				return nil, err
			}
			out = append(out, m)
		} else {
			return nil, fmt.Errorf("the Story Bible entity data is invalid")
		}
	}
	return out, nil
}

// normalizeEntity guarantees the shape the UI renders against. The guide file is
// written by a Python sidecar across several schema generations, so any of
// these can be absent; a missing object must read as empty, never crash the
// Story Bible page after a rebuild.
func normalizeEntity(entity map[string]any, keepStatus bool) error {
	if _, ok := entity["pronunciation"].(map[string]any); !ok {
		entity["pronunciation"] = map[string]any{}
	}
	readPronunciation(entity["pronunciation"].(map[string]any), keepStatus)
	if description, ok := entity["description"].(map[string]any); !ok {
		entity["description"] = map[string]any{"text": "", "evidence": map[string]any{}}
	} else if description["evidence"] == nil {
		description["evidence"] = map[string]any{}
	}
	// properties is the narrator's ordered list of {key, value} facts. It is additive (a file written before it has none), so it reads as
	// an empty list, and it stays a list: the host re-marshals this map, and an object would come back with its keys sorted.
	// appearances is additive the same way; nothing reads it yet.
	for _, key := range []string{"aliases", "occurrences", "personality_notes", "relationships", "properties", "appearances"} {
		if entity[key] == nil {
			entity[key] = []any{}
			continue
		}
		if _, ok := entity[key].([]any); !ok {
			return fmt.Errorf("the Story Bible %s data is invalid", key)
		}
	}
	if aliases, ok := entity["aliases"].([]any); ok {
		readReview(entity, aliases)
		for _, raw := range aliases {
			alias, ok := raw.(map[string]any)
			if !ok {
				return fmt.Errorf("the Story Bible alias data is invalid")
			}
			if _, ok := alias["pronunciation"].(map[string]any); !ok {
				alias["pronunciation"] = map[string]any{}
			}
			readPronunciation(alias["pronunciation"].(map[string]any), keepStatus)
			if alias["occurrences"] == nil {
				alias["occurrences"] = []any{}
			} else if _, ok := alias["occurrences"].([]any); !ok {
				return fmt.Errorf("the Story Bible alias occurrences data is invalid")
			}
		}
	}
	return nil
}

// readReview fills the entry's review flags (SNB-3b): {entry, aliases}, the entry itself and the alias texts still to look at. A file
// written before them has none, and its entry flag is review_state "needs review". A stored name the entry no longer has is dropped,
// and a speaker colour outside 1..7 reads as automatic (no speaker_color).
func readReview(entity map[string]any, aliases []any) {
	if color, ok := entity["speaker_color"].(float64); !ok || color < 1 || color > SpeakerColors || color != float64(int(color)) {
		delete(entity, "speaker_color")
	}
	stored, ok := entity["review"].(map[string]any)
	if !ok {
		entity["review"] = map[string]any{"entry": entity["review_state"] == "needs review", "aliases": []any{}}
		return
	}
	names := map[string]bool{}
	for _, raw := range aliases {
		if alias, ok := raw.(map[string]any); ok {
			if text, ok := alias["text"].(string); ok {
				names[text] = true
			}
		}
	}
	flagged := []any{}
	list, _ := stored["aliases"].([]any)
	for _, raw := range list {
		if text, ok := raw.(string); ok && names[text] && !slices.Contains(flagged, any(text)) {
			flagged = append(flagged, text)
		}
	}
	entry, _ := stored["entry"].(bool)
	entity["review"] = map[string]any{"entry": entry, "aliases": flagged}
}

// readPronunciation reads a stored pronunciation the way ADR 0792 says: a stored status is ignored, and the legacy source "user" reads as
// "manual", in the value and in its alternate. A note stays as it is.
func readPronunciation(value map[string]any, keepStatus bool) {
	if !keepStatus {
		delete(value, "status")
	}
	if !keepStatus && value["source"] == legacyManualSource {
		value["source"] = ManualSource
	}
	if alternate, ok := value["alternate"].(map[string]any); ok {
		readPronunciation(alternate, keepStatus)
	}
}

// DialogueCue is one entry of the guide file's dialogue_cues
// (written by manuscript_guide.py extract_dialogue_cues/merge_dialogue_cues): a quoted span with its
// resolved (or unknown) speaker. It is a document-level list, a sibling of
// "entities", not per-entity data.
type DialogueCue struct {
	ID              string              `json:"id"`
	ChapterID       string              `json:"chapterId"`
	ParagraphID     string              `json:"paragraphId"`
	QuoteStart      int                 `json:"quote_start"`
	QuoteEnd        int                 `json:"quote_end"`
	QuoteText       string              `json:"quote_text"`
	SpeakerEntityID *string             `json:"speaker_entity_id"`
	SpeakerSource   string              `json:"speaker_source"`
	Evidence        DialogueCueEvidence `json:"evidence"`
	Corrected       bool                `json:"corrected"`
}

// DialogueCueEvidence is one cue's manuscript evidence: where it was found
// and the speech-verb tag text that resolved it, empty for an untagged or
// continuation cue.
type DialogueCueEvidence struct {
	ChapterID   string `json:"chapterId"`
	ParagraphID string `json:"paragraphId"`
	Excerpt     string `json:"excerpt"`
	Tag         string `json:"tag"`
}

// DialogueCues returns the Story Bible's extracted dialogue cues,
// each a quoted span with its resolved or unknown speaker. A guide file
// written before dialogue cues existed has none, which reads as an empty list, the same
// way a missing "entities" list does.
func (s *Service) DialogueCues() ([]DialogueCue, error) {
	document, err := s.document()
	if err != nil {
		return nil, err
	}
	raw, present := document["dialogue_cues"]
	if !present || raw == nil {
		return []DialogueCue{}, nil
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("the Story Bible dialogue cue data is invalid")
	}
	var cues []DialogueCue
	if err := json.Unmarshal(encoded, &cues); err != nil {
		return nil, fmt.Errorf("the Story Bible dialogue cue data is invalid")
	}
	if cues == nil {
		cues = []DialogueCue{}
	}
	return cues, nil
}

// CorrectCue records the narrator's own attribution for one dialogue cue
// (speakerEntityID "unknown" or "" clears it back to unknown), so the next
// rebuild's merge_dialogue_cues keeps it instead of overwriting it with
// fresh, possibly-unknown, extraction - the same durability ADR 0007's lock
// guard already gives a locked entity, applied to a cue instead.
func (s *Service) CorrectCue(cueID, speakerEntityID string) error {
	_, err := s.Run("correct-cue", "--guide", s.guidePath(), "--cue-id", cueID, "--speaker-entity-id", speakerEntityID)
	return err
}

func (s *Service) Run(args ...string) (string, error) {
	return s.runContext(context.Background(), args...)
}

// runContext is Run with a caller-owned deadline: when ctx ends the supervisor
// kills the sidecar and the call returns.
func (s *Service) runContext(ctx context.Context, args ...string) (string, error) {
	if s.project == "" {
		return "", fmt.Errorf("save the REAPER project and import a manuscript first")
	}
	if s.sidecars == nil {
		return "", fmt.Errorf("the sidecar supervisor is unavailable")
	}
	program, fullArgs, err := s.command(args)
	if err != nil {
		return "", err
	}
	code, out, failure, e := s.sidecars.Run(ctx, program, fullArgs...)
	if e != nil {
		return "", e
	}
	if code != 0 {
		message := strings.TrimSpace(failure)
		if message == "" {
			message = strings.TrimSpace(out)
		}
		if message == "" {
			message = "Story Bible sidecar failed"
		}
		return "", fmt.Errorf("%s", message)
	}
	return strings.TrimSpace(string(out)), nil
}

// command supports both development (Python plus an explicit script) and a
// frozen release sidecar (one executable with no backend argument). Requiring
// a script path in the latter mode would make every packaged Story Bible
// operation fail before the sidecar starts.
func (s *Service) command(args []string) (string, []string, error) {
	if _, err := os.Stat(s.python); err != nil {
		return "", nil, fmt.Errorf("configure the Manuscript Guide executable before continuing")
	}
	if s.backend == "" {
		return s.python, args, nil
	}
	if _, err := os.Stat(s.backend); err != nil {
		return "", nil, fmt.Errorf("configure the Manuscript Guide backend before continuing")
	}
	return s.python, append([]string{s.backend}, args...), nil
}

// RulesOnly is the model argument that builds without a language model: the rules-only extraction, lower quality, chosen for one build.
const RulesOnly = "rules-only"

// Build runs the Story Bible build. model is what the sidecar gives spaCy: the folder of an installed model, a model name, or RulesOnly.
func (s *Service) Build(progress, log, model string) (string, error) {
	if e := os.MkdirAll(filepath.Dir(s.guidePath()), 0755); e != nil {
		return "", e
	}
	out, err := s.Run(s.buildArgs(progress, log, model)...)
	if err != nil {
		return out, err
	}
	_ = s.SaveFindings() // best-effort; a problem here never fails a build that already succeeded (see SaveFindings)
	return out, nil
}
func (s *Service) buildArgs(progress, log, model string) []string {
	args := []string{"build", "--manuscript", s.manuscript(), "--out", s.guidePath(), "--progress", progress, "--log", log, "--spacy-model", model}
	return append(args, s.defaultPronunciationSourceArgs()...)
}

// defaultPronunciationSourceArgs is --default-source <value> when the narrator set a preferred pronunciation source
// (Settings > Story Bible); omitted (not passed as an explicit empty
// value) when unset, so the build/edit/create command line carries no extra flag.
// It only reorders the sidecar's own build-time fallback (manuscript_guide.py's pronunciation()); it never limits the
// entity/alias Generate-Replace control's own explicit --source choice (Pronounce, below).
func (s *Service) defaultPronunciationSourceArgs() []string {
	value, _ := s.settings.Effective("ManuscriptGuide", "default_pronunciation_source", "")
	if value == "" {
		return nil
	}
	return []string{"--default-source", value}
}

func (s *Service) Edit(id, field, value string) error {
	return s.EditFields(id, map[string]string{field: value})
}

// EditFields changes every field of an entity in one sidecar process. The sidecar applies them all in memory and writes the file once, so a
// field it refuses leaves the file as it was, and a Save of four fields costs one process instead of four (interaction feedback audit, phase 4).
// The fields are sent in name order, so the same edit always produces the same command.
func (s *Service) EditFields(id string, values map[string]string) error {
	if len(values) == 0 {
		return nil
	}
	_, err := s.Run(s.editArgs(id, values)...)
	return err
}
func (s *Service) editArgs(id string, values map[string]string) []string {
	fields := make([]string, 0, len(values))
	for field := range values {
		fields = append(fields, field)
	}
	sort.Strings(fields)
	args := []string{"edit", "--guide", s.guidePath(), "--entity-id", id}
	for _, field := range fields {
		// --value=... and not "--value", "...": argparse takes a value that starts with a dash ("-brave") only in this form.
		args = append(args, "--field", field, "--value="+values[field])
	}
	if _, editsAliases := values["aliases"]; editsAliases {
		args = append(args, "--manuscript", s.manuscript())
		// Only a new alias generates a pronunciation (apply_edit's "aliases" branch); every other field never reads
		// --default-source, so it stays off their command line too.
		args = append(args, s.defaultPronunciationSourceArgs()...)
	}
	return args
}

// Pronounce sets the pronunciation of an entity's own name (aliasIndex nil) or one of its aliases from exactly the
// named engine ("cmu" or "espeak"), and marks it as the narrator's explicit choice so a rebuild keeps it.
// It is refused on a locked entity (ADR 0007, enforced by the sidecar) and when the chosen engine has nothing for the name.
// Pronounce asks the named pronunciation source for the entity's (or one alias's) pronunciation. A source the pronunciation port
// cannot ask for one is refused with its *port.NotSupportedError before the sidecar starts.
func (s *Service) Pronounce(id string, aliasIndex *int, source string) error {
	if err := pronunciationport.CheckPronounce(source); err != nil {
		return err
	}
	args := []string{"pronounce", "--guide", s.guidePath(), "--entity-id", id, "--source", source}
	if aliasIndex != nil {
		args = append(args, "--alias-index", fmt.Sprint(*aliasIndex))
	}
	_, err := s.Run(args...)
	return err
}

// ManualSource is the source id of a pronunciation the narrator typed (ADR 0792). A file written before it says "user"; Entities reads
// that as manual.
const ManualSource = "manual"

const legacyManualSource = "user"

// Candidate is one source's answer for one word: Say when it has one, otherwise a sentence naming the source and the word.
type Candidate struct {
	OK     bool   `json:"ok"`
	Say    string `json:"say,omitempty"`
	Reason string `json:"reason,omitempty"`
}

// Candidate asks one registered source how it would say word, changing nothing. An unregistered source is refused with its
// *port.NotSupportedError before the sidecar starts. The word is trimmed and goes as one --word=VALUE argument, so a leading "-"
// stays a value; the sidecar refuses one that is blank, over 80 characters or holds a newline or NUL.
func (s *Service) Candidate(word, source string) (Candidate, error) {
	if err := pronunciationport.CheckPronounce(source); err != nil {
		return Candidate{}, err
	}
	out, err := s.Run("candidate", "--word="+strings.TrimSpace(word), "--source", source)
	if err != nil {
		return Candidate{}, err
	}
	var result Candidate
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		return Candidate{}, fmt.Errorf("the pronunciation source gave an answer that could not be read")
	}
	return result, nil
}

// The narrator's own pronunciation and a pronunciation's note are free text (ADR 0346). The sidecar checks the same
// limits; the host checks them first so a bad value never starts a process.
const (
	maxUserPronunciation = 200
	maxPronunciationNote = 1000
)

// PronunciationStatuses are the statuses a pronunciation can have; one written before status existed reads as the first.
var PronunciationStatuses = []string{"researched", "query_sent", "author_confirmed"}

func pronunciationTarget(args []string, aliasIndex *int) []string {
	if aliasIndex != nil {
		args = append(args, "--alias-index", fmt.Sprint(*aliasIndex))
	}
	return args
}

// PronounceUser sets the narrator's own pronunciation (source "manual") of the entity's name or one alias. It never asks a dictionary,
// and the pronunciation it replaces is kept beside it as the alternate. The text goes as one --ipa=VALUE argument, so a value
// starting with "-" stays a value.
func (s *Service) PronounceUser(id string, aliasIndex *int, ipa string) error {
	text := strings.TrimSpace(ipa)
	switch {
	case text == "":
		return fmt.Errorf("type a pronunciation first")
	case strings.ContainsAny(text, "\r\n"):
		return fmt.Errorf("a pronunciation is one line")
	case utf8.RuneCountInString(text) > maxUserPronunciation:
		return fmt.Errorf("a pronunciation is at most %d characters", maxUserPronunciation)
	}
	_, err := s.Run(pronunciationTarget([]string{"pronounce-user", "--guide", s.guidePath(), "--entity-id", id, "--ipa=" + text}, aliasIndex)...)
	return err
}

// UsePronunciationAlternate puts the kept alternate back in use and keeps the one it replaces: lossless both ways, no lookup.
func (s *Service) UsePronunciationAlternate(id string, aliasIndex *int) error {
	_, err := s.Run(pronunciationTarget([]string{"pronunciation-use-alternate", "--guide", s.guidePath(), "--entity-id", id}, aliasIndex)...)
	return err
}

// SetPronunciationStatus sets a pronunciation's status and, when note is not nil, its note (an empty one clears it).
func (s *Service) SetPronunciationStatus(id string, aliasIndex *int, status string, note *string) error {
	if !slices.Contains(PronunciationStatuses, status) {
		return fmt.Errorf("unknown pronunciation status %q", status)
	}
	args := []string{"pronunciation-status", "--guide", s.guidePath(), "--entity-id", id, "--status", status}
	if note != nil {
		text := strings.TrimSpace(*note)
		if utf8.RuneCountInString(text) > maxPronunciationNote {
			return fmt.Errorf("a pronunciation note is at most %d characters", maxPronunciationNote)
		}
		args = append(args, "--note="+text)
	}
	_, err := s.Run(pronunciationTarget(args, aliasIndex)...)
	return err
}

// MarkReviewed clears the review flags of the entry and every name (aliasIndex nil), or of one name; the entry is reviewed when nothing
// is left. Refused on a locked entry (ADR 0007, enforced by the sidecar).
func (s *Service) MarkReviewed(id string, aliasIndex *int) error {
	_, err := s.Run(pronunciationTarget([]string{"mark-reviewed", "--guide", s.guidePath(), "--entity-id", id}, aliasIndex)...)
	return err
}

// FlagReview flags the entry (aliasIndex nil), or one name, as needing review: the undo of MarkReviewed, and what an accepted automatic
// suggestion sets. A flag that is set already changes nothing. Refused on a locked entry.
func (s *Service) FlagReview(id string, aliasIndex *int) error {
	_, err := s.Run(pronunciationTarget([]string{"review-flag", "--guide", s.guidePath(), "--entity-id", id}, aliasIndex)...)
	return err
}

// SpeakerColors is how many speaker colours there are: the seven hues of ADR 0367, --speaker-1 to --speaker-7.
const SpeakerColors = 7

// SetSpeakerColor stores a character's speaker colour, 1..SpeakerColors, which wins over the stable pick; nil or 0 puts it back to
// automatic. A value outside that is refused before the sidecar starts; the sidecar refuses a locked entry and one that cannot speak.
func (s *Service) SetSpeakerColor(id string, index *int) error {
	value := 0
	if index != nil {
		value = *index
	}
	if value < 0 || value > SpeakerColors {
		return fmt.Errorf("a speaker colour is 1 to %d, or 0 for automatic", SpeakerColors)
	}
	_, err := s.Run("speaker-color", "--guide", s.guidePath(), "--entity-id", id, "--index", fmt.Sprint(value))
	return err
}

func (s *Service) Rescan(id string) error {
	_, err := s.Run("rescan", "--guide", s.guidePath(), "--manuscript", s.manuscript(), "--entity-id", id)
	return err
}
func (s *Service) Create(name, category string, aliases []string) (string, error) {
	return s.CreateDescribed(name, category, aliases, "")
}

// Property is one labelled fact of an entity ("Codename": "Wren"). The sidecar requires a key, unique whatever its case, and takes an
// empty value; a caller with a labelled line that repeats a label merges the values before it asks for the entity.
type Property struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// CreateDescribed creates an entity that already has its description, in one sidecar process instead of a create and an edit.
func (s *Service) CreateDescribed(name, category string, aliases []string, description string) (string, error) {
	return s.CreateFull(name, category, aliases, description, nil)
}

// CreateFull creates an entity with its description and its properties in one sidecar process. The import of a manuscript's cast blocks
// uses it for the labelled facts of a character.
func (s *Service) CreateFull(name, category string, aliases []string, description string, properties []Property) (string, error) {
	out, err := s.Run(s.createArgs(name, category, aliases, description, properties)...)
	if err != nil {
		return "", err
	}
	parts := strings.Split(out, "|")
	if len(parts) < 2 || parts[0] != "CREATED" {
		return "", fmt.Errorf("could not create the entity")
	}
	return parts[1], nil
}
func (s *Service) createArgs(name, category string, aliases []string, description string, properties []Property) []string {
	args := []string{"create", "--guide", s.guidePath(), "--manuscript", s.manuscript(), "--name", name, "--category", category, "--aliases", strings.Join(aliases, ";")}
	if description != "" {
		args = append(args, "--description="+description)
	}
	if len(properties) > 0 {
		// One JSON list in the --flag=value form, which argparse takes even when the text starts with a dash.
		encoded, _ := json.Marshal(properties) // a slice of two strings cannot fail to encode
		args = append(args, "--properties="+string(encoded))
	}
	return append(args, s.defaultPronunciationSourceArgs()...)
}
func (s *Service) Merge(source, target string) error {
	_, err := s.Run("merge", "--guide", s.guidePath(), "--source-id", source, "--target-id", target)
	return err
}
func (s *Service) Delete(id string) error {
	_, err := s.Run("delete", "--guide", s.guidePath(), "--entity-id", id)
	return err
}
func (s *Service) Relate(id, other, label string) error {
	_, err := s.Run("relate", "--guide", s.guidePath(), "--entity-id", id, "--other-id", other, "--label", label)
	return err
}
func (s *Service) Unrelate(id, other, label string) error {
	_, err := s.Run("unrelate", "--guide", s.guidePath(), "--entity-id", id, "--other-id", other, "--label", label)
	return err
}

// VocabularyCandidates returns the names Proofing's "Suggest from manuscript"
// offers: the Guide's stored vocabulary_candidates list plus every name derived
// from the current entities, one spelling per case-insensitive name (the first
// seen wins, stored list first), sorted.
//
// The stored list is only an addition. The sidecar writes it at build time, so
// create() seeds it empty and only build() ever refreshes it: choosing the
// stored list whenever it exists made Suggest return nothing on a freshly
// imported project and miss every name added after the last build.
//
// Derived names follow the sidecar's own rule (is_vocabulary_worthy, ADR 0020)
// with one relaxation: an entity the narrator locked or added by hand is always
// offered, whatever its category, because it is theirs (the sidecar checks
// Needs Review first, so it drops such an entity). Auto-extracted Needs Review
// and Draft entities stay out, and a lone word the build is not sure of still
// needs three occurrences.
func (s *Service) VocabularyCandidates() ([]string, error) {
	b, err := os.ReadFile(s.guidePath())
	if err != nil {
		return nil, fmt.Errorf("build the Story Bible before requesting vocabulary suggestions")
	}
	var document map[string]any
	if err := json.Unmarshal(b, &document); err != nil {
		return nil, fmt.Errorf("could not read the Story Bible: %w", err)
	}
	seen := map[string]string{}
	add := func(text string) {
		text = strings.TrimSpace(text)
		// Hints are joined with commas for the recognizer, so a name holding a
		// comma or a line break could not survive the round trip.
		if text == "" || strings.ContainsAny(text, ",\r\n") {
			return
		}
		if _, exists := seen[strings.ToLower(text)]; !exists {
			seen[strings.ToLower(text)] = text
		}
	}
	stored, _ := document["vocabulary_candidates"].([]any)
	for _, value := range stored {
		if text, ok := value.(string); ok {
			add(text)
		}
	}
	entities, _ := document["entities"].([]any)
	for _, item := range entities {
		entity, _ := item.(map[string]any)
		if entity == nil || !vocabularyWorthy(entity) {
			continue
		}
		if name, ok := entity["canonical_name"].(string); ok {
			add(name)
		}
		for _, alias := range entityAliasTexts(entity) {
			add(alias)
		}
	}
	values := make([]string, 0, len(seen))
	for _, value := range seen {
		values = append(values, value)
	}
	sort.Slice(values, func(left, right int) bool { return strings.ToLower(values[left]) < strings.ToLower(values[right]) })
	return values, nil
}

// minSingleWordVocabularyOccurrences mirrors MIN_SINGLE_WORD_VOCABULARY_OCCURRENCES
// in the sidecar.
const minSingleWordVocabularyOccurrences = 3

// vocabularyWorthy reports whether an entity's names are offered as vocabulary
// hints. It is the sidecar's is_vocabulary_worthy with locked and manual entities
// checked first.
func vocabularyWorthy(entity map[string]any) bool {
	if locked, _ := entity["locked"].(bool); locked {
		return true
	}
	if manual, _ := entity["manual"].(bool); manual {
		return true
	}
	if entity["category"] == "Needs Review" || entity["category"] == "Draft" {
		return false
	}
	name, _ := entity["canonical_name"].(string)
	if len(strings.Fields(name)) > 1 {
		return true
	}
	count, known := entityOccurrenceCount(entity)
	return !known || count >= minSingleWordVocabularyOccurrences
}

// entityOccurrenceCount is the entity's occurrence_count, or its own occurrences
// plus its aliases' when the guide predates that field. known is false when the
// entity carries no occurrence data at all (an old schema), so it cannot be judged.
func entityOccurrenceCount(entity map[string]any) (count int, known bool) {
	if number, ok := entity["occurrence_count"].(float64); ok {
		return int(number), true
	}
	own, hasOwn := entity["occurrences"].([]any)
	count, known = len(own), hasOwn
	aliases, _ := entity["aliases"].([]any)
	for _, raw := range aliases {
		if alias, ok := raw.(map[string]any); ok {
			if list, ok := alias["occurrences"].([]any); ok {
				count, known = count+len(list), true
			}
		}
	}
	return count, known
}

// entityAliasTexts returns the alias spellings of an entity. Guides from an
// earlier schema store an alias as a plain string; the sidecar normalizes them
// on load, but the host reads the file directly.
func entityAliasTexts(entity map[string]any) []string {
	aliases, _ := entity["aliases"].([]any)
	texts := make([]string, 0, len(aliases))
	for _, raw := range aliases {
		switch alias := raw.(type) {
		case string:
			texts = append(texts, alias)
		case map[string]any:
			if text, ok := alias["text"].(string); ok {
				texts = append(texts, text)
			}
		}
	}
	return texts
}

const (
	// previewTimeout bounds one render-audio run. A cold start of the frozen
	// sidecar loads onnxruntime and a 114 MB voice model before it speaks, so
	// this is generous; it exists so a hung sidecar cannot leave the play
	// button spinning forever.
	previewTimeout = 2 * time.Minute
	// previewCacheTag versions the cache key. Bump it when the key's inputs
	// change so files rendered under the old key are never trusted again (v1
	// ignored the voice id; v2 to v3 added the chosen pronunciation).
	previewCacheTag = "narration-utils-tts-preview-v3"
	// wavHeaderBytes is the size of a canonical WAV header. A file no larger
	// than that holds no samples, so it is never a usable preview.
	wavHeaderBytes = 44
)

// PreviewVoice is the voice a preview is rendered with. Every field is part of
// the cache key except Model, which is the path the sidecar loads.
type PreviewVoice struct{ ID, Model, Provider, Version string }

// previewFileName is the cache file for one voice speaking one text under one pronunciation choice.
// pronunciationKey is the entry's chosen pronunciation's IPA, or "" when it speaks the plain text (spoken)
// unchanged: two entries with the same spelled text but different chosen pronunciations (or the same text
// before and after a pronunciation is chosen) must never share a cached render.
func previewFileName(voice PreviewVoice, spoken, pronunciationKey string) string {
	key := strings.Join([]string{previewCacheTag, voice.ID, voice.Provider, voice.Version, spoken, pronunciationKey}, "\x00")
	hash := sha256.Sum256([]byte(key))
	return hex.EncodeToString(hash[:]) + ".wav"
}

// spokenName returns the text a preview speaks: the entity's name, or one of
// its aliases when alias is set. It is empty when the entry no longer exists.
func spokenName(entities []map[string]any, id string, alias *int) string {
	for _, entity := range entities {
		if entity["id"] != id {
			continue
		}
		if alias == nil {
			spoken, _ := entity["canonical_name"].(string)
			return strings.TrimSpace(spoken)
		}
		values, _ := entity["aliases"].([]any)
		if *alias < 0 || *alias >= len(values) {
			return ""
		}
		value, _ := values[*alias].(map[string]any)
		spoken, _ := value["text"].(string)
		return strings.TrimSpace(spoken)
	}
	return ""
}

// chosenPronunciationKey returns the IPA a preview will actually speak for id/alias when the narrator chose a
// pronunciation (pronounce()/pronounce_user() mark it "chosen"; render_audio then speaks it as phonemes instead
// of the spelled name), or "" when nothing changes what the preview says. previewFileName folds this
// into the cache key so switching, or choosing, a pronunciation never reuses a stale plain-name render.
func chosenPronunciationKey(entities []map[string]any, id string, alias *int) string {
	for _, entity := range entities {
		if entity["id"] != id {
			continue
		}
		holder := entity
		if alias != nil {
			values, _ := entity["aliases"].([]any)
			if *alias < 0 || *alias >= len(values) {
				return ""
			}
			holder, _ = values[*alias].(map[string]any)
		}
		pronunciation, _ := holder["pronunciation"].(map[string]any)
		chosen, _ := pronunciation["chosen"].(bool)
		if !chosen {
			return ""
		}
		ipa, _ := pronunciation["ipa"].(string)
		return ipa
	}
	return ""
}

// cachedPreview returns a previously rendered WAV. A file with no samples
// (a run that failed) is a miss, not audio.
func cachedPreview(path string) ([]byte, bool) {
	audio, err := os.ReadFile(path)
	if err != nil || len(audio) <= wavHeaderBytes {
		return nil, false
	}
	return audio, true
}

// discardPreview removes what a failed run left behind so it cannot be mistaken
// for a cached preview: the file itself when it holds no samples (a valid one is
// never deleted), and the sidecar's "<name>.<pid>.part" temp files. The temp
// files are found by listing the directory, because the project path may hold
// characters filepath.Glob treats as a pattern.
func discardPreview(path string) {
	if _, ok := cachedPreview(path); !ok {
		_ = os.Remove(path)
	}
	dir, name := filepath.Dir(path), filepath.Base(path)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), name+".") && strings.HasSuffix(entry.Name(), ".part") {
			_ = os.Remove(filepath.Join(dir, entry.Name()))
		}
	}
}

// previewLock returns the lock for one cache file. Two clicks (or an alias and a
// voice change) can ask for the same file while the first render is running; the
// second waits and then finds the cache filled instead of racing the first
// sidecar's rename and cleanup.
func (s *Service) previewLock(name string) *sync.Mutex {
	s.previewLocksMu.Lock()
	defer s.previewLocksMu.Unlock()
	if s.previewLocks == nil {
		s.previewLocks = map[string]*sync.Mutex{}
	}
	if s.previewLocks[name] == nil {
		s.previewLocks[name] = &sync.Mutex{}
	}
	return s.previewLocks[name]
}

// sidecarReason reduces a sidecar failure to the reason it logged: the text
// after its last "ERROR: " line, without the log lines that came before it.
func sidecarReason(err error) error {
	lines := strings.Split(strings.TrimSpace(err.Error()), "\n")
	for index := len(lines) - 1; index >= 0; index-- {
		if reason, found := strings.CutPrefix(strings.TrimSpace(lines[index]), "ERROR: "); found && reason != "" {
			return errors.New(reason)
		}
	}
	return err
}

// Preview returns a WAV of the voice speaking the entry's name or alias, reusing
// a cached render when one exists. A failed, empty or timed-out render leaves no
// file behind, so the next attempt always starts clean.
func (s *Service) Preview(id string, alias *int, voice PreviewVoice) ([]byte, error) {
	entities, err := s.Entities()
	if err != nil {
		return nil, err
	}
	spoken := spokenName(entities, id, alias)
	if spoken == "" {
		return nil, fmt.Errorf("the requested Story Bible name no longer exists")
	}
	name := previewFileName(voice, spoken, chosenPronunciationKey(entities, id, alias))
	dir := filepath.Join(s.project, "ManuscriptGuide", "audio", "tts")
	out := filepath.Join(dir, name)
	lock := s.previewLock(name)
	lock.Lock()
	defer lock.Unlock()
	if audio, ok := cachedPreview(out); ok {
		return audio, nil
	}
	args := []string{"render-audio", "--guide", s.guidePath(), "--entity-id", id, "--audio-dir", dir, "--piper-model", voice.Model, "--output-name", name}
	if alias != nil {
		args = append(args, "--alias-index", fmt.Sprint(*alias))
	}
	ctx, cancel := context.WithTimeout(context.Background(), s.previewTimeout)
	defer cancel()
	if _, err = s.runContext(ctx, args...); err != nil {
		discardPreview(out)
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf("the preview took longer than %s and was stopped; try again, and restart the app if it keeps happening", s.previewTimeout.Round(time.Second))
		}
		return nil, sidecarReason(err)
	}
	audio, ok := cachedPreview(out)
	if !ok {
		discardPreview(out)
		return nil, fmt.Errorf("the preview voice produced no audio for %q", spoken)
	}
	return audio, nil
}
