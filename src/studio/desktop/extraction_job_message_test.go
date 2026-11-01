package main

import (
	"errors"
	"regexp"
	"testing"
)

// scanAddedMessage is the leading text the UI reads off a finished scan's job-ended message to offer its "Show them" button:
// SCAN_ADDED in src/studio/ui/src/jobEnded.ts. A wording change here must change that regex too, so this test fails first.
var scanAddedMessage = regexp.MustCompile(`^([1-9][0-9]*) suggestions? added`)

func finishedScanMessage(added, skipped int, err error, cancelled bool) string {
	job := &extractionScanJob{}
	job.mu.Lock()
	job.added, job.skipped = added, skipped
	job.mu.Unlock()
	job.finish(err, cancelled)
	job.mu.RLock()
	defer job.mu.RUnlock()
	return job.message
}

func TestScanSuccessMessageLeadsWithTheCountTheUIReads(t *testing.T) {
	cases := []struct {
		name           string
		added, skipped int
		want           string
		offers         bool
	}{
		{"many", 2, 1, "2 suggestions added; 1 already offered or rejected before.", true},
		{"one", 1, 0, "1 suggestion added.", true},
		{"many, none skipped", 5, 0, "5 suggestions added.", true},
		{"none", 0, 3, "0 suggestions added; 3 already offered or rejected before.", false},
	}
	for _, c := range cases {
		got := finishedScanMessage(c.added, c.skipped, nil, false)
		if got != c.want {
			t.Errorf("%s: message %q, want %q", c.name, got, c.want)
		}
		if scanAddedMessage.MatchString(got) != c.offers {
			t.Errorf("%s: the UI's SCAN_ADDED reads %q as offers=%v, want %v", c.name, got, !c.offers, c.offers)
		}
	}
}

func TestScanErrorAndCancelledMessagesKeepTheirCountOutOfTheLeadingFormat(t *testing.T) {
	// The UI offers no "Show them" for these: a cancelled scan raises no toast, and an error toast leads with the error.
	if got, want := finishedScanMessage(2, 0, errors.New("boom"), false), "The scan did not finish: boom. Kept 2 suggestions from the sources that finished."; got != want {
		t.Errorf("error message %q, want %q", got, want)
	}
	if got, want := finishedScanMessage(2, 0, nil, true), "Scan cancelled. Kept 2 suggestions from the sources that finished."; got != want {
		t.Errorf("cancelled message %q, want %q", got, want)
	}
	for _, message := range []string{
		finishedScanMessage(2, 0, errors.New("boom"), false),
		finishedScanMessage(2, 0, nil, true),
	} {
		if scanAddedMessage.MatchString(message) {
			t.Errorf("%q must not match the UI's SCAN_ADDED", message)
		}
	}
}
