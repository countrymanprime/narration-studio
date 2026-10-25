package takereview

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/brand"
	"desktop/internal/process"
)

// The test binary doubles as the sidecar: started with fakeSidecarEnv set, TestMain writes that variable's text to
// --out (or exits with the code it names) and records its arguments beside it, instead of running the tests.
const fakeSidecarEnv = "TAKEREVIEW_FAKE_SIDECAR"

func TestMain(m *testing.M) {
	if text, ok := os.LookupEnv(fakeSidecarEnv); ok {
		var code int
		if _, err := fmt.Sscanf(text, "exit %d", &code); err == nil {
			os.Exit(code)
		}
		for k, arg := range os.Args {
			if arg == "--out" && k+1 < len(os.Args) {
				_ = os.WriteFile(os.Args[k+1]+".args", []byte(strings.Join(os.Args[1:], " ")), 0o600)
				if err := os.WriteFile(os.Args[k+1], []byte(text), 0o600); err != nil {
					os.Exit(3)
				}
			}
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

const scanManuscript = `{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c-1", "title": "Chapter One"}, {"id": "c-2", "title": "Chapter Two"}],
	"paragraphs": [{"id": "p-1", "chapterId": "c-1", "index": 0, "text": "Ada walked into the quiet room. She closed the door behind her softly."},
	{"id": "p-2", "chapterId": "c-2", "index": 1, "text": "Nothing else happened."}]}`

const scanHeard = `REPEAT_WORDS|{"words":[["Ada",0.0,0.4],["walked",0.5,0.9],["into",1.0,1.4],["the",1.5,1.9],["quiet",2.0,2.4],["room",2.5,2.9],["She",3.0,3.4],["closed",3.5,3.9]]}
REPEAT_WORDS|{"words":[["She",0.0,0.4],["closed",0.5,0.9],["the",1.0,1.4],["door",1.5,1.9],["behind",2.0,2.4],["her",2.5,2.9],["softly",3.0,3.4]]}
`

// scanRunner is a ProcessRunner whose sidecar is this test binary answering sidecar, and a request for a two-read
// manifest of a project manuscript.
func scanRunner(t *testing.T, sidecar string) (*ProcessRunner, SidecarRequest) {
	t.Helper()
	t.Setenv(fakeSidecarEnv, sidecar)
	project := t.TempDir()
	manuscript := filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(manuscript), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manuscript, []byte(scanManuscript), 0o600); err != nil {
		t.Fatal(err)
	}
	manifest := filepath.Join(project, "manifest.txt")
	if err := os.WriteFile(manifest, []byte("0|a.wav|0|7|{I-1}|{T-1}\n1|b.wav|0|4|{I-1}|{T-2}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	supervisor := process.NewSupervisor()
	t.Cleanup(func() { _ = supervisor.Close() })
	runner := &ProcessRunner{Sidecars: supervisor, Python: os.Args[0], SessionDir: filepath.Join(project, "session")}
	return runner, SidecarRequest{ManifestPath: manifest, ManuscriptPath: manuscript, TrackName: "Chapter 1", Model: "small"}
}

func TestTheHostGroupsTheReadsTheSidecarHeard(t *testing.T) {
	runner, req := scanRunner(t, scanHeard)

	raw, err := runner.FindRepeats(context.Background(), req)

	want := "SUMMARY|Found 1 repeated-span group(s) across 2 segment(s)\n" +
		"SPAN_GROUP|0|0|1|2\n" +
		"SPAN_MEMBER|0|0|{I-1}|{T-1}|a.wav|0.000|7.000|0|1|1.000|0.533|\n" +
		"SPAN_MEMBER|0|1|{I-1}|{T-2}|b.wav|0.000|4.000|1|1|0.500|0.467|\n"
	if err != nil || raw != want {
		t.Fatalf("raw = %q, %v; want %q", raw, err, want)
	}
	outs, _ := filepath.Glob(filepath.Join(runner.SessionDir, "repeats_*.txt.args"))
	if len(outs) != 1 {
		t.Fatalf("args files = %v", outs)
	}
	if words, _ := filepath.Glob(filepath.Join(runner.SessionDir, "repeats_*.txt")); len(words) != 0 {
		t.Errorf("the sidecar's words were left behind: %v", words)
	}
	args, _ := os.ReadFile(outs[0])
	if strings.Contains(string(args), "--track-name") || strings.Contains(string(args), "--chapter-title") || !strings.Contains(string(args), "--model small") {
		t.Fatalf("the sidecar was passed %q", args)
	}
}

func TestATrackThatMatchesNoChapterAsksForOneWithoutStartingTheSidecar(t *testing.T) {
	runner, req := scanRunner(t, "exit 7")
	req.TrackName = "Appendix"

	raw, err := runner.FindRepeats(context.Background(), req)

	if err != nil || raw != "NEED_CHAPTER|Chapter One|Chapter Two\n" {
		t.Fatalf("raw = %q, %v", raw, err)
	}
}

func TestAScanFailsWhenTheChapterTheManifestOrTheSidecarDoes(t *testing.T) {
	for name, c := range map[string]struct {
		sidecar string
		edit    func(*SidecarRequest)
		want    string
	}{
		"an unknown chapter title": {"exit 7", func(r *SidecarRequest) { r.ChapterTitle = "Chapter Nine" }, "Chapter title override 'Chapter Nine' not found in the document."},
		"no manuscript":            {"exit 7", func(r *SidecarRequest) { r.ManuscriptPath += ".missing" }, "takereview: "},
		"no manifest":              {"exit 7", func(r *SidecarRequest) { r.ManifestPath += ".missing" }, "could not read the repeated-span manifest"},
		"the sidecar fails":        {"exit 1", func(*SidecarRequest) {}, "repeated-span detector exited 1"},
		"a read it did not hear":   {strings.SplitAfter(scanHeard, "\n")[0], func(*SidecarRequest) {}, "heard 1 read(s) of 2"},
		"an older sidecar's lines": {"SUMMARY|Found 0 repeated-span group(s) across 0 segment(s)\n", func(*SidecarRequest) {}, `unknown line "SUMMARY"`},
	} {
		runner, req := scanRunner(t, c.sidecar)
		c.edit(&req)
		if raw, err := runner.FindRepeats(context.Background(), req); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %q, %v; want an error containing %q", name, raw, err, c.want)
		}
	}
	if _, err := (&ProcessRunner{}).FindRepeats(context.Background(), SidecarRequest{}); err == nil {
		t.Error("a runner with no sidecar scanned")
	}
}
