package bridge

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// tracks_read is on the list: a live list that comes after the usual wait is the live list, not a fall back to the saved project.
func TestReadTracksAnsweredAfterTheUsualWaitIsTheLiveList(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			time.Sleep(300 * time.Millisecond)
			return [][]string{
				{"TRACKS_READ", run(command), "C:/p/Alice.rpp", "0", "1"},
				{"TRACKS_ROW", run(command), "0", createdTrack, "Alice", "0"},
				{"TRACKS_READ_END", run(command), "1", "1"},
			}
		})
		actions.SetTimeout(50 * time.Millisecond)
		actions.SetLateWait(5 * time.Second)
		got, err := actions.ReadTracks(context.Background())
		if err != nil || len(got.Tracks) != 1 {
			t.Fatalf("got %+v, err %v", got, err)
		}
	})
}

// #3645: REAPER read track_create and answered after the usual wait. The answer is the answer: the track was made, so the host gets it
// and does not report "not answering" for a change that landed.
func TestCreateTrackAnsweredAfterTheUsualWaitIsStillAnswered(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			time.Sleep(300 * time.Millisecond)
			return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3]}}
		})
		actions.SetTimeout(50 * time.Millisecond)
		actions.SetLateWait(5 * time.Second)
		got, err := actions.CreateChildTrack(context.Background(), "Alice", createdTrack)
		if err != nil {
			t.Fatalf("a create answered late failed: %v", err)
		}
		if got.GUID != createdTrack || got.Name != "Alice" {
			t.Fatalf("got %+v", got)
		}
	})
}

// The same class: arming a lane (arm_only, arm_lane) answered late is armed, not "did not confirm".
func TestArmAnsweredAfterTheUsualWaitIsStillAnswered(t *testing.T) {
	for _, command := range []string{"arm_only", "arm_lane"} {
		t.Run(command, func(t *testing.T) {
			onVirtualClock(t, func(t *testing.T) {
				actions, client, dir := newActionsSession(t, true)
				startFakeReaper(t, client, dir, func(cmd []string) [][]string {
					time.Sleep(300 * time.Millisecond)
					return [][]string{{"ARMED", run(cmd), testTrack, "1", "1"}}
				})
				actions.SetTimeout(50 * time.Millisecond)
				actions.SetLateWait(5 * time.Second)
				var err error
				if command == "arm_only" {
					_, err = actions.ArmOnly(context.Background(), testTrack)
				} else {
					_, err = actions.ArmLane(context.Background(), testTrack, false)
				}
				if err != nil {
					t.Fatalf("%s answered late failed: %v", command, err)
				}
			})
		})
	}
}

// A command REAPER read and never answers is ErrAnswerLate (an ErrNoAnswer), so the caller reads back instead of sending it again.
func TestCreateTrackReadButNeverAnsweredIsErrAnswerLate(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
		actions.SetTimeout(50 * time.Millisecond)
		actions.SetLateWait(100 * time.Millisecond)
		_, err := actions.CreateTrack(context.Background(), "Alice")
		if !errors.Is(err, ErrAnswerLate) || !errors.Is(err, ErrNoAnswer) {
			t.Fatalf("err = %v, want ErrAnswerLate (and ErrNoAnswer)", err)
		}
	})
}

// A command REAPER never read is taken back and fails at the usual wait, however long the late wait is: a REAPER that is closed is not waited on.
func TestCreateTrackNeverReadIsTakenBackAtTheUsualWait(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		actions, client, dir := newActionsSession(t, true)
		fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
		fake.stall(2 * time.Second)
		actions.SetTimeout(50 * time.Millisecond)
		actions.SetLateWait(10 * time.Second)
		started := time.Now()
		_, err := actions.CreateTrack(context.Background(), "Alice")
		if !errors.Is(err, ErrNoAnswer) || errors.Is(err, ErrAnswerLate) {
			t.Fatalf("err = %v, want plain ErrNoAnswer", err)
		}
		if time.Since(started) > time.Second {
			t.Fatalf("waited %v for a command REAPER never read", time.Since(started))
		}
	})
}

// A read keeps the usual wait: a track state read REAPER read and did not answer is plain ErrNoAnswer.
func TestAReadKeepsTheUsualWait(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
		actions.SetTimeout(50 * time.Millisecond)
		actions.SetLateWait(10 * time.Second)
		started := time.Now()
		if _, err := actions.ChapterTrackState(context.Background(), testTrack); !errors.Is(err, ErrNoAnswer) || errors.Is(err, ErrAnswerLate) {
			t.Fatalf("err = %v, want plain ErrNoAnswer", err)
		}
		if time.Since(started) > time.Second {
			t.Fatalf("a read waited %v", time.Since(started))
		}
	})
}

// Switching the voice during a take is the same class (switch_voice): answered late is switched, not "did not answer".
func TestSwitchVoiceAnsweredAfterTheUsualWaitIsStillAnswered(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			time.Sleep(300 * time.Millisecond)
			return [][]string{{"VOICE_SWITCHED", run(command), testTrack, "12.5"}}
		})
		actions.SetTimeout(50 * time.Millisecond)
		actions.SetLateWait(5 * time.Second)
		got, err := actions.SwitchVoice(context.Background(), testTrack)
		if err != nil {
			t.Fatalf("a switch answered late failed: %v", err)
		}
		if got.TrackGUID != testTrack && got.TrackGUID != "" {
			t.Fatalf("got %+v", got)
		}
	})
}

// A caller's deadline that ends after REAPER read the command is late too, not a plain deadline: the caller reads back instead of retrying.
func TestACreateREAPERReadWhoseCallerDeadlineEndsIsErrAnswerLate(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
		actions.SetTimeout(10 * time.Second)
		ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
		defer cancel()
		_, err := actions.CreateTrack(ctx, "Alice")
		if !errors.Is(err, ErrAnswerLate) || !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("err = %v, want ErrAnswerLate wrapping the deadline", err)
		}
	})
}

// writeCommands are the commands this package sends by name that change something in REAPER, so each is waited for once REAPER has read
// it (#3752). With keepsShortWait it must name every command the package sends: a new command is put on one list or the other here.
var writeCommands = []string{
	"add_finding_marker", "apply_fx_chain", "apply_fx_range", "chapter_folders", "choose_range_fx", "create_regions", "delete_range",
	"delete_voice_sample_region", "fx_range_bypass", "fx_range_compare", "fx_range_set_param", "go_to", "hide_takes", "import_audio_track",
	"keep_voice_sample", "loop_context", "monitor_level", "monitor_restore", "navigate_item", "play_from", "play_range",
	"preview_file_range", "punch_to", "record_start", "record_stop", "reduce_range_gain", "remove_fx_range", "repair_click",
	"replace_range", "restore_replacement", "reveal_file", "roll", "save_project", "select_track", "set_active_take", "set_cursor",
	"solo_chapter", "solo_restore", "split_take", "stop_file_preview", "stop_fx_compare", "stop_loop", "stop_play", "switch_voice",
	"track_create", "tracks_read", "undo_last",
}

// Every command sent by name is on exactly one list, and the lists decide the wait: a write waits late, a read does not.
func TestEveryCommandSentByNameWaitsLateOrIsANamedRead(t *testing.T) {
	sent := regexp.MustCompile(`request\(ctx, "([a-z_]+)"`)
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	found := map[string]bool{}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		source, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for _, match := range sent.FindAllSubmatch(source, -1) {
			found[string(match[1])] = true
		}
	}
	if len(found) < 40 {
		t.Fatalf("found only %d commands in the package's source: the scan no longer matches how a command is sent", len(found))
	}
	for command := range found {
		write, read := slices.Contains(writeCommands, command), keepsShortWait[command]
		if write == read {
			t.Errorf("%s: on writeCommands %v, on keepsShortWait %v; want exactly one", command, write, read)
		}
	}
	for _, command := range writeCommands {
		if !found[command] {
			t.Errorf("%s is on writeCommands and is no longer sent", command)
		}
		if !waitsLate(command, []string{"apply"}) {
			t.Errorf("%s changes REAPER and does not wait late", command)
		}
	}
	for command := range keepsShortWait {
		if !found[command] {
			t.Errorf("%s is on keepsShortWait and is no longer sent", command)
		}
		if waitsLate(command, []string{"apply"}) {
			t.Errorf("%s is a read and waits late", command)
		}
	}
	// The commands sent through a variable (the two arms, the two stacks) and one this package does not know all wait late.
	for _, command := range []string{"arm_only", "arm_lane", "stack_takes", "unstack_takes", "a_command_added_later"} {
		if !waitsLate(command, nil) {
			t.Errorf("%s does not wait late", command)
		}
	}
}

// The two commands that read with one argument and write with another: only the write waits late.
func TestTheReadOfACommandThatAlsoWritesKeepsTheUsualWait(t *testing.T) {
	for _, c := range []struct {
		command string
		args    []string
		late    bool
	}{
		{"monitor_level", []string{""}, false},
		{"monitor_level", []string{"70"}, true},
		{"chapter_folders", []string{"preview", "", ""}, false},
		{"chapter_folders", []string{"apply", "", ""}, true},
	} {
		if got := waitsLate(c.command, c.args); got != c.late {
			t.Errorf("%s %q waits late = %v, want %v", c.command, c.args, got, c.late)
		}
	}
}

// #3752, the class: a write outside the five commands of #3645 that REAPER read and answered after the usual wait is answered, not "not
// answering" for a stop, a cut, a move or a save that then lands.
func TestAWriteAnsweredAfterTheUsualWaitIsStillAnswered(t *testing.T) {
	for command, c := range map[string]struct {
		answer func(cmd []string) []string
		send   func(ctx context.Context, actions *Actions) error
	}{
		"record_stop": {
			func(cmd []string) []string { return []string{"RECORD_STOPPED", run(cmd), "3", "1", "2"} },
			func(ctx context.Context, actions *Actions) error { _, err := actions.RecordStop(ctx); return err },
		},
		"select_track": {
			func(cmd []string) []string { return []string{"TRACK_SELECTED", run(cmd), testTrack} },
			func(ctx context.Context, actions *Actions) error {
				_, err := actions.SelectTrack(ctx, testTrack)
				return err
			},
		},
		"stop_play": {
			func(cmd []string) []string { return []string{"TRANSPORT_STOPPED", run(cmd), "5.000000"} },
			func(ctx context.Context, actions *Actions) error { _, err := actions.StopPlay(ctx); return err },
		},
		"go_to": {
			func(cmd []string) []string { return []string{"PLACE_SET", run(cmd), cmd[3], "42.5"} },
			func(ctx context.Context, actions *Actions) error {
				_, err := actions.GoTo(ctx, testTrack, PlaceTarget{End: true})
				return err
			},
		},
	} {
		t.Run(command, func(t *testing.T) {
			onVirtualClock(t, func(t *testing.T) {
				actions, client, dir := newActionsSession(t, true)
				fake := startFakeReaper(t, client, dir, func(cmd []string) [][]string {
					time.Sleep(900 * time.Millisecond)
					return [][]string{c.answer(cmd)}
				})
				actions.SetTimeout(500 * time.Millisecond)
				actions.SetLateWait(5 * time.Second)
				if err := c.send(context.Background(), actions); err != nil {
					t.Fatalf("%s answered late: %v", command, err)
				}
				if sent := fake.commands(); len(sent) != 1 || sent[0][1] != command {
					t.Fatalf("REAPER read %v; want one %s", sent, command)
				}
			})
		})
	}
}

// A write REAPER read and never answers is ErrAnswerLate, and one whose caller's deadline ends first is ErrAnswerLate wrapping the
// deadline: either way the caller is told REAPER took it, never that nothing happened.
func TestAWriteReadButNeverAnsweredIsErrAnswerLate(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
		actions.SetTimeout(500 * time.Millisecond)
		actions.SetLateWait(100 * time.Millisecond)
		if _, err := actions.RecordStop(context.Background()); !errors.Is(err, ErrAnswerLate) {
			t.Fatalf("a stop never answered: %v, want ErrAnswerLate", err)
		}
		actions.SetLateWait(10 * time.Second)
		ctx, cancel := context.WithTimeout(context.Background(), 1200*time.Millisecond)
		defer cancel()
		if _, err := actions.RecordStop(ctx); !errors.Is(err, ErrAnswerLate) || !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("a stop whose caller's deadline ended: %v, want ErrAnswerLate wrapping the deadline", err)
		}
	})
}

// A write REAPER never read is taken back at the usual wait, however long the late wait: a closed REAPER is not waited on.
func TestAWriteNeverReadIsTakenBackAtTheUsualWait(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		actions, client, dir := newActionsSession(t, true)
		fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
		fake.stall(2 * time.Second)
		actions.SetTimeout(500 * time.Millisecond)
		actions.SetLateWait(10 * time.Second)
		started := time.Now()
		if _, err := actions.RecordStop(context.Background()); !errors.Is(err, ErrNoAnswer) || errors.Is(err, ErrAnswerLate) {
			t.Fatalf("err = %v, want plain ErrNoAnswer", err)
		}
		if time.Since(started) > 1500*time.Millisecond {
			t.Fatalf("waited %v for a stop REAPER never read", time.Since(started))
		}
		if left := pendingCommands(t, dir); len(left) != 0 {
			t.Fatalf("the stop is still in the session folder: %v", left)
		}
	})
}

// The navigator's moves are the same class: a move REAPER read and answered late is where REAPER went, one never answered is
// ErrAnswerLate, and one whose caller's deadline ended is ErrAnswerLate wrapping the deadline.
func TestANavigationREAPERReadIsWaitedFor(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		navigator, client, dir := newNavigatorSession(t)
		var silent atomic.Bool
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			if silent.Load() {
				return nil
			}
			time.Sleep(900 * time.Millisecond)
			return [][]string{{"NAVIGATED", run(command), testItem, "1.000000"}}
		})
		navigator.SetTimeout(500 * time.Millisecond)
		navigator.SetLateWait(5 * time.Second)
		got, err := navigator.Navigate(context.Background(), Target{ItemGUID: testItem})
		if err != nil || got.ItemGUID != testItem {
			t.Fatalf("a move answered late: %+v, %v", got, err)
		}
		silent.Store(true)
		navigator.SetLateWait(100 * time.Millisecond)
		if _, err := navigator.Navigate(context.Background(), Target{ItemGUID: testItem}); !errors.Is(err, ErrAnswerLate) {
			t.Fatalf("a move never answered: %v, want ErrAnswerLate", err)
		}
		navigator.SetLateWait(10 * time.Second)
		ctx, cancel := context.WithTimeout(context.Background(), 1200*time.Millisecond)
		defer cancel()
		if _, err := navigator.Navigate(ctx, Target{ItemGUID: testItem}); !errors.Is(err, ErrAnswerLate) || !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("a move whose caller's deadline ended: %v, want ErrAnswerLate wrapping the deadline", err)
		}
	})
}

// A ping is a read: REAPER read it and did not answer, and it is plain ErrNoAnswer at the usual wait.
func TestAPingKeepsTheUsualWait(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		navigator, client, dir := newNavigatorSession(t)
		startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
		navigator.SetTimeout(500 * time.Millisecond)
		started := time.Now()
		if _, err := navigator.Ping(context.Background()); !errors.Is(err, ErrNoAnswer) || errors.Is(err, ErrAnswerLate) {
			t.Fatalf("err = %v, want plain ErrNoAnswer", err)
		}
		if time.Since(started) > 1500*time.Millisecond {
			t.Fatalf("a ping waited %v", time.Since(started))
		}
	})
}

// A gain change is an edit: one REAPER read and answered late is the change, and one never answered is ErrAnswerLate.
func TestAGainChangeREAPERReadIsWaitedFor(t *testing.T) {
	onVirtualClock(t, func(t *testing.T) {
		levels, client, dir := newLevelMatchSession(t)
		var silent atomic.Bool
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			if silent.Load() {
				return nil
			}
			time.Sleep(900 * time.Millisecond)
			return [][]string{{"GAIN_ITEM", run(command), testItem, "1.000000", "2.000000"}, {"GAIN_APPLIED", run(command), "1"}}
		})
		levels.SetTimeout(500 * time.Millisecond)
		levels.SetLateWait(5 * time.Second)
		candidates := []GainCandidate{{ItemGUID: testItem, DeltaDB: -3, FindingID: "f1"}}
		got, err := levels.Apply(context.Background(), candidates)
		if err != nil || len(got.Changed) != 1 {
			t.Fatalf("a gain change answered late: %+v, %v", got, err)
		}
		silent.Store(true)
		levels.SetLateWait(100 * time.Millisecond)
		if _, err := levels.Apply(context.Background(), candidates); !errors.Is(err, ErrAnswerLate) {
			t.Fatalf("a gain change never answered: %v, want ErrAnswerLate", err)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 1200*time.Millisecond)
		defer cancel()
		levels.SetLateWait(10 * time.Second)
		if _, err := levels.Apply(ctx, candidates); !errors.Is(err, ErrAnswerLate) || !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("a gain change whose caller's deadline ended: %v, want ErrAnswerLate wrapping the deadline", err)
		}
	})
}
