package main

import (
	"context"
	"go/ast"
	"go/parser"
	"go/token"
	"math"
	"strconv"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/dawporttest"
)

// fakeRecorder stands in for bridge.Actions' Recorder role (its own tests drive a fake REAPER through the file
// protocol, and the Lua harness the command): it records what was asked and answers what the test set.
type fakeRecorder struct {
	armGUID string
	armed   bridge.Armed
	armErr  error

	startGUID string
	startOpts dawport.RecordOptions
	started   bridge.RecordStarted
	startErr  error

	// calls is every command in the order it was sent: "ArmOnly", "RecordStart", "RecordStop".
	calls []string

	stopCalls int
	stopped   bridge.RecordStopped
	stopErr   error

	ended func(bridge.RecordEnded)
}

var _ dawport.Recorder = (*fakeRecorder)(nil)

func (f *fakeRecorder) ArmOnly(_ context.Context, guid string) (bridge.Armed, error) {
	f.calls = append(f.calls, "ArmOnly")
	f.armGUID = guid
	if f.armErr != nil {
		return bridge.Armed{}, f.armErr
	}
	armed := f.armed
	armed.TrackGUID = guid
	return armed, nil
}

func (f *fakeRecorder) RecordStart(_ context.Context, guid string, opts dawport.RecordOptions) (bridge.RecordStarted, error) {
	f.calls = append(f.calls, "RecordStart")
	f.startGUID, f.startOpts = guid, opts
	if f.startErr != nil {
		return bridge.RecordStarted{}, f.startErr
	}
	started := f.started
	started.TrackGUID = guid
	return started, nil
}

func (f *fakeRecorder) RecordStop(context.Context) (bridge.RecordStopped, error) {
	f.calls = append(f.calls, "RecordStop")
	f.stopCalls++
	return f.stopped, f.stopErr
}

func (f *fakeRecorder) OnRecordEnded(handler func(bridge.RecordEnded)) { f.ended = handler }

func TestReadAloudArmOnlyArmsTheChaptersLinkedTrack(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	fake := &fakeRecorder{armed: bridge.Armed{Disarmed: 1, Changed: true}}

	result, err := readAloudArmOnlyIn(context.Background(), host.services(), fake, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if fake.armGUID != readAloudTrack {
		t.Fatalf("armed %q, want the chapter's linked track %q", fake.armGUID, readAloudTrack)
	}
	if result.Outcome != "armed" || result.TrackGUID != readAloudTrack || result.Disarmed == nil || *result.Disarmed != 1 || result.Changed == nil || !*result.Changed {
		t.Fatalf("result = %+v", result)
	}
}

func TestReadAloudArmOnlyRefusesWhileRecording(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	fake := &fakeRecorder{armErr: bridge.ErrAlreadyRecording}

	result, err := readAloudArmOnlyIn(context.Background(), host.services(), fake, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "refused" || result.Reason != "already_recording" {
		t.Fatalf("result = %+v, want a refusal for already recording", result)
	}
}

func TestReadAloudArmOnlyWithNoLinkedTrackIsRefused(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	fake := &fakeRecorder{}

	result, err := readAloudArmOnlyIn(context.Background(), host.services(), fake, ids[1])
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "refused" || result.Reason != readAloudUnlinked || fake.armGUID != "" {
		t.Fatalf("result = %+v, armGUID = %q, want a no_link refusal and nothing sent", result, fake.armGUID)
	}
}

func TestReadAloudArmOnlyWithNoRecorderIsExperimentalOff(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)

	result, err := readAloudArmOnlyIn(context.Background(), host.services(), nil, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "refused" || result.Reason != readAloudExperimentalOff {
		t.Fatalf("result = %+v", result)
	}
}

func TestReadAloudArmOnlyWithAChapterTheManuscriptDoesNotHaveIsAnError(t *testing.T) {
	host, _ := newReadAloudReaperHost(t)
	if _, err := readAloudArmOnlyIn(context.Background(), host.services(), &fakeRecorder{}, "no-such-chapter"); err == nil {
		t.Fatal("answered for a chapter the manuscript does not have")
	}
}

func TestReadAloudArmOnlyIsStandaloneWithoutAReaperSession(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	linkChapter(t, host, ids[0], readAloudTrack)
	// No host.reachability set: newTestHostForChapterMatch's host is standalone (bindings_navigation.go's reaperStatus).

	result, err := readAloudArmOnlyIn(context.Background(), host.services(), &fakeRecorder{}, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "refused" || result.Reason != reaperStandalone {
		t.Fatalf("result = %+v, want a standalone refusal", result)
	}
}

// recordStart runs Record with state as the track state the preconditions read; nil state means no reader.
func recordStart(t *testing.T, host *Host, recorder dawport.Recorder, state *bridge.TrackState, chapterID string) ReadAloudRecording {
	t.Helper()
	var reader trackStateReader
	if state != nil {
		reader = &fakeTrackStates{state: *state}
	}
	result, err := readAloudRecordStartIn(context.Background(), host.services(), recorder, reader, chapterID)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestReadAloudRecordStartArmsThenRecordsFromTheEnd(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	fake := &fakeRecorder{started: bridge.RecordStarted{Position: 12.5}}

	result := recordStart(t, host, fake, &bridge.TrackState{}, ids[0])

	if got := strings.Join(fake.calls, ","); got != "ArmOnly,RecordStart" {
		t.Fatalf("calls = %s, want ArmOnly then RecordStart", got)
	}
	if fake.armGUID != readAloudTrack || fake.startGUID != readAloudTrack || fake.startOpts.Start != bridge.AtEnd {
		t.Fatalf("armed %q, started on %q with %+v; want the chapter's track %q from the end", fake.armGUID, fake.startGUID, fake.startOpts, readAloudTrack)
	}
	if result.Outcome != "started" || result.TrackGUID != readAloudTrack || result.Position == nil || *result.Position != 12.5 {
		t.Fatalf("result = %+v", result)
	}
}

// Other tracks being armed is no longer a refusal: ArmOnly disarms them (the DAW remembers them) and RecordStop puts
// them back (ADR 0232).
func TestReadAloudRecordStartWithOtherTracksArmedArmsOnlyTheChapters(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	fake := &fakeRecorder{armed: bridge.Armed{Disarmed: 3, Changed: true}}

	result := recordStart(t, host, fake, &bridge.TrackState{ArmedCount: 3}, ids[0])

	if result.Outcome != "started" {
		t.Fatalf("result = %+v, want started with other tracks armed", result)
	}
	if fake.stopCalls != 0 {
		t.Fatalf("stopCalls = %d, want 0: a good start restores nothing until Stop", fake.stopCalls)
	}
}

func TestReadAloudRecordStartPreconditionsStillRefuseAndChangeNothing(t *testing.T) {
	for name, tc := range map[string]struct {
		state  bridge.TrackState
		reason string
	}{
		"playing":           {bridge.TrackState{Playing: true}, "playing"},
		"already recording": {bridge.TrackState{Recording: true}, "already_recording"},
	} {
		t.Run(name, func(t *testing.T) {
			host, ids := newReadAloudReaperHost(t)
			fake := &fakeRecorder{}
			result := recordStart(t, host, fake, &tc.state, ids[0])
			if result.Outcome != "refused" || result.Reason != tc.reason || result.Message == "" || len(fake.calls) != 0 {
				t.Fatalf("result = %+v, calls = %v, want a %q refusal with nothing sent", result, fake.calls, tc.reason)
			}
		})
	}
	t.Run("no link", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		fake := &fakeRecorder{}
		if result := recordStart(t, host, fake, &bridge.TrackState{}, ids[1]); result.Reason != readAloudUnlinked || len(fake.calls) != 0 {
			t.Fatalf("result = %+v, calls = %v", result, fake.calls)
		}
	})
	t.Run("several links", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		if _, err := host.ChapterTrackMapConfirm("{00000000-0000-4000-8000-0000000000AA}", ids[0]); err != nil {
			t.Fatal(err)
		}
		fake := &fakeRecorder{}
		if result := recordStart(t, host, fake, &bridge.TrackState{}, ids[0]); result.Reason != readAloudSeveralLinks || len(fake.calls) != 0 {
			t.Fatalf("result = %+v, calls = %v", result, fake.calls)
		}
	})
	t.Run("track missing", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		fake := &fakeRecorder{}
		reader := &fakeTrackStates{err: &bridge.TrackStaleError{GUID: readAloudTrack}}
		result, err := readAloudRecordStartIn(context.Background(), host.services(), fake, reader, ids[0])
		if err != nil || result.Reason != readAloudTrackMissing || len(fake.calls) != 0 {
			t.Fatalf("result = %+v, %v, calls = %v", result, err, fake.calls)
		}
	})
	t.Run("not connected", func(t *testing.T) {
		host, ids := newTestHostForChapterMatch(t)
		linkChapter(t, host, ids[0], readAloudTrack)
		fake := &fakeRecorder{}
		if result := recordStart(t, host, fake, nil, ids[0]); result.Reason != reaperStandalone || len(fake.calls) != 0 {
			t.Fatalf("result = %+v, calls = %v", result, fake.calls)
		}
	})
	t.Run("experimental off", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		if result := recordStart(t, host, nil, nil, ids[0]); result.Outcome != "refused" || result.Reason != readAloudExperimentalOff {
			t.Fatalf("result = %+v", result)
		}
	})
}

func TestReadAloudRecordStartRefusals(t *testing.T) {
	for name, tc := range map[string]struct {
		err    error
		reason string
	}{
		"REAPER is playing":     {bridge.ErrPlaying, "playing"},
		"already recording":     {bridge.ErrAlreadyRecording, "already_recording"},
		"did not start":         {bridge.ErrRecordingDidNotStart, "did_not_start"},
		"a timeout":             {context.DeadlineExceeded, "timeout"},
		"the track is stale":    {&bridge.TrackStaleError{GUID: readAloudTrack}, readAloudTrackMissing},
		"the bridge is offline": {bridge.ErrUnavailable, reaperStandalone},
		"REAPER is not running": {bridge.ErrNoAnswer, reaperNotRunning},
	} {
		t.Run(name, func(t *testing.T) {
			host, ids := newReadAloudReaperHost(t)
			fake := &fakeRecorder{startErr: tc.err}
			result := recordStart(t, host, fake, nil, ids[0])
			if result.Outcome != "refused" || result.Reason != tc.reason {
				t.Fatalf("result = %+v, want reason %q", result, tc.reason)
			}
		})
	}
}

// A start the DAW refuses after the arms changed asks for them back before answering. The Lua record_stop restores
// only while a recording runs, so the in-DAW effect is the owner's check (see the PR's Handoff); this pins the call.
func TestReadAloudRecordStartThatFailsPutsTheArmsBack(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	fake := &fakeRecorder{armed: bridge.Armed{Disarmed: 1, Changed: true}, startErr: bridge.ErrRecordingDidNotStart}

	result := recordStart(t, host, fake, nil, ids[0])

	if result.Reason != "did_not_start" || strings.Join(fake.calls, ",") != "ArmOnly,RecordStart,RecordStop" {
		t.Fatalf("result = %+v, calls = %v", result, fake.calls)
	}
	unchanged := &fakeRecorder{startErr: bridge.ErrRecordingDidNotStart}
	recordStart(t, host, unchanged, nil, ids[0])
	if unchanged.stopCalls != 0 {
		t.Fatalf("stopCalls = %d when ArmOnly changed nothing, want 0", unchanged.stopCalls)
	}
}

// fakeStartPuncher stands in for the Puncher role a start at a punch places the cursor with: it records the time it was
// asked into the recorder's own call list, so a test sees the order of arm, cursor and record.
type fakeStartPuncher struct {
	recorder *fakeRecorder
	at       float64
	preRoll  float64
	err      error
}

func (f *fakeStartPuncher) PunchTo(_ context.Context, wordTime, preRoll float64) (float64, error) {
	f.recorder.calls = append(f.recorder.calls, "PunchTo")
	f.at, f.preRoll = wordTime, preRoll
	return wordTime, f.err
}

func (f *fakeStartPuncher) PlayPosition(context.Context) (dawport.PlayPosition, error) {
	return dawport.PlayPosition{}, nil
}

func (f *fakeStartPuncher) Roll(context.Context, string, float64) (dawport.Result, error) {
	return dawport.Result{}, nil
}

// recordStartAt runs Record at a punch with state as the track state the preconditions read; nil state means no reader.
func recordStartAt(t *testing.T, host *Host, recorder dawport.Recorder, puncher dawport.Puncher, state *bridge.TrackState, chapterID string, at float64) ReadAloudRecording {
	t.Helper()
	var reader trackStateReader
	if state != nil {
		reader = &fakeTrackStates{state: *state}
	}
	result, err := readAloudRecordStartAtIn(context.Background(), host.services(), recorder, puncher, reader, chapterID, at)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestReadAloudRecordStartAtAPunchRecordsFromThere(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	fake := &fakeRecorder{armed: bridge.Armed{Disarmed: 1, Changed: true}, started: bridge.RecordStarted{Position: 30}}
	puncher := &fakeStartPuncher{recorder: fake}

	result := recordStartAt(t, host, fake, puncher, &bridge.TrackState{}, ids[0], 30)

	if got := strings.Join(fake.calls, ","); got != "ArmOnly,PunchTo,RecordStart" {
		t.Fatalf("calls = %s, want ArmOnly, then the cursor placed, then RecordStart", got)
	}
	if puncher.at != 30 || puncher.preRoll != 0 {
		t.Fatalf("cursor placed at %v with pre-roll %v, want 30 with none", puncher.at, puncher.preRoll)
	}
	if fake.armGUID != readAloudTrack || fake.startGUID != readAloudTrack || fake.startOpts.Start != bridge.StartHere {
		t.Fatalf("armed %q, started on %q with %+v; want the chapter's track %q from the cursor", fake.armGUID, fake.startGUID, fake.startOpts, readAloudTrack)
	}
	if result.Outcome != "started" || result.TrackGUID != readAloudTrack || result.Position == nil || *result.Position != 30 || result.Message != readAloudRecordingFrom(30) {
		t.Fatalf("result = %+v", result)
	}
	if fake.stopCalls != 0 {
		t.Fatalf("stopCalls = %d, want 0: a good start restores nothing until Stop", fake.stopCalls)
	}
}

func TestReadAloudRecordStartAtRefusesABadTime(t *testing.T) {
	for name, at := range map[string]float64{
		"negative":          -0.5,
		"not a number":      math.NaN(),
		"positive infinity": math.Inf(1),
		"negative infinity": math.Inf(-1),
	} {
		t.Run(name, func(t *testing.T) {
			host, ids := newReadAloudReaperHost(t)
			fake := &fakeRecorder{}
			reader := &fakeTrackStates{}
			result, err := readAloudRecordStartAtIn(context.Background(), host.services(), fake, &fakeStartPuncher{recorder: fake}, reader, ids[0], at)
			if err != nil {
				t.Fatal(err)
			}
			if result.Outcome != "refused" || result.Reason != readAloudBadTime || result.Message != readAloudBadTimeSentence {
				t.Fatalf("result = %+v, want a bad_time refusal", result)
			}
			if len(fake.calls) != 0 || len(reader.asked) != 0 {
				t.Fatalf("calls = %v, asked = %v: nothing may be read, armed or moved for a bad time", fake.calls, reader.asked)
			}
		})
	}
}

// The arms and the refusals behave as ReadAloudRecordStart's: every precondition refuses with nothing sent, and a
// cursor or record start that fails after the arms changed asks for them back.
func TestReadAloudRecordStartAtRefusesAsRecordStartDoes(t *testing.T) {
	for name, tc := range map[string]struct {
		state  bridge.TrackState
		reason string
	}{
		"playing":           {bridge.TrackState{Playing: true}, "playing"},
		"already recording": {bridge.TrackState{Recording: true}, "already_recording"},
	} {
		t.Run(name, func(t *testing.T) {
			host, ids := newReadAloudReaperHost(t)
			fake := &fakeRecorder{}
			result := recordStartAt(t, host, fake, &fakeStartPuncher{recorder: fake}, &tc.state, ids[0], 30)
			if result.Outcome != "refused" || result.Reason != tc.reason || len(fake.calls) != 0 {
				t.Fatalf("result = %+v, calls = %v, want a %q refusal with nothing sent", result, fake.calls, tc.reason)
			}
		})
	}
	t.Run("no link", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		fake := &fakeRecorder{}
		if result := recordStartAt(t, host, fake, &fakeStartPuncher{recorder: fake}, &bridge.TrackState{}, ids[1], 30); result.Reason != readAloudUnlinked || len(fake.calls) != 0 {
			t.Fatalf("result = %+v, calls = %v", result, fake.calls)
		}
	})
	t.Run("not connected", func(t *testing.T) {
		host, ids := newTestHostForChapterMatch(t)
		linkChapter(t, host, ids[0], readAloudTrack)
		fake := &fakeRecorder{}
		if result := recordStartAt(t, host, fake, &fakeStartPuncher{recorder: fake}, nil, ids[0], 30); result.Reason != reaperStandalone || len(fake.calls) != 0 {
			t.Fatalf("result = %+v, calls = %v", result, fake.calls)
		}
	})
	t.Run("no recorder", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		if result := recordStartAt(t, host, nil, &fakeStartPuncher{recorder: &fakeRecorder{}}, nil, ids[0], 30); result.Reason != readAloudExperimentalOff {
			t.Fatalf("result = %+v", result)
		}
	})
	t.Run("no puncher", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		fake := &fakeRecorder{}
		if result := recordStartAt(t, host, fake, nil, nil, ids[0], 30); result.Reason != readAloudExperimentalOff || len(fake.calls) != 0 {
			t.Fatalf("result = %+v, calls = %v", result, fake.calls)
		}
	})
	t.Run("the cursor cannot move", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		fake := &fakeRecorder{armed: bridge.Armed{Disarmed: 1, Changed: true}}
		result := recordStartAt(t, host, fake, &fakeStartPuncher{recorder: fake, err: bridge.ErrPunchWhileRecording}, nil, ids[0], 30)
		if result.Reason != "already_recording" || strings.Join(fake.calls, ",") != "ArmOnly,PunchTo,RecordStop" {
			t.Fatalf("result = %+v, calls = %v, want the arms put back", result, fake.calls)
		}
	})
	t.Run("the start fails", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		fake := &fakeRecorder{armed: bridge.Armed{Disarmed: 1, Changed: true}, startErr: bridge.ErrRecordingDidNotStart}
		result := recordStartAt(t, host, fake, &fakeStartPuncher{recorder: fake}, nil, ids[0], 30)
		if result.Reason != "did_not_start" || strings.Join(fake.calls, ",") != "ArmOnly,PunchTo,RecordStart,RecordStop" {
			t.Fatalf("result = %+v, calls = %v", result, fake.calls)
		}
	})
	t.Run("an arm the DAW refuses", func(t *testing.T) {
		host, ids := newReadAloudReaperHost(t)
		fake := &fakeRecorder{armErr: &bridge.TrackStaleError{GUID: readAloudTrack}}
		result := recordStartAt(t, host, fake, &fakeStartPuncher{recorder: fake}, nil, ids[0], 30)
		if result.Reason != readAloudTrackMissing || strings.Join(fake.calls, ",") != "ArmOnly" {
			t.Fatalf("result = %+v, calls = %v", result, fake.calls)
		}
	})
}

// The new binding's answers, pinned for the UI's schema: a start at a punch, and the refusals only it has (a bad time,
// the punch role off). Its other refusals are read-aloud-recordings' own.
func TestContractReadAloudRecordStartAt(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	answers := map[string]ReadAloudRecording{}
	started := &fakeRecorder{started: bridge.RecordStarted{Position: 30}}
	answers["started"] = recordStartAt(t, host, started, &fakeStartPuncher{recorder: started}, nil, ids[0], 30)
	answers["bad_time"] = recordStartAt(t, host, &fakeRecorder{}, &fakeStartPuncher{recorder: &fakeRecorder{}}, nil, ids[0], -1)
	answers["no_puncher"] = recordStartAt(t, host, &fakeRecorder{}, nil, nil, ids[0], 30)
	answers["no_link"] = recordStartAt(t, host, &fakeRecorder{}, &fakeStartPuncher{recorder: &fakeRecorder{}}, nil, ids[1], 30)
	contractfile.Check(t, "readaloud-record-start-at", answers)
}

func TestRecordRefusalsNameTheAdapterNotReaper(t *testing.T) {
	err := bridge.ErrAlreadyRecording
	if got := readAloudRecordRefusal("Audacity", err); !strings.Contains(got.Message, "Audacity") || strings.Contains(got.Message, "REAPER") {
		t.Fatalf("message = %q, want it to name Audacity", got.Message)
	}
	if got := readAloudConnectionRefusal("Audacity", reaperStandalone); strings.Contains(got.Message, "REAPER") {
		t.Fatalf("message = %q", got.Message)
	}
	if got := readAloudExperimentalOffRefusal("Audacity"); strings.Contains(got.Message, "REAPER") {
		t.Fatalf("message = %q", got.Message)
	}
	// No string literal in this file spells REAPER outside the adapter-name helper (comments are free to).
	fset := token.NewFileSet()
	file, parseErr := parser.ParseFile(fset, "bindings_readaloud_record.go", nil, 0)
	if parseErr != nil {
		t.Fatal(parseErr)
	}
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Name.Name == "readAloudAdapterName" {
			continue
		}
		ast.Inspect(fn, func(n ast.Node) bool {
			if lit, ok := n.(*ast.BasicLit); ok && lit.Kind == token.STRING {
				if text, _ := strconv.Unquote(lit.Value); strings.Contains(text, "REAPER") {
					t.Errorf("%s: literal %q names REAPER; word it from the adapter's name", fn.Name.Name, text)
				}
			}
			return true
		})
	}
}

func TestReadAloudRecordStartWithNoRecorderIsExperimentalOff(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	result := recordStart(t, host, nil, nil, ids[0])
	if result.Outcome != "refused" || result.Reason != readAloudExperimentalOff {
		t.Fatalf("result = %+v", result)
	}
}

func TestReadAloudRecordStopStopsAndRestoresArms(t *testing.T) {
	fake := &fakeRecorder{stopped: bridge.RecordStopped{Restored: 2, Kept: 1}}
	result, err := readAloudRecordStopIn(context.Background(), "REAPER", fake)
	if err != nil {
		t.Fatal(err)
	}
	if fake.stopCalls != 1 {
		t.Fatalf("stopCalls = %d, want 1", fake.stopCalls)
	}
	if result.Outcome != "stopped" || result.Restored == nil || *result.Restored != 2 || result.Kept == nil || *result.Kept != 1 {
		t.Fatalf("result = %+v", result)
	}
}

func TestReadAloudRecordStopLeavesARecordingItDidNotStartAlone(t *testing.T) {
	fake := &fakeRecorder{stopErr: bridge.ErrNotOurRecording}
	result, err := readAloudRecordStopIn(context.Background(), "REAPER", fake)
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "refused" || result.Reason != "not_our_recording" {
		t.Fatalf("result = %+v", result)
	}
}

func TestReadAloudRecordStopWithNoRecorderIsExperimentalOff(t *testing.T) {
	result, err := readAloudRecordStopIn(context.Background(), "REAPER", nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "refused" || result.Reason != readAloudExperimentalOff {
		t.Fatalf("result = %+v", result)
	}
}

// The bindings answer JSON, and a successful start remembers the chapter so ServiceShutdown (and OnRecordEnded) can
// clear it again; a standalone host (no bridge.Actions) refuses every one.
func TestReadAloudRecordBindingsAnswerJSON(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	for _, raw := range []func() (string, error){
		func() (string, error) { return host.ReadAloudArmOnly(ids[0]) },
		func() (string, error) { return host.ReadAloudRecordStart(ids[0]) },
		func() (string, error) { return host.ReadAloudRecordStartAt(ids[0], 30) },
		func() (string, error) { return host.ReadAloudRecordStop() },
	} {
		out, err := raw()
		if err != nil {
			t.Fatal(err)
		}
		if out == "" {
			t.Fatal("empty binding answer")
		}
	}
}

// stopReadAloudRecordingOnShutdown reads recorderFrom(h.services()) fresh, not the recorder setReadAloudRecording was
// given, so on a test host with no dawPortResolver it finds none and only clears the flag; a resolver wired to a fake
// is exactly TestRecorderFromComesFromTheResolver's own case, not repeated here.
func TestServiceShutdownClearsAReadAloudRecordingItStarted(t *testing.T) {
	host, _ := newReadAloudReaperHost(t)
	host.setReadAloudRecording("chapter-1", &fakeRecorder{})

	host.stopReadAloudRecordingOnShutdown()

	host.mu.RLock()
	chapter := host.readAloudRecordingChapter
	host.mu.RUnlock()
	if chapter != "" {
		t.Fatalf("readAloudRecordingChapter = %q after shutdown, want cleared", chapter)
	}
}

func TestServiceShutdownWithNoRecordingIsANoOp(t *testing.T) {
	host, _ := newReadAloudReaperHost(t)
	host.stopReadAloudRecordingOnShutdown() // must not panic with nothing recording
}

func TestOnRecordEndedClearsTheChapter(t *testing.T) {
	host, _ := newReadAloudReaperHost(t)
	fake := &fakeRecorder{}
	host.setReadAloudRecording("chapter-1", fake)

	fake.ended(bridge.RecordEnded{Restored: 1})

	host.mu.RLock()
	chapter := host.readAloudRecordingChapter
	host.mu.RUnlock()
	if chapter != "" {
		t.Fatalf("readAloudRecordingChapter = %q after OnRecordEnded, want cleared", chapter)
	}
}

// TestRecorderFromComesFromTheResolver pins that the role comes from the resolver (ADR 0300): the Record bindings
// source their recorder through recorderFrom, which asks svc.dawPortResolver for the Record role instead of holding a
// bridge client directly.
func TestRecorderFromComesFromTheResolver(t *testing.T) {
	fake := dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Supported))
	resolver := dawport.NewResolver(dawport.ResolverConfig{
		Adapter: fake,
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
	})

	recorder := recorderFrom(hostServices{dawPortResolver: resolver})
	if recorder == nil {
		t.Fatal("no recorder from a resolver with a live adapter")
	}
	if _, err := recorder.ArmOnly(context.Background(), "guid"); err != nil {
		t.Fatalf("ArmOnly: %v", err)
	}
	if calls := fake.Calls(); len(calls) != 1 || calls[0] != "record.ArmOnly" {
		t.Fatalf("the recorder did not come from the resolver: calls = %v", calls)
	}
}

func TestRecorderFromIsNilWithoutAResolver(t *testing.T) {
	if recorder := recorderFrom(hostServices{}); recorder != nil {
		t.Fatalf("recorder = %v, want nil with no resolver", recorder)
	}
}

// The binding's answers, pinned for the UI's schema (ADR 0069); other_armed and several_armed now start, since Record
// disarms the others (ADR 0791): one arm, record start and record stop per REAPER
// state the mock (`?mockReaper=`) can put a chapter in, plus the stale-track and no-link cases only the host can
// reach. wireContracts.test.ts cross-checks every mock seed but "unavailable" (its own reason, standalone, differs
// from experimental_off's here on purpose - the read-aloud-reaper-states golden the same way).
func TestContractReadAloudRecordings(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	answers := map[string]ReadAloudRecording{}
	record := func(name string, fake *fakeRecorder, chapterID string) {
		t.Helper()
		// A nil *fakeRecorder must reach readAloudArmOnlyIn as a true nil dawport.Recorder, not a typed nil in a non-nil
		// interface (which would pass its `recorder == nil` check and then panic on the fake's nil receiver).
		var recorder dawport.Recorder
		if fake != nil {
			recorder = fake
		}
		armed, err := readAloudArmOnlyIn(context.Background(), host.services(), recorder, chapterID)
		if err != nil {
			t.Fatal(err)
		}
		answers[name+".arm"] = armed
		started, err := readAloudRecordStartIn(context.Background(), host.services(), recorder, nil, chapterID)
		if err != nil {
			t.Fatal(err)
		}
		answers[name+".start"] = started
		stopped, err := readAloudRecordStopIn(context.Background(), "REAPER", recorder)
		if err != nil {
			t.Fatal(err)
		}
		answers[name+".stop"] = stopped
	}
	record("ready", &fakeRecorder{started: bridge.RecordStarted{Position: 0}}, ids[0])
	record("not_armed", &fakeRecorder{startErr: bridge.ErrNoTrackArmed}, ids[0]) // a start the DAW still refuses for this reason
	record("other_armed", &fakeRecorder{armed: bridge.Armed{Disarmed: 1, Changed: true}}, ids[0])
	record("several_armed", &fakeRecorder{armed: bridge.Armed{Disarmed: 3, Changed: true}}, ids[0])
	record("recording_elsewhere", &fakeRecorder{armErr: bridge.ErrAlreadyRecording, startErr: bridge.ErrAlreadyRecording}, ids[0])
	record("track_missing", &fakeRecorder{armErr: &bridge.TrackStaleError{GUID: readAloudTrack}, startErr: &bridge.TrackStaleError{GUID: readAloudTrack}}, ids[0])
	record("experimental_off", nil, ids[0])
	record("no_link", &fakeRecorder{}, ids[1])
	contractfile.Check(t, "read-aloud-recordings", answers)
}
