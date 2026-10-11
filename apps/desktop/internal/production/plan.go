package production

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

// This file checks the book's deadline, contracted amount, payment type and
// milestones before they are saved to the project manifest, where they survive a
// manuscript replace. Dates are calendar dates, "YYYY-MM-DD" (ADR 0323); the
// payment type and the milestone measure, estimate, done flag and template are
// ADR 0800's.

const (
	dateLayout = "2006-01-02"
	// maxMilestones, maxMilestoneName and maxMilestoneNote bound what one save
	// can put on the manifest.
	maxMilestones    = 100
	maxMilestoneName = 200
	maxMilestoneNote = 2000
	// maxMilestoneTemplate bounds a template id.
	maxMilestoneTemplate = 64
)

// The payment types (ADR 0800). Only per finished hour carries a contracted amount: a royalty share or no payment is
// a label and shows no rate figure (SNP-Q4).
const (
	PaymentPerFinishedHour = "per_finished_hour"
	PaymentRoyaltyShare    = "royalty_share"
	PaymentNone            = "none"
)

// measurePattern is every measure a milestone can have (the Studio Next mock's MEASURES): custom, all recorded, all
// edited, all proofed, all edited and proofed, the first N chapters edited and proofed (chN), the first N finished
// minutes (minN), the 15-minute checkpoint and the whole book. Whether the delivery profile offers one is not checked.
var measurePattern = regexp.MustCompile(`^(custom|rec|edit|proof|editproof|checkpoint|all|ch[1-9][0-9]{0,3}|min[1-9][0-9]{0,3})$`)

// templatePattern is a template id: a short lower-case word such as "checkpoint15".
var templatePattern = regexp.MustCompile(`^[a-z0-9_-]+$`)

// Plan is the book's deadline, contracted amount, payment type and milestones as
// the bindings answer them. Deadline and ContractedAmount are nil when unset, and
// ContractedAmount is nil whenever Payment is not per finished hour; Payment is
// always one of the three types; Milestones is never nil.
type Plan struct {
	Deadline         *string             `json:"deadline"`
	ContractedAmount *float64            `json:"contractedAmount"`
	Payment          string              `json:"payment"`
	Milestones       []project.Milestone `json:"milestones"`
}

// PlanOf reads manifest's plan fields into a Plan that shares nothing with
// it. A nil manifest (a project that has none yet) is an empty plan.
func PlanOf(manifest *project.Manifest) Plan {
	plan := Plan{Payment: PaymentNone, Milestones: []project.Milestone{}}
	if manifest == nil {
		return plan
	}
	if manifest.Deadline != "" {
		deadline := manifest.Deadline
		plan.Deadline = &deadline
	}
	plan.Payment = PaymentOf(manifest)
	if manifest.ContractedAmount != nil && plan.Payment == PaymentPerFinishedHour {
		amount := *manifest.ContractedAmount
		plan.ContractedAmount = &amount
	}
	plan.Milestones = append(plan.Milestones, manifest.Milestones...)
	return plan
}

// PaymentOf is the manifest's payment type. A manifest written before the type existed (or edited to an unknown one)
// reads as per finished hour when it has a contracted amount, since that amount was the per-finished-hour rate's
// (ADR 0320), and as none without one.
func PaymentOf(manifest *project.Manifest) string {
	if manifest == nil {
		return PaymentNone
	}
	if payment, err := CheckPayment(manifest.Payment); err == nil {
		return payment
	}
	if manifest.ContractedAmount != nil {
		return PaymentPerFinishedHour
	}
	return PaymentNone
}

// CheckPayment returns payment, trimmed, when it is one of the three payment types, and an error otherwise.
func CheckPayment(payment string) (string, error) {
	switch trimmed := strings.TrimSpace(payment); trimmed {
	case PaymentPerFinishedHour, PaymentRoyaltyShare, PaymentNone:
		return trimmed, nil
	}
	return "", fmt.Errorf("%q is not a payment type: choose per_finished_hour, royalty_share or none", payment)
}

// CheckDate returns value, trimmed, when it is a real calendar date written
// "YYYY-MM-DD", and an error otherwise.
func CheckDate(value string) (string, error) {
	value = strings.TrimSpace(value)
	if _, err := time.Parse(dateLayout, value); err != nil {
		return "", fmt.Errorf("%q is not a date written YYYY-MM-DD", value)
	}
	return value, nil
}

// CheckAmount accepts no amount (nil clears it) or a finite, non-negative
// number. The amount is the narrator's own currency; nothing converts it.
func CheckAmount(amount *float64) error {
	if amount != nil && !measured(*amount) {
		return errors.New("the contracted amount must be a number of zero or more")
	}
	return nil
}

// CleanMilestones trims every milestone's fields and refuses the list when any
// milestone has no name, has no real date, is too long, has a measure that is
// not one, an estimate that is not a real date or that a custom milestone (no
// measure, or "custom") cannot have, or a template id that is not one, or when
// there are too many. Their order is the narrator's own. Whether the project's
// delivery profile offers a measure is not checked here.
func CleanMilestones(milestones []project.Milestone) ([]project.Milestone, error) {
	if len(milestones) > maxMilestones {
		return nil, fmt.Errorf("a book can have at most %d milestones", maxMilestones)
	}
	out := make([]project.Milestone, 0, len(milestones))
	for index, milestone := range milestones {
		name := strings.TrimSpace(milestone.Name)
		note := strings.TrimSpace(milestone.Note)
		switch {
		case name == "":
			return nil, fmt.Errorf("milestone %d needs a name", index+1)
		case utf8.RuneCountInString(name) > maxMilestoneName:
			return nil, fmt.Errorf("milestone %d's name is longer than %d characters", index+1, maxMilestoneName)
		case utf8.RuneCountInString(note) > maxMilestoneNote:
			return nil, fmt.Errorf("milestone %d's note is longer than %d characters", index+1, maxMilestoneNote)
		}
		due, err := CheckDate(milestone.DueDate)
		if err != nil {
			return nil, fmt.Errorf("milestone %d (%s): %w", index+1, name, err)
		}
		cleaned := project.Milestone{Name: name, DueDate: due, Note: note, Done: milestone.Done}
		if err := cleanMeasure(&cleaned, milestone); err != nil {
			return nil, fmt.Errorf("milestone %d (%s): %w", index+1, name, err)
		}
		out = append(out, cleaned)
	}
	return out, nil
}

// cleanMeasure checks milestone's measure, estimate and template and sets them, trimmed, on cleaned.
func cleanMeasure(cleaned *project.Milestone, milestone project.Milestone) error {
	measure := strings.TrimSpace(milestone.Measure)
	if measure != "" && !measurePattern.MatchString(measure) {
		return fmt.Errorf("%q is not a measure", measure)
	}
	if estimate := strings.TrimSpace(milestone.Estimate); estimate != "" {
		if measure == "" || measure == "custom" {
			return errors.New("a custom milestone has no estimate")
		}
		checked, err := CheckDate(estimate)
		if err != nil {
			return fmt.Errorf("the estimate: %w", err)
		}
		cleaned.Estimate = checked
	}
	template := strings.TrimSpace(milestone.Template)
	if template != "" && (len(template) > maxMilestoneTemplate || !templatePattern.MatchString(template)) {
		return fmt.Errorf("%q is not a template id", template)
	}
	cleaned.Measure = measure
	cleaned.Template = template
	return nil
}
