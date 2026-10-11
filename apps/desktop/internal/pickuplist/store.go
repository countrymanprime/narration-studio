package pickuplist

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/countrymanprime/narration-utils/shell/internal/findings"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// SchemaVersion is the only pickup-list.json version this package reads or writes.
const SchemaVersion = 1

// what names the file for the narrator in a persist notice or an error.
const what = "pickup list"

// File is where a project's pickup list changes are kept.
func File(project string) string {
	return filepath.Join(project, "narration-utils", "pickups", "pickup-list.json")
}

// added is a line the narrator typed. Time is seconds into the chapter's recording.
type added struct {
	ID          string  `json:"id"`
	ChapterID   string  `json:"chapterId"`
	ParagraphID string  `json:"paragraphId,omitempty"`
	Time        float64 `json:"time"`
	Line        string  `json:"line"`
	At          string  `json:"at"`
}

// listFile is the stored document: the lines added, the ids removed and left out, the pickups done with no marker to
// say so, and the done states that wait to be written to the DAW.
type listFile struct {
	SchemaVersion int      `json:"schemaVersion"`
	Added         []added  `json:"added"`
	Removed       []string `json:"removed"`
	LeftOut       []string `json:"leftOut"`
	Done          []string `json:"done"`
	Waiting       []string `json:"waiting"`
}

var fileLocks sync.Map

// lockFile serialises every change to one project's file across services built for the same project.
// +checklocksignore
func lockFile(path string) func() {
	lock, _ := fileLocks.LoadOrStore(filepath.Clean(path), &sync.Mutex{})
	mutex, _ := lock.(*sync.Mutex)
	mutex.Lock()
	return mutex.Unlock
}

func emptyFile() listFile {
	return listFile{SchemaVersion: SchemaVersion, Added: []added{}, Removed: []string{}, LeftOut: []string{}, Done: []string{}, Waiting: []string{}}
}

// read reads pickup-list.json; the caller holds the file's lock. A corrupt file is kept aside and an empty store
// started (the narrator is told by the reporter); one written by a newer app is refused and never overwritten.
func (s *Service) read() (listFile, error) {
	file := emptyFile()
	newer := 0
	var decoded listFile
	outcome := s.config.Reporter.ReadJSON(File(s.config.Project), what, persist.NarratorData, func(raw []byte) error {
		var candidate listFile
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion > SchemaVersion {
			newer = candidate.SchemaVersion
			return nil
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return file, nil
	case persist.Unreadable:
		return listFile{}, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, SchemaVersion, what); err != nil {
		return listFile{}, err
	}
	if decoded.Added != nil {
		file.Added = decoded.Added
	}
	for _, list := range []struct{ from, to *[]string }{
		{&decoded.Removed, &file.Removed}, {&decoded.LeftOut, &file.LeftOut}, {&decoded.Done, &file.Done}, {&decoded.Waiting, &file.Waiting},
	} {
		if *list.from != nil {
			*list.to = *list.from
		}
	}
	return file, nil
}

// write replaces pickup-list.json through a temporary file and a rename; the caller holds the file's lock.
func (s *Service) write(file listFile) error {
	file.SchemaVersion = SchemaVersion
	path := File(s.config.Project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's pickups folder: %w", err)
	}
	bytes, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write the %s file: %w", what, err)
	}
	if err := os.Rename(temporary, path); err != nil {
		return fmt.Errorf("could not activate the %s file: %w", what, err)
	}
	return nil
}

// FixKindValue is what a decided note asks for: a pickup (record it again) or an edit.
type FixKindValue string

// The two fixes a decided note can ask for.
const (
	FixPickup FixKindValue = "pickup"
	FixEdit   FixKindValue = "edit"
)

// editCategories are fixed in the edit rather than re-recorded: the Proof page's own list
// (apps/ui/src/components/proof/resolution.ts, ADR 0470). Every other category is a pickup, the safer fix.
var editCategories = map[findings.Category]bool{
	findings.CategoryDuplicateRead: true, findings.CategoryTakeComparison: true, findings.CategoryPacing: true,
	findings.CategoryAudioQuality: true, findings.CategorySilenceCleanup: true, findings.CategoryLevelConsistency: true,
	findings.CategoryDeliveryQC: true,
}

// FixKind is the Proof page's fixKindOf in Go: extra words heard (Transcript Compare's EXTRA) and the edit categories
// are edits; everything else is a pickup. An accepted pickup is the decision "Needs pickup".
func FixKind(finding findings.Finding) FixKindValue {
	if kind, _ := finding.Evidence["kind"].(string); kind == "EXTRA" {
		return FixEdit
	}
	if editCategories[finding.Category] {
		return FixEdit
	}
	return FixPickup
}
