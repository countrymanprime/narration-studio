package main

import (
	"fmt"
	"runtime"
	"strconv"
	"strings"

	"desktop/internal/coverage"
	"desktop/internal/settings"
)

// The per-run options CoverageStart reads from its options map, beside "model" and "skipRecheck". Each one a run does not
// name comes from the RecordingCoverage settings, so a start with no options and a background check run the same way.
const (
	coverageOptionRecheck      = "recheck"      // "true" or "false": a second pass with a larger model, whatever the cascade setting says
	coverageOptionRecheckModel = "recheckModel" // the larger model; an approved Whisper model id
	coverageOptionRecheckBelow = "recheckBelow" // 0 to 1: also re-check passages whose words Whisper scored under this
	coverageOptionWorkers      = "workers"      // worker processes; 0 chooses from the model
	coverageOptionChunkSeconds = "chunkSeconds" // each piece's length; 0 transcribes an item whole
	coverageOptionOverlap      = "overlapSeconds"
	coverageOptionChapters     = "chapters" // chapters checked at once by one Check recordings run
)

const (
	maxCoverageWorkers      = 32
	minCoverageChunkSeconds = 30
	maxCoverageChunkSeconds = 3600
	maxCoverageOverlap      = 60
	maxCoverageChapters     = 8
)

// coverageCPUs is the computer's processor count, which a run of several chapters shares between them. A variable so a test
// can say how many there are.
var coverageCPUs = runtime.NumCPU

// coverageFreeMemoryMB is the memory free now, in MB (0: it cannot be read). A variable so a test can say how much.
var coverageFreeMemoryMB = platformFreeMemoryMB

// coverageMachine is what a recording check plans its transcriptions at once with (coverage.PlanWorkers).
func coverageMachine() coverage.Machine {
	return coverage.Machine{CPUs: coverageCPUs(), FreeMemoryMB: coverageFreeMemoryMB()}
}

// coverageChoices is what one check will do, decided once from the settings and the run's options: which model makes the
// first pass, whether and with which larger model a second pass follows, which passages it takes, and how a long item is
// cut up. CoverageStart, CoverageEngines and the background check all read it here, so what the dialog offers, what a
// press runs and what a background check runs cannot differ.
type coverageChoices struct {
	FirstPass   string
	Recheck     string // empty: no second pass
	UnsureBelow float64
	Pipeline    bool // the cascade_pipeline setting: the larger model works alongside the first pass
	Parallel    coverage.Parallel
}

// resolveCoverageChoices applies options over the settings. An option that is present and not valid is an error, never
// quietly replaced: a narrator who asked for 5 workers must not be told 1 ran. Without "recheck", the second pass follows the
// cascade setting, and a named "model" still runs alone unless the run asks for the second pass too.
func resolveCoverageChoices(store *settings.Store, options map[string]string) (coverageChoices, error) {
	all := coverageSettings(store)
	cascade := all.Cascade
	named := options["model"] != ""

	choices := coverageChoices{Parallel: all.Parallel, Pipeline: cascade.Pipeline}
	switch {
	case named:
		choices.FirstPass = options["model"]
	case cascade.Enabled:
		choices.FirstPass = cascade.FirstPassModel
	default:
		choices.FirstPass = resolveWhisperModelID(store, nil)
	}

	recheck := cascade.Enabled && !named
	if options["skipRecheck"] == "true" {
		recheck = false
	}
	if value, given := options[coverageOptionRecheck]; given {
		switch value {
		case "true":
			recheck = options["skipRecheck"] != "true"
		case "false":
			recheck = false
		default:
			return coverageChoices{}, fmt.Errorf("%s must be true or false", coverageOptionRecheck)
		}
	}
	if recheck {
		choices.Recheck = cascade.RecheckModel
		if value := strings.TrimSpace(options[coverageOptionRecheckModel]); value != "" {
			choices.Recheck = value
		}
		choices.UnsureBelow = cascade.UnsureBelow
		if value, given := options[coverageOptionRecheckBelow]; given {
			share, err := strconv.ParseFloat(value, 64)
			if err != nil || share < 0 || share > 1 {
				return coverageChoices{}, fmt.Errorf("%s must be a number from 0 to 1", coverageOptionRecheckBelow)
			}
			choices.UnsureBelow = share
		}
	}

	var err error
	if choices.Parallel.Workers, err = wholeOption(options, coverageOptionWorkers, choices.Parallel.Workers, 0, maxCoverageWorkers); err != nil {
		return coverageChoices{}, err
	}
	if choices.Parallel.ChunkSeconds, err = wholeOption(options, coverageOptionChunkSeconds, choices.Parallel.ChunkSeconds, 0, maxCoverageChunkSeconds); err != nil {
		return coverageChoices{}, err
	}
	if choices.Parallel.ChunkSeconds > 0 && choices.Parallel.ChunkSeconds < minCoverageChunkSeconds {
		return coverageChoices{}, fmt.Errorf("%s must be 0 or at least %d", coverageOptionChunkSeconds, minCoverageChunkSeconds)
	}
	if choices.Parallel.OverlapSeconds, err = wholeOption(options, coverageOptionOverlap, choices.Parallel.OverlapSeconds, 0, maxCoverageOverlap); err != nil {
		return coverageChoices{}, err
	}
	if choices.Parallel.Chapters, err = wholeOption(options, coverageOptionChapters, choices.Parallel.Chapters, 1, maxCoverageChapters); err != nil {
		return coverageChoices{}, err
	}
	// Chapters at once share the computer: each run plans its count with its share (coverage.SharePlan, Request.Concurrent).
	return choices, nil
}

// wholeOption reads a whole-number option in [low, high], or returns current when the option is absent.
func wholeOption(options map[string]string, key string, current, low, high int) (int, error) {
	raw, given := options[key]
	if !given {
		return current, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < low || value > high {
		return 0, fmt.Errorf("%s must be a whole number from %d to %d", key, low, high)
	}
	return value, nil
}
