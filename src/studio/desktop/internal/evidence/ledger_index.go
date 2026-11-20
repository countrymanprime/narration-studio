package evidence

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"desktop/internal/persist"
)

// ledgerIndex keeps the ledger's decoded records between reads. A record file is written once under a random ID
// (LedgerStore.Write) and never rewritten in place, so a record stays good for as long as its file's size and
// modification time do. Every read still lists the folder: a file another LedgerStore wrote is decoded on the next read, and
// one that is gone (a manuscript replace clears the folder) is dropped. Without it, one chapter-list read of a 44 chapter
// book decoded the whole ledger about 180 times (issue 3749).
type ledgerIndex struct {
	mu sync.Mutex
	// +checklocks:mu
	records map[string]indexedRecord
	// decodes counts the record files read and decoded, for the tests that guard the work a read does.
	// +checklocks:mu
	decodes int
}

// indexedRecord is one file's decoded record and the file state it was decoded from. readable is false for a file whose
// content did not decode, which is remembered too, so a corrupt neighbour is reported once and not on every read.
type indexedRecord struct {
	size     int64
	modTime  time.Time
	record   LedgerRecord
	readable bool
}

// refresh lists dir and returns its readable records, decoding with read only the files that are new or changed since the
// last call. The lock is held across the listing and the decoding, so reads that arrive together decode each file once and
// an older listing never drops what a newer one found. A file that could not be read at all (locked, or gone since the
// listing) is left out of this answer and tried again on the next read. A folder that is not there holds no records.
func (index *ledgerIndex) refresh(dir string, read func(id string) (LedgerRecord, persist.Outcome)) ([]LedgerRecord, error) {
	index.mu.Lock()
	defer index.mu.Unlock()
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		index.records = nil
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("could not list the analysis ledger: %w", err)
	}
	kept := make(map[string]indexedRecord, len(entries))
	records := make([]LedgerRecord, 0, len(entries))
	for _, entry := range entries {
		id, ok := recordID(entry.Name())
		if !ok {
			continue
		}
		info, err := entry.Info()
		if err == nil && entry.Type()&os.ModeSymlink != 0 {
			// The listing describes the link; the record is the file it points to.
			info, err = os.Stat(filepath.Join(dir, entry.Name()))
		}
		if err != nil {
			continue
		}
		held, found := index.records[id]
		if !found || held.size != info.Size() || !held.modTime.Equal(info.ModTime()) {
			record, outcome := read(id)
			index.decodes++
			if outcome != persist.Loaded && outcome != persist.Healed {
				continue
			}
			held = indexedRecord{size: info.Size(), modTime: info.ModTime(), record: record, readable: outcome == persist.Loaded}
		}
		kept[id] = held
		if held.readable {
			records = append(records, held.record)
		}
	}
	index.records = kept
	return records, nil
}
