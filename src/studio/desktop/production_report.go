package main

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/deliveryprofile"
	"github.com/countrymanprime/narration-studio/shell/internal/production"
	"github.com/countrymanprime/narration-studio/shell/internal/productionreport"
)

// The Production page's status report export. The page sends only the narrator's choice of sections (the Include
// checkboxes; the money one is off by default); the host builds the report from
// exactly the same overview and plan the Production page just read (buildProductionOverview, bindings_production.go)
// and writes an HTML and a JSON file into the project's narration-studio/production/reports folder. It never writes
// next to the audio, never changes the time log or the plan, and never overwrites an earlier report.

// maxProductionReportNameAttempts bounds the search for a free file name when reports are exported within the same second.
const maxProductionReportNameAttempts = 100

// ProductionReportInclude is the sections the narrator ticked in the report dialog: the preview and the written file hold
// exactly these. Money is the contracted amount and the effective rate.
type ProductionReportInclude struct {
	Words      bool `json:"words"`
	Stages     bool `json:"stages"`
	Milestones bool `json:"milestones"`
	Pickups    bool `json:"pickups"`
	Delivery   bool `json:"delivery"`
	Money      bool `json:"money"`
}

// ProductionReportExport is what one export wrote: the folder (relative to the project, slash-separated) and the two
// file names in it.
type ProductionReportExport struct {
	Folder                   string `json:"folder"`
	HTMLFile                 string `json:"htmlFile"`
	JSONFile                 string `json:"jsonFile"`
	ContractedAmountIncluded bool   `json:"contractedAmountIncluded"`
	// Include echoes the sections the file holds.
	Include ProductionReportInclude `json:"include"`
}

// ProductionReportPreview is what an export would write now, built from the same Report the export renders: the HTML
// page and the JSON text byte for byte, and the folder and file stem (the name it would use now; an export a second
// later may differ). Nothing is written.
type ProductionReportPreview struct {
	HTML                     string `json:"html"`
	JSON                     string `json:"json"`
	Folder                   string `json:"folder"`
	Stem                     string `json:"stem"`
	ContractedAmountIncluded bool   `json:"contractedAmountIncluded"`
	// Include echoes the sections the preview holds.
	Include ProductionReportInclude `json:"include"`
}

// buildProductionReport builds the report both the preview and the export render; it refuses without a project.
func (h *Host) buildProductionReport(include ProductionReportInclude) (project, generatedAt string, report productionreport.Report, err error) {
	project = h.services().config.projectFolder
	if project == "" {
		return "", "", productionreport.Report{}, fmt.Errorf("open a project first; the report is kept in its narration-studio/production/reports folder")
	}
	overview, milestones, err := h.buildProductionOverview()
	if err != nil {
		return "", "", productionreport.Report{}, err
	}
	now := time.Now()
	generatedAt = now.UTC().Format(time.RFC3339)
	in := productionreport.Input{
		GeneratedAt: generatedAt, AppVersion: h.version,
		Options:    productionreport.Options{Include: productionreport.Sections(include)},
		Overview:   overview,
		Milestones: milestones,
		Now:        now,
	}
	// Each of these reads only for a section that is ticked, so a report without it never touches the pickup list or the measurement.
	if include.Pickups {
		if in.Pickups, err = h.reportPickups(overview); err != nil {
			return "", "", productionreport.Report{}, err
		}
	}
	if include.Delivery {
		in.Delivery = h.reportDelivery()
	}
	return project, generatedAt, productionreport.Build(in), nil
}

// reportPickups counts the open pickups of each chapter, in the manuscript's order, from the same merged list the Pickups page reads.
func (h *Host) reportPickups(overview production.Overview) ([]productionreport.PickupChapter, error) {
	list, err := h.pickupList().List()
	if err != nil {
		return nil, fmt.Errorf("could not read the pickup list: %w", err)
	}
	byChapter := map[string]*productionreport.PickupChapter{}
	chapters := make([]productionreport.PickupChapter, len(overview.Chapters))
	for i, chapter := range overview.Chapters {
		chapters[i].Chapter = chapter.Title
		byChapter[chapter.ID] = &chapters[i]
	}
	for _, pickup := range list.Pickups {
		row := byChapter[pickup.ChapterID]
		if row == nil || pickup.Done {
			continue
		}
		row.Open++
		if !slices.Contains(row.Kinds, pickup.Type) {
			row.Kinds = append(row.Kinds, pickup.Type)
		}
	}
	return chapters, nil
}

// reportDelivery judges the last measurement of this session against the project's delivery profile, the way Master & QC does;
// nil when nothing has been measured.
func (h *Host) reportDelivery() *productionreport.DeliveryInput {
	job := h.judgeMeasure(h.measureState())
	if len(job.Files) == 0 {
		return nil
	}
	labels := map[string]string{}
	name := ""
	if job.Profile != nil {
		name = job.Profile.Name
		for _, rule := range job.Profile.Rules {
			labels[rule.ID] = rule.Label
		}
	}
	files := make([]productionreport.DeliveryFile, len(job.Files))
	for i, file := range job.Files {
		files[i] = productionreport.DeliveryFile{Name: file.Name, Measured: file.Status == measureFileMeasured}
		for _, result := range file.Rules {
			if result.Status != deliveryprofile.StatusNotMet {
				continue
			}
			label := labels[result.RuleID]
			if label == "" {
				label = result.RuleID
			}
			files[i].Missed = append(files[i].Missed, label)
		}
	}
	return &productionreport.DeliveryInput{Profile: name, Files: files}
}

// ProductionStatusReportPreview answers the document ProductionStatusReport would write, without writing anything
// include is the same choice of sections as the export's.
func (h *Host) ProductionStatusReportPreview(include ProductionReportInclude) (string, error) {
	project, generatedAt, report, err := h.buildProductionReport(include)
	if err != nil {
		return "", err
	}
	rendered, err := report.Render()
	if err != nil {
		return "", err
	}
	stem, err := freeProductionReportStem(filepath.Join(project, filepath.FromSlash(productionreport.Dir)), generatedAt)
	if err != nil {
		return "", err
	}
	return encodeBinding(ProductionReportPreview{
		HTML: string(rendered.HTML), JSON: string(rendered.JSON), Folder: productionreport.Dir, Stem: stem,
		ContractedAmountIncluded: report.Privacy.ContractedAmountIncluded, Include: include,
	}, nil)
}

// ProductionStatusReport writes the book's status report, as an HTML and a JSON file, with the sections include ticks:
// words and finished audio, hours by stage and PFH, the deadline and milestones, the chapters held back, and
// book-wide readiness counts. include.Money is the narrator's choice to write the contracted amount and the effective
// rate; off by default, since a status report is often shared with someone the narrator would not otherwise tell their
// rate. It refuses without a project.
func (h *Host) ProductionStatusReport(include ProductionReportInclude) (string, error) {
	project, generatedAt, report, err := h.buildProductionReport(include)
	if err != nil {
		return "", err
	}
	return encodeBinding(writeProductionReport(project, generatedAt, report))
}

// writeProductionReport writes the two files under a name no earlier report has, each through a temporary file.
func writeProductionReport(project, generatedAt string, report productionreport.Report) (ProductionReportExport, error) {
	rendered, err := report.Render()
	if err != nil {
		return ProductionReportExport{}, err
	}
	folder := filepath.Join(project, filepath.FromSlash(productionreport.Dir))
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return ProductionReportExport{}, fmt.Errorf("could not create the report folder: %w", err)
	}
	stem, err := freeProductionReportStem(folder, generatedAt)
	if err != nil {
		return ProductionReportExport{}, err
	}
	for _, file := range []struct {
		name string
		data []byte
	}{{stem + ".json", rendered.JSON}, {stem + ".html", rendered.HTML}} {
		if err := writeFileAtomically(filepath.Join(folder, file.name), file.data); err != nil {
			return ProductionReportExport{}, err
		}
	}
	return ProductionReportExport{
		Folder: productionreport.Dir, HTMLFile: stem + ".html", JSONFile: stem + ".json",
		ContractedAmountIncluded: report.Privacy.ContractedAmountIncluded, Include: ProductionReportInclude(report.Privacy.Sections),
	}, nil
}

// freeProductionReportStem names a report after when it was made (production-status-20260927-180000Z), adding -2,
// -3, ... when a report of that second is already there.
func freeProductionReportStem(folder, generatedAt string) (string, error) {
	stamp := strings.NewReplacer("-", "", ":", "", "T", "-").Replace(generatedAt)
	base := "production-status-" + stamp
	for attempt := 1; attempt <= maxProductionReportNameAttempts; attempt++ {
		stem := base
		if attempt > 1 {
			stem = fmt.Sprintf("%s-%d", base, attempt)
		}
		if !reportFileExists(filepath.Join(folder, stem+".json")) && !reportFileExists(filepath.Join(folder, stem+".html")) {
			return stem, nil
		}
	}
	return "", fmt.Errorf("could not find a free name for the report in %s", productionreport.Dir)
}
