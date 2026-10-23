//go:build audacityreal && linux

// Package audacityreal is the harness for the real-Audacity 3 tests (src/studio/tests/audacity3/real/): it starts a pinned Audacity 3 on Linux
// under Xvfb with a PulseAudio null sink, reaches it over mod-script-pipe's FIFOs, and records what every test saw into a
// machine-readable results file. It holds no assertions of its own; the test packages next to it (foundation, and the record and edit
// suites) decide what passes. Only the `audacityreal` build tag compiles it, so no ordinary test run starts an Audacity.
//
//	src/studio/tests/audacity3/real/foundation/run.sh
package audacityreal

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

// Env is what src/studio/tests/audacity3/real/*/run.sh set up around the test process.
type Env struct {
	Work     string // scratch root: profiles, temp dirs, generated audio
	App      string // the extracted AppImage (squashfs-root), holding AppRun
	Out      string // results, raw replies, screenshots, exported audio: uploaded as the CI artifact
	Golden   string // committed reply bytes the fake pipe is tested against; the harness only writes under Out
	Display  string // the Xvfb display, ":99"
	Version  string // the pinned Audacity version, recorded with every result
	Fixture  string // the pinned LibriVox chapter (kara_01.mp3)
	Markers  string // the fixture's committed alignment
	Sink     string // the PulseAudio null sink's name
	Runner   string // the runner image, recorded with every result
	GoldenIn string // where `Golden` reply bytes are read from (src/studio/tests/audacity3/real/foundation/golden)
}

// LoadEnv reads the NU_AUDACITY_* variables. A missing one fails the test with the script that sets it.
func LoadEnv(t testing.TB) Env {
	t.Helper()
	need := func(name string) string {
		v := os.Getenv(name)
		if v == "" {
			t.Fatalf("%s is not set: the audacityreal tag is opt-in, so run src/studio/tests/audacity3/real/foundation/run.sh, which sets it", name)
		}
		return v
	}
	e := Env{
		Work:    need("NU_AUDACITY_WORK"),
		App:     need("NU_AUDACITY_APP"),
		Out:     need("NU_AUDACITY_OUT"),
		Display: need("DISPLAY"),
		Version: need("NU_AUDACITY_VERSION"),
		Sink:    os.Getenv("NU_AUDACITY_SINK"),
		Fixture: os.Getenv("NU_AUDACITY_FIXTURE"),
		Markers: os.Getenv("NU_AUDACITY_MARKERS"),
		Runner:  runnerName(),
	}
	e.GoldenIn = os.Getenv("NU_AUDACITY_GOLDEN_DIR")
	for _, d := range []string{e.Work, e.Out, filepath.Join(e.Out, "results"), filepath.Join(e.Out, "raw"), filepath.Join(e.Out, "shots"), filepath.Join(e.Out, "audio")} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return e
}

func runnerName() string {
	for _, k := range []string{"NU_AUDACITY_RUNNER", "ImageOS", "RUNNER_NAME"} {
		if v := os.Getenv(k); v != "" {
			if k == "ImageOS" {
				return v + " " + os.Getenv("ImageVersion")
			}
			return v
		}
	}
	h, _ := os.Hostname()
	return "local " + h + " uid " + strconv.Itoa(os.Getuid())
}
