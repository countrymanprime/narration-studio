package audacity

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-studio/shell/internal/dawport"
)

// Pickups is the pickup list over Audacity (docs/reference/daw/capabilities.md#pickups). REAPER keeps a pickup as a project marker
// named `PICKUP: <body>` (open) or `PICKUP_DONE: <body>`; Audacity has no project markers, so a pickup is a label on the "Narration
// Utils" label track, `[nu:pickup open] <body>` or `[nu:pickup done] <body>`, where <body> is the note or `[tag] note`. Resolving or
// reopening one rewrites the prefix with SetLabel. Only a label with this prefix is ever changed: the narrator's own labels, and a
// pickup the narrator edited by hand into another shape, are read as they stand. The answers are REAPER's events (PICKUPS_IMPORTED,
// PICKUPS_EXPORTED, PICKUP_NEXT, PICKUP_RESOLVED, PICKUP_REOPENED, PICKUP_MARKERS_LISTED, PICKUPS_COUNTED), queued as each request
// finishes and delivered by Dispatch.
type Pickups struct {
	*eventHub
	session *Session
}

var _ dawport.PickupList = (*Pickups)(nil)

// NewPickups is the pickup list over session, with events of its own.
func NewPickups(session *Session) *Pickups { return newPickups(session, newEventHub()) }

// newPickups is the pickup list over session, queuing its events on hub (see newReview).
func newPickups(session *Session, hub *eventHub) *Pickups {
	return &Pickups{eventHub: hub, session: session}
}

const (
	pickupOpenPrefix = "[nu:pickup open] "
	pickupDonePrefix = "[nu:pickup done] "
	// pickupTolerance is how close a pickup's time must be to count as the same one, as REAPER's duplicate window is.
	pickupTolerance = 0.15
	pickupTimeout   = 2 * time.Minute
)

var (
	pickupLabel = regexp.MustCompile(`^\[nu:pickup (open|done)\] (.*)$`)
	pickupBody  = regexp.MustCompile(`^\[(.*?)\] (.*)$`)
)

// PickupLabelText is the label text for a pickup: its state, then its tag and note, made safe for a scripting command and cut to fit.
func PickupLabelText(open bool, tag, note string) (string, error) {
	note = oneLine(note)
	if note == "" {
		return "", fmt.Errorf("%w: a pickup with no note", audacitybridge.ErrInvalidValue)
	}
	body := note
	if tag = oneLine(tag); tag != "" {
		body = "[" + tag + "] " + note
	}
	prefix := pickupDonePrefix
	if open {
		prefix = pickupOpenPrefix
	}
	return audacitybridge.SanitizeText(prefix+body, maxLabelBytes), nil
}

// ParsePickupLabel reads a pickup back from a label's text; ok is false for any other label.
func ParsePickupLabel(text string) (open bool, tag, note string, ok bool) {
	m := pickupLabel.FindStringSubmatch(text)
	if m == nil {
		return false, "", "", false
	}
	body := m[2]
	if parts := pickupBody.FindStringSubmatch(body); parts != nil {
		tag, body = parts[1], parts[2]
	}
	return m[1] == "open", tag, body, true
}

func oneLine(s string) string { return strings.Join(strings.Fields(s), " ") }

// pickup is one pickup label as read.
type pickup struct {
	label audacitybridge.LabelInfo
	open  bool
	tag   string
	note  string
}

func (p *Pickups) read(ctx context.Context) ([]pickup, []audacitybridge.LabelInfo, error) {
	labels, err := p.session.client.Labels(ctx)
	if err != nil {
		return nil, nil, err
	}
	var found []pickup
	for _, l := range labels {
		if open, tag, note, ok := ParsePickupLabel(l.Text); ok {
			found = append(found, pickup{label: l, open: open, tag: tag, note: note})
		}
	}
	sort.SliceStable(found, func(i, j int) bool { return found[i].label.Start < found[j].label.Start })
	return found, labels, nil
}

func (p *Pickups) async(runID string, work func(ctx context.Context) error) error {
	if runID == "" {
		return errors.New("a pickup request needs a run id")
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), pickupTimeout)
		defer cancel()
		if err := work(ctx); err != nil {
			p.emit("ERROR", runID, errorSentence(err))
		}
	}()
	return nil
}

func f6(v float64) string { return strconv.FormatFloat(v, 'f', 6, 64) }

// ImportPickups adds a label for each `start|tag|note` row of the payload that is not there yet (open or done, within 0.15 s, same
// body), in the order given, so importing the same list twice adds nothing the second time. A row with no usable start or note is
// counted as invalid and skipped.
func (p *Pickups) ImportPickups(runID, payloadPath string) error {
	return p.async(runID, func(ctx context.Context) error {
		rows, invalid, err := readPickupPayload(payloadPath)
		if err != nil {
			return err
		}
		known, labels, err := p.read(ctx)
		if err != nil {
			return err
		}
		added, existing := 0, 0
		for _, row := range rows {
			text, err := PickupLabelText(true, row.tag, row.note)
			if err != nil {
				invalid++
				continue
			}
			_, wantTag, wantNote, _ := ParsePickupLabel(text)
			dup := false
			for _, k := range known {
				if math.Abs(k.label.Start-row.start) <= pickupTolerance && k.tag == wantTag && k.note == wantNote {
					dup = true
					break
				}
			}
			if dup {
				existing++
				continue
			}
			if err := p.session.addLabel(ctx, labels, row.start, row.start, text); err != nil {
				return fmt.Errorf("pickup at %s: %w", f6(row.start), err)
			}
			known = append(known, pickup{label: audacitybridge.LabelInfo{Start: row.start, End: row.start}, open: true, tag: wantTag, note: wantNote})
			added++
			if labels, err = p.session.client.Labels(ctx); err != nil {
				return err
			}
		}
		p.emit("PICKUPS_IMPORTED", runID, strconv.Itoa(added), strconv.Itoa(existing), strconv.Itoa(invalid))
		return nil
	})
}

type pickupRow struct {
	start float64
	tag   string
	note  string
}

// readPickupPayload reads `start|tag|note` rows (the note is last so it may hold pipes).
func readPickupPayload(path string) (rows []pickupRow, invalid int, err error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, 0, errors.New("The pickup list was not found.") //nolint:staticcheck // a sentence the narrator reads
	}
	defer func() { _ = file.Close() }()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 4<<20)
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if line == "" {
			continue
		}
		fields := strings.SplitN(line, "|", 3)
		start, perr := strconv.ParseFloat(fields[0], 64)
		if len(fields) < 3 || perr != nil || math.IsNaN(start) || math.IsInf(start, 0) || start < 0 || oneLine(fields[2]) == "" {
			invalid++
			continue
		}
		rows = append(rows, pickupRow{start: start, tag: fields[1], note: fields[2]})
	}
	return rows, invalid, scanner.Err()
}

// ExportPickups writes every open pickup as `start|tag|note` to outputPath, in the shape ImportPickups reads, and answers
// PICKUPS_EXPORTED. Resolved pickups are left out: this is the remaining list. It changes nothing in the project.
func (p *Pickups) ExportPickups(runID, outputPath string) error {
	return p.async(runID, func(ctx context.Context) error {
		found, _, err := p.read(ctx)
		if err != nil {
			return err
		}
		var out strings.Builder
		count := 0
		for _, k := range found {
			if k.open {
				out.WriteString(f6(k.label.Start) + "|" + k.tag + "|" + k.note + "\n")
				count++
			}
		}
		if err := os.WriteFile(outputPath, []byte(out.String()), 0o600); err != nil {
			return errors.New("Could not write the pickup list.") //nolint:staticcheck // a sentence the narrator reads
		}
		p.emit("PICKUPS_EXPORTED", runID, outputPath, strconv.Itoa(count))
		return nil
	})
}

// NextPickup puts the cursor at the nearest open pickup after the cursor, wrapping to the earliest when the cursor is at or past
// every one, and answers PICKUP_NEXT. The cursor is the start of Audacity's time selection.
func (p *Pickups) NextPickup(runID string) error {
	return p.async(runID, func(ctx context.Context) error {
		found, _, err := p.read(ctx)
		if err != nil {
			return err
		}
		var open []pickup
		for _, k := range found {
			if k.open {
				open = append(open, k)
			}
		}
		if len(open) == 0 {
			return errors.New("No pickups remain.") //nolint:staticcheck // a sentence the narrator reads
		}
		cursor, _, err := p.session.client.Selection(ctx)
		if err != nil {
			return err
		}
		chosen := open[0]
		for _, k := range open {
			if k.label.Start > cursor {
				chosen = k
				break
			}
		}
		if err := p.session.client.SelectTime(ctx, chosen.label.Start, chosen.label.Start); err != nil {
			return err
		}
		p.emit("PICKUP_NEXT", runID, f6(chosen.label.Start), chosen.tag, chosen.note)
		return nil
	})
}

// ResolvePickup marks the open pickup nearest position as done, keeping its body.
func (p *Pickups) ResolvePickup(runID string, position float64) error {
	return p.rename(runID, position, true, "PICKUP_RESOLVED", "No open pickup was found at that position.")
}

// ReopenPickup puts the resolved pickup nearest position back to open, keeping its body.
func (p *Pickups) ReopenPickup(runID string, position float64) error {
	return p.rename(runID, position, false, "PICKUP_REOPENED", "No resolved pickup was found at that position.")
}

// rename rewrites the prefix of the pickup nearest position that is in the state `from` (resolving takes an open one, reopening a
// done one). A pickup already in the target state is no match, so repeating the request finds nothing and changes nothing.
func (p *Pickups) rename(runID string, position float64, resolving bool, event, notFound string) error {
	if math.IsNaN(position) || math.IsInf(position, 0) || position < 0 {
		return fmt.Errorf("%w: a pickup position of %v", audacitybridge.ErrInvalidValue, position)
	}
	return p.async(runID, func(ctx context.Context) error {
		found, _, err := p.read(ctx)
		if err != nil {
			return err
		}
		var best *pickup
		for i := range found {
			k := &found[i]
			if k.open != resolving {
				continue
			}
			if gap := math.Abs(k.label.Start - position); gap <= pickupTolerance && (best == nil || gap < math.Abs(best.label.Start-position)) {
				best = k
			}
		}
		if best == nil {
			return errors.New(notFound)
		}
		text, err := PickupLabelText(!resolving, best.tag, best.note)
		if err != nil {
			return err
		}
		if err := p.session.client.SetLabel(ctx, best.label.Index, audacitybridge.LabelEdit{Text: &text}); err != nil {
			return err
		}
		p.emit(event, runID, f6(best.label.Start), best.tag, best.note)
		return nil
	})
}

// ListPickupMarkers writes every pickup, open or done, as `start|state|tag|note` in time order to outputPath and answers
// PICKUP_MARKERS_LISTED. It changes nothing in the project.
func (p *Pickups) ListPickupMarkers(runID, outputPath string) error {
	return p.async(runID, func(ctx context.Context) error {
		found, _, err := p.read(ctx)
		if err != nil {
			return err
		}
		var out strings.Builder
		open, done := 0, 0
		for _, k := range found {
			state := "done"
			if k.open {
				state = "open"
				open++
			} else {
				done++
			}
			out.WriteString(f6(k.label.Start) + "|" + state + "|" + k.tag + "|" + k.note + "\n")
		}
		if err := os.WriteFile(outputPath, []byte(out.String()), 0o600); err != nil {
			return errors.New("Could not write the pickup list.") //nolint:staticcheck // a sentence the narrator reads
		}
		p.emit("PICKUP_MARKERS_LISTED", runID, outputPath, strconv.Itoa(open), strconv.Itoa(done))
		return nil
	})
}

// CountPickups answers PICKUPS_COUNTED with how many pickups are open and how many there are.
func (p *Pickups) CountPickups(runID string) error {
	return p.async(runID, func(ctx context.Context) error {
		found, _, err := p.read(ctx)
		if err != nil {
			return err
		}
		open := 0
		for _, k := range found {
			if k.open {
				open++
			}
		}
		p.emit("PICKUPS_COUNTED", runID, strconv.Itoa(open), strconv.Itoa(len(found)))
		return nil
	})
}
