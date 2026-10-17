package coverage

import (
	"fmt"
	"math"
	"strconv"
)

// SettingsTool is the settings.Store tool the recording check's four settings
// live under (docs/utilities/recording-coverage.md Q3), layered project
// over global over the built-in defaults in config/defaults.json like every
// other tool.
const SettingsTool = "RecordingCoverage"

// The four setting keys (Q3). The first two are thresholds, applied on read;
// the last two are alignment parameters, which change which words count and
// so are in a result's parameter hash (Q13 B).
const (
	SettingMinParagraphPresent = "min_paragraph_present"
	SettingMaxMissingRun       = "max_missing_run"
	SettingMaxMisreadRun       = "max_misread_run"
	SettingMinAnchorRun        = "min_anchor_run"
)

// The model cascade's own three settings. MC1: opt-in, off by default.
// MC2: two independent models, not Transcript Compare's own model_size - the first pass's own, and the re-check's;
// while the cascade is off, CoverageStart keeps reading Transcript Compare's model_size.
const (
	SettingCascadeEnabled        = "cascade_enabled"
	SettingCascadeFirstPassModel = "cascade_first_pass_model"
	SettingCascadeRecheckModel   = "cascade_recheck_model"
)

// How a long item is transcribed, and which words the first pass doubts. Parallel workers, chunk length and crossover
// change how fast the same words are made, not which ones count, so they are not in a result's parameter hash.
const (
	SettingParallelWorkers     = "parallel_workers"
	SettingChunkSeconds        = "chunk_seconds"
	SettingChunkOverlapSeconds = "chunk_overlap_seconds"
	SettingParallelChapters    = "parallel_chapters"
	SettingCascadeUnsureBelow  = "cascade_unsure_below"
)

// minChunkSeconds is the shortest chunk a narrator can ask for: under it the crossover would be most of the chunk.
const minChunkSeconds = 30

// Parallel is how a long item is cut up and how many Whisper processes work on the pieces (docs/utilities/recording-coverage.md,
// "Long chapters"). The zero value is the sidecar's own default: the whole item, one process.
type Parallel struct {
	// Workers is the number of worker processes; 0 lets the sidecar choose from the model's memory cost.
	Workers int
	// ChunkSeconds is each piece's length; 0 transcribes an item whole.
	ChunkSeconds int
	// OverlapSeconds is the crossover: how much neighbouring pieces overlap, where their words are joined.
	OverlapSeconds int
	// Chapters is how many chapters a Check recordings run checks at once. It is not a sidecar flag: each chapter is its
	// own run with its own processes (Request.Concurrent), so the host shares the processors between them.
	Chapters int
}

// Settings are everything the narrator sets for the recording check: how the
// transcript is aligned to the text, and when a chapter counts as recorded.
type Settings struct {
	Alignment  AlignmentParams
	Thresholds Thresholds
	Cascade    CascadeSettings
	Parallel   Parallel
}

// CascadeSettings is the model cascade's own settings (MC1, MC2).
type CascadeSettings struct {
	// Enabled turns the two-pass check on at all (MC1). Off by default: CoverageStart runs a plain, single-model
	// check on Transcript Compare's model_size.
	Enabled bool
	// FirstPassModel and RecheckModel are Whisper model ids from the approved catalog (MC2), independent of
	// Transcript Compare's own model_size. RecheckModel should not be smaller than FirstPassModel (MC2's
	// recommendation); nothing here enforces that - it is the narrator's own choice in Settings.
	FirstPassModel string
	RecheckModel   string
	// UnsureBelow is the Whisper word probability under which a passage is re-checked with RecheckModel even when
	// the text is all there; 0 re-checks only what the first pass reports missing.
	UnsureBelow float64
}

// DefaultSettings are 0.8, 3, 8 and 3, chosen by running the synthetic
// fixtures through the shipped path under simulated transcriber error (Q3 started at 0.95, 3, 8 and 3). No real narration has checked them,
// so they stay Proposed and labelled uncalibrated (Q15). The cascade defaults
// to off, tiny first pass, large-v3-turbo re-check (MC1, MC2).
var DefaultSettings = Settings{
	Alignment:  DefaultAlignmentParams,
	Thresholds: DefaultThresholds,
	Cascade:    CascadeSettings{Enabled: false, FirstPassModel: "tiny", RecheckModel: "large-v3-turbo", UnsureBelow: 0.5},
	Parallel:   Parallel{Workers: 0, ChunkSeconds: 300, OverlapSeconds: 6, Chapters: 1},
}

func (t Thresholds) validate() error {
	if math.IsNaN(t.MinParagraphPresent) || t.MinParagraphPresent < 0 || t.MinParagraphPresent > 1 || t.MaxMissingRun < 0 {
		return fmt.Errorf("thresholds must be a paragraph share from 0 to 1 and a missing run of 0 or more (got %g and %d)", t.MinParagraphPresent, t.MaxMissingRun)
	}
	return nil
}

// ResolveSettings reads the four settings through lookup (the effective value
// of one key, "" when none is set anywhere). A value that is missing, not a
// number, or out of range - a hand-edited or corrupt settings file, since the
// Settings page refuses one - falls back to that one setting's default, so a
// typo degrades to the conservative value instead of failing every check.
func ResolveSettings(lookup func(key string) string) Settings {
	defaults := DefaultSettings
	return Settings{
		Alignment: AlignmentParams{
			MaxMisreadRun: wholeSetting(lookup(SettingMaxMisreadRun), 0, defaults.Alignment.MaxMisreadRun),
			MinAnchorRun:  wholeSetting(lookup(SettingMinAnchorRun), 1, defaults.Alignment.MinAnchorRun),
		},
		Thresholds: Thresholds{
			MinParagraphPresent: shareSetting(lookup(SettingMinParagraphPresent), defaults.Thresholds.MinParagraphPresent),
			MaxMissingRun:       wholeSetting(lookup(SettingMaxMissingRun), 0, defaults.Thresholds.MaxMissingRun),
		},
		Cascade: CascadeSettings{
			Enabled:        boolSetting(lookup(SettingCascadeEnabled), defaults.Cascade.Enabled),
			FirstPassModel: stringSetting(lookup(SettingCascadeFirstPassModel), defaults.Cascade.FirstPassModel),
			RecheckModel:   stringSetting(lookup(SettingCascadeRecheckModel), defaults.Cascade.RecheckModel),
			UnsureBelow:    shareSetting(lookup(SettingCascadeUnsureBelow), defaults.Cascade.UnsureBelow),
		},
		Parallel: Parallel{
			Workers:        wholeSetting(lookup(SettingParallelWorkers), 0, defaults.Parallel.Workers),
			ChunkSeconds:   chunkSetting(lookup(SettingChunkSeconds), defaults.Parallel.ChunkSeconds),
			OverlapSeconds: wholeSetting(lookup(SettingChunkOverlapSeconds), 0, defaults.Parallel.OverlapSeconds),
			Chapters:       wholeSetting(lookup(SettingParallelChapters), 1, defaults.Parallel.Chapters),
		},
	}
}

// boolSetting reads a "true"/"false" setting (validateSettingValue's own "bool" kind), falling back on anything else
// - missing, or a hand-edited file's garbage - the same conservative-default rule wholeSetting and shareSetting
// follow.
func boolSetting(raw string, fallback bool) bool {
	switch raw {
	case "true":
		return true
	case "false":
		return false
	default:
		return fallback
	}
}

// stringSetting falls back for an unset ("") value; a set value is trusted as is (the Settings page's "choice" kind
// already restricts it to the approved catalog, validateSettingValue).
func stringSetting(raw, fallback string) string {
	if raw == "" {
		return fallback
	}
	return raw
}

// chunkSetting reads a chunk length: 0 (chunking off) or at least minChunkSeconds; anything else is the fallback.
func chunkSetting(raw string, fallback int) int {
	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 || (value > 0 && value < minChunkSeconds) {
		return fallback
	}
	return value
}

func wholeSetting(raw string, minimum, fallback int) int {
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum {
		return fallback
	}
	return value
}

func shareSetting(raw string, fallback float64) float64 {
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsNaN(value) || value < 0 || value > 1 {
		return fallback
	}
	return value
}
