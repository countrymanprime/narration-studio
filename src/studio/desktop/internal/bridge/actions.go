package bridge

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Actions sends the REAPER bridge commands that docs/research/reaper-api-for-planned-commands.md plans and waits for
// their answers. Whether a command may be sent is its Gate's answer, asked before anything is written: the host builds the
// gate over the DAW port's resolver, so what the linked engine declares decides it. No setting does.
//
// Like Navigator, a request returns once its answer has been dispatched by the host's loop (Client.Dispatch), so a
// request must never be made from a Subscription's Handle.
type Actions struct {
	client *Client
	gate   Gate
	mu     sync.Mutex // guards everything below
	// +checklocks:mu
	timeout time.Duration
	// +checklocks:mu
	lateWait time.Duration
	// +checklocks:mu
	pending map[string]*actionRun
	// +checklocks:mu
	next uint64
	// recordingRun is the run of the recording record_start started, so its RECORD_ENDED (the narrator stopped it in
	// REAPER) reaches onRecordEnded after the request itself has returned.
	// +checklocks:mu
	recordingRun string
	// +checklocks:mu
	onRecordEnded func(RecordEnded)
	// +checklocks:mu
	observe func(RequestTiming)
}

// RequestTiming is how long one request took from writing its command to its outcome. It holds the command's name and a fixed
// outcome word, never an argument or an answer, which can carry a track's or a file's name.
type RequestTiming struct {
	Command string
	// Outcome is "answered", "error" (the script refused), "no_answer" (timed out), "cancelled" or "send_failed".
	Outcome string
	Elapsed time.Duration
	// Queue is how long the command file sat in the commands folder before REAPER read it (REAPER deletes a command file as it reads it, then
	// runs its handler), from writing it to seeing it gone, polled every takenPoll (10 ms: an answer faster than that reads as all queue). REAPER reads the files of one tick in turn, so a
	// command queued behind others in the same tick counts their handlers' time as queue. Elapsed less Queue is REAPER's own time, the answer's way
	// back included. Taken is false when the file was still there at the outcome (a request that ended unanswered takes its file back first, and the file being there to remove is what says REAPER never read it), and Queue is then Elapsed; Queue is 0 when nothing was sent. A command taken back in the moment between REAPER deleting its file and running it reads as unread and can still run; the file's absence is the only evidence the host has. When the
	// outcome proves REAPER read the command but the poll could not see the file go (a stat that failed another way), Taken is true and Queue is QueueUnknown.
	Queue time.Duration
	Taken bool
}

// SetObserver gives Actions somewhere to report each request's RequestTiming (the host writes it to the run log). It is
// optional and is called on the requesting goroutine, so it must be quick.
func (a *Actions) SetObserver(observe func(RequestTiming)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.observe = observe
}

func (a *Actions) report(command, outcome string, started time.Time, watch *takenWatch) {
	a.mu.Lock()
	observe := a.observe
	a.mu.Unlock()
	if observe != nil {
		elapsed := time.Since(started)
		queue, taken := watch.queue(started, elapsed, outcome)
		// The observer is a log write: a panic in it must not cost the caller the answer.
		defer func() { _ = recover() }()
		observe(RequestTiming{Command: command, Outcome: outcome, Elapsed: elapsed, Queue: queue, Taken: taken})
	}
}

// experimentalCommands are the commands the verification pass (docs/operations/reaper-verification-pass.md) has not yet
// confirmed in a real REAPER. The list gates nothing: every one is sent when its capability is declared and REAPER answers. It
// records what the pass still has to run. A command leaves this list in the PR that records its pass, and its capability's declaration in the DAW
// port's REAPER adapter moves to Supported with it (dawport/reaper's tests parse this map to hold the two together).
var experimentalCommands = map[string]bool{
	"chapter_track_state":        true,
	"select_track":               true,
	"track_create":               true,
	"chapter_folders":            true,
	"tracks_read":                true,
	"set_cursor":                 true,
	"play_from":                  true,
	"play_range":                 true,
	"stop_play":                  true,
	"watch_transport":            true,
	"arm_only":                   true,
	"arm_lane":                   true,
	"monitor_restore":            true,
	"solo_chapter":               true,
	"solo_restore":               true,
	"record_start":               true,
	"record_stop":                true,
	"switch_voice":               true,
	"set_active_take":            true,
	"hide_takes":                 true,
	"list_fx_chains":             true,
	"apply_fx_chain":             true,
	"create_regions":             true,
	"keep_voice_sample":          true,
	"delete_voice_sample_region": true,
	"read_voice_samples":         true,
	"play_position":              true,
	"punch_to":                   true,
	"roll":                       true,
	"delete_range":               true,
	"replace_range":              true,
	"restore_replacement":        true,
	"import_audio_track":         true,
	"apply_fx_range":             true,
	"remove_fx_range":            true,
	"stack_takes":                true,
	"unstack_takes":              true,
	"master_chain_read":          true,
	"split_take":                 true,
	"reduce_range_gain":          true,
	"repair_click":               true,
	"fx_range_params":            true,
	"fx_range_set_param":         true,
	"fx_range_bypass":            true,
	"fx_range_compare":           true,
	"stop_fx_compare":            true,
	"choose_range_fx":            true,
	"range_fx_chosen":            true,
	"last_action":                true,
	"undo_last":                  true,
	"monitor_level":              true,
	"read_place":                 true,
	"go_to":                      true,
	"preview_file_range":         true,
	"stop_file_preview":          true,
	"reveal_file":                true,
	"save_project":               true,
}

// actionTags are the events Actions consumes: every answer of every command it sends, and ERROR.
var actionTags = []string{"TRACK_STATE", "TRACK_ITEM", "TRACK_STATE_END", "TRACK_STALE", "TRACK_SELECTED", "TRACK_CREATED", "FOLDER_MOVE", "FOLDERS_PLANNED", "FOLDERS_REPAIRED", "FOLDERS_STALE", "ARMED", "CHAPTER_SOLOED", "SOLO_RESTORED", "MONITOR_RESTORED", "RECORD_STARTED", "RECORD_STOPPED", "RECORD_ENDED", "RECORD_NOT_OURS", "VOICE_SWITCHED", "TRACKS_READ", "TRACKS_ROW", "TRACKS_READ_END",
	"ACTIVE_TAKE_SET", "TAKES_HIDDEN", "ITEM_STALE", "FX_CHAIN", "FX_CHAINS_LISTED", "FX_CHAIN_APPLIED",
	"REGIONS_CREATED", "PLAY_POSITION", "PUNCHED", "ROLLED", "RANGE_CUT", "RANGE_REPLACED", "REPLACEMENT_RESTORED", "AUDIO_TRACK_ADDED", "RANGE_FX_APPLIED", "RANGE_FX_REMOVED", "TAKES_STACKED", "TAKES_UNSTACKED", "MASTER_CHAIN_FX", "MASTER_CHAIN_TRACK", "MASTER_CHAIN_READ", "TAKE_SPLIT",
	"FILE_PREVIEW_STARTED", "FILE_PREVIEW_STOPPED", "FILE_REVEALED", "RANGE_GAIN_REDUCED", "CLICKS_REPAIRED",
	"RANGE_FX_PARAM", "RANGE_FX_PARAMS", "RANGE_FX_PARAM_SET", "RANGE_FX_BYPASSED",
	"RANGE_FX_COMPARE", "RANGE_FX_COMPARE_STOPPED", "RANGE_FX_CHOOSING", "RANGE_FX_CHOSEN_FX", "RANGE_FX_CHOSEN", "LAST_ACTION", "UNDONE_LAST", "SAVED", "MONITOR_LEVEL", "PUNCH_PREROLL", "METERS", "PLACE", "PLACE_SET",
	"VOICE_SAMPLE_KEPT", "VOICE_SAMPLE_STALE", "VOICE_SAMPLE_REMOVED", "VOICE_SAMPLE_REGION", "VOICE_SAMPLES_READ",
	"CURSOR_SET", "TRANSPORT_PLAYING", "RANGE_PLAYING", "TRANSPORT_STOPPED", "TRANSPORT_WATCHING", "ERROR"}

// Gate is asked, with the command's name, before Actions sends it. nil lets the command go; an error refuses it and
// nothing is written, and the refusal reaches the caller as it is.
type Gate func(command string) error

// ErrNotGated is the refusal of an Actions built with no gate: nothing was sent to REAPER. It is a wiring bug, never a narrator's setting.
var ErrNotGated = errors.New("this REAPER command has no capability gate, so nothing was sent")

// actionRun collects the events of one request until one of its closing tags (or an ERROR) arrives.
type actionRun struct {
	closing map[string]bool
	events  []Event
	done    chan answerSet
}

type answerSet struct {
	events []Event
	err    error
}

// NewActions subscribes to the answers of its commands on client. gate is asked on every request; a nil gate
// refuses every command with ErrNotGated, so an Actions nobody gated sends nothing. With a nil
// client every request the gate lets through is ErrUnavailable.
func NewActions(client *Client, gate Gate) *Actions {
	a := &Actions{client: client, gate: gate, timeout: DefaultAnswerTimeout, lateWait: LateAnswerWait, pending: map[string]*actionRun{}}
	if client != nil {
		client.Subscribe(Subscription{Tags: actionTags, Owns: a.owns, Handle: a.handle, Invalid: a.invalid})
	}
	return a
}

// SetTimeout changes how long a request waits for its answer.
func (a *Actions) SetTimeout(timeout time.Duration) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.timeout = timeout
}

// Experimental reports whether command is still on experimentalCommands (not yet through the verification pass). It decides
// nothing about whether the command is sent.
func Experimental(command string) bool { return experimentalCommands[command] }

// request sends command with a new run ID and returns every event of that run up to and including the first one whose
// tag is in closing. An ERROR for the run ends it with its message.
func (a *Actions) request(ctx context.Context, command string, closing []string, args ...string) ([]Event, error) {
	if err := a.allowed(command); err != nil {
		return nil, err
	}
	runID, run, timeout := a.open(closing)
	defer a.close(runID)
	started := time.Now()
	defer a.client.Expect()()
	target, err := a.client.Send(command, append([]string{runID}, args...))
	if err != nil {
		a.report(command, "send_failed", started, nil)
		a.logFailure(command, runID, "could not send")
		return nil, fmt.Errorf("could not send %s to REAPER: %w", command, err)
	}
	watch := watchTaken(target)
	defer watch.stop()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case got := <-run.done:
		if got.err != nil {
			a.report(command, "error", started, watch)
			a.logFailure(command, runID, failureKind(got.err))
		} else {
			a.report(command, "answered", started, watch)
		}
		return got.events, got.err
	case <-timer.C:
		// Taken back first: what the take-back finds is what says whether REAPER read the command, and the observer (a log write) must not
		// stand between the timeout and taking the command back.
		back := a.client.retract(target)
		watch.retracted(back)
		if back != retractRemoved && mayRunLong[command] {
			// REAPER already read this command (or the file could not be taken back), so it is at work on it (a create or an arm in a big
			// project can take longer than the usual wait): keep waiting for its answer rather than report a failure for a change that is
			// about to land.
			return a.waitLate(ctx, command, runID, run, started, watch, back)
		}
		a.report(command, "no_answer", started, watch)
		a.logFailure(command, runID, "no answer within "+timeout.String()+retractNote(back))
		return nil, ErrNoAnswer
	case <-ctx.Done():
		back := a.client.retract(target)
		watch.retracted(back)
		a.report(command, "cancelled", started, watch)
		a.logFailure(command, runID, "cancelled"+retractNote(back))
		if back != retractRemoved && mayRunLong[command] {
			// The caller's deadline ended after REAPER read the command: it may have done it, as for a late answer.
			return nil, fmt.Errorf("%w: %w", ErrAnswerLate, ctx.Err())
		}
		return nil, ctx.Err()
	}
}

// LateAnswerWait is how much longer a command in mayRunLong is waited for once REAPER has read it and has not answered in
// DefaultAnswerTimeout. A command REAPER never read is taken back and fails at DefaultAnswerTimeout, as before.
const LateAnswerWait = 20 * time.Second

// mayRunLong are the commands REAPER can take longer than DefaultAnswerTimeout to finish once it has read them, and whose abandoned wait
// does harm (#3645): track_create and the two arms report a failure for a change that still lands (a lane made and then "not found", a
// retry that makes a second one), and tracks_read answers the saved project, without the lane just made, in place of the live list.
// Other commands keep the short wait.
var mayRunLong = map[string]bool{"track_create": true, "arm_only": true, "arm_lane": true, "tracks_read": true, "switch_voice": true}

// ErrAnswerLate is ErrNoAnswer for a command REAPER had read: it may still have done what it was asked, so the caller reads back
// before saying it failed or sending it again. errors.Is(err, ErrNoAnswer) holds.
var ErrAnswerLate = fmt.Errorf("%w: REAPER took the command but has not confirmed it yet", ErrNoAnswer)

// waitLate waits up to LateAnswerWait more for the answer of a command REAPER has read.
func (a *Actions) waitLate(ctx context.Context, command, runID string, run *actionRun, started time.Time, watch *takenWatch, back retractResult) ([]Event, error) {
	a.mu.Lock()
	wait := a.lateWait
	a.mu.Unlock()
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case got := <-run.done:
		if got.err != nil {
			a.report(command, "error", started, watch)
			a.logFailure(command, runID, failureKind(got.err))
		} else {
			a.report(command, "answered", started, watch)
		}
		return got.events, got.err
	case <-timer.C:
		a.report(command, "no_answer", started, watch)
		a.logFailure(command, runID, "no answer within "+wait.String()+" more"+retractNote(back))
		return nil, ErrAnswerLate
	case <-ctx.Done():
		a.report(command, "cancelled", started, watch)
		a.logFailure(command, runID, "cancelled"+retractNote(back))
		return nil, fmt.Errorf("%w: %w", ErrAnswerLate, ctx.Err())
	}
}

// SetLateWait changes how long a command in mayRunLong is waited for after REAPER has read it.
func (a *Actions) SetLateWait(wait time.Duration) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.lateWait = wait
}

// retractNote is what the host log adds when a request ends unanswered: whether the command was taken back before REAPER read it.
func retractNote(back retractResult) string {
	switch back {
	case retractRemoved:
		return " (command taken back)"
	case retractFailed:
		return " (command could not be taken back and may still run)"
	}
	return " (REAPER had already read the command)"
}

// logFailure writes one host-log line for a command sent that failed, with its run ID: the command's first argument, which every event
// the script answers it with carries too, so the line can be matched with the session folder's events.log.
func (a *Actions) logFailure(command, runID, kind string) {
	a.client.report("reaper_action_failed", fmt.Sprintf("%s run %s: %s", command, runID, kind))
}

// failureKind is what the host log says of an answer's error: the host's own sentence for an error it names, and never the script's
// sentence, which can carry a track's or a file's name.
func failureKind(err error) string {
	var refusal *RefusalError
	switch {
	case errors.As(err, &refusal):
		return "error (the script's own sentence, not logged)"
	case errors.Is(err, ErrRollStopped):
		return "error: " + ErrRollStopped.Error()
	case hostSentence(err):
		return "error: " + err.Error()
	default:
		return "error"
	}
}

// hostSentence reports whether err is one of the errors the host words itself, whose text holds nothing of the narrator's.
func hostSentence(err error) bool {
	switch err {
	case ErrScriptOutdated, ErrRecording, ErrPunchWhileRecording, ErrBadPunch, ErrBadRoll:
		return true
	}
	for _, known := range refusals {
		if err == known {
			return true
		}
	}
	return false
}

// allowed refuses a command its gate refuses, then any command with no bridge, before anything is written.
func (a *Actions) allowed(command string) error {
	if a.gate == nil {
		return ErrNotGated
	}
	if err := a.gate(command); err != nil {
		return err
	}
	if a.client == nil {
		return ErrUnavailable
	}
	return nil
}

func (a *Actions) open(closing []string) (string, *actionRun, time.Duration) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.next++
	runID := fmt.Sprintf("act%d-%d", time.Now().UnixNano(), a.next)
	run := &actionRun{closing: map[string]bool{}, done: make(chan answerSet, 1)}
	for _, tag := range closing {
		run.closing[tag] = true
	}
	a.pending[runID] = run
	return runID, run, a.timeout
}

func (a *Actions) close(runID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.pending, runID)
}

func (a *Actions) owns(runID string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	_, ok := a.pending[runID]
	return ok || (runID != "" && runID == a.recordingRun)
}

func (a *Actions) handle(event Event) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if event.RunID == "" {
		// A session-level ERROR (an unsupported protocol) answers every request in flight.
		if event.Tag == "ERROR" {
			for _, run := range a.pending {
				finish(run, answerSet{err: actionError(event)})
			}
		}
		return
	}
	if event.Tag == "RECORD_ENDED" && event.RunID == a.recordingRun {
		a.recordingRun = ""
		if a.onRecordEnded != nil {
			ended := RecordEnded{Restored: int(numberAt(event.Fields, 2)), Kept: int(numberAt(event.Fields, 3)), UndoPoints: int(numberAt(event.Fields, 4))}
			// Handle runs inside Dispatch: the callback must be quick and must not make a request.
			go a.onRecordEnded(ended)
		}
		return
	}
	run, ok := a.pending[event.RunID]
	if !ok {
		return
	}
	switch {
	case event.Tag == "ERROR":
		finish(run, answerSet{err: actionError(event)})
	case run.closing[event.Tag]:
		run.events = append(run.events, event)
		finish(run, answerSet{events: run.events})
	default:
		run.events = append(run.events, event)
	}
}

func (a *Actions) invalid(event Event, reason error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if run, ok := a.pending[event.RunID]; ok {
		finish(run, answerSet{err: fmt.Errorf("REAPER sent an answer this app could not read (%v): import the app's script from this app's REAPER folder again", reason)})
	}
}

// finish hands a run its answer once; a later event for the same run is dropped.
func finish(run *actionRun, got answerSet) {
	select {
	case run.done <- got:
	default:
	}
}

func actionError(event Event) error {
	message := "REAPER could not do that"
	if len(event.Fields) > 2 && event.Fields[2] != "" {
		message = event.Fields[2]
	}
	switch message {
	case "Unsupported workspace command":
		return ErrScriptOutdated
	case "REAPER is recording. Stop recording first.":
		return ErrRecording
	case "REAPER is recording. Stop it before moving to a word.":
		return ErrPunchWhileRecording
	case "The word time or pre-roll is not a usable number of seconds.":
		return ErrBadPunch
	case "The roll time is not a usable number of seconds.":
		return ErrBadRoll
	}
	if known, ok := refusals[message]; ok {
		return known
	}
	if rollStopped[message] {
		return fmt.Errorf("%w: %s", ErrRollStopped, message)
	}
	return &RefusalError{Sentence: message}
}

// RefusalError is an ERROR the script answered with a sentence this host has no error of its own for: REAPER refused, and
// the sentence says why in the narrator's words (roll's overlapping-recording option, say).
type RefusalError struct{ Sentence string }

func (e *RefusalError) Error() string { return e.Sentence }

// normalizeGUID writes a GUID the way the Lua bridge compares it: upper case in braces, so the host can match an answer
// against what it asked for.
func normalizeGUID(guid string) string {
	bare := strings.ToUpper(strings.Trim(strings.TrimSpace(guid), "{}"))
	if bare == "" {
		return ""
	}
	return "{" + bare + "}"
}

// takenPoll is how often a request looks for its command file to be gone.
const takenPoll = 10 * time.Millisecond

// takenWatch notes when REAPER read a command: REAPER deletes the file as it reads it, so the file's absence is the moment, to within
// takenPoll. It is how a request's wait is split into the time the command queued and REAPER's own time.
type takenWatch struct {
	done chan struct{}
	// stat looks at the command file; os.Stat, except in a test that needs a stat that fails some other way than "not there".
	stat func(string) (os.FileInfo, error)
	mu   sync.Mutex
	// +checklocks:mu
	target string
	// +checklocks:mu
	at time.Time
	// +checklocks:mu
	taken backResult
}

// backResult is what taking a command back found: not tried, the host removed the file (REAPER had not deleted it), it was already gone, or it
// could not be removed.
type backResult int

const (
	notTakenBack backResult = iota
	takenBackByUs
	goneBeforeTakenBack
	takeBackFailed
)

// QueueUnknown is RequestTiming.Queue when REAPER is known to have answered but the file's going was not seen: a negative millisecond, so a
// log field in whole milliseconds reads -1.
const QueueUnknown = -time.Millisecond

func watchTaken(target string) *takenWatch {
	w := &takenWatch{done: make(chan struct{}), stat: os.Stat}
	w.mu.Lock()
	w.target = target
	w.mu.Unlock()
	go func() {
		ticker := time.NewTicker(takenPoll)
		defer ticker.Stop()
		for {
			select {
			case <-w.done:
				return
			case <-ticker.C:
				if w.seen() {
					return
				}
			}
		}
	}()
	return w
}

// retracted records what taking the command back found, which settles a request that ended without an answer: a file the host had to remove
// was not yet deleted by REAPER, one that could not be removed may still be there (REAPER never read it, or will read it late), and one
// already gone was read by REAPER (or removed by something else; a missing folder is told apart in queue, nothing else can be). REAPER
// deletes the file a moment before it runs the command, so a command taken back in that moment is reported as unread and can still run.
func (w *takenWatch) retracted(back retractResult) {
	if w == nil {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	switch back {
	case retractRemoved:
		w.taken = takenBackByUs
	case retractFailed:
		w.taken = takeBackFailed
	default:
		w.taken = goneBeforeTakenBack
	}
}

// seen looks once and answers whether the file is gone, noting the first time it was. The stat runs outside the lock.
func (w *takenWatch) seen() bool {
	w.mu.Lock()
	if !w.at.IsZero() {
		w.mu.Unlock()
		return true
	}
	target := w.target
	w.mu.Unlock()
	if _, err := w.stat(target); !os.IsNotExist(err) {
		return false
	}
	// A commands folder that is gone too is not REAPER reading the command.
	if _, err := os.Stat(filepath.Dir(target)); err != nil {
		return false
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.at.IsZero() {
		w.at = time.Now()
	}
	return true
}

// folderExists says the commands folder is still there: a file missing from a missing folder is not REAPER reading it.
func (w *takenWatch) folderExists() bool {
	w.mu.Lock()
	target := w.target
	w.mu.Unlock()
	_, err := os.Stat(filepath.Dir(target))
	return err == nil
}

func (w *takenWatch) stop() {
	if w != nil {
		close(w.done)
	}
}

// queue answers how long the command waited for REAPER to read it, measured from started, and whether REAPER read it at all. A file the host
// had to remove, or could not remove, was not read: its queue time is the whole wait. Otherwise a file the watch saw go (while its folder was
// there) was read at that moment. A file that is gone but was not seen to go is read when the outcome shows REAPER answered (answered or
// error) or the take-back found it already gone with its folder still there, with an unknown queue time (QueueUnknown); a vanished folder is
// not REAPER reading it. A nil watch (nothing was sent) answers zero.
func (w *takenWatch) queue(started time.Time, elapsed time.Duration, outcome string) (time.Duration, bool) {
	if w == nil {
		return 0, false
	}
	w.mu.Lock()
	back := w.taken
	w.mu.Unlock()
	if back == takenBackByUs {
		return elapsed, false
	}
	// A take-back that failed leaves the file where it was: REAPER may read it later, in the late wait of a command that may run long, and
	// then the watch sees it go and the command is read like any other.
	if w.seen() {
		w.mu.Lock()
		defer w.mu.Unlock()
		return min(w.at.Sub(started), elapsed), true
	}
	if back == goneBeforeTakenBack && !w.folderExists() {
		return elapsed, false
	}
	if outcome == "answered" || outcome == "error" || back == goneBeforeTakenBack {
		return QueueUnknown, true
	}
	return elapsed, false
}
