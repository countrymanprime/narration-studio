package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/extraction"
	"desktop/internal/extraction/store"
	"desktop/internal/findings"
	"desktop/internal/voicesample"
)

// Delete Story Bible data removes the Story Bible's folder and findings, answers what it held, and leaves the rest of the project: the
// manuscript, the recordings, the settings, the voice samples and another analyzer's findings.
func TestGuideDeleteAllRemovesOnlyTheStoryBibleData(t *testing.T) {
	service, _, project := countingGuideIn(t)
	writeStoryBible(t, project)
	findingsStore := findings.NewStore(project)
	service.SetFindings(findingsStore)
	if err := service.SaveFindings(); err != nil {
		t.Fatal(err)
	}
	if _, err := findingsStore.SaveAnalyzerFindings("transcript", "c-0001", []findings.Finding{}); err != nil {
		t.Fatal(err)
	}
	suggestions := filepath.Join(project, "ManuscriptGuide", "suggestions.json")
	if err := os.WriteFile(suggestions, []byte(`{"version": 1, "suggestions": []}`), 0o600); err != nil {
		t.Fatal(err)
	}
	kept := []string{
		filepath.Join(project, "Recordings", "take-1.wav"),
		filepath.Join(project, "settings.json"),
		filepath.Join(voicesample.Dir(project), "samples.json"),
		filepath.Join(project, "Manuscript.txt"),
	}
	for _, path := range kept {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("kept"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	host := hostWithoutCueRefresh(service)
	host.config = config{projectFolder: project}
	host.findings = findingsStore

	if _, err := host.GuideDeleteAll(false); err == nil {
		t.Fatal("an unconfirmed delete was not refused")
	}
	if _, err := os.Stat(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")); err != nil {
		t.Fatalf("an unconfirmed delete removed the Story Bible: %v", err)
	}

	payload, err := host.GuideDeleteAll(true)
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "guide-delete-all", payload)
	if payload != `{"entries":1,"suggestions":0}` {
		t.Fatalf("payload = %s", payload)
	}
	if _, err := os.Stat(filepath.Join(project, "ManuscriptGuide")); !os.IsNotExist(err) {
		t.Fatalf("the ManuscriptGuide folder is still there: %v", err)
	}
	for _, path := range kept {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("%s went with the Story Bible: %v", path, err)
		}
	}
	if left, err := findingsStore.List(findings.Query{}); err != nil || len(left) != 0 {
		t.Fatalf("findings = %+v, %v", left, err)
	}
	if _, err := os.Stat(filepath.Join(project, filepath.FromSlash(findings.Dir), "transcript")); err != nil {
		t.Fatalf("another analyzer's findings went: %v", err)
	}
	if list, err := host.GuideEntities(); err != nil || list != "[]" {
		t.Fatalf("GuideEntities after the delete = %s, %v", list, err)
	}
}

// The suggestions count every stored row, the rejected ones too, and a delete with nothing there answers zeros.
func TestGuideDeleteAllCountsTheScansSuggestions(t *testing.T) {
	service, _, project := countingGuideIn(t)
	host := hostWithoutCueRefresh(service)
	host.config = config{projectFolder: project}
	if payload, err := host.GuideDeleteAll(true); err != nil || payload != `{"entries":0,"suggestions":0}` {
		t.Fatalf("an empty project = %s, %v", payload, err)
	}
	suggestions := host.extractionStore()
	offered := []store.Raw{
		{Payload: store.Payload{Kind: extraction.KindProperty, Entry: "Alice", Key: "Mood", Value: "Sleepy"}},
		{Payload: store.Payload{Kind: extraction.KindProperty, Entry: "Alice", Key: "Age", Value: "Seven"}},
	}
	paragraphs := []extraction.Paragraph{{ID: "p1", ChapterID: "c1", Text: "Alice yawned."}}
	result, err := suggestions.Ingest(store.SourceRules, offered, store.Context{Paragraphs: paragraphs, Bible: store.Bible{{ID: "alice", Name: "Alice"}}, At: time.Now()})
	if err != nil || len(result.Added) != 2 {
		t.Fatalf("ingest = %+v, %v", result, err)
	}
	if _, err := suggestions.Reject(result.Added[0].ID); err != nil {
		t.Fatal(err)
	}
	if payload, err := host.GuideDeleteAll(true); err != nil || payload != `{"entries":0,"suggestions":2}` {
		t.Fatalf("payload = %s, %v", payload, err)
	}
}

// A build or a scan writes the files a delete removes, so either running refuses the delete and leaves the Story Bible.
func TestGuideDeleteAllWaitsForABuildOrAScan(t *testing.T) {
	for name, running := range map[string]func(*Host){
		"build": func(host *Host) { host.guideJob = &workJob{id: "guide-1", kind: "story_bible", phase: "running"} },
		"scan": func(host *Host) {
			host.extractionJob = &extractionScanJob{phase: "running", sources: []string{"rules"}}
		},
	} {
		t.Run(name, func(t *testing.T) {
			service, _, project := countingGuideIn(t)
			writeStoryBible(t, project)
			host := hostWithoutCueRefresh(service)
			host.config = config{projectFolder: project}
			running(host)
			if _, err := host.GuideDeleteAll(true); err == nil || !strings.Contains(err.Error(), "wait for") {
				t.Fatalf("err = %v, want a refusal to wait", err)
			}
			if _, err := os.Stat(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")); err != nil {
				t.Fatalf("a refused delete removed the Story Bible: %v", err)
			}
		})
	}
}
