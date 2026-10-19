package productionreport

import "fmt"

// Section is one part of the report the narrator can leave out; the mock's report dialog offers the same six. The
// title, the notice and the privacy line are not sections: they say what the file is and are always written.
type Section string

const (
	// SectionWords is the book's chapter and word counts and its finished audio.
	SectionWords Section = "words"
	// SectionStages is the hours logged (by stage and per finished hour) and the chapters' readiness.
	SectionStages Section = "stages"
	// SectionMilestones is the deadline and the plan's milestones.
	SectionMilestones Section = "milestones"
	// SectionPickups is the open pickups, by chapter.
	SectionPickups Section = "pickups"
	// SectionDelivery is the last measurement judged against the delivery profile.
	SectionDelivery Section = "delivery"
	// SectionMoney is the contracted amount and the effective rate; the one section that is off unless asked for.
	SectionMoney Section = "money"
)

// AllSections lists every section in the order the report writes them.
var AllSections = []Section{SectionWords, SectionStages, SectionMilestones, SectionPickups, SectionDelivery, SectionMoney}

// Sections is the set of sections one export includes.
type Sections map[Section]bool

// ParseSections reads the ids the UI sends. An id that names no section is refused, so a misspelt one never silently drops a
// section from a file the narrator thinks is complete.
func ParseSections(ids []string) (Sections, error) {
	chosen := Sections{}
	for _, id := range ids {
		section := Section(id)
		if !isSection(section) {
			return nil, fmt.Errorf("%q is not a section of the status report", id)
		}
		chosen[section] = true
	}
	return chosen, nil
}

func isSection(section Section) bool {
	for _, known := range AllSections {
		if known == section {
			return true
		}
	}
	return false
}

// IDs lists the included sections in report order: what the files and the answer say was included.
func (s Sections) IDs() []string {
	ids := []string{}
	for _, section := range AllSections {
		if s[section] {
			ids = append(ids, string(section))
		}
	}
	return ids
}
