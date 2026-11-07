package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	// maxTraceBatchBytes and maxTraceBatchEvents bound one SystemTraceBatch call, so the page cannot use it to fill memory or the disk.
	maxTraceBatchBytes  = 64 << 10
	maxTraceBatchEvents = 200
)

type traceBatch struct {
	Events []struct {
		Event  string         `json:"event"`
		Fields map[string]any `json:"fields"`
	} `json:"events"`
}

// SystemTraceBatch takes the activity-trace events the page collected (screen changes, host calls, live events, overlays, caught
// errors) as `{"events":[{"event":"ui.nav","fields":{"page":"settings"}}]}` and writes each through the trace's registry
// (docs/prds/activity-trace.prd.md). An event the registry does not list under `ui`, or a field of the wrong shape, is dropped and
// counted; the page cannot write a host event or a path. It answers how many events were written and how many were refused. The
// page sends every batch, because the in-memory ring always records; a call costs one JSON parse.
func (h *Host) SystemTraceBatch(batch string) (string, error) {
	if len(batch) > maxTraceBatchBytes {
		return encodeBinding(nil, fmt.Errorf("trace batch is larger than %d bytes", maxTraceBatchBytes))
	}
	var parsed traceBatch
	if err := json.Unmarshal([]byte(batch), &parsed); err != nil {
		return encodeBinding(nil, fmt.Errorf("trace batch is not valid JSON"))
	}
	if len(parsed.Events) > maxTraceBatchEvents {
		return encodeBinding(nil, fmt.Errorf("trace batch has more than %d events", maxTraceBatchEvents))
	}
	accepted, refused := 0, 0
	for _, event := range parsed.Events {
		area, name, ok := strings.Cut(event.Event, ".")
		if ok && h.tracer.EmitFromPage(area, name, event.Fields) {
			accepted++
		} else {
			refused++
		}
	}
	return encodeBinding(map[string]any{"accepted": accepted, "refused": refused}, nil)
}
