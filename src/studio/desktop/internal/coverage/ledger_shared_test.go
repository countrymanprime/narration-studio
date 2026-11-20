package coverage

import (
	"reflect"
	"testing"

	"desktop/internal/evidence"
)

// The ledger store hands every reader the same decoded records (evidence.LedgerStore.All), so a reader that changed one
// would change it for every later read. After every kind of read this package makes, the store's records still equal what
// a fresh store decodes from the files.
func TestCoverageReadsLeaveTheLedgersRecordsAsTheyAreOnDisk(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{present: 8})
	run(t, service, testRequest())

	recordedFractions(service)
	service.CurrentParagraphs(DefaultAlignmentParams)
	if _, err := service.Result(testChapter, DefaultAlignmentParams); err != nil {
		t.Fatal(err)
	}
	project, projectFile, err := service.savedProject()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ResultIn(project, projectFile, testChapter, DefaultAlignmentParams); err != nil {
		t.Fatal(err)
	}
	if _, err := service.latestRecord(testChapter); err != nil {
		t.Fatal(err)
	}

	held, err := service.ledger.All()
	if err != nil {
		t.Fatal(err)
	}
	onDisk, err := evidence.NewLedgerStore(p.dir).All()
	if err != nil {
		t.Fatal(err)
	}
	if len(held) == 0 || !reflect.DeepEqual(byID(held), byID(onDisk)) {
		t.Fatalf("after the reads the store holds\n%+v\nbut the files hold\n%+v", held, onDisk)
	}
}

func byID(records []evidence.LedgerRecord) map[string]evidence.LedgerRecord {
	out := make(map[string]evidence.LedgerRecord, len(records))
	for _, record := range records {
		out[record.ID] = record
	}
	return out
}
