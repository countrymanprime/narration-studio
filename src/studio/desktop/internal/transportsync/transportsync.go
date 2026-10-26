// Package transportsync is the host's side of the Editing page's transport sync (docs/design/editing-daw-transport-sync.md): what the
// DawTransportSync binding does with the transport_sync role, and the payload of the daw_position_changed event. It holds no state and no bridge
// client; the binding in src/studio/desktop passes it the role, the capability's support and a way to ask whether the DAW has this book's project open.
package transportsync

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// Timeout bounds one call to the DAW: each is a single quick request.
const Timeout = 3 * time.Second

// Lease is the position-stream lease one "watch" asks for. The page renews it every Lease/2, so one missed renewal is tolerated and a closed page
// stops the stream within Lease. The script clamps it to ten seconds.
const Lease = 6 * time.Second

// The actions Do takes.
const (
	ActionCursor = "cursor"
	ActionPlay   = "play"
	ActionStop   = "stop"
	ActionWatch  = "watch"
)

const (
	badTime      = "That place is not a usable number of seconds."
	unknown      = "Unknown transport action."
	notConnected = "%s is not connected to this app. Open this app from its launcher action in %s."
	notAnswering = "%s is not answering. Check that %s is open and the app's launcher action is running, then try again."
	otherProject = "%s does not have this book's project open, so its transport was left alone. Open the project in %s, then try again."
	recording    = "%s is recording. Stop recording first."
	failed       = "%s could not do that: %s."
	noAnswer     = "%s did not answer within %d seconds."
)

// Do runs one action on syncer. support is the transport_sync capability's answer and is checked first, with nothing asked of the DAW when it
// refuses; sameProject says whether the DAW has this book's project open, and a cursor, play or watch is left alone when it does not (a stop is
// never refused for it, so a transport the app started can always be stopped). A refusal is a Result with one sentence in Refused and Message.
func Do(ctx context.Context, name string, support dawport.Support, syncer dawport.TransportSyncer, sameProject func() bool, action string, seconds float64) dawport.Result {
	if !support.Available {
		return dawport.Refused(support.Message)
	}
	switch action {
	case ActionCursor, ActionPlay, ActionStop, ActionWatch:
	default:
		return dawport.Refused(unknown)
	}
	if (action == ActionCursor || action == ActionPlay) && (math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0) {
		return dawport.Refused(badTime)
	}
	if syncer == nil {
		return dawport.Refused(fmt.Sprintf(notConnected, name, name))
	}
	if action != ActionStop && !sameProject() {
		return dawport.Refused(fmt.Sprintf(otherProject, name, name))
	}
	var err error
	switch action {
	case ActionCursor:
		_, err = syncer.SetCursor(ctx, seconds)
	case ActionPlay:
		_, err = syncer.PlayFrom(ctx, seconds)
	case ActionStop:
		_, err = syncer.Stop(ctx)
	case ActionWatch:
		_, err = syncer.Watch(ctx, Lease)
	}
	if err != nil {
		return dawport.Refused(refusal(name, err))
	}
	// Moving a cursor or the transport is not an edit: no undo step, whatever it changed.
	return dawport.OK("", action != ActionWatch).WithUndoSteps(0)
}

// refusal words an error the role returned rather than answered.
func refusal(name string, err error) string {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused.Message
	}
	switch {
	case errors.Is(err, bridge.ErrRecording):
		return fmt.Sprintf(recording, name)
	case errors.Is(err, bridge.ErrNoAnswer):
		return fmt.Sprintf(notAnswering, name, name)
	case errors.Is(err, bridge.ErrUnavailable):
		return fmt.Sprintf(notConnected, name, name)
	case errors.Is(err, context.DeadlineExceeded):
		return fmt.Sprintf(noAnswer, name, int(Timeout.Seconds()))
	}
	return fmt.Sprintf(failed, name, err.Error())
}

// Position is the payload of daw_position_changed: the DAW's play state, play head and edit cursor in project seconds as the last TRANSPORT event
// carried them, and whether the DAW has this book's project open (a position of another project must not move the page).
type Position struct {
	Playing      bool    `json:"playing"`
	Recording    bool    `json:"recording"`
	PlayPosition float64 `json:"playPosition"`
	EditCursor   float64 `json:"editCursor"`
	SameProject  bool    `json:"sameProject"`
}

// Payload is the event payload for a streamed position.
func Payload(position dawport.TransportPosition, sameProject bool) Position {
	return Position{
		Playing:      position.Playing,
		Recording:    position.Recording,
		PlayPosition: position.PlayPosition,
		EditCursor:   position.EditCursor,
		SameProject:  sameProject,
	}
}
