// Package repeats parses a pickup and duplicate scan's tagged output
// (SUMMARY and SPAN_GROUP/SPAN_MEMBER lines, written by
// internal/comparerun's FindRepeats from the reads the Transcript Compare
// sidecar's --find-repeats heard) and adapts it into findings.Finding
// records for the pickup and duplicate_read categories
// (docs/utilities/take-review.md).
//
// It only reshapes the scan's groups into the findings contract
// (src/studio/desktop/internal/findings). It does not read the project
// model, choose a scan scope, run the scan, create takes or write to a
// findings store: the internal/takereview scan service does that.
package repeats

import (
	"bufio"
	"fmt"
	"strconv"
	"strings"
)

// Member is one read (an item, or one take of an item) that a SPAN_GROUP
// clustered with others because it covers the same manuscript span.
type Member struct {
	ItemIndex      int
	ItemGUID       string
	TakeGUID       string
	SourceFile     string
	StartOffset    float64
	Length         float64
	FirstUnit      int
	LastUnit       int
	Coverage       float64 // fraction of the group's manuscript span this read covers
	Quality        float64 // fraction of aligned tokens that matched the manuscript exactly
	ExactCopyGroup string  // shared across members with byte-identical source ranges; empty if none
}

// Group is one cluster of reads the sidecar judged to cover the same
// manuscript span: an inclusive [FirstUnit, LastUnit] sentence-unit range.
type Group struct {
	ID        int
	FirstUnit int
	LastUnit  int
	Members   []Member
}

// ParseOutput reads a scan's tagged lines (SUMMARY plus
// SPAN_GROUP/SPAN_MEMBER) and returns the parsed groups, in the order
// SPAN_GROUP lines appeared. Unrecognized tags, such as the NEED_CHAPTER
// line of a scan whose track matched no chapter, are ignored.
func ParseOutput(text string) ([]Group, error) {
	byID := map[int]*Group{}
	var order []int

	scanner := bufio.NewScanner(strings.NewReader(text))
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		fields := strings.Split(line, "|")
		switch fields[0] {
		case "SPAN_GROUP":
			g, err := parseSpanGroup(fields)
			if err != nil {
				return nil, err
			}
			byID[g.ID] = g
			order = append(order, g.ID)
		case "SPAN_MEMBER":
			m, groupID, err := parseSpanMember(fields)
			if err != nil {
				return nil, err
			}
			g, ok := byID[groupID]
			if !ok {
				return nil, fmt.Errorf("repeats: SPAN_MEMBER references unknown group %d", groupID)
			}
			g.Members = append(g.Members, m)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	groups := make([]Group, 0, len(order))
	for _, id := range order {
		groups = append(groups, *byID[id])
	}
	return groups, nil
}

func parseSpanGroup(fields []string) (*Group, error) {
	// SPAN_GROUP|<group_id>|<first_unit>|<last_unit>|<member_count>
	if len(fields) < 5 {
		return nil, fmt.Errorf("repeats: malformed SPAN_GROUP line (want 5 fields, got %d)", len(fields))
	}
	id, err := strconv.Atoi(fields[1])
	if err != nil {
		return nil, fmt.Errorf("repeats: SPAN_GROUP id: %w", err)
	}
	first, err := strconv.Atoi(fields[2])
	if err != nil {
		return nil, fmt.Errorf("repeats: SPAN_GROUP first_unit: %w", err)
	}
	last, err := strconv.Atoi(fields[3])
	if err != nil {
		return nil, fmt.Errorf("repeats: SPAN_GROUP last_unit: %w", err)
	}
	return &Group{ID: id, FirstUnit: first, LastUnit: last}, nil
}

func parseSpanMember(fields []string) (Member, int, error) {
	// SPAN_MEMBER|group|item_index|item_guid|take_guid|source_file|start_offset|length|first_u|last_u|coverage|quality|exact_copy
	if len(fields) < 13 {
		return Member{}, 0, fmt.Errorf("repeats: malformed SPAN_MEMBER line (want 13 fields, got %d)", len(fields))
	}
	groupID, err := strconv.Atoi(fields[1])
	if err != nil {
		return Member{}, 0, fmt.Errorf("repeats: SPAN_MEMBER group id: %w", err)
	}
	itemIndex, err := strconv.Atoi(fields[2])
	if err != nil {
		return Member{}, 0, fmt.Errorf("repeats: SPAN_MEMBER item_index: %w", err)
	}
	startOffset, err := strconv.ParseFloat(fields[6], 64)
	if err != nil {
		return Member{}, 0, fmt.Errorf("repeats: SPAN_MEMBER start_offset: %w", err)
	}
	length, err := strconv.ParseFloat(fields[7], 64)
	if err != nil {
		return Member{}, 0, fmt.Errorf("repeats: SPAN_MEMBER length: %w", err)
	}
	firstUnit, err := strconv.Atoi(fields[8])
	if err != nil {
		return Member{}, 0, fmt.Errorf("repeats: SPAN_MEMBER first_u: %w", err)
	}
	lastUnit, err := strconv.Atoi(fields[9])
	if err != nil {
		return Member{}, 0, fmt.Errorf("repeats: SPAN_MEMBER last_u: %w", err)
	}
	coverage, err := strconv.ParseFloat(fields[10], 64)
	if err != nil {
		return Member{}, 0, fmt.Errorf("repeats: SPAN_MEMBER coverage: %w", err)
	}
	quality, err := strconv.ParseFloat(fields[11], 64)
	if err != nil {
		return Member{}, 0, fmt.Errorf("repeats: SPAN_MEMBER quality: %w", err)
	}
	return Member{
		ItemIndex:      itemIndex,
		ItemGUID:       fields[3],
		TakeGUID:       fields[4],
		SourceFile:     fields[5],
		StartOffset:    startOffset,
		Length:         length,
		FirstUnit:      firstUnit,
		LastUnit:       lastUnit,
		Coverage:       coverage,
		Quality:        quality,
		ExactCopyGroup: fields[12],
	}, groupID, nil
}
