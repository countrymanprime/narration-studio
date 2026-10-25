package main

import (
	"context"
	"crypto/sha256"
	"desktop/internal/brand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/guide"
	"desktop/internal/process"
	"desktop/internal/settings"
	"desktop/internal/tts"
)

const (
	fakeGuideRenderEnv = "SHELL_FAKE_GUIDE_RENDER"
	// previewVoiceID is the settings default, so a Host with no saved voice
	// selection picks the voice the test catalog defines.
	previewVoiceID = "en_US-ljspeech-high"
)

// runFakeGuideRender stands in for the Story Bible sidecar's render-audio
// command: it writes a small WAV where the host asked for it, or fails.
func runFakeGuideRender() int {
	if path := os.Getenv("SHELL_FAKE_GUIDE_ARGS"); path != "" {
		// A test that wants to see how the sidecar was started: the arguments, one per line.
		_ = os.WriteFile(path, []byte(strings.Join(os.Args[1:], "\n")+"\n"), 0o600)
	}
	if os.Getenv(fakeGuideRenderEnv) == "fail" {
		_, _ = os.Stderr.WriteString("ERROR: \"Dawnspire\" could not be spoken: the voice produced no audio for it.\n")
		return 1
	}
	if len(os.Args) > 1 {
		// A build's model work: no language model, and an empty pronunciation for each name.
		switch os.Args[1] {
		case "entities", "pronunciation":
			if os.Args[1] == "entities" {
				_, _ = os.Stdout.WriteString(`{"available": false}` + "\n")
			}
			for index, arg := range os.Args {
				if arg == "--words-file" && index+1 < len(os.Args) {
					for deadline := time.Now().Add(20 * time.Second); time.Now().Before(deadline); time.Sleep(5 * time.Millisecond) {
						if _, err := os.Stat(os.Args[index+1]); err == nil {
							break
						}
					}
					raw, _ := os.ReadFile(os.Args[index+1])
					var words []string
					_ = json.Unmarshal(raw, &words)
					_, _ = os.Stdout.WriteString(strings.Repeat("{}\n", len(words)))
				}
			}
			return 0
		}
	}
	var dir, name string
	for index, arg := range os.Args {
		if index+1 >= len(os.Args) {
			break
		}
		switch arg {
		case "--audio-dir":
			dir = os.Args[index+1]
		case "--output-name":
			name = os.Args[index+1]
		}
	}
	_ = os.MkdirAll(dir, 0o755)
	_ = os.WriteFile(filepath.Join(dir, name), append([]byte("RIFF-fake-wav-"), make([]byte, 64)...), 0o600)
	return 0
}

type previewHost struct {
	host      *Host
	voice     tts.Voice
	voiceFile string
	project   string
}

// newPreviewHost builds a Host with a Story Bible holding one entity and a
// one-voice catalog served by a local server. The voice is not installed until
// the test installs it.
func newPreviewHost(t *testing.T, renderMode string) previewHost {
	t.Helper()
	t.Setenv(fakeGuideRenderEnv, renderMode)
	t.Setenv("APPDATA", t.TempDir()) // keep the developer's own global voice choice out of the test
	model, modelConfig := []byte("model-bytes"), []byte("{}")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".json") {
			_, _ = w.Write(modelConfig)
			return
		}
		_, _ = w.Write(model)
	}))
	t.Cleanup(server.Close)
	sum := func(body []byte) string { digest := sha256.Sum256(body); return hex.EncodeToString(digest[:]) }
	catalog := map[string]any{"catalogVersion": 1, "voices": []map[string]any{{
		"id": previewVoiceID, "provider": "piper", "displayName": "Test voice", "locale": "en_US", "version": "1.0.0",
		"files": []map[string]any{
			{"name": previewVoiceID + ".onnx", "url": server.URL + "/voice.onnx", "sha256": sum(model), "size": len(model)},
			{"name": previewVoiceID + ".onnx.json", "url": server.URL + "/voice.onnx.json", "sha256": sum(modelConfig), "size": len(modelConfig)},
		},
	}}}
	catalogPath := filepath.Join(t.TempDir(), "tts-assets.json")
	body, err := json.Marshal(catalog)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(catalogPath, body, 0o600); err != nil {
		t.Fatal(err)
	}
	cacheRoot := t.TempDir()
	manager, err := tts.New(catalogPath, cacheRoot)
	if err != nil {
		t.Fatal(err)
	}
	project := t.TempDir()
	store := settings.New(t.TempDir(), project)
	sidecars := process.NewSupervisor()
	t.Cleanup(func() { _ = sidecars.Close() })
	service := guide.New(project, os.Args[0], "", store, sidecars)
	guidePath := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	if err := os.MkdirAll(filepath.Dir(guidePath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(guidePath, []byte(`{"entities":[{"id":"e1","canonical_name":"Dawnspire","aliases":[]}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	// The manuscript a build reads, which the host's cue refresh after it reads too.
	manuscript := filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(manuscript), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manuscript, []byte(`{"schemaVersion":1,"documentId":"d","chapters":[{"id":"c1"}],"paragraphs":[{"id":"p1","chapterId":"c1","chapterTitle":"One","text":"Hello, said Captain Dawnspire."}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	voice, _ := manager.Voice(previewVoiceID)
	return previewHost{host: &Host{settings: store, assets: newAssetRegistry(cacheRoot, manager, nil, nil, nil), guide: service}, voice: voice, project: project, voiceFile: filepath.Join(cacheRoot, "piper", previewVoiceID, "1.0.0", previewVoiceID+".onnx")}
}

func (p previewHost) install(t *testing.T) {
	t.Helper()
	if err := p.host.registry().tts.Install(context.Background(), previewVoiceID); err != nil {
		t.Fatal(err)
	}
}

func decodePreview(t *testing.T, raw string) map[string]any {
	t.Helper()
	var result map[string]any
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestGuidePreviewIsUnavailableWithoutTheStoryBibleOrVoices(t *testing.T) {
	if _, err := (&Host{}).GuidePreview("e1", nil); err == nil || !strings.Contains(err.Error(), "unavailable") {
		t.Fatalf("error = %v, want an unavailable message", err)
	}
}

func TestGuidePreviewRejectsAVoiceOutsideTheApprovedCatalog(t *testing.T) {
	rig := newPreviewHost(t, "wav")
	other := "not-a-catalog-voice"
	if err := rig.host.settings.Save("Piper", "project", map[string]*string{"tts_voice_id": &other}); err != nil {
		t.Fatal(err)
	}
	if _, err := rig.host.GuidePreview("e1", nil); err == nil || !strings.Contains(err.Error(), "approved catalog") {
		t.Fatalf("error = %v, want the approved-catalog message", err)
	}
}

func TestGuidePreviewAsksToInstallTheVoiceBeforeRendering(t *testing.T) {
	rig := newPreviewHost(t, "wav")
	raw, err := rig.host.GuidePreview("e1", nil)
	if err != nil {
		t.Fatal(err)
	}
	result := decodePreview(t, raw)
	if result["status"] != "asset_required" || result["installState"] != "not_installed" {
		t.Fatalf("result = %#v, want asset_required / not_installed", result)
	}
	if voice, _ := result["voice"].(map[string]any); voice["id"] != previewVoiceID {
		t.Fatalf("voice = %#v", result["voice"])
	}
}

func TestGuidePreviewTreatsADamagedVoiceAsNeedingReinstall(t *testing.T) {
	rig := newPreviewHost(t, "wav")
	rig.install(t)
	if err := os.WriteFile(rig.voiceFile, []byte("corrupt"), 0o600); err != nil {
		t.Fatal(err)
	}
	result := decodePreview(t, mustPreview(t, rig.host))
	if result["status"] != "asset_required" || result["installState"] != "verification_failed" {
		t.Fatalf("result = %#v, want asset_required / verification_failed", result)
	}
}

func TestGuidePreviewReturnsAudioOnceTheVoiceIsInstalled(t *testing.T) {
	rig := newPreviewHost(t, "wav")
	rig.install(t)
	result := decodePreview(t, mustPreview(t, rig.host))
	if result["status"] != "ready" || result["mimeType"] != "audio/wav" {
		t.Fatalf("result = %#v", result)
	}
	audio, err := base64.StdEncoding.DecodeString(result["audioBase64"].(string))
	if err != nil || len(audio) == 0 {
		t.Fatalf("audio = %d bytes, %v", len(audio), err)
	}
}

func TestGuidePreviewSurfacesWhyTheSidecarFailed(t *testing.T) {
	rig := newPreviewHost(t, "fail")
	rig.install(t)
	_, err := rig.host.GuidePreview("e1", nil)
	if err == nil || !strings.Contains(err.Error(), "could not be spoken") || strings.Contains(err.Error(), "ERROR:") {
		t.Fatalf("error = %v, want the sidecar's reason without its log prefix", err)
	}
}

func TestGuidePreviewSaysWhenTheStoryBibleHelperIsNotConfigured(t *testing.T) {
	rig := newPreviewHost(t, "wav")
	rig.install(t)
	sidecars := process.NewSupervisor()
	t.Cleanup(func() { _ = sidecars.Close() })
	rig.host.guide = guide.New(rig.project, filepath.Join(t.TempDir(), "missing.exe"), "", rig.host.settings, sidecars)
	if _, err := rig.host.GuidePreview("e1", nil); err == nil || !strings.Contains(err.Error(), "Manuscript Guide executable") {
		t.Fatalf("error = %v, want the configure-the-executable message", err)
	}
}

func mustPreview(t *testing.T, host *Host) string {
	t.Helper()
	raw, err := host.GuidePreview("e1", nil)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
