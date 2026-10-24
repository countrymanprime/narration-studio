package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// dawMetersTimeout bounds one daw_meters read. The Booth reads several a second while its Levels menu is open, so a read that
// takes longer is dropped and the next one asks again.
const dawMetersTimeout = 1500 * time.Millisecond

const (
	dawMetersNoAnswerSentence = "%s did not answer the level read in time. The levels show again when it does."
	dawMetersOutdatedSentence = "The app's script in %s is older than this app and cannot read its meters. Import the script again from this app's %s folder."
	dawMetersNotReadSentence  = "%s could not read its meters: %s."
)

// DawMetersResult is DawMeters' answer. OK is false with the sentence in Message (and the resolver's reason in Reason when it
// refused) when the DAW was not asked or did not answer. OK is true with the output level and, when a track is record-armed, the
// input level and that track's name; Input is null with no armed track. Levels are dBFS, -100 for silence.
type DawMetersResult struct {
	OK         bool     `json:"ok"`
	Output     float64  `json:"output"`
	Input      *float64 `json:"input"`
	InputTrack string   `json:"inputTrack"`
	Message    string   `json:"message"`
	Reason     string   `json:"reason"`
}

// DawMeters reads what the DAW's own meters show: the level it plays out at and the level the record-armed track hears. It
// changes nothing and arms nothing. The daw_meters capability's own sentence comes first when the resolver refuses it; no live
// adapter, the DAW not answering and no answer in time are refused in a sentence.
func (h *Host) DawMeters() (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), dawMetersTimeout)
	defer cancel()
	return encodeBinding(dawMetersIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapDawMeters), svc.meterReader), nil)
}

// dawMetersIn is DawMeters with the launch's daw_meters support and the engine's role (nil with no live adapter) given. name is the
// engine's name for the sentences.
func dawMetersIn(ctx context.Context, name string, support dawport.Support, reader dawport.MeterReader) DawMetersResult {
	if !support.Available {
		return DawMetersResult{Message: support.Message, Reason: string(support.Reason)}
	}
	if reader == nil {
		return DawMetersResult{Message: readAloudConnectionRefusal(name, reaperStandalone).Message}
	}
	meters, err := reader.DawMeters(ctx)
	if err != nil {
		return DawMetersResult{Message: dawMetersRefusal(name, err)}
	}
	result := DawMetersResult{OK: true, Output: meters.OutputDB}
	if meters.Armed {
		input := meters.InputDB
		result.Input, result.InputTrack = &input, meters.InputTrack
	}
	return result
}

// dawMetersRefusal words an error the role returned: a capability refusal, the bridge not answering, the script's own sentence,
// or no answer in time.
func dawMetersRefusal(name string, err error) string {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused.Message
	}
	var refusal *bridge.RefusalError
	switch {
	case errors.As(err, &refusal):
		return refusal.Sentence
	case errors.Is(err, bridge.ErrNoAnswer):
		return readAloudConnectionRefusal(name, reaperNotRunning).Message
	case errors.Is(err, bridge.ErrUnavailable):
		return readAloudConnectionRefusal(name, reaperStandalone).Message
	case errors.Is(err, bridge.ErrScriptOutdated):
		return fmt.Sprintf(dawMetersOutdatedSentence, name, name)
	case errors.Is(err, context.DeadlineExceeded):
		return fmt.Sprintf(dawMetersNoAnswerSentence, name)
	}
	return fmt.Sprintf(dawMetersNotReadSentence, name, err.Error())
}
