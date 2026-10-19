package productionreport

// notice is the report's first words: what it is, and what it is not (mirrors internal/deliveryreport's own framing).
const notice = "A summary of this book's logged time, pace and readiness, made on the narrator's computer from the same figures the " +
	"Production page shows. It is not an invoice or a certification: the PFH and rate come only from hours the narrator logged and " +
	"audio the app measured, never an estimate presented as a fact, and a figure with no honest input is written as \"not available\"."

// Report is the whole exported report; JSON and HTML are two renderings of it. Each section the narrator left out is
// null (and absent from the page), and Sections names the ones that were written.
type Report struct {
	SchemaVersion int          `json:"schema_version"`
	GeneratedAt   string       `json:"generated_at"`
	App           App          `json:"app"`
	Notice        string       `json:"notice"`
	Sections      []string     `json:"sections"`
	Book          *BookSummary `json:"book"`
	Stages        *Stages      `json:"stages"`
	Schedule      *Schedule    `json:"schedule"`
	Pickups       *Pickups     `json:"pickups"`
	Delivery      *Delivery    `json:"delivery"`
	Rate          *RateInfo    `json:"rate"`
	Privacy       Privacy      `json:"privacy"`
}

type App struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// BookSummary is the words section: the chapters, their words and the finished audio, all measured, never estimated.
type BookSummary struct {
	Chapters          int     `json:"chapters"`
	FinalizedChapters int     `json:"finalized_chapters"`
	WordCount         int     `json:"word_count"`
	RecordedSeconds   float64 `json:"recorded_seconds"`
	MeasuredChapters  int     `json:"measured_chapters"`
}

// Stages is the stages section: the hours logged, where they went and what they came to per finished hour, with each
// chapter's readiness. A nil BookPFH is undefined, written as "not available".
type Stages struct {
	HoursLogged  float64            `json:"hours_logged"`
	HoursByStage map[string]float64 `json:"hours_by_stage"`
	BookPFH      *float64           `json:"book_pfh"`
	Readiness    Readiness          `json:"readiness"`
}

// Schedule is the milestones section: the due date and the plan's checkpoints.
type Schedule struct {
	Deadline   *Deadline   `json:"deadline"`
	Milestones []Milestone `json:"milestones"`
}

// Pickups is the pickups section: the lines still to record again, by chapter in the manuscript's order.
type Pickups struct {
	Open     int              `json:"open"`
	Chapters []ChapterPickups `json:"chapters"`
}

// ChapterPickups is one chapter's open pickups and the kinds they are, in the order they first appear.
type ChapterPickups struct {
	Chapter string   `json:"chapter"`
	Open    int      `json:"open"`
	Kinds   []string `json:"kinds"`
}

// Delivery is the delivery section: the files the last measurement of this session covered, judged against the profile
// in force. Measured is false, and every count 0, when nothing has been measured yet: the report says so rather than
// reading it as a pass.
type Delivery struct {
	Measured  bool          `json:"measured"`
	Profile   string        `json:"profile"`
	Pass      int           `json:"pass"`
	Fail      int           `json:"fail"`
	Unchecked int           `json:"unchecked"`
	Failing   []FailingFile `json:"failing"`
	Note      string        `json:"note"`
}

// FailingFile is a measured file that misses at least one rule, with the rules it misses.
type FailingFile struct {
	File  string   `json:"file"`
	Rules []string `json:"rules"`
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

// RateInfo is the book's contracted amount and effective rate. Both are nil, and Note says why, unless the narrator
// opted in (the money section): financial figures are the one thing this report does not write by
// default, since a status report is often shared with someone the narrator would not otherwise tell their rate.
type RateInfo struct {
	ContractedAmount *float64 `json:"contracted_amount"`
	EffectiveRate    *float64 `json:"effective_rate"`
	Note             string   `json:"note"`
}

type Privacy struct {
	ContractedAmountIncluded bool   `json:"contracted_amount_included"`
	Note                     string `json:"note"`
}
