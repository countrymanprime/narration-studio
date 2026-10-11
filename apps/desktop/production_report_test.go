package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

// The Production page's status report export (ProductionStatusReport): the host builds it from exactly
// the overview and plan ProductionOverview just answered, and writes it into the project's own
// narration-utils/production/reports folder, never over an earlier report.

func TestProductionStatusReportRequiresAnOpenProject(t *testing.T) {
	host := NewHost()
	if _, err := host.ProductionStatusReport(false); err == nil {
		t.Fatal("want an error with no project open")
	}
}

func TestProductionStatusReportWritesFilesAndLeavesOutTheContractedAmountByDefault(t *testing.T) {
	host := productionHost(t)
	answer := decodeAnswer(t)(host.ProductionStatusReport(false))
	if answer["contractedAmountIncluded"] != false {
		t.Fatalf("want the contracted amount left out by default, got %v", answer)
	}
	folder, _ := answer["folder"].(string)
	if folder != "narration-utils/production/reports" {
		t.Fatalf("want the reports folder, got %q", folder)
	}
	htmlFile, _ := answer["htmlFile"].(string)
	jsonFile, _ := answer["jsonFile"].(string)
	for _, name := range []string{htmlFile, jsonFile} {
		path := filepath.Join(host.config.projectFolder, filepath.FromSlash(folder), name)
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected %s to exist: %v", path, err)
		}
	}
	written, err := os.ReadFile(filepath.Join(host.config.projectFolder, filepath.FromSlash(folder), jsonFile))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(written), "\"contracted_amount_included\": true") {
		t.Fatal("the written report should not say the amount was included")
	}
}

func TestProductionStatusReportIncludesTheContractedAmountWhenAsked(t *testing.T) {
	host := productionHost(t)
	answer := decodeAnswer(t)(host.ProductionStatusReport(true))
	if answer["contractedAmountIncluded"] != true {
		t.Fatalf("want the contracted amount included, got %v", answer)
	}
}

func TestProductionStatusReportNeverOverwritesAnEarlierReport(t *testing.T) {
	host := productionHost(t)
	first := decodeAnswer(t)(host.ProductionStatusReport(false))
	second := decodeAnswer(t)(host.ProductionStatusReport(false))
	if first["jsonFile"] == second["jsonFile"] {
		t.Fatalf("two exports named the same file: %v", first["jsonFile"])
	}
}

// TestContractProductionStatusReport pins ProductionStatusReport's payload as the UI receives it, with the dated file
// names fixed: they carry the export time, which contractfile.Stabilize does not normalize (it is not RFC 3339).
func TestContractProductionStatusReport(t *testing.T) {
	host := productionHost(t)
	answer := decodeAnswer(t)(host.ProductionStatusReport(false))
	answer["htmlFile"] = "production-status-20260921-100000Z.html"
	answer["jsonFile"] = "production-status-20260921-100000Z.json"
	stable, err := contractfile.Stabilize(answer)
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "production-status-report", stable)
}

// ProductionStatusReportPreview (ADR 0843): the document an export would write, built from the same Report and
// answered without writing anything.

func previewOf(t *testing.T, host *Host, include bool) map[string]any {
	t.Helper()
	return decodeAnswer(t)(host.ProductionStatusReportPreview(include))
}

func TestProductionStatusReportPreviewEqualsTheWrittenFile(t *testing.T) {
	host := productionHost(t)
	for attempt := 0; attempt < 5; attempt++ {
		preview := previewOf(t, host, true)
		exported := decodeAnswer(t)(host.ProductionStatusReport(true))
		folder := filepath.Join(host.config.projectFolder, filepath.FromSlash(exported["folder"].(string)))
		writtenJSON, err := os.ReadFile(filepath.Join(folder, exported["jsonFile"].(string)))
		if err != nil {
			t.Fatal(err)
		}
		writtenHTML, err := os.ReadFile(filepath.Join(folder, exported["htmlFile"].(string)))
		if err != nil {
			t.Fatal(err)
		}
		// The report carries its generation second; an attempt that straddled a second boundary is tried again.
		if preview["json"] != string(writtenJSON) && generatedAt(preview["json"].(string)) != generatedAt(string(writtenJSON)) {
			continue
		}
		if preview["json"] != string(writtenJSON) || preview["html"] != string(writtenHTML) {
			t.Fatal("the preview is not byte for byte the written file")
		}
		return
	}
	t.Fatal("could not preview and export within one second")
}

func TestProductionStatusReportPreviewWritesNothing(t *testing.T) {
	host := productionHost(t)
	reports := filepath.Join(host.config.projectFolder, filepath.FromSlash("narration-utils/production/reports"))
	before, _ := os.ReadDir(filepath.Join(host.config.projectFolder, "narration-utils", "production"))
	previewOf(t, host, true)
	if _, err := os.Stat(reports); !os.IsNotExist(err) {
		t.Fatalf("a preview created the reports folder: %v", err)
	}
	after, _ := os.ReadDir(filepath.Join(host.config.projectFolder, "narration-utils", "production"))
	if len(before) != len(after) {
		t.Fatalf("a preview changed the production folder: %d -> %d entries", len(before), len(after))
	}
}

func TestProductionStatusReportPreviewKeepsTheContractedAmountOptIn(t *testing.T) {
	host := productionHost(t)
	amount := 1234.5
	if _, err := host.ProductionSetDeadline("2099-01-01", &amount); err != nil {
		t.Fatal(err)
	}
	left := previewOf(t, host, false)
	if left["contractedAmountIncluded"] != false || strings.Contains(left["json"].(string), "1234.5") {
		t.Fatalf("the preview leaked the amount: %v", left["json"])
	}
	if strings.Contains(left["html"].(string), "1234.50") {
		t.Fatal("the HTML names the contracted amount without the opt-in")
	}
	included := previewOf(t, host, true)
	if included["contractedAmountIncluded"] != true || !strings.Contains(included["json"].(string), "1234.5") || !strings.Contains(included["html"].(string), "1234.50") {
		t.Fatalf("the opted-in preview misses the amount: %v", included["json"])
	}
}

func TestProductionStatusReportPreviewRequiresAnOpenProject(t *testing.T) {
	_, previewErr := NewHost().ProductionStatusReportPreview(false)
	_, exportErr := NewHost().ProductionStatusReport(false)
	if previewErr == nil || exportErr == nil || previewErr.Error() != exportErr.Error() {
		t.Fatalf("want the export's own sentence, got %v and %v", previewErr, exportErr)
	}
}

func TestProductionStatusReportPreviewNamesTheNextFile(t *testing.T) {
	host := productionHost(t)
	first := previewOf(t, host, false)
	if first["folder"] != "narration-utils/production/reports" {
		t.Fatalf("folder = %v", first["folder"])
	}
	// The preview's stem is the name it would use now; an export a later second may name differently.
	exported := decodeAnswer(t)(host.ProductionStatusReport(false))
	next := previewOf(t, host, false)
	taken := strings.TrimSuffix(exported["jsonFile"].(string), ".json")
	if next["stem"] == taken {
		t.Fatalf("the preview offered the stem %v an earlier report already holds", taken)
	}
	if strings.HasPrefix(first["stem"].(string), "production-status-") == false {
		t.Fatalf("stem = %v", first["stem"])
	}
}

func TestProductionStatusReportPreviewHTMLHasNoScriptAndEscapesText(t *testing.T) {
	host := productionHost(t)
	if _, err := host.ProductionSaveMilestones([]project.Milestone{{Name: "<script>alert(1)</script>", DueDate: "2099-01-01"}}); err != nil {
		t.Fatal(err)
	}
	page := previewOf(t, host, false)["html"].(string)
	if strings.Contains(strings.ToLower(page), "<script") || !strings.Contains(page, "&lt;script&gt;") {
		t.Fatalf("the page does not escape markup in a milestone name")
	}
}

func TestContractProductionStatusReportPreview(t *testing.T) {
	host := productionHost(t)
	answer := previewOf(t, host, false)
	answer["stem"] = "production-status-20260921-100000Z"
	answer["json"] = "{}\n"
	answer["html"] = "<!doctype html>\n"
	stable, err := contractfile.Stabilize(answer)
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "production-status-report-preview", stable)
}

func generatedAt(reportJSON string) string {
	var doc struct {
		GeneratedAt string `json:"generated_at"`
	}
	_ = json.Unmarshal([]byte(reportJSON), &doc)
	return doc.GeneratedAt
}
