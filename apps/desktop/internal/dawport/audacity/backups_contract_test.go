package audacity

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
)

// go-golden-for-the-file: backups.json as writeBackups writes it, an empty table and one with two rows, pinned for
// dawBackupsFileSchema (apps/ui/src/api/schemas/daw.ts). UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-backups-*.json.
func TestBackupsFileContract(t *testing.T) {
	at := time.Date(2026, 10, 12, 9, 30, 0, 0, time.UTC)
	cases := map[string]backupsTable{
		"daw-backups-empty": {},
		"daw-backups-two": {Backups: []Backup{
			{ID: "{0F8E2A5C-1B3D-4E6F-8A9B-0C1D2E3F4A5B}", GUID: "Chapter 1", ChapterID: "ch-1", Start: 20, End: 280, CreatedAt: at},
			{ID: "{7A6B5C4D-3E2F-4109-8877-665544332211}", GUID: "Chapter 2", ChapterID: "ch-2", Start: 0, End: 134.5, CreatedAt: at.Add(time.Hour)},
		}},
	}
	for name, table := range cases {
		t.Run(name, func(t *testing.T) {
			path := BackupsFile(t.TempDir())
			if err := writeBackups(path, table); err != nil {
				t.Fatal(err)
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			read, err := readBackups(path, nil)
			if err != nil || len(read.Backups) != len(table.Backups) {
				t.Fatalf("the file the host wrote reads back as %+v, %v", read, err)
			}
			var decoded map[string]any
			if err := json.Unmarshal(raw, &decoded); err != nil {
				t.Fatal(err)
			}
			contractfile.Check(t, name, decoded)
		})
	}
}
