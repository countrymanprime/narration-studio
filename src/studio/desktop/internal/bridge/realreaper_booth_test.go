//go:build realreaper

package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"sync"
	"testing"
	"time"
)

// TestBoothSequenceAgainstRealReaper drives the host's own bridge Client and Actions against a REAPER that is already running (the
// real-REAPER CI job, scripts/ci/real-reaper/scenarios_perf_lanes.py, started it and built the project), the way the Booth does: the host's
// 150 ms dispatch tick runs on its own goroutine, each request writes a command file and waits for its answer through Actions.request (its
// fast poll, its 3 s limit), and each action issues the requests the page and the host issue for it (docs/research/reaper-bridge-performance.md,
// "Requests per action"), the page's reads between steps included and concurrent as they are in the app. What it leaves out is the host's
// answer caches (tracks_cache.go) and the UI's own rendering, so a read the app would share is paid for here.
//
// It is built only with the realreaper tag and does nothing without NARRATION_REAL_REAPER_SESSION; nothing in the normal test run reaches it.
// Inputs: NARRATION_REAL_REAPER_SESSION (the session folder), NARRATION_REAL_REAPER_GUIDS (JSON: folder, narrator, veyra), NARRATION_REAL_REAPER_OUT
// (where the JSON result goes), NARRATION_REAL_REAPER_REPS (default 5).
func TestBoothSequenceAgainstRealReaper(t *testing.T) {
	session := os.Getenv("NARRATION_REAL_REAPER_SESSION")
	if session == "" {
		t.Skip("no real REAPER session")
	}
	var guids struct{ Folder, Narrator, Veyra string }
	if err := json.Unmarshal([]byte(os.Getenv("NARRATION_REAL_REAPER_GUIDS")), &guids); err != nil || guids.Folder == "" {
		t.Fatalf("NARRATION_REAL_REAPER_GUIDS: %v", err)
	}
	// Without an audio device (the Windows runner) REAPER cannot record: the press and the stop are left out.
	record := os.Getenv("NARRATION_REAL_REAPER_RECORD") != "0"
	reps := 5
	if _, err := fmt.Sscan(os.Getenv("NARRATION_REAL_REAPER_REPS"), &reps); err != nil || reps < 1 {
		reps = 5
	}

	client, err := New(session)
	if err != nil {
		t.Fatal(err)
	}
	// Start after what REAPER has already written, as the host does when it attaches to a running session's log.
	if info, err := os.Stat(session + "/events.log"); err == nil {
		client.events.eventOffset = info.Size()
	}
	actions := NewActions(client, func(string) error { return nil })
	var mu sync.Mutex
	perCommand := map[string][]float64{}
	failures := map[string]int{}
	actions.SetObserver(func(timing RequestTiming) {
		mu.Lock()
		defer mu.Unlock()
		perCommand[timing.Command] = append(perCommand[timing.Command], float64(timing.Elapsed.Microseconds())/1000)
		if timing.Outcome != "answered" {
			failures[timing.Command+":"+timing.Outcome]++
		}
	})

	stop := make(chan struct{})
	ticked := make(chan struct{})
	go func() {
		defer close(ticked)
		ticker := time.NewTicker(150 * time.Millisecond) // transcriptLoop's tick (app.go)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				_ = client.Dispatch()
			}
		}
	}()
	defer func() { close(stop); <-ticked }()

	ctx := context.Background()
	// concurrently runs the reads the page issues at once and answers the first error.
	concurrently := func(reads ...func() error) error {
		var wg sync.WaitGroup
		errs := make([]error, len(reads))
		for i, read := range reads {
			wg.Add(1)
			go func() {
				defer wg.Done()
				errs[i] = read()
			}()
		}
		wg.Wait()
		for _, err := range errs {
			if err != nil {
				return err
			}
		}
		return nil
	}
	readTracks := func() error { _, err := actions.ReadTracks(ctx); return err }
	readState := func() error { _, err := actions.ChapterTrackStateNoItems(ctx, guids.Folder); return err }
	readFolder := func() error { _, err := actions.ChapterFolderState(ctx, guids.Folder); return err }
	// readAloudReaperState is a track list and a state read (useBoothVoices.ts, useRecordControl.ts).
	readAloud := func() error { return concurrently(readTracks, readState) }

	actionsRun := map[string][]float64{}
	timed := func(name string, run func() error) {
		started := time.Now()
		err := run()
		elapsed := float64(time.Since(started).Microseconds()) / 1000
		actionsRun[name] = append(actionsRun[name], elapsed)
		if err != nil {
			mu.Lock()
			failures[name+":"+err.Error()]++
			mu.Unlock()
		}
	}

	for rep := 0; rep < reps; rep++ {
		lane := guids.Veyra
		if rep%2 == 1 {
			lane = guids.Narrator
		}
		// A lane switch: the voice set's list read and arm, then the three readAloudReaperState reads its epoch and voice changes start.
		timed("lane_switch", func() error {
			if _, err := actions.ReadTracks(ctx); err != nil {
				return err
			}
			if _, err := actions.ArmLane(ctx, lane, true); err != nil {
				return err
			}
			return concurrently(readAloud, readAloud, readAloud)
		})
		// A lane create: the child track, then the read that adopts it.
		timed("lane_create", func() error {
			if _, err := actions.CreateChildTrack(ctx, fmt.Sprintf("Host lane %d", rep), guids.Folder); err != nil {
				return err
			}
			return readTracks()
		})
		if record {
			// A record press: the state read, the arm, the cursor, the start; then a second later the stop, and REAPER settles.
			timed("record_press", func() error {
				if err := readState(); err != nil {
					return err
				}
				if _, err := actions.ArmLane(ctx, lane, false); err != nil {
					return err
				}
				if _, err := actions.PunchTo(ctx, 120, 0); err != nil {
					return err
				}
				_, err := actions.RecordStart(ctx, lane, RecordOptions{})
				return err
			})
			time.Sleep(time.Second)
			timed("record_stop", func() error { _, err := actions.RecordStop(ctx); return err })
			time.Sleep(500 * time.Millisecond)
		}
		// The window gaining focus: the live track list, the record control, the voices, the listening mic and the pull-back read together.
		timed("window_focus", func() error {
			return concurrently(readTracks, readTracks, readTracks, readTracks, readState, readState, readState, readState, readFolder)
		})
		// The Booth idle for five seconds: the live read's three track lists and the record control's state read.
		timed("idle_tick", func() error { return concurrently(readTracks, readTracks, readAloud) })
	}

	summarize := func(values []float64) map[string]float64 {
		sorted := append([]float64(nil), values...)
		sort.Float64s(sorted)
		at := func(q float64) float64 { return sorted[int(q*float64(len(sorted)-1)+0.5)] }
		return map[string]float64{"n": float64(len(sorted)), "p50": at(0.5), "p95": at(0.95), "max": sorted[len(sorted)-1]}
	}
	out := map[string]any{"actions_ms": map[string]any{}, "requests_ms": map[string]any{}, "failures": failures}
	for name, values := range actionsRun {
		out["actions_ms"].(map[string]any)[name] = summarize(values)
	}
	mu.Lock()
	for name, values := range perCommand {
		out["requests_ms"].(map[string]any)[name] = summarize(values)
	}
	mu.Unlock()
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if path := os.Getenv("NARRATION_REAL_REAPER_OUT"); path != "" {
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("%s", data)
	if len(failures) > 0 {
		t.Errorf("failures: %v", failures)
	}
}
