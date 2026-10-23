package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// monitorLevelTimeout bounds one monitor_level request: a read or a set of one send's volume.
const monitorLevelTimeout = 3 * time.Second

const (
	monitorLevelNoAnswerSentence  = "%s did not answer the monitor level within %d seconds. Check the level before trying again."
	monitorLevelOutdatedSentence  = "The app's script in %s is older than this app and cannot set the monitor level. Import the script again from this app's %s folder."
	monitorLevelNotDoneSentence   = "%s could not set the monitor level: %s."
	monitorLevelNotReadSentence   = "%s could not read the monitor level: %s."
	monitorLevelNoSuchLevelFormat = "the monitor level is 0 to %d, not %d"
)

// MonitorLevelResult is DawMonitorLevel's and DawSetMonitorLevel's answer. OK is false with the sentence in Message and Level 0
// when the DAW was not asked or did not do it; OK is true with the level the DAW holds (0 to 100) and an empty Message.
type MonitorLevelResult struct {
	OK      bool   `json:"ok"`
	Level   int    `json:"level"`
	Message string `json:"message"`
}

// DawMonitorLevel reads the level the narrator monitors the project at, a whole number from 0 to 100 (the Booth's output slider).
// The answer is a MonitorLevelResult: the monitor_level capability's own sentence when the resolver refuses it, checked first; no live
// adapter, the DAW not answering and no answer in time are refused in a sentence. It changes nothing.
func (h *Host) DawMonitorLevel() (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), monitorLevelTimeout)
	defer cancel()
	return encodeBinding(dawMonitorLevelIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapMonitorLevel), svc.monitorLeveler, nil), nil)
}

// DawSetMonitorLevel sets the level the narrator monitors the project at to level, a whole number from 0 to 100, and answers the
// level the DAW holds afterwards (it can differ from level only by rounding). A level outside 0 to 100 is an error and nothing is
// sent; every other refusal is as DawMonitorLevel's, with the DAW untouched. In REAPER the level is the master track's first
// hardware output volume, so the delivery files are not changed.
func (h *Host) DawSetMonitorLevel(level int) (string, error) {
	if level < 0 || level > dawport.MaxLevel {
		return encodeBinding(MonitorLevelResult{}, fmt.Errorf(monitorLevelNoSuchLevelFormat, dawport.MaxLevel, level))
	}
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), monitorLevelTimeout)
	defer cancel()
	return encodeBinding(dawMonitorLevelIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapMonitorLevel), svc.monitorLeveler, &level), nil)
}

// dawMonitorLevelIn is the two bindings with the launch's monitor_level support and the engine's role (nil with no live adapter)
// given. set is nil to read. name is the engine's name for the sentences.
func dawMonitorLevelIn(ctx context.Context, name string, support dawport.Support, leveler dawport.MonitorLeveler, set *int) MonitorLevelResult {
	if !support.Available {
		return monitorLevelRefused(support.Message)
	}
	if leveler == nil {
		return monitorLevelRefused(readAloudConnectionRefusal(name, reaperStandalone).Message)
	}
	var (
		level int
		err   error
	)
	if set == nil {
		level, err = leveler.MonitorLevel(ctx)
	} else {
		level, err = leveler.SetMonitorLevel(ctx, *set)
	}
	if err != nil {
		return monitorLevelRefused(monitorLevelRefusal(name, set != nil, err))
	}
	if level < 0 || level > dawport.MaxLevel {
		return monitorLevelRefused(fmt.Sprintf(monitorLevelNotReadSentence, name, "it answered a level outside 0 to 100"))
	}
	return MonitorLevelResult{OK: true, Level: level}
}

func monitorLevelRefused(message string) MonitorLevelResult {
	return MonitorLevelResult{Message: message}
}

// monitorLevelRefusal words an error the role returned rather than answered: a capability refusal, the bridge not answering, the
// script's own sentence, or no answer in time.
func monitorLevelRefusal(name string, setting bool, err error) string {
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
		return fmt.Sprintf(monitorLevelOutdatedSentence, name, name)
	case errors.Is(err, bridge.ErrExperimentalOff):
		return err.Error()
	case errors.Is(err, context.DeadlineExceeded):
		return fmt.Sprintf(monitorLevelNoAnswerSentence, name, int(monitorLevelTimeout.Seconds()))
	case setting:
		return fmt.Sprintf(monitorLevelNotDoneSentence, name, err.Error())
	}
	return fmt.Sprintf(monitorLevelNotReadSentence, name, err.Error())
}
