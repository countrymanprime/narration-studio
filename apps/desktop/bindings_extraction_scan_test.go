package main

import (
	"encoding/json"
	"os"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/process"
)

func decodeSources(t *testing.T) func(string, error) []ExtractionSource {
	return func(payload string, err error) []ExtractionSource {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var rows []ExtractionSource
		if err := json.Unmarshal([]byte(payload), &rows); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return rows
	}
}

func TestExtractionSourcesReportAvailabilityAndReason(t *testing.T) {
	host := &Host{sidecars: process.NewSupervisor()}
	rows := decodeSources(t)(host.ExtractionSources())
	want := []ExtractionSource{
		{ID: "rules", Label: "Rules", Icon: "auto", Runs: true, Available: true},
		{ID: "imported", Label: "Imported file", Icon: "import", Reason: "Imported file is not available yet."},
		{ID: "local-model", Label: "Local model", Icon: "globe", Runs: true, Reason: "No local model is installed."},
		{ID: "gliner", Label: "GLiNER", Icon: "locate", Runs: true, Reason: "GLiNER is not downloaded."},
		{ID: "booknlp", Label: "BookNLP", Icon: "dictionary", Runs: true, Reason: "BookNLP is not downloaded."},
	}
	if !slices.Equal(rows, want) {
		t.Fatalf("sources =\n%+v\nwant\n%+v", rows, want)
	}

	// An installed tool whose adapter is not built yet says so; the rules with no sidecar say why.
	host = &Host{extractionInstalled: func() []string { return []string{"booknlp-big"} }}
	rows = decodeSources(t)(host.ExtractionSources())
	if rows[0].Available || rows[0].Reason != "The Story Bible sidecar is not set up." {
		t.Fatalf("rules with no sidecar = %+v", rows[0])
	}
	if rows[4].Available || rows[4].Reason != "BookNLP is not available yet." {
		t.Fatalf("installed BookNLP = %+v", rows[4])
	}
}

func TestRulesCommandRunsTheProjectsManuscriptAndStoryBible(t *testing.T) {
	host := &Host{}
	if _, err := host.rulesCommand(); err == nil {
		t.Fatal("a rules command with no project was not refused")
	}
	host.config.projectFolder = t.TempDir()
	host.config.manuscriptPython = "missing.exe"
	if _, err := host.rulesCommand(); err == nil {
		t.Fatal("a rules command with no sidecar was not refused")
	}
	host.config.manuscriptPython = os.Args[0]
	command, err := host.rulesCommand()
	if err != nil || len(command.Args) != 0 || command.Program != host.config.manuscriptPython {
		t.Fatalf("frozen sidecar = %+v, %v", command, err)
	}
	host.config.manuscriptBackend = host.config.manuscriptPython
	if command, err = host.rulesCommand(); err != nil || !slices.Equal(command.Args, []string{host.config.manuscriptBackend}) {
		t.Fatalf("development sidecar = %+v, %v", command, err)
	}
}
