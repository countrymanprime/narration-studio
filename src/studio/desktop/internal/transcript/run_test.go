package transcript

import (
	"desktop/internal/brand"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport/reaper"
	"desktop/internal/process"
	"desktop/internal/settings"
)

// The test binary doubles as the sidecar: started with fakeSidecarEnv set, TestMain writes that variable's text to
// --out (or exits with the code it names) instead of running the tests.
const fakeSidecarEnv = "TRANSCRIPT_FAKE_SIDECAR"

func TestMain(m *testing.M) {
	if text, ok := os.LookupEnv(fakeSidecarEnv); ok {
		var code int
		if _, err := fmt.Sscanf(text, "exit %d", &code); err == nil {
			os.Exit(code)
		}
		for k, arg := range os.Args {
			if arg == "--out" && k+1 < len(os.Args) {
				if err := os.WriteFile(os.Args[k+1], []byte(text), 0o600); err != nil {
					os.Exit(3)
				}
			}
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

const runManuscript = `{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c-1", "title": "Chapter One"}],
	"paragraphs": [{"id": "p-1", "chapterId": "c-1", "index": 4, "text": "She had nothing to do. Once or twice she peeped."}]}`

const runWords = `COMPARE_CHAPTER|{"chapterId":"c-1","score":0.95}
COMPARE_SEGMENT|{"itemIndex":2,"startOffset":10.0,"concatStart":0.0}
COMPARE_WORDS|{"words":[["She",0.0,0.3],["had",0.4,0.7],["nothing",0.8,1.1],["two",1.2,1.5],["do",1.6,1.9],["Once",2.6,2.9],["or",3.0,3.2],["twice",3.3,3.6],["she",3.7,3.9],["peeped",4.0,4.4]]}
`

// runService is a service whose sidecar is this test binary answering sidecar, with a project manuscript, at the
// point REAPER has prepared the run (COMPARE_PREPARED).
func runService(t *testing.T, sidecar string) (*Service, string) {
	t.Helper()
	t.Setenv(fakeSidecarEnv, sidecar)
	project, session := t.TempDir(), t.TempDir()
	manuscript := filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(manuscript), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manuscript, []byte(runManuscript), 0o600); err != nil {
		t.Fatal(err)
	}
	client, err := bridge.New(session)
	if err != nil {
		t.Fatal(err)
	}
	supervisor := process.NewSupervisor()
	t.Cleanup(func() { _ = supervisor.Close() })
	service := NewWithReview(Config{Project: project, SessionDir: session, Python: os.Args[0]}, reaper.ReviewFor(client), settings.New(t.TempDir(), project), supervisor, nil)
	service.state = empty()
	service.state["runId"], service.state["phase"] = "run-1", "preparing"
	service.Handle([]string{"COMPARE_PREPARED", "run-1", filepath.Join(session, "m.txt"), manuscript, "Chapter One", filepath.Join(session, "chapter.diff"), "1"})
	return service, session
}

// wait polls the run as the host's ticker does until it leaves "running".
func wait(t *testing.T, service *Service) map[string]any {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		service.Poll()
		if state := service.Snapshot(); state["phase"] != "running" {
			return state
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("the run never finished")
	return nil
}

func TestTheHostBuildsTheMarkersAndTheDiffFromTheSidecarsWords(t *testing.T) {
	service, session := runService(t, runWords)
	state := wait(t, service)

	if state["phase"] != "inspecting" {
		t.Fatalf("state = %#v", state)
	}
	results, err := os.ReadFile(filepath.Join(session, "results_run-1.txt"))
	if err != nil {
		t.Fatal(err)
	}
	want := "SUMMARY|MATCH: 'Chapter One' (score 0.95) - 1 discrepancy marker(s)\n" +
		"DIFF|" + filepath.Join(session, "chapter.diff") + "\n" +
		"MARKER|2|11.200|MISREAD|MISREAD: 'to' as '2'|to|2|Chapter One|4|She had nothing to do.|She had nothing two do.|medium|0.100|\n"
	if string(results) != want {
		t.Fatalf("results:\n%s\nwant:\n%s", results, want)
	}
	if diff, ok := state["diff"].(string); !ok || !strings.Contains(diff, "-She had nothing to do.") || !strings.Contains(diff, "+She had nothing two do") {
		t.Fatalf("diff = %q", state["diff"])
	}
	for _, name := range []string{"chapter.manuscript.txt", "chapter.recorded.txt"} {
		if _, err := os.Stat(filepath.Join(session, name)); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	log, _ := os.ReadFile(filepath.Join(session, "log_run-1.txt"))
	if !strings.Contains(string(log), `"msg": "Wrote 1 marker row(s) to `) {
		t.Fatalf("log = %q", log)
	}
	commands, err := os.ReadDir(filepath.Join(session, "commands"))
	if err != nil || len(commands) != 1 {
		t.Fatalf("REAPER was not asked to inspect the markers: %v, %v", commands, err)
	}
}

func TestATrackNameThatMatchesNoChapterAsksForOne(t *testing.T) {
	service, _ := runService(t, "NEED_CHAPTER|Chapter One|Chapter Two\n")
	state := wait(t, service)

	if state["phase"] != "need_chapter" || fmt.Sprint(state["chapters"]) != "[Chapter One Chapter Two]" {
		t.Fatalf("state = %#v", state)
	}
}

func TestASidecarFailureOrAWordsReportTheHostCannotUseFailsTheRun(t *testing.T) {
	for sidecar, want := range map[string]string{
		"exit 1":           "Transcript backend failed.",
		"exit 0":           "The comparison's words report could not be read:",
		"exit 2":           "Cancelled — no markers were added.",
		"COMPARE_WORDS|{}": "The comparison's words report has a malformed line 1.",
		strings.Replace(runWords, `"c-1"`, `"c-9"`, 1): "The manuscript has no narratable chapter with id 'c-9'.",
	} {
		service, _ := runService(t, sidecar)
		if state := wait(t, service); !strings.HasPrefix(fmt.Sprint(state["message"]), want) {
			t.Errorf("%q: state = %v, want %q", sidecar, state["message"], want)
		}
	}
}
