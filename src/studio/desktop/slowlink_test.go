package main

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
)

func TestSlowDawLinkSlowsTheClientAndSaysSoInTheHostLog(t *testing.T) {
	cases := []struct {
		profile     string
		development bool
		slowed      bool
		logged      string
	}{
		{"", true, false, ""},
		{"0ms", true, false, ""},
		{"150ms", true, true, "slowed on purpose by NARRATION_DAW_LATENCY=150ms"},
		{"quick", true, false, "was not understood"},
		// A release build: the narrator's commands are never held or dropped by a variable left in the environment.
		{"150ms", false, false, "was ignored"},
		{"", false, false, ""},
	}
	for _, test := range cases {
		t.Run(fmt.Sprint(test.profile, test.development), func(t *testing.T) {
			dir := t.TempDir()
			client, err := bridge.New(dir)
			if err != nil {
				t.Fatal(err)
			}
			var lines []string
			slowDawLink(client, test.profile, test.development, func(kind, message string) error {
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
	slowDawLink(nil, "1s", true, func(string, string) error { t.Fatal("a launch with no bridge logged a slow link"); return nil })
}
