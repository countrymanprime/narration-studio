package coverage

import (
	"testing"
	"time"

	"desktop/internal/evidence"
)

// Background recording checks: the scheduler's decision alone, with
// every condition spelled out.

var bgNow = time.Date(2026, 9, 25, 12, 0, 0, 0, time.UTC)

// readyConditions is a moment every condition allows a background check: on, the model installed, on mains power,
// REAPER closed, nothing running and nothing edited for an hour.
func readyConditions() BackgroundConditions {
	return BackgroundConditions{Enabled: true, Confirmed: true, ModelReady: true, Power: PowerMains, LastActivity: bgNow.Add(-time.Hour), Now: bgNow}
}

func changedAgo(chapterID string, state evidence.EvaluatorState, ago time.Duration) BackgroundCandidate {
	return BackgroundCandidate{ChapterID: chapterID, Freshness: state, LastChanged: bgNow.Add(-ago)}
}

func TestTheChapterChangedLongestAgoIsCheckedFirst(t *testing.T) {
	decision := NextBackground(readyConditions(), []BackgroundCandidate{
		changedAgo("c-2", evidence.StateStale, 10*time.Minute),
		changedAgo("c-1", evidence.StateStale, 40*time.Minute),
		changedAgo("c-3", evidence.StateNever, 50*time.Minute),
	})
	if decision.ChapterID != "c-1" || decision.Wait != "" {
		t.Fatalf("decision = %+v, want the stale chapter changed longest ago before a never-checked one", decision)
	}
}

func TestANeverCheckedChapterWhoseTrackChangedIsCheckedWhenNothingIsStale(t *testing.T) {
	decision := NextBackground(readyConditions(), []BackgroundCandidate{changedAgo("c-3", evidence.StateNever, 50*time.Minute)})
	if decision.ChapterID != "c-3" {
		t.Fatalf("decision = %+v", decision)
	}
}

func TestNothingStartsUnlessEveryConditionAllowsIt(t *testing.T) {
	candidates := []BackgroundCandidate{changedAgo("c-1", evidence.StateStale, time.Hour)}
	for name, tc := range map[string]struct {
		change func(*BackgroundConditions)
		wait   BackgroundWait
	}{
		"turned off":             {func(c *BackgroundConditions) { c.Enabled = false }, WaitOff},
		"a job runs":             {func(c *BackgroundConditions) { c.Busy = true }, WaitBusy},
		"no model":               {func(c *BackgroundConditions) { c.ModelReady = false }, WaitModel},
		"on battery":             {func(c *BackgroundConditions) { c.Power = PowerBattery }, WaitBattery},
		"power unknown":          {func(c *BackgroundConditions) { c.Power = PowerUnknown }, WaitBattery},
		"REAPER may record":      {func(c *BackgroundConditions) { c.ReaperRunning = true }, WaitRecording},
		"REAPER is recording":    {func(c *BackgroundConditions) { c.ReaperRunning, c.RecordingKnown, c.Recording = true, true, true }, WaitRecording},
		"REAPER edited just now": {func(c *BackgroundConditions) { c.LastActivity = bgNow.Add(-BackgroundQuiet / 2) }, WaitQuiet},
		"not confirmed yet":      {func(c *BackgroundConditions) { c.Confirmed = false }, WaitConfirm},
	} {
		t.Run(name, func(t *testing.T) {
			conditions := readyConditions()
			tc.change(&conditions)
			decision := NextBackground(conditions, candidates)
			if decision.ChapterID != "" || decision.Wait != tc.wait {
				t.Fatalf("decision = %+v, want to wait for %q", decision, tc.wait)
			}
		})
	}
}

func TestREAPERIdleAndNotRecordingAllowsACheck(t *testing.T) {
	conditions := readyConditions()
	conditions.ReaperRunning, conditions.RecordingKnown = true, true
	if decision := NextBackground(conditions, []BackgroundCandidate{changedAgo("c-1", evidence.StateStale, time.Hour)}); decision.ChapterID != "c-1" {
		t.Fatalf("decision = %+v", decision)
	}
}

func TestAChapterChangedWithinTheQuietPeriodWaits(t *testing.T) {
	decision := NextBackground(readyConditions(), []BackgroundCandidate{changedAgo("c-1", evidence.StateStale, BackgroundQuiet/2)})
	if decision.ChapterID != "" || decision.Wait != WaitQuiet {
		t.Fatalf("decision = %+v", decision)
	}
}

func TestNothingToCheckSaysSo(t *testing.T) {
	decision := NextBackground(readyConditions(), []BackgroundCandidate{changedAgo("c-1", evidence.StateCurrent, time.Hour)})
	if decision.ChapterID != "" || decision.Wait != WaitNothing {
		t.Fatalf("decision = %+v", decision)
	}
}

func TestTheWordsJustSpokenAreCheckedWithinAMinuteOfTheTake(t *testing.T) {
	// The Booth's narrator stops a take and reads ahead: the check of that take must not wait minutes (#2251 item 5).
	if BackgroundQuiet > time.Minute {
		t.Fatalf("BackgroundQuiet = %v, want a minute or less", BackgroundQuiet)
	}
	conditions := readyConditions()
	conditions.LastActivity = bgNow.Add(-BackgroundQuiet)
	if decision := NextBackground(conditions, []BackgroundCandidate{changedAgo("c-1", evidence.StateStale, BackgroundQuiet)}); decision.ChapterID != "c-1" {
		t.Fatalf("decision = %+v", decision)
	}
}

func TestTheDecisionCountsTheChaptersStillWaiting(t *testing.T) {
	candidates := []BackgroundCandidate{
		changedAgo("c-1", evidence.StateStale, time.Hour),
		changedAgo("c-2", evidence.StateNever, time.Hour),
		changedAgo("c-3", evidence.StateStale, BackgroundQuiet/2),
		changedAgo("c-4", evidence.StateCurrent, time.Hour),
	}
	if decision := NextBackground(readyConditions(), candidates); decision.ChapterID != "c-1" || decision.Queued != 2 {
		t.Fatalf("decision = %+v, want c-1 started and two more waiting", decision)
	}
	off := readyConditions()
	off.Power = PowerBattery
	if decision := NextBackground(off, candidates); decision.Wait != WaitBattery || decision.Queued != 3 {
		t.Fatalf("decision = %+v, want three waiting for mains power", decision)
	}
}

func TestBackgroundCPUsLeaveTheLiveTrackingItsShare(t *testing.T) {
	for _, tc := range []struct {
		total, chosen int
		live          bool
		want          int
	}{
		{8, 0, false, 4}, {8, 0, true, 2}, {2, 0, true, 1}, {1, 0, false, 1}, {8, 6, false, 6}, {8, 6, true, 6}, {4, 9, false, 4},
	} {
		if got := BackgroundCPUs(tc.total, tc.chosen, tc.live); got != tc.want {
			t.Errorf("BackgroundCPUs(%d, %d, %v) = %d, want %d", tc.total, tc.chosen, tc.live, got, tc.want)
		}
	}
}
