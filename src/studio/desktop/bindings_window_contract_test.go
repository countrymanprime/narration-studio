package main

import (
	"testing"

	"desktop/internal/contractfile"
)

// What WindowZoom and WindowSetZoom send: one shape, the window's
// current zoom level as a fraction.
func TestContractWindowZoom(t *testing.T) {
	contractfile.Check(t, "window-zoom", WindowZoomResult{Level: 1.25})
}
