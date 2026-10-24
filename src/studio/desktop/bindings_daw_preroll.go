package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// punchPrerollTimeout bounds one punch_preroll request: a read of two REAPER preferences.
const punchPrerollTimeout = 3 * time.Second

const (
	punchPrerollNoAnswerSentence = "%s did not answer about its pre-roll within %d seconds. Open the Levels menu again to read it."
	punchPrerollOutdatedSentence = "The app's script in %s is older than this app and cannot read its pre-roll. Import the script again from this app's %s folder."
	punchPrerollNotReadSentence  = "%s could not read its pre-roll: %s."
)

// PunchPrerollResult is DawPunchPreroll's answer: OK with what the DAW holds (whether it plays the pre-roll before it records, the length
// in measures, one measure in seconds at the edit cursor), or OK false with the sentence in Message.
type PunchPrerollResult struct {
	OK             bool    `json:"ok"`
	OnRecord       bool    `json:"onRecord"`
	Measures       float64 `json:"measures"`
	MeasureSeconds float64 `json:"measureSeconds"`
	Message        string  `json:"message"`
}

// DawPunchPreroll reads the DAW's own pre-roll before a punched take, which the Booth punches with (its Levels menu shows it): the
// punch_preroll capability's sentence when the resolver refuses it, checked first; no live adapter, the DAW not answering and no answer
// in time are refused in a sentence. It changes nothing: the pre-roll is the narrator's to set in the DAW.
func (h *Host) DawPunchPreroll() (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), punchPrerollTimeout)
	defer cancel()
	return encodeBinding(dawPunchPrerollIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapPunchPreroll), svc.prerollReader), nil)
}

// dawPunchPrerollIn is DawPunchPreroll with the launch's punch_preroll support and the engine's role (nil with no live adapter) given.
// name is the engine's name for the sentences.
func dawPunchPrerollIn(ctx context.Context, name string, support dawport.Support, reader dawport.PrerollReader) PunchPrerollResult {
	if !support.Available {
		return PunchPrerollResult{Message: support.Message}
	}
	if reader == nil {
		return PunchPrerollResult{Message: readAloudConnectionRefusal(name, reaperStandalone).Message}
	}
	held, err := reader.PunchPreroll(ctx)
	if err != nil {
		return PunchPrerollResult{Message: punchPrerollRefusal(name, err)}
	}
	if held.MeasureSeconds <= 0 || held.Measures < 0 {
		return PunchPrerollResult{Message: fmt.Sprintf(punchPrerollNotReadSentence, name, "it answered a pre-roll the app cannot use")}
	}
	return PunchPrerollResult{OK: true, OnRecord: held.OnRecord, Measures: held.Measures, MeasureSeconds: held.MeasureSeconds}
}

// punchPrerollRefusal words an error the role returned rather than answered, as monitorLevelRefusal does for the monitor level.
func punchPrerollRefusal(name string, err error) string {
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
		return fmt.Sprintf(punchPrerollOutdatedSentence, name, name)
	case errors.Is(err, bridge.ErrExperimentalOff):
		return err.Error()
	case errors.Is(err, context.DeadlineExceeded):
		return fmt.Sprintf(punchPrerollNoAnswerSentence, name, int(punchPrerollTimeout.Seconds()))
	}
	return fmt.Sprintf(punchPrerollNotReadSentence, name, err.Error())
}
