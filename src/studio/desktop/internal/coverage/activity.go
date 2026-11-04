package coverage

import (
	"encoding/json"
	"io"
	"os"
	"slices"
)

// What a recording check is doing now, beyond its percent: the sidecar writes <progress>.activity.json
// (src/studio/sidecars/transcript-compare/core/coverage_activity.py) and the host sends it with the run's state, so the Check recordings
// dialog can show how many transcriptions run at once, how far the chunks are, and what the larger model was asked to re-check. Every
// number is a count of work done or queued; the file is best-effort, and a run without it shows the percent alone.

// activitySchemaVersion is the sidecar's activity file version (coverage_activity.SCHEMA_VERSION).
const activitySchemaVersion = 1

// maxActivityBytes is the most of the file the host reads: the sidecar's is under 1 KB.
const maxActivityBytes = 16 << 10

// Why the larger model was asked to look at a passage (RecheckActivity.Reasons).
const (
	// ReasonLowConfidence: Whisper gave a word of the passage a probability below the run's score line.
	ReasonLowConfidence = "low_confidence"
	// ReasonMissingWords: the first pass heard nothing where the script has words (known only after the chapter is aligned).
	ReasonMissingWords = "missing_words"
	// ReasonWidespread: so much of the chapter was in doubt that the larger model redoes whole items.
	ReasonWidespread = "widespread"
)

// PassActivity is one model's share of a run. A unit is the audio one transcription takes: an item, or a chunk of a long item.
type PassActivity struct {
	Model string `json:"model"`
	// Workers is the transcriptions this model runs at once, as the sidecar planned them; Busy is how many run now.
	Workers int `json:"workers"`
	Busy    int `json:"busy"`
	// Total and Done count units. Final is false while Total can still grow (the larger model's passages, until the first pass is through).
	Total int  `json:"total"`
	Done  int  `json:"done"`
	Final bool `json:"final"`
}

// Counts is a done-of-total pair.
type Counts struct {
	Total int `json:"total"`
	Done  int `json:"done"`
}

// RecheckActivity is the larger model's share: its units are passages (windows) of items, and Reasons says why they were chosen.
type RecheckActivity struct {
	PassActivity
	Reasons []string `json:"reasons"`
}

// Activity is a run's live work, sent as State.Activity. Requested is the worker count the narrator set (0 is Automatic); the
// workers in FirstPass are what the check really runs.
type Activity struct {
	Requested int              `json:"requested"`
	Items     Counts           `json:"items"`
	FirstPass PassActivity     `json:"firstPass"`
	Recheck   *RecheckActivity `json:"recheck,omitempty"`
}

// activityFile is the sidecar's file. A plain or pipelined run writes firstPass (and recheck when it hands passages to the larger model);
// the windows-only re-check stage writes recheck alone, because its windows are the larger model's share and it has no first pass.
type activityFile struct {
	SchemaVersion int           `json:"schemaVersion"`
	Items         Counts        `json:"items"`
	FirstPass     *PassActivity `json:"firstPass"`
	Recheck       *fileRecheck  `json:"recheck"`
}

type fileRecheck struct {
	PassActivity
	Reason *string `json:"reason"`
}

func (j *job) activityPath() string { return j.progressPath + ".activity.json" }

// readActivityFile reads and checks the sidecar's file; ok is false when it is missing, torn, of another version or not believable.
func readActivityFile(path string) (activityFile, bool) {
	handle, err := os.Open(path)
	if err != nil {
		return activityFile{}, false
	}
	defer func() { _ = handle.Close() }()
	raw, err := io.ReadAll(io.LimitReader(handle, maxActivityBytes+1))
	if err != nil || len(raw) > maxActivityBytes {
		return activityFile{}, false
	}
	var file activityFile
	if err := json.Unmarshal(raw, &file); err != nil || file.SchemaVersion != activitySchemaVersion {
		return activityFile{}, false
	}
	if file.FirstPass == nil && file.Recheck == nil {
		return activityFile{}, false
	}
	if (file.FirstPass != nil && !file.FirstPass.believable()) || (file.Recheck != nil && !file.Recheck.believable()) || file.Items.Total < 0 || file.Items.Done < 0 {
		return activityFile{}, false
	}
	return file, true
}

func (p PassActivity) believable() bool {
	return p.Workers >= 1 && p.Busy >= 0 && p.Busy <= p.Workers && p.Total >= 0 && p.Done >= 0
}

// activityOf is the run's activity for the stage it is in, and ok is false when the file lacks the pass the stage reports. The first
// stage's file is taken as it is. A later stage's file holds the larger model's share in recheck, and the host adds it to what the first
// stage ended with (activityBase) field by field, because the re-check stages are one more pass of the larger model over more passages.
// The reason a passage was chosen is the file's when it names one, otherwise the stage's own.
func (j *job) activityOf(file activityFile) (Activity, bool) {
	activity := Activity{Requested: j.request.Parallel.Workers, Items: file.Items}
	if j.stage == stageFirstPass {
		if file.FirstPass == nil {
			return Activity{}, false
		}
		activity.FirstPass = *file.FirstPass
		if file.Recheck != nil {
			activity.Recheck = &RecheckActivity{PassActivity: file.Recheck.PassActivity, Reasons: reasonsOf(file.Recheck.Reason)}
		}
		return activity, true
	}
	if file.Recheck == nil {
		return Activity{}, false
	}
	base := j.activityBase
	activity.Items = base.Items
	activity.FirstPass = base.FirstPass
	activity.FirstPass.Busy = 0
	reason := j.stageReason()
	if file.Recheck.Reason != nil {
		reason = *file.Recheck.Reason
	}
	recheck := RecheckActivity{PassActivity: file.Recheck.PassActivity, Reasons: []string{reason}}
	if base.Recheck != nil {
		recheck.Total += base.Recheck.Total
		recheck.Done += base.Recheck.Done
		recheck.Reasons = append(slices.Clone(base.Recheck.Reasons), reason)
		slices.Sort(recheck.Reasons)
		recheck.Reasons = slices.Compact(recheck.Reasons)
	}
	activity.Recheck = &recheck
	return activity, true
}

// stageReason is why a re-check stage asked the larger model for its passages.
func (j *job) stageReason() string {
	if j.stage == stageRecheckWhole {
		return ReasonWidespread
	}
	return ReasonMissingWords
}

func reasonsOf(reason *string) []string {
	if reason == nil {
		return []string{}
	}
	return []string{*reason}
}
