// Command guide-rules prints the Story Bible rules' suggestions for a manuscript, one JSON line each, as the Manuscript Guide
// sidecar's `suggest --source rules` printed them before the rules moved into the host (guide.RuleSuggestions). It writes
// nothing. The extraction calibration tool (scripts/research/extraction-calibration) runs it with `go run` to score the rules
// source the app offers:
//
//	go run ./cmd/guide-rules --manuscript <manuscript.json> --guide <manuscript_guide.json>
//
// A missing Story Bible is an empty one. On a refusal it prints the reason on stderr and exits 1.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"

	"desktop/internal/guide"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("guide-rules", flag.ContinueOnError)
	flags.SetOutput(stderr)
	manuscript := flags.String("manuscript", "", "the canonical manuscript.json")
	bible := flags.String("guide", "", "the Story Bible (manuscript_guide.json); a missing file is an empty one")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if *manuscript == "" || *bible == "" {
		_, _ = fmt.Fprintln(stderr, "--manuscript and --guide are required")
		return 2
	}
	lines, err := guide.RuleSuggestions(context.Background(), *manuscript, *bible)
	if err != nil {
		_, _ = fmt.Fprintln(stderr, err)
		return 1
	}
	for _, line := range lines {
		if _, err := fmt.Fprintln(stdout, line); err != nil {
			_, _ = fmt.Fprintln(stderr, err)
			return 1
		}
	}
	return 0
}
