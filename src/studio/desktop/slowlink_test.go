package main

import (
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
)

func TestSlowDawLinkSlowsTheClientAndSaysSoInTheHostLog(t *testing.T) {
	cases := []struct {
		profile string
		slowed  bool
		logged  string
	}{
		{"", false, ""},
		{"0ms", false, ""},
		{"150ms", true, "slowed on purpose by NARRATION_DAW_LATENCY=150ms"},
		{"quick", false, "was not understood"},
	}
	for _, test := range cases {
		t.Run(test.profile, func(t *testing.T) {
			dir := t.TempDir()
			client, err := bridge.New(dir)
			if err != nil {
				t.Fatal(err)
			}
			var lines []string
			slowDawLink(client, test.profile, func(kind, message string) error {
				lines = append(lines, kind+": "+message)
				return nil
			})
			if (test.logged == "") != (len(lines) == 0) || (test.logged != "" && !strings.Contains(lines[0], "bridge.slow_link: ") || test.logged != "" && !strings.Contains(lines[0], test.logged)) {
				t.Fatalf("host log %q; want a line holding %q", lines, test.logged)
			}
			began := time.Now()
			target, err := client.Send("ping", nil)
			if err != nil {
				t.Fatal(err)
			}
			if held := client.Retract(target) == false; held != test.slowed {
				t.Fatalf("command held = %v after %v; want %v", held, time.Since(began), test.slowed)
			}
		})
	}
	slowDawLink(nil, "1s", func(string, string) error { t.Fatal("a launch with no bridge logged a slow link"); return nil })
}
