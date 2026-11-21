package editing

import "strconv"

// formatFloat renders a seconds-like value at a fixed precision, matching
// evidence.formatSeconds's own microsecond precision so two identity hashes
// never disagree over a value that would print the same in the UI.
func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', 6, 64)
}
