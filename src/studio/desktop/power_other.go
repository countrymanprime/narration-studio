//go:build !windows

package main

import "desktop/internal/coverage"

// platformPower is unknown off Windows: the app does not read the power state there yet, so background recording
// checks, which never run on battery (D27), do not run.
func platformPower() coverage.Power { return coverage.PowerUnknown }
