package tracks

import (
	"path/filepath"
	"testing"

	"desktop/internal/contractfile"
)

// The audio engine panel's project as TracksList sends it, parsed from the fixture .rpp with its resolved media. The absolute
// folder of the checkout is replaced so the file reads the same on every machine.
func TestContractTracksProject(t *testing.T) {
	folder, err := filepath.Abs("testdata")
	if err != nil {
		t.Fatal(err)
	}
	project, err := Parse(filepath.Join(folder, "basic.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	stable, err := contractfile.PortablePaths(project, folder, "C:/Projects/Alice")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "tracks-project", stable)
}

// The same payload for a nested project: depth and isFolder on a folder inside a folder, a folder closing two levels at once and an empty folder.
func TestContractTracksProjectFolders(t *testing.T) {
	folder, err := filepath.Abs("testdata")
	if err != nil {
		t.Fatal(err)
	}
	project, err := Parse(filepath.Join(folder, "folders-handmade.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	stable, err := contractfile.PortablePaths(project, folder, "C:/Projects/Alice")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "tracks-project-folders", stable)
}
