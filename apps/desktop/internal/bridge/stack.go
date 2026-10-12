package bridge

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Stack the later reads of passages on the first read's spot as takes, and move them back (ADR 0860 point 4;
// stack_takes and unstack_takes in narration_takes.lua). Experimental (actions.go) until the QA pass has run them in a
// real REAPER (#1495).

// MaxStackGroups and MaxStackMoves are the most groups and moves one request holds; the script refuses more
// (narration_takes.lua's MAX_GROUPS and MAX_MOVES), and so does this before anything is written.
const (
	MaxStackGroups = 200
	MaxStackMoves  = 500
)

// maxStackPayloadBytes is the largest payload file the script reads (MAX_PAYLOAD_BYTES).
const maxStackPayloadBytes = 65536

// ErrBadStack is the refusal for a request REAPER would not read: a GUID that is not shaped like one or is named twice,
// a group with no move, a time that is negative or not finite, a length that is not positive, a shift of the wrong sign,
// or more than MaxStackGroups groups or MaxStackMoves moves. Nothing was sent. The script answers it for the same
// reasons.
var ErrBadStack = errors.New("the takes to stack are not valid")

// ErrNothingToStack is the refusal for a request with no group: nothing was sent, or the script found nothing to do.
var ErrNothingToStack = errors.New("nothing to stack")

var stackRefusals = map[string]error{
	"The stacking request is not readable, so nothing changed.": ErrBadStack,
	"The stacking request is too large, so nothing changed.":    ErrBadStack,
	"Nothing to stack.":    ErrNothingToStack,
	"Nothing to un-stack.": ErrNothingToStack,
}

var stackGUID = regexp.MustCompile(`^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$`)

// StackMove is one later read: its take as the app last read it, where it starts now and where it starts afterwards (project
// seconds), and its length. A stack moves it from where it was recorded to the first read's start; an un-stack back.
type StackMove struct {
	TakeGUID string
	From, To float64
	Len      float64
}

// StackGroup is one passage: the first read's item and take, which do not move, and the later reads.
type StackGroup struct {
	ItemGUID     string
	BaseTakeGUID string
	Moves        []StackMove
}

// StackRequest is the passages of one chapter to stack or un-stack. Shift is how far the audio after them moves, summed
// over the groups: negative (earlier) for a stack, positive for an un-stack.
type StackRequest struct {
	Groups []StackGroup
	Shift  float64
}

// TakesStacked is what stack_takes or unstack_takes did: the groups and takes moved, the shift REAPER applied to the
// audio after them, and the undo points the command added (1).
type TakesStacked struct {
	Groups, Takes int
	Shift         float64
	UndoPoints    int
}

// StackTakes makes each group's later reads takes of the first read's item, moves their own items to the muted Cuts
// track and moves the audio after them up by the request's shift, in one undo block. The request goes in a payload file
// written under the session folder, removed once REAPER answers. A request REAPER would not read is ErrBadStack and one
// with no group ErrNothingToStack, both before anything is written. An item or take that changed since the app read it is a
// *StaleError, and nothing changes while REAPER records (ErrRecording); what only the script can check (a read longer
// than the first, on another track, other audio between the reads, a shift the reads do not add up to) is a
// *RefusalError in its words. Any refusal changes nothing.
func (a *Actions) StackTakes(ctx context.Context, request StackRequest) (TakesStacked, error) {
	return a.stack(ctx, "stack_takes", "TAKES_STACKED", request, -1)
}

// UnstackTakes puts each stacked take back where its read was recorded, by the offset the take recorded, and moves the
// audio after it out again, in one undo block. Each move goes from the first read's start to where the read was
// recorded, and the shift is positive. The same refusals as StackTakes.
func (a *Actions) UnstackTakes(ctx context.Context, request StackRequest) (TakesStacked, error) {
	return a.stack(ctx, "unstack_takes", "TAKES_UNSTACKED", request, 1)
}

func (a *Actions) stack(ctx context.Context, command, answer string, request StackRequest, sign float64) (TakesStacked, error) {
	request = normalizedStack(request)
	if err := validStack(request, sign); err != nil {
		return TakesStacked{}, err
	}
	payload := stackPayload(request)
	if len(payload) > maxStackPayloadBytes {
		return TakesStacked{}, fmt.Errorf("%w: %d bytes", ErrBadStack, len(payload))
	}
	if err := a.allowed(command); err != nil {
		return TakesStacked{}, err
	}
	path := filepath.Join(a.client.sessionDir, fmt.Sprintf("stack-%d.txt", time.Now().UnixNano()))
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		return TakesStacked{}, fmt.Errorf("could not write the takes to stack: %w", err)
	}
	defer func() { _ = os.Remove(path) }()
	events, err := a.request(ctx, command, []string{answer, "ITEM_STALE"}, path)
	if err != nil {
		var refusal *RefusalError
		if errors.As(err, &refusal) && stackRefusals[refusal.Sentence] != nil {
			return TakesStacked{}, fmt.Errorf("%w: %s", stackRefusals[refusal.Sentence], refusal.Sentence)
		}
		return TakesStacked{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return TakesStacked{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	return TakesStacked{
		Groups: int(numberAt(event.Fields, 2)), Takes: int(numberAt(event.Fields, 3)),
		Shift: numberAt(event.Fields, 4), UndoPoints: int(numberAt(event.Fields, 5)),
	}, nil
}

// normalizedStack writes every GUID as the script compares it (upper case in braces), on a copy.
func normalizedStack(request StackRequest) StackRequest {
	out := StackRequest{Shift: request.Shift, Groups: make([]StackGroup, len(request.Groups))}
	for i, group := range request.Groups {
		moves := make([]StackMove, len(group.Moves))
		for j, move := range group.Moves {
			move.TakeGUID = normalizeGUID(move.TakeGUID)
			moves[j] = move
		}
		out.Groups[i] = StackGroup{ItemGUID: normalizeGUID(group.ItemGUID), BaseTakeGUID: normalizeGUID(group.BaseTakeGUID), Moves: moves}
	}
	return out
}

// validStack checks a normalized request as the script's read_stack_payload does, so a request it would refuse is never
// written. sign is -1 for a stack and 1 for an un-stack.
func validStack(request StackRequest, sign float64) error {
	if len(request.Groups) == 0 {
		return ErrNothingToStack
	}
	if !finite(request.Shift) || request.Shift*sign < 0 {
		return fmt.Errorf("%w: shift %v", ErrBadStack, request.Shift)
	}
	if len(request.Groups) > MaxStackGroups {
		return fmt.Errorf("%w: %d groups", ErrBadStack, len(request.Groups))
	}
	seen, moves := map[string]bool{}, 0
	named := func(guid string) bool {
		if !stackGUID.MatchString(guid) || seen[guid] {
			return false
		}
		seen[guid] = true
		return true
	}
	for _, group := range request.Groups {
		if !named(group.ItemGUID) || !named(group.BaseTakeGUID) || len(group.Moves) == 0 {
			return fmt.Errorf("%w: group %s", ErrBadStack, group.ItemGUID)
		}
		for _, move := range group.Moves {
			moves++
			if !named(move.TakeGUID) || !finite(move.From) || move.From < 0 || !finite(move.To) || move.To < 0 || !finite(move.Len) || move.Len <= 0 {
				return fmt.Errorf("%w: move %s", ErrBadStack, move.TakeGUID)
			}
		}
	}
	if moves > MaxStackMoves {
		return fmt.Errorf("%w: %d moves", ErrBadStack, moves)
	}
	return nil
}

// stackPayload is the file the script reads: `shift|seconds`, then per group `group|item|base take` followed by one
// `move|take|from|to|length` per later read (docs/architecture/reaper-bridge.md, "Stacking takes").
func stackPayload(request StackRequest) string {
	var payload strings.Builder
	fmt.Fprintf(&payload, "shift|%s\n", formatSeconds(request.Shift))
	for _, group := range request.Groups {
		fmt.Fprintf(&payload, "group|%s|%s\n", group.ItemGUID, group.BaseTakeGUID)
		for _, move := range group.Moves {
			fmt.Fprintf(&payload, "move|%s|%s|%s|%s\n", move.TakeGUID, formatSeconds(move.From), formatSeconds(move.To), formatSeconds(move.Len))
		}
	}
	return payload.String()
}
