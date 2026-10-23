package main

import (
	"context"
	"fmt"
	"math"
	"strings"

	"desktop/internal/dawport"
	"desktop/internal/dawport/builtin"
)

// The Booth's Record when the project records with the built-in recorder. It is the same pair of bindings
// the Booth uses with a DAW, ReadAloudRecordStart and ReadAloudRecordStop (bindings_readaloud_record.go), so the page
// asks one question whatever records: the engine is the host's own choice (Recording.engine), never a label from the page
// (threat-model row 6f), and the start goes through the DAW port's Record role over internal/recording, so the capability
// report's refusals (Experimental switched off, a toggle) are the ones the Booth already shows before the press.
//
// The recorder is part of the app, so none of REAPER's preconditions apply: no bridge, no linked track, no armed track. The
// chapter id the page sends is not used: a take is a file in the project's Recordings folder, and which line it belongs to is
// assigned afterwards (RecorderSetTakeLine). Nothing here reads a path from the page.

const (
	// readAloudNoMicrophone is the refusal of a start with no microphone to record on.
	readAloudNoMicrophone = "no_microphone"
	// readAloudChooseMicrophone is the refusal of a start when several microphones are listed and none is chosen.
	readAloudChooseMicrophone = "choose_microphone"
	// readAloudNotRecording is the refusal of a stop when no take is recording.
	readAloudNotRecording = "not_recording"

	teleprompterSettingsTool = "Teleprompter"
	// inputDeviceKey is the global Teleprompter.input_device row: the microphone the Booth's Levels menu shows and saves.
	inputDeviceKey = "input_device"
)

// recordsInApp is whether the Booth's Record goes to the built-in recorder: the project's engine is the built-in recorder and
// it has a recorder to ask (a project is open).
func (h *Host) recordsInApp(svc hostServices) bool {
	return svc.recorder != nil && h.recordingEngine(svc) == engineBuiltin
}

// builtinTransportPayload is daw_transport_changed's payload for the built-in recorder: recording while a take records. It sends
// no position (the recorder keeps no project timeline), so the payload changes only when a take starts or ends.
func builtinTransportPayload(recording bool) map[string]any {
	return map[string]any{"playing": false, "recording": recording}
}

// builtinResolver is the DAW port's resolver over the built-in recorder's live adapter, with the narrator's capability toggles
// and the Experimental switch from svc's settings, as dawResolverOver builds it for a declaration.
func builtinResolver(svc hostServices, adapter dawport.Adapter) *dawport.Resolver {
	store := svc.settings
	return dawport.NewResolver(dawport.ResolverConfig{
		Adapter:      adapter,
		Runtime:      adapter.(interface{ Runtime() dawport.Runtime }).Runtime,
		Toggle:       dawport.SettingsToggles(store.Effective),
		Experimental: dawport.SettingsExperimental(store.Effective),
	})
}

// builtinMicrophone is the microphone a take records on, or the refusal that says what to do: the one the Booth's Levels menu
// chose, else the one the project last recorded with, else the only one listed. Several listed and none chosen is a refusal,
// never a guess.
func (h *Host) builtinMicrophone(ctx context.Context, svc hostServices) (string, *ReadAloudRecording) {
	if device, _ := svc.settings.Effective(teleprompterSettingsTool, inputDeviceKey, ""); strings.TrimSpace(device) != "" {
		return strings.TrimSpace(device), nil
	}
	if device := strings.TrimSpace(svc.settings.Project(recordingSettingsTool)[recordingDeviceKey]); device != "" {
		return device, nil
	}
	devices, message, err := svc.recorder.Devices(ctx)
	switch {
	case err != nil:
		refused := readAloudRefused(refusedFailed, "The built-in recorder could not list the microphones: "+err.Error())
		return "", &refused
	case len(devices) == 1:
		return devices[0].Name, nil
	case len(devices) == 0:
		if message == "" {
			message = "No microphone found. Plug one in, then press Record again."
		}
		refused := readAloudRefused(readAloudNoMicrophone, message)
		return "", &refused
	}
	refused := readAloudRefused(readAloudChooseMicrophone, "Choose the microphone in Levels, then press Record.")
	return "", &refused
}

// builtinRecordStart starts a take through the Record role. The capability's own refusal comes first, so a take that Settings has
// switched off never opens the device.
func (h *Host) builtinRecordStart(ctx context.Context, svc hostServices) ReadAloudRecording {
	var device string
	adapter := builtin.New(builtin.Config{Recorder: svc.recorder, Device: func() string { return device }})
	resolver := builtinResolver(svc, adapter)
	if support := resolver.Support(dawport.CapRecord); !support.Available {
		return readAloudRefused(string(support.Reason), support.Message)
	}
	recorder, err := dawport.Role[dawport.Recorder](resolver, dawport.CapRecord)
	if err != nil {
		return readAloudRefused(refusedFailed, err.Error())
	}
	chosen, refused := h.builtinMicrophone(ctx, svc)
	if refused != nil {
		return *refused
	}
	device = chosen
	if _, err := recorder.RecordStart(ctx, "", dawport.RecordOptions{}); err != nil {
		return readAloudRefused(refusedFailed, upperFirst(err.Error()))
	}
	// The project remembers the microphone it last recorded with, as RecorderStart does.
	if err := svc.settings.Save(recordingSettingsTool, "project", map[string]*string{recordingDeviceKey: &chosen}); err != nil {
		_ = h.log.Report("recording", "could not remember the recorder's device: "+err.Error())
	}
	return ReadAloudRecording{Outcome: "started"}
}

// builtinRecordStop ends the take the recorder is making. It is not gated by the capability report: Experimental switched off
// during a take must not leave the narrator unable to stop it.
func builtinRecordStop(svc hostServices) ReadAloudRecording {
	if !svc.recorder.Recording() {
		return readAloudRefused(readAloudNotRecording, "The built-in recorder is not recording, so nothing was stopped.")
	}
	svc.recorder.Stop()
	return ReadAloudRecording{Outcome: "stopped"}
}

// builtinPunchRefusal answers a start at a punch: the recorder has no roll yet, and the sentence is the capability's own.
func builtinPunchRefusal(svc hostServices, at float64) ReadAloudRecording {
	if math.IsNaN(at) || math.IsInf(at, 0) || at < 0 {
		return readAloudRefused(readAloudBadTime, readAloudBadTimeSentence)
	}
	adapter := builtin.New(builtin.Config{Recorder: svc.recorder})
	support := builtinResolver(svc, adapter).Support(dawport.CapPunch)
	return readAloudRefused(string(support.Reason), support.Message)
}

// upperFirst starts a sentence with a capital, as a refusal is shown.
func upperFirst(sentence string) string {
	if sentence == "" {
		return sentence
	}
	return fmt.Sprintf("%s%s", strings.ToUpper(sentence[:1]), sentence[1:])
}
