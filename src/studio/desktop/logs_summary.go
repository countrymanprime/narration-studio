package main

import (
	"fmt"
	"io"
	"path/filepath"

	"desktop/internal/diagexport"
	"desktop/internal/runlog"
)

// logsSummaryFlag prints a safe summary of the activity trace and exits: `--logs-summary [trace.jsonl]`. It reads the trace file
// (logs/trace.jsonl and its backups, or the path given) and prints event names, counts and error classes, so an engineer or an
// agent can start from it without opening a log that could hold more.
const logsSummaryFlag = "--logs-summary"

// isLogsSummaryRequest reports whether the program was started to print the trace summary.
func isLogsSummaryRequest(arguments []string) bool {
	return len(arguments) > 0 && arguments[0] == logsSummaryFlag
}

func runLogsSummary(arguments []string, stdout, stderr io.Writer) int {
	path := filepath.Join(filepath.Dir(runlog.DefaultPath()), "trace.jsonl")
	if len(arguments) > 1 {
		path = arguments[1]
	}
	data, err := diagexport.ReadTrace(path)
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "could not read the trace:", err)
		return 1
	}
	if err := diagexport.Summarize(stdout, data); err != nil {
		_, _ = fmt.Fprintln(stderr, "could not summarize the trace:", err)
		return 1
	}
	return 0
}
