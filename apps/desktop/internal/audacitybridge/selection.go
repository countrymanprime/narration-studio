package audacitybridge

import (
	"context"
	"fmt"
)

type selectionJSON struct {
	Start *flexNumber `json:"start"`
	End   *flexNumber `json:"end"`
}

// Selection reads the time selection (GetInfo: Type=Selection Format=JSON, added in Audacity 3.6): start and end in project seconds.
// With a cursor and no range, start and end are the same time, so a cursor and a selection are one thing here: a range the narrator
// selected reads as a cursor at its start for a caller that only asks where the cursor is. Times carry six significant digits.
func (c *Client) Selection(ctx context.Context) (start, end float64, err error) {
	reply, err := c.Do(ctx, getInfo("Selection"))
	if err != nil {
		return 0, 0, err
	}
	var row selectionJSON
	if err := decodeInfo(reply, &row); err != nil {
		return 0, 0, err
	}
	if row.Start == nil || row.End == nil {
		return 0, 0, &ProtocolError{"the selection has no start or end"}
	}
	start, end = float64(*row.Start), float64(*row.End)
	if end < start {
		return 0, 0, &ProtocolError{fmt.Sprintf("the selection ends (%v) before it starts (%v)", end, start)}
	}
	return start, end, nil
}
