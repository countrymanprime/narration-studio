package coverage

import (
	"sort"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/evidence"
)

// Background recording checks. NextBackground decides, from what the host
// knows at one moment, whether a check of a changed chapter may start now and which one. It only decides: the host starts the check through the same Start as a narrator's press, so progress, the ledger record and
// job:ended are the same. It is pure, so every rule is a table test.

// BackgroundQuiet is how long nothing may have changed in REAPER, and in the chapter itself, before a background check
// starts: long enough that a take just stopped is saved and the narrator is reading ahead, short enough that the words just
// spoken are checked before the next take (#2251). A check is incremental, below normal priority and on a share of the
// processors (BackgroundCPUs), so it can start this soon.
const BackgroundQuiet = 45 * time.Second

// Power is whether the computer runs on mains power. Only PowerMains allows a background check (never on
// battery); a power state the host cannot read counts as battery.
type Power string

const (
	PowerMains   Power = "mains"
	PowerBattery Power = "battery"
	PowerUnknown Power = "unknown"
)

// BackgroundWait is why no background check starts now, "" when one does.
type BackgroundWait string

const (
	// WaitOff: the narrator turned background checks off (RecordingCoverage.background_checks).
	WaitOff BackgroundWait = "off"
	// WaitConfirm: checks are on but the narrator has not yet answered the first-time notice that says what a background
	// check runs and why (RecordingCoverage.background_checks_confirmed); nothing starts unannounced.
	WaitConfirm BackgroundWait = "confirm"
	// WaitBusy: a check or another job the narrator started is running.
	WaitBusy BackgroundWait = "busy"
	// WaitModel: the Whisper model is not installed; a background check never downloads one.
	WaitModel BackgroundWait = "model"
	// WaitBattery: the computer is on battery, or its power state cannot be read.
	WaitBattery BackgroundWait = "battery"
	// WaitRecording: REAPER is recording, or is running and cannot say whether it is.
	WaitRecording BackgroundWait = "recording"
	// WaitQuiet: REAPER, or the chapter to check, changed within BackgroundQuiet.
	WaitQuiet BackgroundWait = "quiet"
	// WaitNothing: no linked chapter has changed since its check.
	WaitNothing BackgroundWait = "nothing"
)

// BackgroundConditions is the moment the decision is made. ReaperRunning is a live heartbeat; RecordingKnown is
// whether that heartbeat says if REAPER is recording (Recording). LastActivity is the last change the host saw in
// REAPER: the saved project's modification or its edit counter moving.
type BackgroundConditions struct {
	Enabled        bool
	Confirmed      bool
	ModelReady     bool
	Busy           bool
	Power          Power
	ReaperRunning  bool
	RecordingKnown bool
	Recording      bool
	LastActivity   time.Time
	Now            time.Time
}

// BackgroundCandidate is a linked chapter the host may check: its check's freshness and when its track last changed.
type BackgroundCandidate struct {
	ChapterID   string
	Freshness   evidence.EvaluatorState
	LastChanged time.Time
}

// BackgroundDecision is the chapter to check now, or why none, and how many changed chapters wait for a check besides it.
type BackgroundDecision struct {
	ChapterID string         `json:"chapterId"`
	Wait      BackgroundWait `json:"wait"`
	Queued    int            `json:"queued"`
}

// NextBackground applies the rules in order: turned on; the first-time notice answered; nothing else running; the model installed; mains power;
// REAPER closed, or known not to be recording; quiet for BackgroundQuiet. Then it picks, among stale chapters first and
// never-checked ones second, the one whose change is oldest and at least BackgroundQuiet old. A current chapter is
// never picked.
func NextBackground(c BackgroundConditions, candidates []BackgroundCandidate) BackgroundDecision {
	queued := 0
	for _, candidate := range candidates {
		if candidate.Freshness == evidence.StateStale || candidate.Freshness == evidence.StateNever {
			queued++
		}
	}
	wait := func(why BackgroundWait) BackgroundDecision { return BackgroundDecision{Wait: why, Queued: queued} }
	switch {
	case !c.Enabled:
		return BackgroundDecision{Wait: WaitOff}
	case !c.Confirmed:
		return wait(WaitConfirm)
	case c.Busy:
		return wait(WaitBusy)
	case !c.ModelReady:
		return wait(WaitModel)
	case c.Power != PowerMains:
		return wait(WaitBattery)
	case c.ReaperRunning && (!c.RecordingKnown || c.Recording):
		return wait(WaitRecording)
	case !c.LastActivity.IsZero() && c.Now.Sub(c.LastActivity) < BackgroundQuiet:
		return wait(WaitQuiet)
	}
	eligible := []BackgroundCandidate{}
	waiting := false
	for _, candidate := range candidates {
		if candidate.Freshness != evidence.StateStale && candidate.Freshness != evidence.StateNever {
			continue
		}
		if c.Now.Sub(candidate.LastChanged) < BackgroundQuiet {
			waiting = true
			continue
		}
		eligible = append(eligible, candidate)
	}
	if len(eligible) == 0 {
		if waiting {
			return wait(WaitQuiet)
		}
		return BackgroundDecision{Wait: WaitNothing}
	}
	rank := func(state evidence.EvaluatorState) int {
		if state == evidence.StateStale {
			return 0
		}
		return 1
	}
	sort.SliceStable(eligible, func(i, j int) bool {
		if rank(eligible[i].Freshness) != rank(eligible[j].Freshness) {
			return rank(eligible[i].Freshness) < rank(eligible[j].Freshness)
		}
		return eligible[i].LastChanged.Before(eligible[j].LastChanged)
	})
	return BackgroundDecision{ChapterID: eligible[0].ChapterID, Queued: queued - 1}
}

// BackgroundCPUs is the processors a background check plans for, of total: the narrator's choice when they made one (never
// more than the computer has), else half the computer, or a quarter while the Booth's live tracking is following a reading,
// and never less than one. The rest stay with the narrator's own work; the check also runs below normal priority.
func BackgroundCPUs(total, chosen int, live bool) int {
	total = max(1, total)
	if chosen > 0 {
		return min(chosen, total)
	}
	if live {
		return max(1, total/4)
	}
	return max(1, total/2)
}
