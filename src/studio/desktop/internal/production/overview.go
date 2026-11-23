package production

import (
	"time"

	"desktop/internal/stages"
)

// This file is the one read the Production page makes. BuildOverview is pure: the host hands it the chapters (status
// and measured recorded time from the manuscript, readiness from the stage recommendations), the time log and the plan,
// and it only arranges and adds them up. It never writes a chapter status and never recomputes a readiness signal: the
// board shows what the signal owners already said.

// Readiness is a chapter's current-stage verdict as the stage recommendations gave it (stages.Assessment): whether
// the stage it is at looks finished (recommended), is held back by something known (not_ready), or cannot be told
// (unknown). Reason is the first held-back or unknown signal's reason, or empty.
type Readiness struct {
	Verdict stages.Verdict `json:"verdict"`
	Target  stages.Stage   `json:"target,omitempty"`
	Reason  string         `json:"reason"`
}

// ChapterInput is one manuscript chapter as the host read it. RecordedSeconds is nil when the chapter's recorded
// length is not measured; Readiness is nil for a chapter the stage recommendations did not assess.
type ChapterInput struct {
	ID              string
	Title           string
	Subtitle        string
	ContentKind     string
	Status          stages.Stage
	WordCount       int
	RecordedSeconds *float64
	Readiness       *Readiness
}

// OverviewInput is everything BuildOverview reads. Plan is the book's deadline and contracted amount as plan.go
// validates and the project manifest keeps them: an unset one is nil, and the figures it feeds are undefined. Now is
// the local time the deadline's days are counted from.
type OverviewInput struct {
	Chapters []ChapterInput
	Sessions []Session
	Plan     Plan
	Now      time.Time
}

// OverviewChapter is one chapter's numbers on the Production page's board. The page takes the chapter's title,
// status and recorded length from the shared chapter list and joins these by ID.
type OverviewChapter struct {
	ID          string     `json:"id"`
	HoursLogged float64    `json:"hoursLogged"`
	PFH         *float64   `json:"pfh"`
	Readiness   *Readiness `json:"readiness"`
}

// Totals are the book-wide figures of the page's KPI row. A nil figure is undefined: shown as "—", never 0.
type Totals struct {
	Chapters          int                      `json:"chapters"`
	FinalizedChapters int                      `json:"finalizedChapters"`
	WordCount         int                      `json:"wordCount"`
	RecordedSeconds   float64                  `json:"recordedSeconds"`
	MeasuredChapters  int                      `json:"measuredChapters"`
	HoursLogged       float64                  `json:"hoursLogged"`
	HoursByStage      map[stages.Stage]float64 `json:"hoursByStage"`
	BookPFH           *float64                 `json:"bookPfh"`
	ContractedAmount  *float64                 `json:"contractedAmount"`
	EffectiveRate     *float64                 `json:"effectiveRate"`
}

// Deadline is the book's due date and the whole days left until it, negative once it has passed.
type Deadline struct {
	Date     string `json:"date"`
	DaysLeft int    `json:"daysLeft"`
}

// Overview is ProductionOverview's answer.
type Overview struct {
	Chapters []OverviewChapter `json:"chapters"`
	Totals   Totals            `json:"totals"`
	Deadline *Deadline         `json:"deadline"`
	Running  *Session          `json:"running"`
}

// BuildOverview arranges the chapters, the time log and the plan into the Production page's board, KPIs and
// "Next up" list.
func BuildOverview(in OverviewInput) Overview {
	recorded := map[string]float64{}
	overview := Overview{
		Chapters: make([]OverviewChapter, 0, len(in.Chapters)),
		Totals:   Totals{Chapters: len(in.Chapters), HoursByStage: HoursByStage(in.Sessions)},
	}
	for _, chapter := range in.Chapters {
		row := OverviewChapter{
			ID:          chapter.ID,
			HoursLogged: ChapterHours(in.Sessions, chapter.ID),
			Readiness:   chapter.Readiness,
		}
		if chapter.RecordedSeconds != nil && measured(*chapter.RecordedSeconds) {
			value := *chapter.RecordedSeconds
			recorded[chapter.ID] = value
			overview.Totals.RecordedSeconds += value
			overview.Totals.MeasuredChapters++
		}
		row.PFH = optional(ChapterPFH(in.Sessions, recorded, chapter.ID))
		overview.Totals.WordCount += chapter.WordCount
		if chapter.Status == stages.StageFinalized {
			overview.Totals.FinalizedChapters++
		}
		overview.Chapters = append(overview.Chapters, row)
	}
	overview.Totals.HoursLogged = LoggedHours(in.Sessions)
	overview.Totals.BookPFH = optional(BookPFH(in.Sessions, recorded))
	if amount := in.Plan.ContractedAmount; amount != nil && measured(*amount) {
		value := *amount
		overview.Totals.ContractedAmount = &value
	}
	overview.Totals.EffectiveRate = optional(EffectiveRate(in.Plan.ContractedAmount, in.Sessions))
	// The manifest only ever holds a date CheckDate accepted; one that does not parse is shown as no deadline, never
	// guessed at.
	if in.Plan.Deadline != nil {
		if due, err := time.Parse(time.DateOnly, *in.Plan.Deadline); err == nil {
			overview.Deadline = &Deadline{Date: *in.Plan.Deadline, DaysLeft: daysBetween(in.Now, due)}
		}
	}
	if index, ok := runningIn(in.Sessions); ok {
		session := in.Sessions[index].clone()
		overview.Running = &session
	}
	return overview
}

// daysBetween counts whole calendar days from now's date to due's date: the same number all day, whatever the hour.
func daysBetween(now, due time.Time) int {
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	to := time.Date(due.Year(), due.Month(), due.Day(), 0, 0, 0, 0, time.UTC)
	return int(to.Sub(from).Hours() / 24)
}

func optional(value float64, ok bool) *float64 {
	if !ok {
		return nil
	}
	return &value
}
