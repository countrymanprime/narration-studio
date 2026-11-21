package evidence

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"desktop/internal/persist"
)

// ledgerIndex keeps the ledger's decoded records between reads, each held by the hash of the bytes it was decoded from. Every read
// lists the folder, then reads and hashes each record file and decodes only the ones whose bytes are new: a file another LedgerStore
// wrote is decoded on the next read, one rewritten in any way is decoded again, and one that is gone (a manuscript replace clears the
// folder) is dropped. Without it, one chapter-list read of a 44 chapter book decoded the whole ledger about 180 times (issue 3749).
type ledgerIndex struct {
	mu sync.Mutex
	// records holds, by record id, what each file last read as. Bytes that did not decode are held too (persist.ReadHeld), so a
	// corrupt neighbour is reported once and not on every read.
	// +checklocks:mu
	records map[string]persist.Held[LedgerRecord]
	// listings and decodes count the folder listings and the record files decoded, for the tests that guard the work a
	// read does.
	// +checklocks:mu
	listings int
	// +checklocks:mu
	decodes int
}

// ledgerRecordName names a record file in the host log.
const ledgerRecordName = "analysis ledger record"

// refresh lists dir and returns its readable records, decoding with decode only the files whose bytes are new since the last call.
// The lock is held across the listing and the reading, so reads that arrive together decode each file once and
// an older listing never drops what a newer one found. A file that could not be read at all (locked, or gone since the
// listing) is left out of this answer and tried again on the next read. A folder that is not there holds no records.
func (index *ledgerIndex) refresh(dir string, reporter *persist.Reporter, decode func(path string, raw []byte) (LedgerRecord, error)) ([]LedgerRecord, error) {
	index.mu.Lock()
	defer index.mu.Unlock()
	index.listings++
	entries, err := persist.ReadDir(dir)
	if os.IsNotExist(err) {
		index.records = nil
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("could not list the analysis ledger: %w", err)
	}
	kept := make(map[string]persist.Held[LedgerRecord], len(entries))
	records := make([]LedgerRecord, 0, len(entries))
	decodes := 0
	for _, entry := range entries {
		id, ok := recordID(entry.Name())
		if !ok {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		held := index.records[id]
		record, outcome := persist.ReadHeld(reporter, path, ledgerRecordName, persist.Disposable, &held, func(raw []byte) (LedgerRecord, error) {
			decodes++
			return decode(path, raw)
		})
		switch outcome {
		case persist.Loaded:
			records = append(records, record)
			kept[id] = held
		case persist.Healed:
			kept[id] = held
		}
	}
	index.decodes += decodes
	index.records = kept
	return records, nil
}

// put holds record as what the file of id reads as, for the store that just wrote those bytes: its next read hashes the file and
// decodes nothing.
func (index *ledgerIndex) put(id string, sum persist.Digest, record LedgerRecord) {
	index.mu.Lock()
	defer index.mu.Unlock()
	if index.records == nil {
		index.records = map[string]persist.Held[LedgerRecord]{}
	}
	held := index.records[id]
	held.Set(sum, record)
	index.records[id] = held
}
