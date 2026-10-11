package main

import (
	"encoding/json"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
)

// The payloads the UI's scan schemas are checked against: the sources of a fresh install, and a scan that ran the
// rules, skipped a source that cannot run and added suggestions.
func TestExtractionScanContractGoldens(t *testing.T) {
	payload, err := (&Host{sidecars: process.NewSupervisor()}).ExtractionSources()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "extraction-sources", payload)

	ran := &scanLog{}
	host, _, events := scanHost(t,
		scanSource{name: extractionport.Rules, runs: true, extract: offers(ran, "rules", rulesDodo, rulesDuchess, rulesRabbit)},
		scanSource{name: extractionport.LocalModel, runs: true, unavailable: "No local model is installed."})
	decodeScanJob(t)(host.ExtractionScan([]string{extractionport.LocalModel}))
	nextJobEnd(t, events)
	job := waitScan(t, host)
	id := "extraction-scan-1"
	job.ID, job.Elapsed = &id, 0
	stable, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	var decoded any
	if err := json.Unmarshal(stable, &decoded); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "extraction-scan-job", decoded)
	if job.Phase != "success" || job.Added != 3 || len(job.Sources) != 2 {
		t.Fatalf("the golden scan = %+v", job)
	}
}
