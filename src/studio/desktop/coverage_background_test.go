package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/coverage"
	"github.com/countrymanprime/narration-studio/shell/internal/dawport"
)

// fakeBackgroundHeartbeat is a dawport.Heartbeat a test can point at a chosen transport, for background-check gating
// on REAPER's own recording state (the transport itself is
// docs/architecture/reaper-bridge.md). Only Reachable and Transport matter to backgroundCheckTick; the rest answer as an unlinked heartbeat.
type fakeBackgroundHeartbeat struct {
	reachable    bool
	transport    dawport.Transport
	hasTransport bool
}

func (f fakeBackgroundHeartbeat) Reachable() bool                { return f.reachable }
func (f fakeBackgroundHeartbeat) CurrentProject() (string, bool) { return "", false }
func (f fakeBackgroundHeartbeat) Matches(string) bool            { return false }
func (f fakeBackgroundHeartbeat) ChangeCount() (int, bool)       { return 0, false }
func (f fakeBackgroundHeartbeat) Transport() (dawport.Transport, bool) {
	return f.transport, f.hasTransport
}

// Background recording checks: the host's loop over the
// real coverage service, with the power state and the clock handed in.

// switchableSidecar is a coverage launcher a test can point at another fake between runs.
type switchableSidecar struct {
	mu   sync.Mutex
	next coverage.Launcher
}

func (s *switchableSidecar) use(launcher coverage.Launcher) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.next = launcher
}

func (s *switchableSidecar) launch(ctx context.Context, program string, args ...string) (coverage.Child, error) {
	s.mu.Lock()
	launcher := s.next
	s.mu.Unlock()
	return launcher(ctx, program, args...)
}

// setReachability swaps the host's DAW heartbeat under h.mu, the lock services() snapshots it with. staleCoverageHost's
// setup run leaves a goroutine in flight (emitCoverage's go h.emitChapterSyncState(), which Wait does not cover) that
// reads every swappable service through services(), so a bare assignment here races with that snapshot.
func setReachability(host *Host, heartbeat dawport.Heartbeat) {
	host.mu.Lock()
	defer host.mu.Unlock()
	host.reachability = heartbeat
}

// staleCoverageHost is a coverage project whose one chapter was checked and then trimmed in REAPER an hour ago, on a
// computer on mains power with REAPER closed: every condition allows a background check.
func staleCoverageHost(t *testing.T) (*Host, *switchableSidecar, time.Time) {
	t.Helper()
	project := coverageProject(t)
	sidecar := &switchableSidecar{next: fakeCoverageSidecar(8)}
	host := coverageHostWithModels(t, project, whisperCatalog(t, map[string]bool{"tiny": true, "small": true}), sidecar.launch)
	checkRecording(t, host)
	confirmBackgroundChecks(t, host)
	rpp := filepath.Join(project, "book.rpp")
	body, err := os.ReadFile(rpp)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(rpp, []byte(strings.Replace(string(body), "LENGTH 4", "LENGTH 3", 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	anHourAgo := time.Now().Add(-time.Hour)
	for _, path := range []string{rpp, filepath.Join(project, "media", "take.wav")} {
		if err := os.Chtimes(path, anHourAgo, anHourAgo); err != nil {
			t.Fatal(err)
		}
	}
	host.powerState = func() coverage.Power { return coverage.PowerMains }
	sidecar.use(fakeCoverageSidecar(9))
	return host, sidecar, time.Now()
}

// confirmBackgroundChecks answers the first-time notice as the narrator's "Check in the background" does.
func confirmBackgroundChecks(t *testing.T, host *Host) {
	t.Helper()
	yes := "true"
	if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{settingBackgroundConfirmed: &yes}); err != nil {
		t.Fatal(err)
	}
}

// argsRecorder wraps a launcher and keeps every launch's flags.
type argsRecorder struct {
	mu       sync.Mutex
	launches []map[string]string
}

func (r *argsRecorder) wrap(inner coverage.Launcher) coverage.Launcher {
	return func(ctx context.Context, program string, args ...string) (coverage.Child, error) {
		values := map[string]string{}
		for i, arg := range args {
			if strings.HasPrefix(arg, "--") {
				values[arg] = "true"
				if i+1 < len(args) && !strings.HasPrefix(args[i+1], "--") {
					values[arg] = args[i+1]
				}
			}
		}
		r.mu.Lock()
		r.launches = append(r.launches, values)
		r.mu.Unlock()
		return inner(ctx, program, args...)
	}
}

func (r *argsRecorder) last(t *testing.T) map[string]string {
	t.Helper()
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.launches) == 0 {
		t.Fatal("nothing was launched")
	}
	return r.launches[len(r.launches)-1]
}

func TestNothingStartsInTheBackgroundBeforeTheNarratorAnswersTheNotice(t *testing.T) {
	host, _, now := staleCoverageHost(t)
	no := "false"
	if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{settingBackgroundConfirmed: &no}); err != nil {
		t.Fatal(err)
	}

	decision := host.backgroundCheckTick(now)

	if decision.Wait != coverage.WaitConfirm || decision.Queued != 1 || host.services().coverage.Busy() {
		t.Fatalf("decision = %+v, busy = %v", decision, host.services().coverage.Busy())
	}
	state, err := host.chapterSyncState()
	if err != nil {
		t.Fatal(err)
	}
	if state.Background.Wait != string(coverage.WaitConfirm) || state.Background.Queued != 1 || state.Background.FirstPassModel != "tiny" || state.Background.RecheckModel != "small" {
		t.Fatalf("the notice needs to say what would run: %+v", state.Background)
	}
}

func TestABackgroundCheckRunsTinyAndSmallOnItsShareOfTheProcessorsBelowNormalPriority(t *testing.T) {
	host, sidecar, now := staleCoverageHost(t)
	t.Cleanup(host.services().coverage.Wait)
	recorder := &argsRecorder{}
	sidecar.use(recorder.wrap(fakeCoverageSidecar(9)))
	previous := coverageCPUs
	coverageCPUs = func() int { return 8 }
	t.Cleanup(func() { coverageCPUs = previous })
	// The narrator's own check uses a heavy pair; the background check keeps to its own.
	heavy, large := "true", "large-v3-turbo"
	if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{"cascade_enabled": &heavy, "cascade_recheck_model": &large}); err != nil {
		t.Fatal(err)
	}

	if decision := host.backgroundCheckTick(now); decision.ChapterID != "c-0001" {
		t.Fatalf("decision = %+v", decision)
	}

	args := recorder.last(t)
	if args["--model"] != "tiny" || args["--recheck-model"] != "small" || args["--cpus"] != "4" {
		t.Fatalf("a background check runs tiny with small as the double-check on half the processors, got %v", args)
	}
}

func TestABackgroundCheckRunsBetweenTakesWhileTheBoothFollowsOnAQuarterOfTheProcessors(t *testing.T) {
	host, sidecar, now := staleCoverageHost(t)
	t.Cleanup(host.services().coverage.Wait)
	recorder := &argsRecorder{}
	sidecar.use(recorder.wrap(fakeCoverageSidecar(9)))
	previous := coverageCPUs
	coverageCPUs = func() int { return 8 }
	t.Cleanup(func() { coverageCPUs = previous })
	host.liveFollowing = func() bool { return true }

	if decision := host.backgroundCheckTick(now); decision.ChapterID != "c-0001" {
		t.Fatalf("the Booth following a reading must not hold every check off: %+v", decision)
	}
	if got := recorder.last(t)["--cpus"]; got != "2" {
		t.Fatalf("--cpus = %q, want a quarter of 8 while the Booth follows", got)
	}
}

func TestTheNarratorsProcessorChoiceIsKept(t *testing.T) {
	host, sidecar, now := staleCoverageHost(t)
	t.Cleanup(host.services().coverage.Wait)
	recorder := &argsRecorder{}
	sidecar.use(recorder.wrap(fakeCoverageSidecar(9)))
	three, single := "3", "none"
	if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{settingBackgroundProcessors: &three, settingBackgroundRecheckModel: &single}); err != nil {
		t.Fatal(err)
	}

	host.backgroundCheckTick(now)

	args := recorder.last(t)
	if args["--cpus"] != "3" {
		t.Fatalf("--cpus = %q", args["--cpus"])
	}
	if _, double := args["--recheck-model"]; double {
		t.Fatalf("none turns the double-check off: %v", args)
	}
}

func TestAStaleChapterIsCheckedAgainInTheBackground(t *testing.T) {
	host, _, now := staleCoverageHost(t)
	events := collectJobEnds(host)

	decision := host.backgroundCheckTick(now)

	if decision.ChapterID != "c-0001" {
		t.Fatalf("decision = %+v", decision)
	}
	if state := host.services().coverage.State(); !state.Background || state.ChapterID != "c-0001" {
		t.Fatalf("the running check is not marked background: %+v", state)
	}
	ended := nextJobEnd(t, events)
	host.services().coverage.Wait()
	if ended.Outcome != jobOutcomeSuccess {
		t.Fatalf("job:ended = %+v", ended)
	}
	state, err := host.chapterSyncState()
	if err != nil {
		t.Fatal(err)
	}
	if row := chapterRow(t, state, "c-0001"); row.Freshness != "current" {
		t.Fatalf("after the background check: %+v", row)
	}
	if next := host.backgroundCheckTick(now.Add(time.Minute)); next.ChapterID != "" || next.Wait != coverage.WaitNothing {
		t.Fatalf("a current chapter was picked again: %+v", next)
	}
}

func TestBackgroundChecksCanBeTurnedOff(t *testing.T) {
	host, _, now := staleCoverageHost(t)
	off := "false"
	if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{"background_checks": &off}); err != nil {
		t.Fatal(err)
	}

	decision := host.backgroundCheckTick(now)

	if decision.Wait != coverage.WaitOff || host.services().coverage.Busy() {
		t.Fatalf("decision = %+v, busy = %v", decision, host.services().coverage.Busy())
	}
	state, err := host.chapterSyncState()
	if err != nil {
		t.Fatal(err)
	}
	if state.Background.Enabled || state.Background.Wait != string(coverage.WaitOff) {
		t.Fatalf("background = %+v", state.Background)
	}
}

func TestOnBatteryNothingStarts(t *testing.T) {
	host, _, now := staleCoverageHost(t)
	host.powerState = func() coverage.Power { return coverage.PowerBattery }
	if decision := host.backgroundCheckTick(now); decision.Wait != coverage.WaitBattery || host.services().coverage.Busy() {
		t.Fatalf("decision = %+v", decision)
	}
}

// TestNothingStartsWhileReaperIsRecording covers the heartbeat's recording bit (docs/utilities/recording-coverage.md and
// docs/architecture/reaper-bridge.md): a live heartbeat that says REAPER is recording holds off, even though every other condition (mains
// power, quiet chapter, model installed) allows a check.
func TestNothingStartsWhileReaperIsRecording(t *testing.T) {
	host, _, now := staleCoverageHost(t)
	setReachability(host, fakeBackgroundHeartbeat{reachable: true, transport: dawport.Transport{Recording: true}, hasTransport: true})
	if decision := host.backgroundCheckTick(now); decision.Wait != coverage.WaitRecording || host.services().coverage.Busy() {
		t.Fatalf("decision = %+v", decision)
	}
}

// TestABackgroundCheckRunsWhileReaperIsOpenAndKnownNotRecording is the flip side: REAPER is reachable, and its own
// heartbeat says it is not recording, so the check that TestNothingStartsWhileReaperIsRecording held off now starts.
func TestABackgroundCheckRunsWhileReaperIsOpenAndKnownNotRecording(t *testing.T) {
	host, _, now := staleCoverageHost(t)
	// The check this starts writes its results into the test's temp folder: let it finish before the folder is removed,
	// which Windows refuses while the run still holds it ("The directory is not empty").
	t.Cleanup(host.services().coverage.Wait)
	setReachability(host, fakeBackgroundHeartbeat{reachable: true, transport: dawport.Transport{Recording: false}, hasTransport: true})
	if decision := host.backgroundCheckTick(now); decision.ChapterID != "c-0001" {
		t.Fatalf("decision = %+v", decision)
	}
}

// TestNothingStartsWhileReaperIsRunningWithNoTransportInTheHeartbeat covers the fallback for an older script or a
// heartbeat that has not carried the transport yet: unknown counts as recording, same as before this
// stream landed the wiring.
func TestNothingStartsWhileReaperIsRunningWithNoTransportInTheHeartbeat(t *testing.T) {
	host, _, now := staleCoverageHost(t)
	setReachability(host, fakeBackgroundHeartbeat{reachable: true})
	if decision := host.backgroundCheckTick(now); decision.Wait != coverage.WaitRecording {
		t.Fatalf("decision = %+v", decision)
	}
}

// heldCoverageSidecar runs until its run is cancelled (the .cancel file beside its progress file), then exits with the
// cancel code, as compare.py does.
func heldCoverageSidecar() coverage.Launcher {
	return func(_ context.Context, _ string, args ...string) (coverage.Child, error) {
		progress := ""
		for i := 0; i+1 < len(args); i++ {
			if args[i] == "--progress" {
				progress = args[i+1]
			}
		}
		child := &coverageChild{}
		go func() {
			for {
				if _, err := os.Stat(progress + ".cancel"); err == nil {
					code := 2
					child.mu.Lock()
					child.code = &code
					child.mu.Unlock()
					return
				}
				time.Sleep(5 * time.Millisecond)
			}
		}()
		return child, nil
	}
}

func TestTheNarratorsOwnCheckPreemptsABackgroundOne(t *testing.T) {
	host, sidecar, now := staleCoverageHost(t)
	sidecar.use(heldCoverageSidecar())
	if decision := host.backgroundCheckTick(now); decision.ChapterID != "c-0001" {
		t.Fatalf("decision = %+v", decision)
	}
	sidecar.use(fakeCoverageSidecar(9))

	started := decodeAnswer(t)(host.CoverageStart("c-0001", nil))

	if started["status"] != "started" {
		t.Fatalf("the narrator's start was refused: %v", started)
	}
	if state := host.services().coverage.State(); state.Background {
		t.Fatalf("the narrator's run is marked background: %+v", state)
	}
	host.services().coverage.Wait()
}

func TestABackgroundCheckTheNarratorCancelledIsNotStartedAgainForTheSameChange(t *testing.T) {
	host, sidecar, now := staleCoverageHost(t)
	sidecar.use(heldCoverageSidecar())
	if decision := host.backgroundCheckTick(now); decision.ChapterID != "c-0001" {
		t.Fatalf("decision = %+v", decision)
	}

	if _, err := host.CoverageCancel(); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	if again := host.backgroundCheckTick(now.Add(time.Minute)); again.ChapterID != "" || host.services().coverage.Busy() {
		t.Fatalf("the cancelled check started again: %+v", again)
	}
}
