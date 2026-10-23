// Package productionreport builds the Production page's exported status report: one model rendered twice, as JSON for
// tools and as a self-contained HTML page for a reviewer without the app, mirroring internal/deliveryreport's own shape
// and "not a certification" framing.
//
// The output is deterministic apart from GeneratedAt: every map is written in key order and every list keeps the order
// its input already has (the same order the Production page reads). The contracted amount and the effective rate, the
// one financial pair this report can hold, are written only when the narrator opts in
// (Sections.Money): a status report is often the one thing a narrator shares with someone they would
// not otherwise tell their rate.
package productionreport

import (
	"encoding/json"
	"fmt"
	"time"

	"desktop/internal/production"
	"desktop/internal/project"
)

// SchemaVersion is the version of the JSON report this package writes.
const SchemaVersion = 2

// Dir is the sidecar folder the host writes reports to, relative to the project folder; distinct from
// narration-studio/production's own sessions.json, so an export never touches the time log.
const Dir = "narration-studio/production/reports"

// Options are the narrator's choices for one export.
type Options struct {
	// Include is the sections to write; Include.Money (the contracted amount and the effective rate) is off by default.
	Include Sections
}

// AllSections ticks every section but the money one, the dialog's first state.
var AllSections = Sections{Words: true, Stages: true, Milestones: true, Pickups: true, Delivery: true}

// PickupChapter is one chapter's open pickups as the host's pickup list has them.
type PickupChapter struct {
	Chapter string
	Open    int
	Kinds   []string
}

// DeliveryFile is one measured file's verdict against the delivery profile: Measured is false for a file the
// measurement could not read, and Missed names the rules a measured file does not meet.
type DeliveryFile struct {
	Name     string
	Measured bool
	Missed   []string
}

// DeliveryInput is the last measurement of this session, judged; nil when nothing has been measured.
type DeliveryInput struct {
	Profile string
	Files   []DeliveryFile
}

// Input is everything one report is built from. Overview is the same production.Overview the Production page reads
// (production.BuildOverview), so the report's figures never drift from what the page just showed. Milestones is the
// plan's own list (production.Plan.Milestones); Overview carries only the deadline, not the milestones.
type Input struct {
	GeneratedAt string
	AppVersion  string
	Options     Options

	Overview   production.Overview
	Milestones []project.Milestone
	// Now is the local time milestones' days-left are counted from; the host passes real time, tests a fixed one.
	Now time.Time
	// Pickups and Delivery are read only when their section is ticked: the open pickups by chapter, and the last judged measurement.
	Pickups  []PickupChapter
	Delivery *DeliveryInput
}

// Build turns the input into the report model. It never fails: an undefined figure is written as absent, not guessed at.
func Build(in Input) Report {
	include := in.Options.Include
	report := Report{
		SchemaVersion: SchemaVersion,
		GeneratedAt:   in.GeneratedAt,
		App:           App{Name: "Narration Studio", Version: in.AppVersion},
		Notice:        notice,
		Book:          BookSummary{Chapters: in.Overview.Totals.Chapters, FinalizedChapters: in.Overview.Totals.FinalizedChapters},
		Privacy:       privacyOf(include),
	}
	if include.Words {
		report.Words = wordsOf(in.Overview)
	}
	if include.Stages {
		report.Stages = stagesOf(in.Overview)
	}
	if include.Milestones {
		report.Schedule = &Schedule{Deadline: deadlineOf(in.Overview), Milestones: milestonesOf(in.Milestones, in.Now)}
	}
	if include.Pickups {
		report.HeldBack = heldBackOf(in.Overview.Chapters)
		pickups := pickupsOf(in.Pickups)
		report.Pickups = &pickups
	}
	if include.Delivery {
		readiness := readinessOf(in.Overview.Chapters)
		report.Readiness = &readiness
		delivery := deliveryOf(in.Delivery)
		report.Delivery = &delivery
	}
	if include.Money {
		rate := rateOf(in.Overview.Totals)
		report.Rate = &rate
	}
	return report
}

// JSON renders the report as indented JSON with a trailing newline.
func (r Report) JSON() ([]byte, error) {
	encoded, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("could not write the report as JSON: %w", err)
	}
	return append(encoded, '\n'), nil
}

// Rendered is the two files one report is written as: the export writes exactly these bytes, and the preview answers them.
type Rendered struct {
	HTML []byte
	JSON []byte
}

// Render renders the report both ways, so a preview and an export of one Report cannot differ.
func (r Report) Render() (Rendered, error) {
	encoded, err := r.JSON()
	if err != nil {
		return Rendered{}, err
	}
	page, err := r.HTML()
	if err != nil {
		return Rendered{}, err
	}
	return Rendered{HTML: page, JSON: encoded}, nil
}

func wordsOf(overview production.Overview) *Words {
	totals := overview.Totals
	return &Words{WordCount: totals.WordCount, RecordedSeconds: totals.RecordedSeconds, MeasuredChapters: totals.MeasuredChapters}
}

func stagesOf(overview production.Overview) *Stages {
	byStage := map[string]float64{}
	for stage, hours := range overview.Totals.HoursByStage {
		byStage[string(stage)] = hours
	}
	return &Stages{HoursLogged: overview.Totals.HoursLogged, HoursByStage: byStage, BookPFH: overview.Totals.BookPFH}
}

func heldBackOf(chapters []production.OverviewChapter) *HeldBack {
	held := HeldBack{Chapters: []HeldBackChapter{}}
	for _, chapter := range chapters {
		if chapter.Readiness != nil && chapter.Readiness.Verdict == "not_ready" {
			held.Chapters = append(held.Chapters, HeldBackChapter{ID: chapter.ID, Title: chapter.Title, Reason: chapter.Readiness.Reason})
		}
	}
	return &held
}

// pickupsOf totals the chapters that have an open pickup; a chapter with none is left out.
func pickupsOf(chapters []PickupChapter) Pickups {
	out := Pickups{Chapters: []ChapterPickups{}}
	for _, chapter := range chapters {
		if chapter.Open == 0 {
			continue
		}
		kinds := chapter.Kinds
		if kinds == nil {
			kinds = []string{}
		}
		out.Open += chapter.Open
		out.Chapters = append(out.Chapters, ChapterPickups{Chapter: chapter.Chapter, Open: chapter.Open, Kinds: kinds})
	}
	return out
}

// deliveryOf counts the measured files that meet every rule, those that miss one and those the measurement could not read.
func deliveryOf(in *DeliveryInput) Delivery {
	if in == nil || len(in.Files) == 0 {
		return Delivery{Failing: []FailingFile{}, Note: "Nothing has been measured in this session, so no file was judged against a delivery profile."}
	}
	out := Delivery{Measured: true, Profile: in.Profile, Failing: []FailingFile{},
		Note: "The files the last measurement of this session covered, judged against the delivery profile in force."}
	for _, file := range in.Files {
		switch {
		case !file.Measured:
			out.Unchecked++
		case len(file.Missed) > 0:
			out.Fail++
			out.Failing = append(out.Failing, FailingFile{File: file.Name, Rules: file.Missed})
		default:
			out.Pass++
		}
	}
	return out
}

func deadlineOf(overview production.Overview) *Deadline {
	if overview.Deadline == nil {
		return nil
	}
	return &Deadline{Date: overview.Deadline.Date, DaysLeft: overview.Deadline.DaysLeft}
}

// milestonesOf keeps the plan's own order (the narrator's), and marks each overdue as of now's calendar date.
func milestonesOf(milestones []project.Milestone, now time.Time) []Milestone {
	out := make([]Milestone, 0, len(milestones))
	for _, milestone := range milestones {
		due, err := time.Parse(time.DateOnly, milestone.DueDate)
		days := 0
		if err == nil {
			days = daysBetween(now, due)
		}
		out = append(out, Milestone{Name: milestone.Name, DueDate: milestone.DueDate, Note: milestone.Note, DaysLeft: days, Overdue: err == nil && days < 0})
	}
	return out
}

// daysBetween counts whole calendar days from now's date to due's date: the same number all day, whatever the hour
// (mirrors internal/production/overview.go's own daysBetween).
func daysBetween(now, due time.Time) int {
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	to := time.Date(due.Year(), due.Month(), due.Day(), 0, 0, 0, 0, time.UTC)
	return int(to.Sub(from).Hours() / 24)
}

func readinessOf(chapters []production.OverviewChapter) Readiness {
	var counts Readiness
	for _, chapter := range chapters {
		if chapter.Readiness == nil {
			counts.None++
			continue
		}
		switch chapter.Readiness.Verdict {
		case "recommended":
			counts.Recommended++
		case "not_ready":
			counts.NotReady++
		case "unknown":
			counts.Unknown++
		case "dismissed":
			counts.Dismissed++
		default:
			counts.None++
		}
	}
	return counts
}

func rateOf(totals production.Totals) RateInfo {
	note := "The effective rate is undefined (no contracted amount set, or no hours logged yet)."
	if totals.EffectiveRate != nil {
		note = "The contracted amount divided by every hour logged on the book."
	}
	return RateInfo{ContractedAmount: totals.ContractedAmount, EffectiveRate: totals.EffectiveRate, Note: note}
}

func privacyOf(include Sections) Privacy {
	note := "The contracted amount and effective rate are left out unless the narrator ticks the box to include them."
	if include.Money {
		note = "The narrator chose to include the contracted amount and the effective rate."
	}
	return Privacy{Sections: include, ContractedAmountIncluded: include.Money, Note: note}
}
