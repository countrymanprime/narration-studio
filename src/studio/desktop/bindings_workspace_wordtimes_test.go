package main

import (
	"testing"

	"desktop/internal/contractfile"
)

func TestDawProjectEditedGolden(t *testing.T) {
	contractfile.Check(t, "daw-project-edited", dawProjectEdited{ChangeCount: 31})
}
