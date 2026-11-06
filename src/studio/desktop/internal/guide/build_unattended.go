package guide

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// A build nobody started by hand: the one a manuscript import starts when Build the Story Bible after import is on (#3092). It is the
// narrator's build with three differences. It files the scan's names by the confidence rule (build_confidence.go), so a name is a
// Character or a Place only on evidence and every other name waits under Needs Review. It builds only a Story Bible with no entries,
// so it never regenerates entries the narrator has looked at. And it reports what it did and what it left out, for the narrator to see.

// ErrBibleNotEmpty is BuildUnattended's answer for a Story Bible that already has entries: nothing was built or written.
var ErrBibleNotEmpty = errors.New("the Story Bible already has entries")

// UnattendedReport is what an unattended build did.
type UnattendedReport struct {
	Characters, Places, Review, Other int
	// LeftOut are the names the scan found that are named fewer than three times, so no entry was made for them: each by its most used
	// spelling, the strongest evidence first.
	LeftOut []string
	// Model is whether the language model's spans were among the evidence.
	Model bool
}

// maxLeftOutNamed is how many left-out names the report's sentence names; the log has them all.
const maxLeftOutNamed = 8

// Sentence is the report as the narrator reads it when the build ends.
func (r UnattendedReport) Sentence() string {
	var b strings.Builder
	fmt.Fprintf(&b, "Story Bible built from the import: %s and %s", plural(r.Characters, "character", "characters"), plural(r.Places, "place", "places"))
	if r.Other > 0 {
		fmt.Fprintf(&b, ", %s", plural(r.Other, "other entry", "other entries"))
	}
	if r.Review > 0 {
		fmt.Fprintf(&b, "; %s to check under Needs review", plural(r.Review, "name", "names"))
	}
	b.WriteString(".")
	if n := len(r.LeftOut); n > 0 {
		named := r.LeftOut[:min(n, maxLeftOutNamed)]
		fmt.Fprintf(&b, " Left out, named only once or twice: %s", strings.Join(named, ", "))
		if n > len(named) {
			fmt.Fprintf(&b, " and %d more", n-len(named))
		}
		b.WriteString(".")
	}
	if !r.Model {
		b.WriteString(" Built without the language model.")
	}
	return b.String()
}

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

// BuildUnattended is Build for a build nobody started by hand. model is as for Build. A Story Bible with entries is ErrBibleNotEmpty and
// writes nothing. The log ends with every name left out.
func (s *Service) BuildUnattended(progress, log, model string) (UnattendedReport, error) {
	if s.project == "" {
		return UnattendedReport{}, errNoProject
	}
	report := &UnattendedReport{}
	run := &buildRun{progress: progress, log: log, unattended: report}
	_, refreshErr, err := s.build(context.Background(), run, model, true)
	if errors.Is(err, ErrBibleNotEmpty) {
		run.say("The Story Bible already has entries, so this build left it as it was.")
		return UnattendedReport{}, err
	}
	if err != nil {
		run.fail(err)
		return UnattendedReport{}, err
	}
	if len(report.LeftOut) > 0 {
		run.say("Left out, named fewer than 3 times: " + strings.Join(report.LeftOut, ", "))
	}
	if refreshErr != nil {
		return *report, refreshErr
	}
	_ = s.SaveFindings() // best-effort, as for Build
	return *report, nil
}

// bibleHasEntries is whether a Story Bible file, as readPrevious read it, holds at least one entry.
func bibleHasEntries(bible any) bool {
	document, ok := bible.(*pyObject)
	if !ok {
		return false
	}
	entries, _ := pyGet(document, "entities", []any{})
	list, ok := entries.([]any)
	return ok && len(list) > 0
}

// countCategories adds each entry's category to the report.
func (r *UnattendedReport) countCategories(entries []freshEntity) {
	for _, entry := range entries {
		switch entry.object.values["category"] {
		case categoryCharacter:
			r.Characters++
		case categoryPlace:
			r.Places++
		case categoryNeedsReview:
			r.Review++
		default:
			r.Other++
		}
	}
}
