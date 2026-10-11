package main

import (
	"fmt"

	"github.com/countrymanprime/narration-utils/shell/internal/lineidentity"
)

// The bindings for manuscript line identity, used by apps/ui's "Link chapters" flow: the wire-contract schema,
// golden payload, mock and wireContracts.test.ts row live in apps/ui/src/api (docs/architecture/wire-contracts.md),
// and h.emitLineIdentity (app.go) relays every state change as the "lineidentity:state" live event, the way
// h.emitTranscript does for Transcript Compare. The UI collects a narrator-confirmed chapter-to-track mapping and
// supplies the rows itself.

// LineIdentityStampRow is one row of LineIdentityStamp's input: an item GUID, the manuscript entity ID it
// should carry (a paragraph or chapter ID), and that entity's current text.
type LineIdentityStampRow struct {
	ItemGUID string `json:"itemGuid"`
	LineID   string `json:"lineId"`
	Text     string `json:"text"`
}

func (h *Host) LineIdentityStamp(rows []LineIdentityStampRow, overwrite bool) (string, error) {
	service := h.services().lineIdentity
	if service == nil {
		return "", fmt.Errorf("the line-identity service is unavailable")
	}
	converted := make([]lineidentity.Row, 0, len(rows))
	for _, row := range rows {
		converted = append(converted, lineidentity.Row{ItemGUID: row.ItemGUID, LineID: row.LineID, Text: row.Text})
	}
	run := h.runLog.Begin("line_identity_stamp", "row_count", len(rows), "overwrite", overwrite)
	err := service.Stamp(converted, overwrite)
	if err != nil {
		run.End("error")
	} else {
		run.End("ok")
	}
	return encodeBinding(map[string]any{"status": "started"}, err)
}

func (h *Host) LineIdentityRead() (string, error) {
	service := h.services().lineIdentity
	if service == nil {
		return "", fmt.Errorf("the line-identity service is unavailable")
	}
	return encodeBinding(map[string]any{"status": "started"}, service.Read())
}

func (h *Host) LineIdentityState() (string, error) {
	if service := h.services().lineIdentity; service != nil {
		return encodeBinding(service.Snapshot(), nil)
	}
	return encodeBinding(map[string]any{
		"runId": nil, "phase": "idle", "message": "",
		"stamp": map[string]any{"applied": 0, "unchanged": 0, "missingCount": 0, "conflictsCount": 0, "missing": []string{}, "conflicts": []string{}},
		"lines": []map[string]any{}, "linesRead": 0,
	}, nil)
}
