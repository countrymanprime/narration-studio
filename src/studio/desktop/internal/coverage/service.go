package coverage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/evidence"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// defaultPollInterval is how often a run's progress file and exit are checked.
const defaultPollInterval = 250 * time.Millisecond

// Config is what the host gives the service when a project is attached.
type Config struct {
	// Project is the project folder. Every path a run hands the sidecar is
	// built from it and from the saved project file (threat-model row 4e).
	Project string
	// Python and Backend start the Transcript Compare sidecar, as for
	// transcript.Service (Backend is the script, empty for a frozen sidecar).
	Python  string
	Backend string
	// ProjectFile resolves the saved .rpp the narrator chose for the project
	// (the audio engine panel's selection). It may be anywhere.
	ProjectFile func() (string, error)
	// LoadManuscript returns the canonical manuscript (manuscript.Service.Load).
	LoadManuscript func() (map[string]any, error)
	// LoadCredits returns a credits kind's ("opening" or "closing") rendered title and text - the same first-of-kind
	// template render the Home row and the teleprompter show - or an error when the
	// library has no template of that kind. nil refuses every credits check with ReasonCreditsNotSetUp.
	LoadCredits func(kind string) (title, text string, err error)
	// Reporter logs a stored file that cannot be read; may be nil.
	Reporter *persist.Reporter
	// ProjectReader reads the saved .rpp ProjectFile resolves; nil falls back to tracks.Parse
	// directly, so a Config literal built before this field existed keeps reading exactly as it did before.
	ProjectReader dawport.ProjectReader
}

// Child is a started sidecar: *process.Child satisfies it.
type Child interface {
	HasExited() bool
	ExitCode() (int, bool)
}

// Launcher starts the sidecar. Cancel is the sidecar's own .cancel file, never
// a kill, so it can leave its words files consistent.
type Launcher func(ctx context.Context, program string, args ...string) (Child, error)

// SupervisorLauncher launches through the host's process supervisor, which
// owns the Windows job object that kills the sidecar with the app.
func SupervisorLauncher(supervisor *process.Supervisor) Launcher {
	return func(ctx context.Context, program string, args ...string) (Child, error) {
		child, err := supervisor.Start(ctx, program, args...)
		if err != nil {
			return nil, err
		}
		return child, nil
	}
}

// Phase is where the service's one job is.
type Phase string

const (
	PhaseIdle      Phase = "idle"
	PhaseRunning   Phase = "running"
	PhaseComplete  Phase = "complete"
	PhaseCancelled Phase = "cancelled"
	PhaseFailed    Phase = "failed"
)

// State is the service's job as the UI sees it (the coverage bindings send it as the
// "coverage:state" event).
type State struct {
	RunID     string  `json:"runId,omitempty"`
	ChapterID string  `json:"chapterId,omitempty"`
	Phase     Phase   `json:"phase"`
	Percent   float64 `json:"percent"`
	Stage     string  `json:"stage,omitempty"`
	Message   string  `json:"message"`
	// RecordID is the ledger record the finished run wrote.
	RecordID    string     `json:"recordId,omitempty"`
	StartedAt   *time.Time `json:"startedAt,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	// Background is true for a run the host started on its own, not the
	// narrator: the UI labels it, and a narrator's own start pre-empts it.
	Background bool `json:"background"`
	// Pass, FirstPassModel, RecheckModel and RecheckWindows are the model cascade's own live progress:
	// set only for a run that asked for a re-check (Request.Recheck.Model non-empty), so the dialog can name which
	// pass is running and how many passages the plan found without waiting for the stored result. Pass is one of
	// "first_pass", "pipeline" (both models working at once), "recheck_windows", "recheck_whole" or "realign" (job.passLabel()).
	Pass           string `json:"pass,omitempty"`
	FirstPassModel string `json:"firstPassModel,omitempty"`
	RecheckModel   string `json:"recheckModel,omitempty"`
	RecheckWindows int    `json:"recheckWindows,omitempty"`
}

// Request is one coverage run.
type Request struct {
	ChapterID     string
	Transcription Transcription
	Alignment     AlignmentParams
	// Background marks a run the host started on its own (NextBackground), not the narrator.
	Background bool
	// Recheck is the model cascade's second pass: when
	// its Model is set, a first pass with Transcription's model is followed, for every region the
	// first pass reports missing, by a re-check with Recheck's model, spliced into the same words
	// and re-aligned - or, when the windows would cover most of the chapter (MC3), one
	// whole-chapter pass with Recheck's model in its place. The zero value keeps today's
	// single-pass behaviour; the host resolves it from settings (MC1, MC2, off by default).
	Recheck Transcription
	// Parallel is how the first pass (and a whole-chapter re-check) cuts an item up and how many processes
	// transcribe the pieces. The zero value sends nothing: the sidecar transcribes each item whole, in one process.
	Parallel Parallel
	// UnsureBelow, above 0, has the first pass report the passages whose words Whisper scored under it, so the
	// re-check can take them as well as what is missing. 0 reports none.
	UnsureBelow float64
	// Pipeline runs the first pass and the re-check of the passages it doubts in one sidecar process, the larger model starting on an
	// item as soon as the smaller one has finished it (docs/design/recording-check-pipeline.md). It needs Recheck and UnsureBelow; without
	// either, or false, the stages run one after the other as before, which is also the oracle the pipelined result is checked against.
	Pipeline bool
	// Concurrent is how many runs may be in progress when this one starts, itself included: the narrator's Check
	// recordings run of several chapters sets it above 1. 0 or 1 starts only when nothing else is running.
	Concurrent int
}

// pipelined reports whether the first pass is the one-process cascade: a re-check model, a score line to find the doubtful passages
// by, and the narrator's (or the default) permission.
func (r Request) pipelined() bool {
	return r.Pipeline && r.Recheck.Model != "" && r.UnsureBelow > 0
}

// Service runs coverage analyses and reads results back. It runs one at a time unless a Start asks for more
// (Request.Concurrent): the narrator's Check recordings run may overlap several chapters, each with its own
// sidecar, folder and state.
type Service struct {
	config       Config
	launch       Launcher
	changed      func(State)
	now          func() time.Time
	pollInterval time.Duration

	ledger  *evidence.LedgerStore
	cache   *evidence.CacheStore
	mapping *evidence.MappingStore
	results resultStore

	mu sync.Mutex
	// jobs are the runs in progress by run id. A job's own state is read and written with mu held.
	// +checklocks:mu
	jobs map[string]*job
	// preparing are the chapters whose run is being prepared, between the limit check and the sidecar launching.
	// +checklocks:mu
	preparing map[string]bool
	// state is the state last sent, what State answers.
	// +checklocks:mu
	state State
}

// New builds the service for one project. changed, when not nil, hears every
// state change.
func New(config Config, launch Launcher, changed func(State)) *Service {
	ledger := evidence.NewLedgerStore(config.Project)
	ledger.Reporter = config.Reporter
	cache := evidence.NewCacheStore(config.Project)
	cache.Reporter = config.Reporter
	mapping := evidence.NewMappingStore(config.Project)
	mapping.Reporter = config.Reporter
	return &Service{
		config: config, launch: launch, changed: changed, now: time.Now, pollInterval: defaultPollInterval,
		ledger: ledger, cache: cache, mapping: mapping,
		results: resultStore{dir: resultsDir(config.Project), reporter: config.Reporter},
		state:   State{Phase: PhaseIdle, Message: "Save the REAPER project, then check a chapter's recording."},
		jobs:    map[string]*job{}, preparing: map[string]bool{},
	}
}

// State returns the state last sent: the newest change of any run.
func (s *Service) State() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

// States returns the state of every run in progress, oldest first.
func (s *Service) States() []State {
	s.mu.Lock()
	defer s.mu.Unlock()
	states := make([]State, 0, len(s.jobs))
	for _, running := range s.jobs {
		states = append(states, running.state)
	}
	sort.Slice(states, func(i, j int) bool { return states[i].RunID < states[j].RunID })
	return states
}

// Busy reports whether a run is being prepared or is running, so the host
// does not switch projects under it.
func (s *Service) Busy() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.jobs)+len(s.preparing) > 0
}

// Wait blocks until the runs in progress, if any, have finished and written their
// ledger records.
func (s *Service) Wait() {
	s.mu.Lock()
	waiting := make([]*job, 0, len(s.jobs))
	for _, running := range s.jobs {
		waiting = append(waiting, running)
	}
	s.mu.Unlock()
	for _, running := range waiting {
		<-running.done
	}
}

// Start prepares a run from the saved project and starts the sidecar. It
// returns an UnknownError, having run and written nothing, when the chapter
// cannot be measured as the saved project stands (unmapped, a missing source,
// ...), and a plain error when something could not be written or launched.
// A run starts only while fewer than request.Concurrent (at least 1) are in
// progress, and never while the same chapter is already being checked.
func (s *Service) Start(request Request) (State, error) {
	s.mu.Lock()
	if s.checkingLocked(request.ChapterID) {
		s.mu.Unlock()
		return State{}, unknown(ReasonBusy, "this chapter is already being checked")
	}
	if limit := max(1, request.Concurrent); len(s.jobs)+len(s.preparing) >= limit {
		s.mu.Unlock()
		if limit == 1 {
			return State{}, unknown(ReasonBusy, "a recording check is already running")
		}
		return State{}, unknown(ReasonBusy, fmt.Sprintf("%d recording checks are already running", limit))
	}
	s.preparing[request.ChapterID] = true
	s.mu.Unlock()

	running, err := s.prepareAndLaunch(request)
	s.mu.Lock()
	delete(s.preparing, request.ChapterID)
	if err != nil {
		s.mu.Unlock()
		return State{}, err
	}
	running.state = running.initialState()
	s.jobs[running.runID] = running
	s.state = running.state
	state := s.state
	s.mu.Unlock()
	s.notify(state)
	go s.watch(running)
	return state, nil
}

// checkingLocked reports whether a run of chapterID is being prepared or is in progress.
// +checklocks:s.mu
func (s *Service) checkingLocked(chapterID string) bool {
	if s.preparing[chapterID] {
		return true
	}
	for _, running := range s.jobs {
		if running.basis.ChapterID == chapterID {
			return true
		}
	}
	return false
}

// Cancel asks every running sidecar to stop through its .cancel file. The items
// each finished stay cached and the run records a partial outcome.
func (s *Service) Cancel() {
	s.cancelWhere(func(*job) bool { return true })
}

// CancelBackground cancels the runs the host started on its own (a background check gives way to the narrator's) and waits until they have ended; the narrator's own runs are left alone.
func (s *Service) CancelBackground() {
	cancelled := s.cancelWhere(func(running *job) bool { return running.request.Background })
	for _, running := range cancelled {
		<-running.done
	}
}

// cancelWhere cancels the running jobs that match, and returns them.
func (s *Service) cancelWhere(match func(*job) bool) []*job {
	s.mu.Lock()
	var cancelled []*job
	var states []State
	for _, running := range s.jobs {
		if running.state.Phase != PhaseRunning || !match(running) {
			continue
		}
		running.state.Message = "Cancelling..."
		s.state = running.state
		cancelled = append(cancelled, running)
		states = append(states, running.state)
	}
	s.mu.Unlock()
	for i, running := range cancelled {
		// The error is dropped on purpose: it fails only when the run has just
		// finished and removed its folder, and then there is nothing to cancel.
		_ = os.WriteFile(running.progressPath+".cancel", []byte("cancel"), 0o600)
		s.notify(states[i])
	}
	return cancelled
}

func (s *Service) notify(state State) {
	if s.changed != nil {
		s.changed(state)
	}
}

// savedProject resolves, checks and parses the saved .rpp: the only basis a
// coverage run or result has (Q6). The file is read wherever it is: in the project
// folder at any depth, or in a separate DAW folder, as the link allows.
func (s *Service) savedProject() (tracks.Project, evidence.LedgerProjectFile, error) {
	if s.config.ProjectFile == nil {
		return tracks.Project{}, evidence.LedgerProjectFile{}, unknown(ReasonNoProjectFile, "no REAPER project file is chosen for this project")
	}
	path, err := s.config.ProjectFile()
	if err != nil {
		return tracks.Project{}, evidence.LedgerProjectFile{}, unknownf(ReasonNoProjectFile, "choose the saved REAPER project file in the audio engine panel first (%v)", err)
	}
	if !strings.EqualFold(filepath.Ext(path), ".rpp") {
		return tracks.Project{}, evidence.LedgerProjectFile{}, unknown(ReasonNoProjectFile, "the chosen file is not a REAPER project file (.rpp)")
	}
	info, err := os.Stat(path)
	if err != nil {
		return tracks.Project{}, evidence.LedgerProjectFile{}, unknownf(ReasonProjectUnreadable, "could not read %s: %v", filepath.Base(path), err)
	}
	project, err := s.readProject(path)
	if err != nil {
		return tracks.Project{}, evidence.LedgerProjectFile{}, unknownf(ReasonProjectUnreadable, "could not read %s: %v", filepath.Base(path), err)
	}
	return project, projectFileFact(path, info.ModTime()), nil
}

// readProject is the dawport.ProjectReader role over path: nil falls back to tracks.Parse
// directly.
func (s *Service) readProject(path string) (tracks.Project, error) {
	if s.config.ProjectReader == nil {
		return tracks.Parse(path)
	}
	return s.config.ProjectReader.ReadProject(path)
}

func (s *Service) chapter(chapterID string) (ChapterBasis, error) {
	basis, _, err := s.basisAndText(chapterID)
	return basis, err
}

// basisAndText resolves chapterID's basis, and, for a credits row, the rendered text a run measures against (Phase
// 3): manuscriptPath (used only by a caller launching the sidecar) stays the real manuscript for a manuscript
// chapter, and text is empty - the sidecar already reads that file itself. A credits id (CreditsKind) never reaches
// LoadManuscript at all: credits are not manuscript chapters and must never be looked up as one.
func (s *Service) basisAndText(chapterID string) (basis ChapterBasis, text string, err error) {
	if s.config.LoadManuscript == nil {
		return ChapterBasis{}, "", unknown(ReasonNoManuscript, "import a manuscript before checking a recording")
	}
	data, loadErr := s.config.LoadManuscript()
	if loadErr != nil {
		return ChapterBasis{}, "", unknown(ReasonNoManuscript, loadErr.Error())
	}
	if kind, ok := CreditsKind(chapterID); ok {
		documentID, _ := data["documentId"].(string)
		if documentID == "" {
			return ChapterBasis{}, "", unknown(ReasonNoManuscript, "import a manuscript before checking a recording")
		}
		if s.config.LoadCredits == nil {
			return ChapterBasis{}, "", unknown(ReasonCreditsNotSetUp, "credits recording checks are not available")
		}
		title, renderedText, loadErr := s.config.LoadCredits(kind)
		if loadErr != nil {
			return ChapterBasis{}, "", unknown(ReasonCreditsNotSetUp, loadErr.Error())
		}
		return creditsBasis(documentID, kind, title, renderedText), renderedText, nil
	}
	basis, err = chapterBasis(data, chapterID)
	return basis, "", err
}

// manuscriptPath is the real project's canonical manuscript file: the sidecar's own --manuscript argument for a
// manuscript chapter's check, and the depth writeCreditsManuscript's stand-in file matches for a credits one.
func (s *Service) manuscriptPath() string {
	return filepath.Join(s.config.Project, "narration-utils", "manuscript", "manuscript.json")
}

func (s *Service) prepareAndLaunch(request Request) (*job, error) {
	if s.config.Project == "" {
		return nil, unknown(ReasonNoProject, "open a project before checking a recording")
	}
	if err := request.Alignment.validate(); err != nil {
		return nil, err
	}
	if request.Transcription.Model == "" {
		return nil, unknown(ReasonInvalidParams, "a Whisper model is needed to check a recording")
	}
	if s.config.Python == "" {
		return nil, unknown(ReasonSidecarMissing, "configure the Transcript Compare executable before checking a recording")
	}
	basis, text, err := s.basisAndText(request.ChapterID)
	if err != nil {
		return nil, err
	}
	project, projectFile, err := s.savedProject()
	if err != nil {
		return nil, err
	}
	trackGUID, err := confirmedTrack(s.mapping, basis.DocumentID, basis.ChapterID)
	if err != nil {
		return nil, err
	}
	planned, err := buildPlan(project, trackGUID, memoIdentify(s.config.Project))
	if err != nil {
		return nil, err
	}
	manuscriptPath := s.manuscriptPath()
	if _, isCredits := CreditsKind(basis.ChapterID); isCredits {
		manuscriptPath = creditsManuscriptPath(s.config.Project)
		if err := writeCreditsManuscript(manuscriptPath, basis, text); err != nil {
			return nil, fmt.Errorf("could not prepare the credits recording check: %w", err)
		}
	}
	inputs := readProjectInputs(s.config.Project)
	started := s.now().UTC()
	running := &job{
		runID: strconv.FormatInt(started.UnixNano(), 10), request: request, basis: basis, plan: planned,
		projectFile: projectFile, inputs: inputs, startedAt: started, done: make(chan struct{}),
		manuscriptPath: manuscriptPath,
		words:          wordsCache{store: s.cache, paramHash: wordsParamHash(request.Transcription, request.Recheck.Model, inputs)},
	}
	running.dir = filepath.Join(runsDir(s.config.Project), running.runID)
	running.progressPath = filepath.Join(running.dir, "progress.txt")
	if err := running.writeInputs(); err != nil {
		_ = os.RemoveAll(running.dir)
		return nil, err
	}
	child, err := s.launch(context.Background(), s.config.Python, s.sidecarArgs(running, request.Transcription)...)
	if err != nil {
		_ = os.RemoveAll(running.dir)
		return nil, fmt.Errorf("could not start the recording check: %w", err)
	}
	running.child = child
	return running, nil
}

// sidecarArgs builds one stage's --coverage arguments over the run's manifest and chapter, with
// the given transcription: the first pass's own model, the whole-chapter fallback's re-check model,
// or, for the align-only re-run after a windowed re-check, the first
// pass's model again (the words files still carry it, src/studio/sidecars/transcript-compare/core/coverage_mode.py's compatibility field). Every path
// is under the run's folder or is the project's own manuscript; the audio paths are in the
// manifest and come from the saved project (threat-model row 4e).
func (s *Service) sidecarArgs(running *job, transcription Transcription) []string {
	args := []string{
		"--coverage",
		"--manifest", running.manifestPath(),
		"--manuscript", running.manuscriptPath,
		"--chapter-id", running.basis.ChapterID,
		"--words-dir", running.wordsDir(),
		"--out", running.resultsPath(),
		"--progress", running.progressPath,
		"--model", transcription.Model,
		"--max-misread-run", strconv.Itoa(running.request.Alignment.MaxMisreadRun),
		"--min-anchor-run", strconv.Itoa(running.request.Alignment.MinAnchorRun),
	}
	if transcription.ModelDir != "" {
		args = append(args, "--model-dir", transcription.ModelDir)
	}
	if transcription.Language != "" {
		args = append(args, "--language", transcription.Language)
	}
	args = append(args, running.request.Parallel.args()...)
	if running.stage == stageFirstPass && running.request.UnsureBelow > 0 {
		args = append(args, "--unsure-below", strconv.FormatFloat(running.request.UnsureBelow, 'f', -1, 64))
		if running.request.pipelined() {
			args = append(args, "--recheck-model", running.request.Recheck.Model)
			if running.request.Recheck.ModelDir != "" {
				args = append(args, "--recheck-model-dir", running.request.Recheck.ModelDir)
			}
		}
	}
	if s.config.Backend != "" {
		args = append([]string{s.config.Backend}, args...)
	}
	return args
}

// recheckArgs builds the windows-only --recheck stage's arguments:
// unlike sidecarArgs, no manifest, chapter or --out - coverage_mode.run_recheck touches none of
// them - but --manuscript is required by the sidecar's argument parser regardless of mode.
func (s *Service) recheckArgs(running *job) []string {
	transcription := running.request.Recheck
	args := []string{
		"--coverage",
		"--recheck", running.windowsPath(),
		"--manuscript", running.manuscriptPath,
		"--words-dir", running.wordsDir(),
		"--progress", running.progressPath,
		"--model", transcription.Model,
	}
	if transcription.ModelDir != "" {
		args = append(args, "--model-dir", transcription.ModelDir)
	}
	if transcription.Language != "" {
		args = append(args, "--language", transcription.Language)
	}
	if s.config.Backend != "" {
		args = append([]string{s.config.Backend}, args...)
	}
	return args
}

// stageArgs builds the sidecar arguments for the stage advance is moving the job into.
func (s *Service) stageArgs(running *job, next stage) []string {
	switch next {
	case stageRecheckWhole:
		return s.sidecarArgs(running, running.request.Recheck)
	case stageRealign:
		return append(s.sidecarArgs(running, running.request.Transcription), "--align-only")
	default: // stageRecheckWindows
		return s.recheckArgs(running)
	}
}

// writeInputs creates the run's folder, writes the manifest and seeds the
// words directory from the cache.
func (j *job) writeInputs() error {
	if err := os.MkdirAll(j.wordsDir(), 0o755); err != nil {
		return fmt.Errorf("could not prepare the recording check: %w", err)
	}
	encoded, err := json.MarshalIndent(j.plan.manifest(), "", "  ")
	if err != nil {
		return err
	}
	if err := writeAtomically(j.manifestPath(), encoded); err != nil {
		return fmt.Errorf("could not write the coverage manifest: %w", err)
	}
	seeded, err := j.words.seed(j.plan.items, j.wordsDir())
	if err != nil {
		return fmt.Errorf("could not prepare the cached words: %w", err)
	}
	j.seeded = seeded
	return nil
}
