// Package project owns a project's own manifest, project.json: the narrator's own project name, creation date and DAW
// project (.rpp) file link. It also holds the Go-side projects-directory helpers. It knows nothing about REAPER's file
// format or the settings store; callers pass in whatever migration source (Tracks.selectedRpp) they already have.
package project

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/credits"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// Marker is the manifest's "this is a Narration Utils project" field: its presence and value, not just the file's
// existence, identify a folder as a project.
const Marker = "narration-utils-project"

const fileName = "project.json"

// Manifest is project.json's content: the project's own name, when it was
// created, and its linked DAW project file, if any.
type Manifest struct {
	Marker         string    `json:"marker"`
	Name           string    `json:"name"`
	CreatedAt      time.Time `json:"createdAt"`
	DawProjectFile *DawLink  `json:"dawProjectFile,omitempty"`
	// Credits is this project's own audiobook credit token values (title, author, copyright, ...), added additively to
	// the manifest rather than kept in a separate file. Nil on a project that has never had its credit values saved.
	Credits *credits.Values `json:"credits,omitempty"`
	// RetailSample is the range the narrator picked as the retail sample (ADR 0152), additive like Credits. Nil when
	// none is picked.
	RetailSample *credits.RetailSample `json:"retailSample,omitempty"`
	// CreditsStatus is the chapter-table row status of the opening and closing credits ("opening"/"closing" keys, one
	// of the five chapter statuses each), additive like Credits (ADR 0183). It lives here rather than in
	// manuscript-notes.json (like a chapter's own status) so it survives Replace manuscript and Clear derived data the
	// way the credits values themselves do. Nil or a missing key means "not_started", the same default a manuscript
	// chapter with no note has.
	CreditsStatus map[string]string `json:"creditsStatus,omitempty"`
	// CreditsSetup records that the narrator said "Don't ask" to the credits setup prompt for one imported manuscript
	// (ADR 0208), additive like Credits. A Replace manuscript gives a new document id, so the prompt asks again. Nil:
	// never dismissed.
	CreditsSetup *CreditsSetup `json:"creditsSetup,omitempty"`
	// ChapterSync is the narrator's answer to "Sync chapters to tracks?" (ADR 0209), additive like Credits. It lives on
	// the manifest because it is a project decision that survives Replace manuscript. Nil: not asked yet.
	ChapterSync *ChapterSync `json:"chapterSync,omitempty"`
	// DeliveryProfile is the delivery profile this project is judged against (ADR 0179), additive like Credits. Nil:
	// the Global default.
	DeliveryProfile *DeliveryProfileRef `json:"deliveryProfile,omitempty"`
	// Deadline is the book's delivery date, a calendar date "YYYY-MM-DD" (ADR 0323), additive like Credits so it
	// survives Replace manuscript: it is a business fact about the book, not the imported text. Empty: none set.
	Deadline string `json:"deadline,omitempty"`
	// ContractedAmount is what the book pays, a bare number in the narrator's own currency (ADR 0320): the effective
	// rate divides it by the hours logged. Nil: none set, so the rate is undefined.
	ContractedAmount *float64 `json:"contractedAmount,omitempty"`
	// Payment is how the book pays: "per_finished_hour", "royalty_share" or "none" (ADR 0800), additive like Credits.
	// Empty: written before the payment type existed; internal/production reads it from ContractedAmount.
	Payment string `json:"payment,omitempty"`
	// RateBasis is the schedule basis the narrator chose: "standard" or "own" (their own pace). Empty reads as standard.
	// It is a choice, not a measurement: the host never checks it against the take log.
	RateBasis string `json:"rateBasis,omitempty"`
	// Milestones are the narrator's own dated checkpoints: a generic list, the ACX 15-minute checkpoint being one the
	// narrator adds like any other. Additive like Credits.
	Milestones []Milestone `json:"milestones,omitempty"`
}

// Milestone is one dated checkpoint: a name, a calendar date "YYYY-MM-DD" and an optional note, plus what it measures,
// an estimated date, whether it is done and the template it came from (ADR 0800; each empty or false on a milestone
// saved before them). Nothing beyond the shape is validated here; internal/production checks a milestone before it is
// saved.
type Milestone struct {
	Name     string `json:"name"`
	DueDate  string `json:"dueDate"`
	Note     string `json:"note,omitempty"`
	Measure  string `json:"measure,omitempty"`
	Estimate string `json:"estimate,omitempty"`
	Done     bool   `json:"done,omitempty"`
	Template string `json:"template,omitempty"`
}

// CreditsSetup is the stored "Don't ask for this project": the manuscript document id it was said for, and when.
type CreditsSetup struct {
	DismissedFor string    `json:"dismissedFor"`
	DismissedAt  time.Time `json:"dismissedAt"`
}

// ChapterSync is the stored consent: Enabled is Sync (true) or Not now (false), and DecidedAt when the narrator chose.
type ChapterSync struct {
	Enabled   bool      `json:"enabled"`
	DecidedAt time.Time `json:"decidedAt"`
}

// DeliveryProfileRef names a delivery profile: a built-in's id and version, or a custom profile's id.
type DeliveryProfileRef struct {
	ID      string `json:"id"`
	Version string `json:"version,omitempty"`
}

// New returns a fresh manifest for a project named name, created at now.
func New(name string, now time.Time) *Manifest {
	return &Manifest{Marker: Marker, Name: name, CreatedAt: now}
}

// Path is where projectFolder's manifest lives, alongside the project's other
// narration-utils sidecar files (settings.json, manuscript-notes.json, ...).
func Path(projectFolder string) string {
	return filepath.Join(projectFolder, "narration-utils", fileName)
}

// Load reads projectFolder's manifest. A project that has none yet (never
// migrated, never created through the new-project flow) is not an error: ok is
// false and err is nil. reporter may be nil (a test, a caller that does not yet
// have one); project.json is the narrator's own data, so a file that cannot be
// decoded is kept aside and reported rather than silently discarded (ADR 0069),
// matching every other narrator-data file in this codebase (settings, notes).
func Load(reporter *persist.Reporter, projectFolder string) (*Manifest, bool, error) {
	var loaded *Manifest
	outcome := reporter.ReadJSON(Path(projectFolder), "project", persist.NarratorData, func(bytes []byte) error {
		var decoded Manifest
		if err := json.Unmarshal(bytes, &decoded); err != nil {
			return err
		}
		loaded = &decoded
		return nil
	})
	if outcome == persist.Missing {
		return nil, false, nil
	}
	if loaded == nil {
		// Healed, Quarantined or Unreadable: persist already logged and, for
		// narrator data, told the narrator and kept the original aside. The
		// caller treats this exactly like "no manifest yet" rather than failing.
		return nil, false, nil
	}
	return loaded, true, nil
}

// Save atomically writes the manifest to projectFolder's project.json, creating
// the narration-utils sidecar folder if needed. It follows the same
// write-to-temp-then-rename pattern as settings.Store.Save and the manuscript
// notes writer, so a crash mid-write never leaves a half-written manifest.
func (m *Manifest) Save(projectFolder string) error {
	path := Path(projectFolder)
	if err := persist.CanOverwrite(path, "project"); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's narration-utils folder: %w", err)
	}
	bytes, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write project.json: %w", err)
	}
	if err := os.Rename(temporary, path); err != nil {
		return fmt.Errorf("could not activate project.json: %w", err)
	}
	return nil
}
