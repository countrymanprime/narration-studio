package main

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/recording"
	"github.com/countrymanprime/narration-utils/shell/internal/recording/recordingtest"
)

// The Booth records without a DAW through ReadAloudRecordStart and ReadAloudRecordStop, the same two bindings it uses for
// REAPER: with the project's engine the built-in recorder they go to the DAW port's Record role over internal/recording
// These tests drive them over a fake engine, so no device is needed; real devices are the owner's pass.

const (
	micOne = "Analogue 1 + 2 (Focusrite USB Audio)"
	micTwo = "Microphone (USB Audio Device)"
)

// boothRecorderHost is a Windows host whose project records with the built-in recorder, with Experimental actions on (they
// start off) and the narrator's microphone chosen unless mic is "".
func boothRecorderHost(t *testing.T, fake *recordingtest.Fake, mic string) *Host {
	t.Helper()
	// The global settings (the microphone, Experimental) live under APPDATA: a test never reads or writes the machine's.
	t.Setenv("APPDATA", t.TempDir())
	host := recorderHost(t, fake)
	recorderOf(t)(host.RecorderChooseEngine(engineBuiltin))
	boothSetting(t, host, "DAW", "global", "experimental_reaper_actions", "true")
	if mic != "" {
		boothSetting(t, host, "Teleprompter", "global", "input_device", mic)
	}
	return host
}

func boothSetting(t *testing.T, host *Host, tool, scope, key, value string) {
	t.Helper()
	if err := host.services().settings.Save(tool, scope, map[string]*string{key: &value}); err != nil {
		t.Fatal(err)
	}
}

func boothRecord(t *testing.T) func(string, error) ReadAloudRecording {
	return func(raw string, err error) ReadAloudRecording {
		t.Helper()
		if err != nil {
			t.Fatalf("binding error = %v", err)
		}
		var result ReadAloudRecording
		if err := json.Unmarshal([]byte(raw), &result); err != nil {
			t.Fatalf("payload %q is not JSON: %v", raw, err)
		}
		return result
	}
}

func TestBuiltinBoothRecordsATakeOnTheChosenMicrophone(t *testing.T) {
	fake := &recordingtest.Fake{DeviceList: []recording.Device{{Name: micOne}, {Name: micTwo}}}
	host := boothRecorderHost(t, fake, micTwo)

	started := boothRecord(t)(host.ReadAloudRecordStart("c-0001"))
	if started.Outcome != "started" {
		t.Fatalf("start = %+v, want started", started)
	}
	if run := fake.Last(); run == nil || run.Kind != "take" || run.Device != micTwo {
		t.Fatalf("run = %+v, want a take on %q", run, micTwo)
	}
	if got := recorderOf(t)(host.RecorderState()).Phase; got != recording.PhaseRecording {
		t.Fatalf("phase = %q, want recording", got)
	}
	if got := host.dawTransport()["recording"]; got != true {
		t.Fatalf("transport recording = %v, want true: the Booth ends a take it cannot hear", got)
	}
	if got := host.dawProjectState(); got.PlayState != "recording" || got.SavedAt != nil {
		t.Fatalf("project state = %+v, want recording with no saved project", got)
	}
	// The payloads the mock follows: a built-in take is recording on the transport, and its project has nothing saved or unsaved.
	contractfile.Check(t, "daw-transport-builtin-recording", decodeTransport(t, host.dawTransport()))
	contractfile.Check(t, "daw-project-state-builtin-recording", host.dawProjectState())

	stopped := boothRecord(t)(host.ReadAloudRecordStop())
	if stopped.Outcome != "stopped" {
		t.Fatalf("stop = %+v, want stopped", stopped)
	}
	state := waitRecorderIdle(t, host)
	if len(state.Takes) != 1 || state.Last == nil || state.Last.Error != nil {
		t.Fatalf("after stop: takes=%d last=%+v, want one clean take", len(state.Takes), state.Last)
	}
	if got := host.dawTransport()["recording"]; got != false {
		t.Fatalf("transport recording = %v after the take ended, want false", got)
	}
}

func TestBuiltinBoothRecordRefusesWhileExperimentalIsOff(t *testing.T) {
	fake := &recordingtest.Fake{DeviceList: []recording.Device{{Name: micOne}}}
	host := boothRecorderHost(t, fake, micOne)
	boothSetting(t, host, "DAW", "global", "experimental_reaper_actions", "false")

	result := boothRecord(t)(host.ReadAloudRecordStart("c-0001"))
	if result.Outcome != "refused" || result.Reason != readAloudExperimentalOff || result.Message != "Experimental: switched off in Settings." {
		t.Fatalf("start = %+v, want the capability's own refusal", result)
	}
	if fake.Last() != nil {
		t.Fatal("a refused start opened the device")
	}
}

func TestBuiltinBoothRecordPicksTheMicrophone(t *testing.T) {
	cases := []struct {
		name    string
		devices []recording.Device
		message string
		saved   string // the Recording.device row: the one the project last recorded with
		chosen  string // the Booth's microphone
		want    string // the device a take opens; "" when refused
		refusal string // a part of the sentence
	}{
		{name: "the chosen microphone wins over the last one", devices: []recording.Device{{Name: micOne}, {Name: micTwo}}, saved: micOne, chosen: micTwo, want: micTwo},
		{name: "the last microphone when none is chosen", devices: []recording.Device{{Name: micOne}, {Name: micTwo}}, saved: micTwo, want: micTwo},
		{name: "the only microphone", devices: []recording.Device{{Name: micOne}}, want: micOne},
		{name: "several and none chosen", devices: []recording.Device{{Name: micOne}, {Name: micTwo}}, refusal: "Choose the microphone in Levels"},
		{name: "none listed", refusal: "No microphone found"},
		{name: "none listed, with the sidecar's reason", message: "PortAudio library not found", refusal: "PortAudio library not found"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fake := &recordingtest.Fake{DeviceList: c.devices, DeviceMessage: c.message}
			host := boothRecorderHost(t, fake, c.chosen)
			if c.saved != "" {
				boothSetting(t, host, "Recording", "project", "device", c.saved)
			}
			result := boothRecord(t)(host.ReadAloudRecordStart("c-0001"))
			if c.want == "" {
				if result.Outcome != "refused" || !strings.Contains(result.Message, c.refusal) || fake.Last() != nil {
					t.Fatalf("start = %+v (run %v), want a refusal containing %q and no device opened", result, fake.Last(), c.refusal)
				}
				return
			}
			if result.Outcome != "started" || fake.Last() == nil || fake.Last().Device != c.want {
				t.Fatalf("start = %+v (run %+v), want a take on %q", result, fake.Last(), c.want)
			}
			boothRecord(t)(host.ReadAloudRecordStop())
			waitRecorderIdle(t, host)
		})
	}
}

func TestBuiltinBoothRecordSaysWhyTheDeviceWillNotOpen(t *testing.T) {
	fake := &recordingtest.Fake{OpenError: errors.New("Windows has blocked this app from the microphone. Allow it in Settings > Privacy > Microphone.")}
	host := boothRecorderHost(t, fake, micOne)
	result := boothRecord(t)(host.ReadAloudRecordStart("c-0001"))
	if result.Outcome != "refused" || !strings.Contains(result.Message, "Privacy > Microphone") {
		t.Fatalf("start = %+v, want the engine's own sentence", result)
	}
	if got := host.dawTransport()["recording"]; got != false {
		t.Fatalf("transport recording = %v after a refused start, want false", got)
	}
	if state := recorderOf(t)(host.RecorderState()); state.Phase != recording.PhaseIdle {
		t.Fatalf("phase = %q after a refused start, want idle", state.Phase)
	}
}

func TestBuiltinBoothRecordRefusesASecondStart(t *testing.T) {
	host := boothRecorderHost(t, &recordingtest.Fake{}, micOne)
	if first := boothRecord(t)(host.ReadAloudRecordStart("c-0001")); first.Outcome != "started" {
		t.Fatalf("first start = %+v", first)
	}
	second := boothRecord(t)(host.ReadAloudRecordStart("c-0001"))
	if second.Outcome != "refused" || !strings.Contains(second.Message, "already recording") {
		t.Fatalf("second start = %+v, want a refusal that a take is already recording", second)
	}
	boothRecord(t)(host.ReadAloudRecordStop())
	waitRecorderIdle(t, host)
}

// Experimental turned off mid-take must not strand the narrator in a take: Stop is never gated.
func TestBuiltinBoothStopWorksWhileExperimentalIsOff(t *testing.T) {
	host := boothRecorderHost(t, &recordingtest.Fake{}, micOne)
	boothRecord(t)(host.ReadAloudRecordStart("c-0001"))
	boothSetting(t, host, "DAW", "global", "experimental_reaper_actions", "false")
	if stopped := boothRecord(t)(host.ReadAloudRecordStop()); stopped.Outcome != "stopped" {
		t.Fatalf("stop = %+v, want stopped", stopped)
	}
	waitRecorderIdle(t, host)
}

func TestBuiltinBoothStopWithNoTakeSaysSo(t *testing.T) {
	host := boothRecorderHost(t, &recordingtest.Fake{}, micOne)
	result := boothRecord(t)(host.ReadAloudRecordStop())
	if result.Outcome != "refused" || !strings.Contains(result.Message, "not recording") {
		t.Fatalf("stop = %+v, want a refusal that nothing is recording", result)
	}
}

func TestBuiltinBoothPunchIsNotAvailableYet(t *testing.T) {
	fake := &recordingtest.Fake{}
	host := boothRecorderHost(t, fake, micOne)
	result := boothRecord(t)(host.ReadAloudRecordStartAt("c-0001", 12))
	if result.Outcome != "refused" || result.Message != "Not available with the built-in recorder yet." || fake.Last() != nil {
		t.Fatalf("punch = %+v (run %v), want the declaration's refusal and nothing recording", result, fake.Last())
	}
}

// A device that stops delivering audio, or a disk that fills, ends the take by itself: the Booth hears the transport fall and the
// recorder's own state says why, with the audio before it kept.
func TestBuiltinBoothTakeEndingByItselfIsHeardAndKept(t *testing.T) {
	fake := &recordingtest.Fake{FailWith: "The microphone was unplugged"}
	host := boothRecorderHost(t, fake, micOne)
	if started := boothRecord(t)(host.ReadAloudRecordStart("c-0001")); started.Outcome != "started" {
		t.Fatalf("start = %+v", started)
	}
	deadline := time.Now().Add(5 * time.Second)
	for host.dawTransport()["recording"] == true && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if host.dawTransport()["recording"] == true {
		t.Fatal("the transport still says recording after the device failed")
	}
	state := waitRecorderIdle(t, host)
	if !strings.Contains(state.Message, "unplugged") || len(state.Takes) != 1 {
		t.Fatalf("state: message=%q takes=%d, want the reason and the audio kept", state.Message, len(state.Takes))
	}
	if got := host.dawProjectState(); got.PlayState != "stopped" {
		t.Fatalf("project state = %+v, want stopped", got)
	}
}

// Switching the project back to a DAW hands the same bindings to REAPER again.
func TestBoothRecordWithADawDoesNotTouchTheBuiltinRecorder(t *testing.T) {
	fake := &recordingtest.Fake{DeviceList: []recording.Device{{Name: micOne}}}
	host := boothRecorderHost(t, fake, micOne)
	recorderOf(t)(host.RecorderChooseEngine(engineDAW))
	result := boothRecord(t)(host.ReadAloudRecordStart("c-0001"))
	if result.Outcome != "refused" || fake.Last() != nil {
		t.Fatalf("start = %+v (run %v), want REAPER's refusal and no built-in take", result, fake.Last())
	}
}

// TestBuiltinBoothRecordingGoldenIsCurrent pins the answers the Booth's Record gets from the built-in recorder
// (ReadAloudRecording, apps/ui's readAloudRecordingSchema): a start, a stop and each refusal. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/read-aloud-recordings-builtin.json.
func TestBuiltinBoothRecordingGoldenIsCurrent(t *testing.T) {
	answers := map[string]ReadAloudRecording{}
	record := boothRecord(t)

	host := boothRecorderHost(t, &recordingtest.Fake{DeviceList: []recording.Device{{Name: micOne}}}, micOne)
	answers["start"] = record(host.ReadAloudRecordStart("c-0001"))
	answers["stop"] = record(host.ReadAloudRecordStop())
	waitRecorderIdle(t, host)
	answers["stop with no take"] = record(host.ReadAloudRecordStop())
	answers["punch"] = record(host.ReadAloudRecordStartAt("c-0001", 12))
	boothSetting(t, host, "DAW", "global", "capability.record", "off")
	answers["record switched off"] = record(host.ReadAloudRecordStart("c-0001"))
	boothSetting(t, host, "DAW", "global", "capability.record", "auto")
	boothSetting(t, host, "DAW", "global", "experimental_reaper_actions", "false")
	answers["experimental off"] = record(host.ReadAloudRecordStart("c-0001"))

	none := boothRecorderHost(t, &recordingtest.Fake{}, "")
	answers["no microphone"] = record(none.ReadAloudRecordStart("c-0001"))
	many := boothRecorderHost(t, &recordingtest.Fake{DeviceList: []recording.Device{{Name: micOne}, {Name: micTwo}}}, "")
	answers["choose a microphone"] = record(many.ReadAloudRecordStart("c-0001"))
	blocked := boothRecorderHost(t, &recordingtest.Fake{OpenError: errors.New("Windows has blocked this app from the microphone.")}, micOne)
	answers["device will not open"] = record(blocked.ReadAloudRecordStart("c-0001"))

	contractfile.Check(t, "read-aloud-recordings-builtin", answers)
}
