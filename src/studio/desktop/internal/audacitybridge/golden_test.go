package audacitybridge_test

import (
	"bufio"
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
)

// goldenDir holds the exact reply bytes a real Audacity 3.7.7 wrote, saved by A3-T3 of the real-Audacity suite
// (tests/audacity3/real/foundation, docs/research/audacity-3-capability-matrix.md). They are the fake pipe's reference: the client's
// reader and the fake's framing are tested against them here, on every pull request, without an Audacity.
const goldenDir = "../../../../tests/audacity3/real/foundation/golden"

func golden(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(goldenDir, name+".bin"))
	if err != nil {
		t.Fatalf("golden reply %s: %v (rerun tests/audacity3/real/foundation/run.sh and copy out/golden/*.bin here)", name, err)
	}
	return b
}

// rawExchange sends one command to the fake over its transport and reads the answer's bytes up to the terminator and its empty line.
func rawExchange(t *testing.T, s *audacitybridgetest.Server, line string) []byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, err := s.Transport().Dial(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	if _, err := conn.Write([]byte(line + "\n")); err != nil {
		t.Fatal(err)
	}
	var out []byte
	r := bufio.NewReader(conn)
	for {
		l, err := r.ReadBytes('\n')
		if err != nil {
			t.Fatalf("reading the fake's answer to %q: %v (got %q)", line, err, out)
		}
		out = append(out, l...)
		if bytes.HasSuffix(out, []byte("BatchCommand finished: OK\n\n")) || bytes.HasSuffix(out, []byte("BatchCommand finished: Failed!\n\n")) {
			return out
		}
		// the terminator line itself is followed by one empty line
		if bytes.Contains(out, []byte("BatchCommand finished:")) && bytes.HasSuffix(out, []byte("\n\n")) {
			return out
		}
	}
}

// Every reply a real Audacity wrote is read by the client's reader as the kind of reply it was: OK or Failed!, with the lines it had.
func TestGoldenRepliesAreReadByTheClient(t *testing.T) {
	files, err := filepath.Glob(filepath.Join(goldenDir, "*.bin"))
	if err != nil || len(files) < 10 {
		t.Fatalf("expected the golden replies of A3-T3 in %s, found %d (%v)", goldenDir, len(files), err)
	}
	for _, f := range files {
		name := strings.TrimSuffix(filepath.Base(f), ".bin")
		raw, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		t.Run(name, func(t *testing.T) {
			wantOK := bytes.HasSuffix(raw, []byte("BatchCommand finished: OK\n\n"))
			if !wantOK && !bytes.HasSuffix(raw, []byte("BatchCommand finished: Failed!\n\n")) {
				t.Fatalf("a golden reply must be a complete reply: %q", raw)
			}
			ok, lines := audacitybridge.ReadReplyForTest(raw)
			if ok != wantOK {
				t.Errorf("read as ok=%v, the terminator says ok=%v", ok, wantOK)
			}
			// The lines are the body without the blank first line Audacity writes before most replies.
			body := strings.TrimPrefix(strings.TrimSuffix(strings.TrimSuffix(string(raw), "BatchCommand finished: OK\n\n"), "BatchCommand finished: Failed!\n\n"), "\n")
			want := strings.TrimSuffix(body, "\n")
			if got := strings.Join(lines, "\n"); got != want {
				t.Errorf("lines %q, want %q", got, want)
			}
		})
	}
}

// What the client parses out of the real GetInfo replies.
func TestGoldenGetInfoRepliesParse(t *testing.T) {
	ctx := context.Background()
	_ = ctx
	tracks, err := audacitybridge.ParseTracksForTest(golden(t, "getinfo-tracks"))
	if err != nil || len(tracks) != 1 || tracks[0].Name != "t03-tone" || tracks[0].Kind != "wave" || tracks[0].Channels != 1 || !tracks[0].HasRange || tracks[0].End != 3 {
		t.Errorf("tracks %+v, err %v", tracks, err)
	}
	clips, err := audacitybridge.ParseClipsForTest(golden(t, "getinfo-clips"))
	if err != nil || len(clips) != 1 || clips[0].Track != 0 || clips[0].End != 3 || clips[0].Name != "t03-tone" {
		t.Errorf("clips %+v, err %v", clips, err)
	}
	labels, err := audacitybridge.ParseLabelsForTest(golden(t, "getinfo-labels"))
	if err != nil || len(labels) != 1 || labels[0].Track != 1 || labels[0].Start != 1 || labels[0].End != 2 {
		t.Errorf("labels %+v, err %v", labels, err)
	}
	for _, name := range []string{"getinfo-tracks-empty", "getinfo-clips-empty", "getinfo-labels-empty"} {
		ok, lines := audacitybridge.ReadReplyForTest(golden(t, name))
		if !ok || len(lines) != 1 || strings.TrimSpace(lines[0]) != "[  ]" && strings.TrimSpace(lines[0]) != "[]" {
			t.Errorf("%s: ok=%v lines %q", name, ok, lines)
		}
	}
}

// The fake pipe frames a reply byte for byte as the real Audacity did, for the commands whose real reply does not depend on a project's
// contents.
func TestFakeFramesLikeAudacity(t *testing.T) {
	cases := []struct{ golden, command string }{
		{"message", `Message: Text="hello"`},
		{"getinfo-tracks-empty", "GetInfo: Type=Tracks Format=JSON"},
		{"getinfo-clips-empty", "GetInfo: Type=Clips Format=JSON"},
		{"getinfo-labels-empty", "GetInfo: Type=Labels Format=JSON"},
		{"selecttime", "SelectTime: Start=1 End=2 RelativeTo=ProjectStart"},
		{"selectnone", "SelectNone"},
		{"play", "Play"},
		{"stop", "Stop"},
	}
	for _, tc := range cases {
		t.Run(tc.golden, func(t *testing.T) {
			s := audacitybridgetest.NewServer()
			got := rawExchange(t, s, tc.command)
			want := golden(t, tc.golden)
			if !bytes.Equal(got, want) {
				t.Errorf("the fake answers %q, Audacity 3.7.7 answered %q", got, want)
			}
		})
	}
}
