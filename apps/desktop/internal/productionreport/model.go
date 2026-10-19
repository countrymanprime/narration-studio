package productionreport

// notice is the report's first words: what it is, and what it is not (mirrors internal/deliveryreport's own framing).
const notice = "A summary of this book's logged time, pace and readiness, made on the narrator's computer from the same figures the " +
	"Production page shows. It is not an invoice or a certification: the PFH and rate come only from hours the narrator logged and " +
	"audio the app measured, never an estimate presented as a fact, and a figure with no honest input is written as \"not available\"."

// Report is the whole exported report; JSON and HTML are two renderings of it. Each section the narrator can untick
// (Sections) is a pointer that is nil, and so left out of both renderings, when unticked.
type Report struct {
	SchemaVersion int         `json:"schema_version"`
	GeneratedAt   string      `json:"generated_at"`
	App           App         `json:"app"`
	Notice        string      `json:"notice"`
	Book          BookSummary `json:"book"`
	Words         *Words      `json:"words,omitempty"`
	Stages        *Stages     `json:"stages,omitempty"`
	Schedule      *Schedule   `json:"schedule,omitempty"`
	HeldBack      *HeldBack   `json:"held_back,omitempty"`
	Readiness     *Readiness  `json:"readiness,omitempty"`
	Rate          *RateInfo   `json:"rate,omitempty"`
	Privacy       Privacy     `json:"privacy"`
}

type App struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// BookSummary is the chapter count, written whatever is ticked.
type BookSummary struct {
	Chapters          int `json:"chapters"`
	FinalizedChapters int `json:"finalized_chapters"`
}

// Words is the "words" section: the book's word count and finished audio, measured, never estimated.
type Words struct {
	WordCount        int     `json:"word_count"`
	RecordedSeconds  float64 `json:"recorded_seconds"`
	MeasuredChapters int     `json:"measured_chapters"`
}

// Stages is the "stages" section: the hours the narrator logged, by stage, and the book's hours per finished hour. A nil
// BookPFH is undefined, written as "not available".
type Stages struct {
	HoursLogged  float64            `json:"hours_logged"`
	HoursByStage map[string]float64 `json:"hours_by_stage"`
	BookPFH      *float64           `json:"book_pfh"`
}

// Schedule is the "milestones" section: the deadline and the plan's milestones.
type Schedule struct {
	Deadline   *Deadline   `json:"deadline"`
	Milestones []Milestone `json:"milestones"`
}

// HeldBack is the "pickups" section: the chapters whose stage readiness is held back, with the reason the stage
// recommendations gave (for example "2 pickups open").
type HeldBack struct {
	Chapters []HeldBackChapter `json:"chapters"`
}

// HeldBackChapter is one chapter whose current stage is held back.
type HeldBackChapter struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Reason string `json:"reason"`
}

// Deadline is the book's due date and the whole days left as of GeneratedAt, negative once it has passed.
type Deadline struct {
	Date     string `json:"date"`
	DaysLeft int    `json:"days_left"`
}

// Milestone is one dated checkpoint as of GeneratedAt: DaysLeft is negative, and Overdue true, once its date has passed.
type Milestone struct {
	Name     string `json:"name"`
	DueDate  string `json:"due_date"`
	Note     string `json:"note,omitempty"`
	DaysLeft int    `json:"days_left"`
	Overdue  bool   `json:"overdue"`
}

// Readiness counts every chapter by its current-stage verdict (never recomputed here, read as the stage
// recommendations gave it): recommended, not_ready, unknown, dismissed, or none for a chapter not assessed.
type Readiness struct {
	Recommended int `json:"recommended"`
	NotReady    int `json:"not_ready"`
	Unknown     int `json:"unknown"`
	Dismissed   int `json:"dismissed"`
	None        int `json:"none"`
}

// RateInfo is the book's contracted amount and effective rate, written only when the narrator ticked the money section
// (Sections.Money, off by default): a status report is often shared with someone the narrator would not otherwise tell
// their rate.
type RateInfo struct {
	ContractedAmount *float64 `json:"contracted_amount"`
	EffectiveRate    *float64 `json:"effective_rate"`
	Note             string   `json:"note"`
}

// Sections records which sections the narrator ticked, so a reader can tell a section left out from one that is empty.
type Sections struct {
	Words      bool `json:"words"`
	Stages     bool `json:"stages"`
	Milestones bool `json:"milestones"`
	Pickups    bool `json:"pickups"`
	Delivery   bool `json:"delivery"`
	Money      bool `json:"money"`
}

type Privacy struct {
	Sections                 Sections `json:"sections"`
	ContractedAmountIncluded bool     `json:"contracted_amount_included"`
	Note                     string   `json:"note"`
}
