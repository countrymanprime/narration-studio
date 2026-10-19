package audacity

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// Review is the review workflow's role over Audacity (docs/reference/daw/capabilities.md#review). The transcript service speaks to a
// DAW in REAPER's events (COMPARE_PREPARED, COMPARE_MARKER, COMPARE_INSPECTED, COMPARE_EXPORT_MARKER, COMPARE_EXPORTED, ERROR), so
// Audacity's answers are those events, queued as each request finishes and delivered by Dispatch on the caller's goroutine.
//
// Audacity has no items and no takes, so the audio under review is the selected audio track, exported once to a WAV in SessionFolder
// and listed as one manifest line; a finding's place is the track's start plus its position in that WAV. A finding is a label,
// `[nu:<id>] <kind>: <words>`, on the "Narration Utils" label track, found again by its id and never by time.
type Review struct {
	session *Session
	// exported checks the file an export wrote; nil means "it exists and holds more than a WAV header", which is what an export of
	// no audio looks like (docs/research/real-audacity3-ci-integration.md, finding 2). A test replaces it.
	exported func(path string) error

	*eventHub

	mu    sync.Mutex // guards runs, order and every run's rows
	runs  map[string]*reviewRun
	order []string
}

var _ dawport.ReviewSession = (*Review)(nil)

type reviewRun struct {
	trackName  string
	trackStart float64
	rows       map[string]*reviewRow
}

type reviewRow struct {
	labelID string
	text    string
	time    float64
	state   string // "pending", "existing" or "exported"
}

// maxRuns is how many comparisons the session remembers; a finding of an older one is "no longer available".
const maxRuns = 8

// reviewTimeout bounds one request's pipe work: an export of a long chapter is the longest.
const reviewTimeout = 5 * time.Minute

// SessionFolder is where the Audacity roles keep what they export and the files they trade with the services above them (a comparison's
// audio and manifest, a pickup list), inside the project's own narration-utils folder. It is the Audacity counterpart of REAPER's
// session directory.
func SessionFolder(project string) string {
	return filepath.Join(project, "narration-utils", "audacity-session")
}

// NewReview is the review role over session, with events of its own.
func NewReview(session *Session) *Review { return newReview(session, newEventHub()) }

// newReview is the review role over session, queuing its events on hub: the adapter's roles share one, so the transcript service's
// Dispatch also delivers a pickup's or a line's event, as REAPER's one events.log does.
func newReview(session *Session, hub *eventHub) *Review {
	return &Review{session: session, eventHub: hub, runs: map[string]*reviewRun{}}
}

// fail queues the ERROR event the transcript service shows as the run's message.
func (r *Review) fail(runID string, err error) {
	r.emit("ERROR", runID, errorSentence(err))
}

// errorSentence is the narrator's sentence for err: the pipe's own are whole sentences already.
func errorSentence(err error) string {
	var sentence audacitybridge.Sentence
	if errors.As(err, &sentence) {
		return string(sentence)
	}
	var failed *audacitybridge.CommandError
	if errors.As(err, &failed) {
		return "Audacity could not do that: " + strings.Join(failed.Lines, " ")
	}
	return err.Error()
}

func (r *Review) remember(runID string, run *reviewRun) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.runs[runID]; !ok {
		r.order = append(r.order, runID)
		for len(r.order) > maxRuns {
			delete(r.runs, r.order[0])
			r.order = r.order[1:]
		}
	}
	r.runs[runID] = run
}

func (r *Review) run(runID string) (*reviewRun, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	run, ok := r.runs[runID]
	return run, ok
}

func safeName(name string) string {
	clean := strings.Trim(unsafeName.ReplaceAllString(name, "_"), "._-")
	if clean == "" {
		return "track"
	}
	return clean[:min(len(clean), 60)]
}

// PrepareReview exports the selected audio track and lists it for the comparison (COMPARE_PREPARED), or says why it cannot (ERROR).
// It returns at once; the work runs in the background and the answer arrives through Dispatch.
func (r *Review) PrepareReview(runID, projectFolder string) error {
	if runID == "" {
		return errors.New("a review needs a run id")
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), reviewTimeout)
		defer cancel()
		if err := r.prepare(ctx, runID, projectFolder); err != nil {
			r.fail(runID, err)
		}
	}()
	return nil
}

func (r *Review) prepare(ctx context.Context, runID, project string) error {
	if !filepath.IsAbs(project) {
		return errors.New("Save the project in the app before starting Transcript Compare.")
	}
	manuscript := filepath.Join(project, "narration-utils", "manuscript", "manuscript.json")
	if _, err := os.Stat(manuscript); err != nil {
		return errors.New("Import a manuscript in Narration Utils before starting Transcript Compare.")
	}
	tracks, err := r.session.client.Tracks(ctx)
	if err != nil {
		return err
	}
	var track *audacitybridge.TrackInfo
	for i := range tracks {
		if tracks[i].Kind == "wave" && tracks[i].Selected {
			track = &tracks[i]
			break
		}
	}
	if track == nil {
		return errors.New("Select the chapter's audio track in Audacity (click its name), then start Transcript Compare.")
	}
	if !track.HasRange || track.End <= track.Start {
		return errors.New("The selected track has no audio.")
	}
	folder := SessionFolder(project)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return fmt.Errorf("Could not prepare the Audacity review folder: %w", err)
	}
	wav, err := freshPath(folder, safeName(track.Name)+"_"+runID, ".wav")
	if err != nil {
		return err
	}
	// Export2 writes only the selected tracks, and the project's audio only through this track.
	if err := r.session.client.SelectTracks(ctx, track.Index, 1); err != nil {
		return err
	}
	if err := r.session.client.SelectTime(ctx, track.Start, track.End); err != nil {
		return err
	}
	if err := r.session.client.Export(ctx, wav, min(max(track.Channels, 1), 2)); err != nil {
		return err
	}
	if err := r.checkExport(wav); err != nil {
		return err
	}
	length := track.End - track.Start
	manifest := filepath.Join(folder, "manifest_"+runID+".txt")
	if err := os.WriteFile(manifest, []byte(fmt.Sprintf("0|%s|%.6f|%.6f\n", filepath.ToSlash(wav), 0.0, length)), 0o600); err != nil {
		return fmt.Errorf("Could not write the Audacity audio manifest: %w", err)
	}
	diffs := filepath.Join(project, "TranscriptCompare", "diffs")
	if err := os.MkdirAll(diffs, 0o755); err != nil {
		return fmt.Errorf("Could not prepare the Transcript Compare folder: %w", err)
	}
	diff := filepath.Join(diffs, safeName(track.Name)+"_"+runID+".diff")
	r.remember(runID, &reviewRun{trackName: track.Name, trackStart: track.Start, rows: map[string]*reviewRow{}})
	r.emit("COMPARE_PREPARED", runID, manifest, manuscript, track.Name, diff, "1")
	return nil
}

func (r *Review) checkExport(path string) error {
	if r.exported != nil {
		return r.exported(path)
	}
	info, err := os.Stat(path)
	if err != nil {
		return errors.New("Audacity did not write the chapter's audio. Check that Audacity is not showing a dialog, then try again.")
	}
	if info.Size() <= 1024 {
		return errors.New("Audacity wrote a file with no audio in it, so nothing was compared. Select the chapter's audio track and try again.")
	}
	return nil
}

// resultMarker is one MARKER line of the comparison's results file (sidecars/transcript-compare/core/compare.py).
type resultMarker struct {
	itemIndex int
	srcpos    float64
	fields    []string // the line's fields after the tag, at most 12
}

// readResults reads the SUMMARY and MARKER lines of the results file.
func readResults(path string) (summary string, markers []resultMarker, err error) {
	file, err := os.Open(path)
	if err != nil {
		return "", nil, errors.New("Transcript results were not found.")
	}
	defer func() { _ = file.Close() }()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 4<<20)
	for scanner.Scan() {
		tag, body, ok := strings.Cut(strings.TrimSuffix(scanner.Text(), "\r"), "|")
		if !ok {
			continue
		}
		switch tag {
		case "SUMMARY":
			summary = body
		case "MARKER":
			fields := strings.SplitN(body, "|", 12)
			index, err1 := strconv.Atoi(fields[0])
			if len(fields) < 4 || err1 != nil {
				continue
			}
			srcpos, err2 := strconv.ParseFloat(fields[1], 64)
			if err2 != nil || math.IsNaN(srcpos) || math.IsInf(srcpos, 0) || srcpos < 0 {
				continue
			}
			markers = append(markers, resultMarker{itemIndex: index, srcpos: srcpos, fields: fields})
		}
	}
	return summary, markers, scanner.Err()
}

func field(fields []string, i int) string {
	if i < len(fields) {
		return fields[i]
	}
	return ""
}

func rowID(m resultMarker) string { return fmt.Sprintf("%d@%.6f", m.itemIndex, m.srcpos) }

// findingLabelID is the identity a finding's label carries: stable for the same position in any comparison of the same track.
func findingLabelID(m resultMarker) string {
	return fmt.Sprintf("f%d-%d", m.itemIndex, int64(math.Round(m.srcpos*1000)))
}

// InspectFindings reads the comparison's results and queues one COMPARE_MARKER per finding, saying whether Audacity already carries
// its label ("existing") or not ("pending"), then COMPARE_INSPECTED.
func (r *Review) InspectFindings(runID, findingsPath string) error {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), reviewTimeout)
		defer cancel()
		if err := r.inspect(ctx, runID, findingsPath); err != nil {
			r.fail(runID, err)
		}
	}()
	return nil
}

func (r *Review) inspect(ctx context.Context, runID, path string) error {
	run, ok := r.run(runID)
	if !ok {
		return errors.New("Transcript Compare context expired; prepare a new comparison.")
	}
	summary, markers, err := readResults(path)
	if err != nil {
		return err
	}
	labels, err := r.session.client.Labels(ctx)
	if err != nil {
		return err
	}
	have := map[string]string{}
	for _, l := range labels {
		if id, _, words, ok := ParseFindingLabel(l.Text); ok {
			have[id] = words
		}
	}
	duplicates := 0
	for _, m := range markers {
		id := rowID(m)
		labelID := findingLabelID(m)
		text, err := FindingLabelText(labelID, false, field(m.fields, 3)) // the marker's name: "MISREAD: their/there"
		if err != nil {
			continue
		}
		state, existing := "pending", ""
		if words, found := have[labelID]; found {
			state, existing = "existing", words
			duplicates++
		}
		when := run.trackStart + m.srcpos
		r.mu.Lock()
		run.rows[id] = &reviewRow{labelID: labelID, text: text, time: when, state: state}
		r.mu.Unlock()
		r.emit("COMPARE_MARKER", runID,
			id, field(m.fields, 2), field(m.fields, 3), field(m.fields, 4), field(m.fields, 5),
			strconv.FormatFloat(when, 'f', 6, 64), strconv.Itoa(m.itemIndex),
			field(m.fields, 6), orZero(field(m.fields, 7)), field(m.fields, 8), field(m.fields, 9),
			state, existing, strconv.FormatFloat(m.srcpos, 'f', 6, 64),
			"", "", "", // item, take and track ids: Audacity has none
		)
	}
	if summary == "" {
		summary = fmt.Sprintf("%d discrepancy(s) found.", len(markers))
	}
	r.emit("COMPARE_INSPECTED", runID, summary, strconv.Itoa(len(markers)), strconv.Itoa(duplicates))
	return nil
}

func orZero(s string) string {
	if s == "" {
		return "0"
	}
	return s
}

// ErrFindingGone: the finding is not in any comparison this session remembers, or its track is not in the project.
var ErrFindingGone = audacitybridge.Sentence("That finding is no longer available: select the chapter's audio track and compare again.")

// NavigateToFinding selects the compared track and puts the cursor at the finding.
func (r *Review) NavigateToFinding(runID, findingID string) error {
	run, ok := r.run(runID)
	if !ok {
		return ErrFindingGone
	}
	r.mu.Lock()
	row, ok := run.rows[findingID]
	var when float64
	if ok {
		when = row.time
	}
	r.mu.Unlock()
	if !ok {
		return ErrFindingGone
	}
	ctx, cancel := context.WithTimeout(context.Background(), audacitybridge.DefaultTimeout*3)
	defer cancel()
	tracks, err := r.session.client.Tracks(ctx)
	if err != nil {
		return err
	}
	index := -1
	for _, t := range tracks {
		if t.Kind == "wave" && t.Name == run.trackName {
			if index >= 0 {
				return audacitybridge.Sentence("Two tracks in Audacity are named " + run.trackName + ", so the app cannot tell which one the finding is on. Rename one and compare again.")
			}
			index = t.Index
		}
	}
	if index < 0 {
		return ErrFindingGone
	}
	if err := r.session.client.SelectTracks(ctx, index, 1); err != nil {
		return err
	}
	return r.session.client.SelectTime(ctx, when, when)
}

// ExportFindings adds a label for each pending finding of the results (a finding Audacity already carries is skipped), queueing
// COMPARE_EXPORT_MARKER for each and COMPARE_EXPORTED at the end. Audacity labels have no colour, so colors is not used.
func (r *Review) ExportFindings(runID, findingsPath string, _ dawport.MarkerColors) error {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), reviewTimeout)
		defer cancel()
		if err := r.export(ctx, runID, findingsPath); err != nil {
			r.fail(runID, err)
		}
	}()
	return nil
}

func (r *Review) export(ctx context.Context, runID, path string) error {
	run, ok := r.run(runID)
	if !ok {
		return errors.New("Transcript Compare context expired; prepare a new comparison.")
	}
	_, markers, err := readResults(path)
	if err != nil {
		return err
	}
	added, duplicates := 0, 0
	for _, m := range markers {
		id := rowID(m)
		r.mu.Lock()
		row := run.rows[id]
		r.mu.Unlock()
		if row == nil {
			continue
		}
		if row.state == "existing" {
			duplicates++
			continue
		}
		if row.state != "pending" {
			continue
		}
		labels, err := r.session.client.Labels(ctx)
		if err != nil {
			return err
		}
		if words, found := labelWords(labels, row.labelID); found {
			r.setState(row, "existing")
			duplicates++
			r.emit("COMPARE_EXPORT_MARKER", runID, id, "existing", words)
			continue
		}
		if err := r.session.addLabel(ctx, labels, row.time, row.time, row.text); err != nil {
			return fmt.Errorf("finding %s: %w", id, err)
		}
		r.setState(row, "exported")
		added++
		r.emit("COMPARE_EXPORT_MARKER", runID, id, "exported", "")
	}
	r.emit("COMPARE_EXPORTED", runID, strconv.Itoa(added), strconv.Itoa(duplicates))
	return nil
}

func (r *Review) setState(row *reviewRow, state string) {
	r.mu.Lock()
	row.state = state
	r.mu.Unlock()
}

func labelWords(labels []audacitybridge.LabelInfo, labelID string) (string, bool) {
	for _, l := range labels {
		if id, _, words, ok := ParseFindingLabel(l.Text); ok && id == labelID {
			return words, true
		}
	}
	return "", false
}
