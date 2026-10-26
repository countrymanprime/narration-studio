// Command booth-replay replays recorded live-ASR output through the Booth's script tracker and its flags, offline (the
// host's port of the teleprompter sidecar's replay.py, internal/boothreplay). It is a development tool and is not
// packaged.
//
//	go run ./cmd/booth-replay --stream session.ndjson --script script.txt [--timeline]
//	python replay.py --events probe.jsonl --calls | go run ./cmd/booth-replay --script script.txt [--timeline]
//	python record_mock_stream.py --calls | go run ./cmd/booth-replay --mock ../ui/src/api/teleprompterRecording.json
//
// --stream reads the NDJSON a live session printed and replays its engine events; otherwise the tracker calls are read
// from --calls (standard input by default). The script is the plain text that was read (--script), or the tokens the
// calls begin with. It prints replay.py's report (the timeline first with --timeline), or with --mock writes the
// browser mock's recording and prints its numbers.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	"desktop/internal/boothreplay"
	"desktop/internal/scripttrack"
)

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "booth-replay:", err)
		os.Exit(1)
	}
}

func run(args []string, stdin io.Reader, stdout io.Writer) error {
	flags := flag.NewFlagSet("booth-replay", flag.ContinueOnError)
	script := flags.String("script", "", "the plain-text script that was read aloud")
	calls := flags.String("calls", "-", "tracker calls, one JSON object a line (- for standard input)")
	stream := flags.String("stream", "", "NDJSON a live session printed; its engine events are replayed")
	timeline := flags.Bool("timeline", false, "also print every position and flag event")
	mock := flags.String("mock", "", "write the browser mock's recording here instead of the report")
	if err := flags.Parse(args); err != nil {
		return err
	}
	var tracked []boothreplay.Call
	var tokens []string
	if *stream != "" {
		raw, err := os.ReadFile(*stream)
		if err != nil {
			return err
		}
		if tracked, err = boothreplay.StreamCalls(string(raw)); err != nil {
			return err
		}
	} else {
		raw, err := read(*calls, stdin)
		if err != nil {
			return err
		}
		if tracked, tokens, err = boothreplay.ParseCalls(string(raw)); err != nil {
			return err
		}
	}
	if *script != "" {
		raw, err := os.ReadFile(*script)
		if err != nil {
			return err
		}
		tokens = scripttrack.ScriptWords(string(raw))
	}
	if tokens == nil {
		return fmt.Errorf("give the script that was read (--script)")
	}
	events, heard, err := boothreplay.Run(tracked, tokens)
	if err != nil {
		return err
	}
	if *mock != "" {
		if err := os.WriteFile(*mock, []byte(boothreplay.MockRecording(events, tokens)), 0o600); err != nil {
			return err
		}
		_, err = fmt.Fprintln(stdout, boothreplay.MockStats(events, tokens))
		return err
	}
	if *timeline {
		for _, line := range boothreplay.TimelineLines(events, tokens) {
			if _, err := fmt.Fprintln(stdout, line); err != nil {
				return err
			}
		}
	}
	_, err = fmt.Fprintln(stdout, boothreplay.Dumps(boothreplay.Summary(events, tokens, heard), 2))
	return err
}

func read(path string, stdin io.Reader) ([]byte, error) {
	if path == "-" {
		return io.ReadAll(stdin)
	}
	return os.ReadFile(path)
}
