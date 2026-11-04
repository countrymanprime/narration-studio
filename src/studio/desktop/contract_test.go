package main

import (
	"desktop/internal/brand"
	"desktop/internal/trace"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/analysistools"
	"desktop/internal/assets"
	"desktop/internal/contractfile"
	"desktop/internal/dictionary"
	"desktop/internal/layout"
	"desktop/internal/manuscript"
	"desktop/internal/moonshine"
	"desktop/internal/project"
	"desktop/internal/settings"
	"desktop/internal/spacy"
	"desktop/internal/tts"
	"desktop/internal/whisper"
)

// The Bootstrap payloads the UI receives. The UI's contract tests validate these files against its schemas and
// the mock client's answers against the same schemas, so a Bootstrap that drifts from its schema fails here or there.
// Machine-specific values (the temp project folder, the diagnostic id) are fixed so the files are stable.
func contractHost(t *testing.T, project string) *Host {
	t.Helper()
	host := newTestHost(t)
	host.diagnostic = "go-1789000000000000000"
	host.config.projectFolder = project
	host.config.projectName = "Alice"
	host.config.daw = "REAPER"
	host.config.manuscriptPython, host.config.manuscriptBackend = "python.exe", "manuscript_guide.py"
	host.config.comparePython, host.config.compareBackend = "python.exe", "compare.py"
	host.config.reaperLauncher = "narration_launcher.lua"
	return host
}

func fixedBootstrap(host *Host) map[string]any {
	boot := host.Bootstrap()
	boot["projectFolder"] = "C:/Projects/Alice"
	if candidate, ok := boot["manuscriptCandidate"].(map[string]any); ok {
		candidate["path"] = "C:/Projects/Alice/Manuscript.docx"
	}
	return boot
}

func TestContractBootstrapWithAnImportedManuscript(t *testing.T) {
	project := t.TempDir()
	path := filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	data := `{"schemaVersion":1,"documentId":"alice-1","importedAt":"2026-09-01T09:30:00Z","importer":{"format":"docx"},"source":{"fileName":"Alice.docx"},"chapters":[{"wordCount":120,"contentKind":"opening"},{"wordCount":1200,"contentKind":"narration"},{"wordCount":800,"contentKind":"narration"}]}`
	if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "bootstrap-manuscript", fixedBootstrap(contractHost(t, project)))
}

func TestContractBootstrapOfferingAManuscriptCandidate(t *testing.T) {
	project := t.TempDir()
	if err := os.WriteFile(filepath.Join(project, "Manuscript.docx"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "bootstrap-candidate", fixedBootstrap(contractHost(t, project)))
}

func TestContractBootstrapOfAStandaloneLaunchWithNoProject(t *testing.T) {
	host := contractHost(t, "")
	host.config.projectName, host.config.daw = "", "Standalone"
	contractfile.Check(t, "bootstrap-standalone", host.Bootstrap())
}

// How a project attach ends, as ProjectSwitch and ProjectCreateIn answer it, and the Story Bible answer that needs a voice.
func TestContractProjectAttachResults(t *testing.T) {
	for name, attached := range map[string]struct {
		ok     bool
		reason string
	}{"project-switch-attached": {true, ""}, "project-switch-refused": {false, attachBusyReason}} {
		encoded, err := attachResult(attached.ok, attached.reason)
		if err != nil {
			t.Fatal(err)
		}
		var decoded any
		if err := json.Unmarshal([]byte(encoded), &decoded); err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, decoded)
	}
}

func TestContractPreviewNeedsAVoice(t *testing.T) {
	voice := tts.Voice{
		ID: "en_US-ljspeech-high", Provider: "piper", DisplayName: "LJSpeech (high)", Locale: "en_US", Version: "1.0", Publisher: "rhasspy",
		License: "CC0-1.0", LicenseURL: "https://example.test/license", ModelCardURL: "https://example.test/card", ProvenanceURL: "https://example.test/source",
		Attribution: "LJ Speech dataset", Files: []tts.File{{Name: "voice.onnx", Size: 114_000_000}, {Name: "voice.onnx.json", Size: 4_800}},
	}
	contractfile.Check(t, "guide-preview-asset-required", voiceAssetRequired(voice, "not_installed", "C:/Users/narrator/AppData/Local/"+brand.DataFolder+"/assets/tts/piper/en_US-ljspeech-high/1.0.0"))
}

// What SystemLookup answers: a lookup the installed dictionary made, through the real
// install and index of a small release in the Open English WordNet shape, and the first-use gate for the real approved dictionary.
func TestContractDictionaryLookup(t *testing.T) {
	f := newLookupFixture(t)
	started, err := f.host.startAssetInstall(installKindDictionary, "oewn-test")
	if err != nil {
		t.Fatal(err)
	}
	waitForPhase(t, func() map[string]any {
		job, _ := f.host.installJobByID(started["id"].(string), "asset")
		return snapshotInstall(job)
	}, "success")
	found, err := f.host.systemLookup("Happier,")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "system-lookup-found", found)
	approved, err := dictionary.New(layout.RepoFile(layout.DictionaryCatalogFile), "")
	if err != nil {
		t.Fatal(err)
	}
	entry, _ := approved.Default()
	contractfile.Check(t, "system-lookup-asset-required", dictionaryAssetRequired(entry, "not_installed", "C:/Users/narrator/AppData/Local/"+brand.DataFolder+"/assets/dictionary/oewn/oewn-2025/2025"))
}

// TestContractSaveDiagnostics pins SystemSaveDiagnostics's and SystemDiagnosticsPreview's answer shapes.
func TestContractSaveDiagnostics(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	host.version = "0.0.0-test"
	host.tracer = trace.New(trace.Options{})
	host.diagnosticsNow = func() time.Time { return time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC) }
	folder := t.TempDir()
	host.pickDiagnosticsFolder = func() (string, error) { return folder, nil }
	path, err := host.saveDiagnostics()
	if err != nil {
		t.Fatal(err)
	}
	fixed := strings.ReplaceAll(filepath.ToSlash(path), filepath.ToSlash(folder), "C:/Users/narrator/Documents")
	contractfile.Check(t, "system-save-diagnostics", map[string]any{"path": fixed})
	bundle, err := host.buildDiagnostics()
	if err != nil {
		t.Fatal(err)
	}
	preview := bundle.Preview()
	preview.LeakCheck.Terms = 0 // the account and home folder names differ by machine
	contractfile.Check(t, "system-diagnostics-preview", preview)
}

// The approved catalogs, built from the repository's real config files with nothing installed, and the install jobs.
// contractFixture is what the catalog payloads are built from: the registry of approved assets and the settings that say which is selected.
type contractFixture struct {
	registry *assetRegistry
	settings *settings.Store
}

func contractServices(t *testing.T) contractFixture {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	voices, err := tts.New(layout.RepoFile(layout.TTSCatalogFile), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	models, err := whisper.New(layout.RepoFile(layout.WhisperCatalogFile), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	languageModels, err := spacy.New(layout.RepoFile(layout.SpacyCatalogFile), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	tools, err := analysistools.New(layout.RepoFile(layout.AnalysisCatalogFile), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	registry := newAssetRegistry(t.TempDir(), voices, models, languageModels, nil)
	registry.registerAnalysisTools(tools)
	return contractFixture{registry: registry, settings: settings.New(layout.FindRoot("."), "")}
}

func TestContractInstallJobs(t *testing.T) {
	for name, job := range map[string]*installJob{
		"tts-install-downloading":     {id: "tts-1", kind: installKindTts, assetID: "en_US-ljspeech-high", phase: installPhaseDownloading, message: "Downloading and verifying the approved voice…", done: 45678901, total: 114203981},
		"tts-install-verifying":       {id: "tts-1", kind: installKindTts, assetID: "en_US-ljspeech-high", phase: installPhaseVerifying, message: "Checking the voice against its approved checksum…", done: 114203981, total: 114203981},
		"tts-install-success":         {id: "tts-1", kind: installKindTts, assetID: "en_US-ljspeech-high", phase: installPhaseSuccess, message: "Voice installed and verified.", done: 114203981, total: 114203981},
		"tts-install-error":           {id: "tts-1", kind: installKindTts, assetID: "en_US-ljspeech-high", phase: installPhaseError, message: "The downloaded voice did not match the approved file, so it was not installed.", errorText: "The downloaded voice did not match the approved file, so it was not installed.", done: 20000000, total: 114203981},
		"tts-install-cancelled":       {id: "tts-1", kind: installKindTts, assetID: "en_US-ljspeech-high", phase: installPhaseCancelled, message: "Voice download cancelled.", done: 20000000, total: 114203981},
		"whisper-install-downloading": {id: "whisper-1", kind: installKindWhisper, assetID: "small", phase: installPhaseDownloading, message: "Downloading and verifying the approved Whisper model…", done: 120000000, total: 486212372},
		"whisper-install-success":     {id: "whisper-1", kind: installKindWhisper, assetID: "small", phase: installPhaseSuccess, message: "Whisper model installed and verified.", done: 486212372, total: 486212372},
	} {
		contractfile.Check(t, name, legacyInstall(snapshotInstall(job)))
	}
}

// The generic asset API: the list of everything that can be downloaded, and the answer to a verify.
func TestContractAssetsListAndVerify(t *testing.T) {
	fixture := contractServices(t)
	host := &Host{assets: fixture.registry, installJobs: map[string]*installJob{}}
	list, err := host.assetsList()
	if err != nil {
		t.Fatal(err)
	}
	// The cache folder is a per-machine path; the golden holds a fixed one so the file is the same everywhere.
	list["cacheRoot"] = "C:/Users/narrator/AppData/Local/" + brand.DataFolder + "/assets"
	for _, entry := range list["assets"].([]map[string]any) {
		entry["path"] = "C:/Users/narrator/AppData/Local/" + brand.DataFolder + "/assets/" + entry["kind"].(string) + "/" + entry["id"].(string)
	}
	contractfile.Check(t, "assets-list", list)
	contractfile.Check(t, "asset-install-downloading", snapshotInstall(&installJob{id: "tts-1", kind: installKindTts, assetID: "en_US-ljspeech-high", phase: installPhaseDownloading, message: "Downloading and verifying the approved voice…", done: 45678901, total: 114203981}))
	unpack := installFailureText(&assets.StepError{Step: assets.StepUnpack, File: "torch.whl", Err: os.ErrPermission}, "analysis tool")
	contractfile.Check(t, "asset-install-unpack-error", snapshotInstall(&installJob{id: "analysis-1", kind: installKindAnalysis, assetID: "booknlp-small", phase: installPhaseError, message: unpack, errorText: unpack,
		errorDetail: "Unpacking torch-2.14.1-cp312-cp312-win_amd64.whl: open: Access is denied.", done: 220000000, total: 220000000}))
	contractfile.Check(t, "assets-verify", map[string]any{"kind": "tts", "id": "en_US-ljspeech-high", "installState": "verification_failed"})
}

func TestContractAFirstUseGateForAModel(t *testing.T) {
	svc := contractServices(t)
	model, ok := svc.registry.whisper.Model("small")
	if !ok {
		t.Fatal("the approved catalog has no small model")
	}
	contractfile.Check(t, "transcript-start-asset-required", modelAssetRequired(model, svc.registry.whisper.State(model), "C:/Users/narrator/AppData/Local/"+brand.DataFolder+"/assets/whisper/faster-whisper/small/536b0662742c02347bc0e980a01041f333bce120"))
	contractfile.Check(t, "transcript-start-started", map[string]any{"status": "started"})
}

// The Teleprompter's first-use gate for each live engine: the same shape as Transcript Compare's plus the engine the model belongs to.
func TestContractTheTeleprompterFirstUseGateForEachEngine(t *testing.T) {
	svc := contractServices(t)
	whisperModel, ok := svc.registry.whisper.Model("tiny")
	if !ok {
		t.Fatal("the approved Whisper catalog has no tiny model")
	}
	liveModels, err := moonshine.New(layout.RepoFile(layout.MoonshineCatalogFile), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	moonshineModel, ok := liveModels.Model("tiny")
	if !ok {
		t.Fatal("the approved Moonshine catalog has no tiny model")
	}
	contractfile.Check(t, "teleprompter-start-asset-required-whisper", liveAssetRequired("whisper", previewModel(whisperModel), modelDownloadSize(whisperModel), svc.registry.whisper.State(whisperModel), "C:/Users/narrator/AppData/Local/"+brand.DataFolder+"/assets/whisper/faster-whisper/tiny/"+whisperModel.Version))
	contractfile.Check(t, "teleprompter-start-asset-required-moonshine", liveAssetRequired("moonshine", previewMoonshineModel(moonshineModel), moonshineDownloadSize(moonshineModel), liveModels.State(moonshineModel), "C:/Users/narrator/AppData/Local/"+brand.DataFolder+"/assets/moonshine/moonshine/tiny/"+moonshineModel.Version))
}

// The Settings page's fields for both scopes, from the real field schemas and the repository's defaults.
func TestContractSettingsForEachScope(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	project := t.TempDir()
	host := newTestHost(t)
	host.settings = settings.New(layout.FindRoot("."), project)
	// The approved catalogs fill the choices that come from them (the spaCy model, the Preview voice), as in the app.
	host.assets = contractServices(t).registry
	// The live engine choices follow the platform (Moonshine ships only on Windows); pin it so the golden is
	// the same on every runner.
	host.platform = "windows"
	for _, scope := range []string{"global", "project"} {
		fields, err := host.settingsForScope(scope)
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, "settings-"+scope, fields)
	}
}

// The Script tool's settings as the Words tab and Settings' Definitions panel read them: unset (web, the default), and with the local
// dictionary chosen.
func TestContractSettingsDefinitionSource(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	host.settings = settings.New(layout.FindRoot("."), t.TempDir())
	pin := func(name string) {
		fields, err := host.settingsForScope("global")
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, map[string]any{"Script": fields["Script"]})
	}
	pin("settings-definition-source")
	local := "local"
	if err := host.saveSettings("Script", "global", map[string]*string{"definition_source": &local}); err != nil {
		t.Fatal(err)
	}
	pin("settings-definition-source-local")
}

// The audio engine panel's discovery as TracksDiscover and TracksSelect send it: nothing found (a nil list, sent as null), several files and
// no choice yet, and one file that is selected on its own.
func TestContractTracksDiscovery(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	pin := func(name, folder string) {
		discovery, err := discoverTracks(hostServices{config: config{projectFolder: folder}, settings: settings.New(layout.FindRoot("."), folder)})
		if err != nil {
			t.Fatal(err)
		}
		stable, err := contractfile.PortablePaths(discovery, folder, "C:/Projects/Alice")
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, stable)
	}
	write := func(folder, file string) {
		if err := os.WriteFile(filepath.Join(folder, file), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	none, several, one := t.TempDir(), t.TempDir(), t.TempDir()
	write(several, "Alice.rpp")
	write(several, "Alice-alt-mix.rpp")
	write(one, "Alice.rpp")
	pin("tracks-discovery-none", none)
	pin("tracks-discovery-several", several)
	pin("tracks-discovery-selected", one)
}

// The confirmed chapter-track mapping's ChapterTrackMapList/Confirm/Clear payloads. ConfirmedAt is a real timestamp (RFC3339Nano), so it is normalized to a fixed value before pinning -
// the same "machine-specific values are fixed" rule contractHost already applies to the diagnostic id.
func TestContractChapterTrackMap(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	project := t.TempDir()
	host := newTestHost(t)
	host.config.projectFolder = project
	host.manuscript = manuscript.New(project)
	job := host.manuscript.Begin(layout.RepoFile(layout.FixturesDir + "/alice.md"))
	if _, err := host.manuscript.Preview(job.ID, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := host.manuscript.Commit(job.ID, false, manuscript.Choices{}); err != nil {
		t.Fatal(err)
	}
	chapters, err := host.manuscript.Chapters()
	if err != nil || len(chapters) == 0 {
		t.Fatalf("chapters = %#v, %v", chapters, err)
	}
	firstChapterID, _ := chapters[0]["id"].(string)

	pin := func(name string, value any) {
		normalized, err := normalizeMappingPayload(value)
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, normalized)
	}

	emptyRaw, err := host.ChapterTrackMapList()
	if err != nil {
		t.Fatal(err)
	}
	pin("chapter-track-map-empty", json.RawMessage(emptyRaw))

	confirmedRaw, err := host.ChapterTrackMapConfirm("{0E4D1D7F-D039-674D-87E6-719376DE95EC}", firstChapterID)
	if err != nil {
		t.Fatal(err)
	}
	pin("chapter-track-map-confirmed", json.RawMessage(confirmedRaw))

	listRaw, err := host.ChapterTrackMapList()
	if err != nil {
		t.Fatal(err)
	}
	pin("chapter-track-map-list", json.RawMessage(listRaw))
}

// normalizeMappingPayload decodes a JSON-encoded ChapterTrackMap binding payload and replaces every "confirmedAt"
// field (a real time.Now() value) and "documentId" field (newID()'s random hex, manuscript/service.go) with fixed
// values, so neither ever makes a committed contract fixture flap from one test run to the next - the same
// "machine-specific values are fixed" rule contractHost already applies to the diagnostic id.
func normalizeMappingPayload(value any) (any, error) {
	const fixedTime = "2026-01-01T00:00:00Z"
	const fixedDocumentID = "doc-fixed-for-contract-test"
	bytes, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var decoded map[string]any
	if err := json.Unmarshal(bytes, &decoded); err != nil {
		return nil, err
	}
	if _, ok := decoded["confirmedAt"]; ok {
		decoded["confirmedAt"] = fixedTime
	}
	if _, ok := decoded["documentId"]; ok {
		decoded["documentId"] = fixedDocumentID
	}
	if mappings, ok := decoded["mappings"].([]any); ok {
		for _, entry := range mappings {
			if mapping, ok := entry.(map[string]any); ok {
				mapping["confirmedAt"] = fixedTime
			}
		}
	}
	return decoded, nil
}

// ChapterTrackMatch's payload: a matched chapter with its
// recorded end, an ambiguous one and one with no track. The project folder is made portable; Stabilize fixes the .rpp's
// save time.
func TestContractChapterTrackMatch(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	folder := host.config.projectFolder
	for name, id := range map[string]string{
		"chapter-track-match-matched":   ids[0],
		"chapter-track-match-ambiguous": ids[1],
		"chapter-track-match-none":      ids[2],
	} {
		raw, err := host.ChapterTrackMatch(id)
		if err != nil {
			t.Fatal(err)
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			t.Fatal(err)
		}
		stable, err := contractfile.PortablePaths(payload, folder, "C:/Projects/Alice")
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, stable)
	}
}

// The chapter track link control's payloads: ChapterTrackLinks with a ready
// project, with no .rpp, and with a double link, a missing track and a renamed one; ChapterTrackSet taking a track from
// another chapter; ChapterTrackUnlink. Paths are made portable, ids and times fixed by Stabilize.
func TestContractChapterTrackLinks(t *testing.T) {
	pin := func(t *testing.T, name string, folder string, raw string) {
		t.Helper()
		var payload any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			t.Fatal(err)
		}
		stable, err := contractfile.PortablePaths(payload, folder, "C:/Projects/Alice")
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, stable)
	}
	call := func(raw string, err error) string {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}

	noProject, _ := newTestHostForMapping(t)
	pin(t, "chapter-track-links-no-project", noProject.config.projectFolder, call(noProject.ChapterTrackLinks()))

	host, ids := newTestHostForChapterMatch(t)
	folder := host.config.projectFolder
	pin(t, "chapter-track-links-ready", folder, call(host.ChapterTrackLinks()))

	for _, link := range [][2]string{{chapterLinksTrackII, ids[1]}, {chapterLinksTrackIJ, ids[1]}, {chapterLinksTrack, ids[2]}, {"{DEADBEEF-0000-4000-8000-000000000000}", ids[0]}} {
		call(host.ChapterTrackMapConfirm(link[0], link[1]))
	}
	pin(t, "chapter-track-links-conflict", folder, call(host.ChapterTrackLinks()))
	pin(t, "chapter-track-set-displaced", folder, call(host.ChapterTrackSet(ids[0], chapterLinksTrack)))
	pin(t, "chapter-track-unlink", folder, call(host.ChapterTrackUnlink(ids[1])))
}

// The system:notice event: something the app did for the narrator that they should read.
func TestContractNarratorNotice(t *testing.T) {
	contractfile.Check(t, "system-notice", noticePayload("Your notes file could not be read. It was kept as manuscript-notes.json.corrupt-20260921-101530 next to the original, and a fresh one was started."))
}

// ProjectLinkDawFile's result: a file linked inside the
// project folder, one outside it (refused), and the dialog cancelled.
func TestContractProjectLinkDawFile(t *testing.T) {
	folder := t.TempDir()
	rpp := filepath.Join(folder, "Alice.rpp")
	if err := os.WriteFile(rpp, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	linked, err := linkDawFile(nil, folder, rpp)
	if err != nil {
		t.Fatal(err)
	}
	stableLinked, err := contractfile.PortablePaths(linked, folder, "C:/Projects/Alice")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "daw-link-selected", stableLinked)

	other := t.TempDir()
	elsewhere := filepath.Join(other, "Elsewhere.rpp")
	if err := os.WriteFile(elsewhere, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	outside, err := linkDawFile(nil, folder, elsewhere)
	if err != nil {
		t.Fatal(err)
	}
	stableOutside, err := contractfile.PortablePaths(outside, folder, "C:/Projects/Alice")
	if err != nil {
		t.Fatal(err)
	}
	stableOutside, err = contractfile.PortablePaths(stableOutside, other, "D:/Audio/Elsewhere")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "daw-link-outside", stableOutside)

	notRpp := filepath.Join(folder, "take.wav")
	if err := os.WriteFile(notRpp, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	refused, err := linkDawFile(nil, folder, notRpp)
	if err != nil {
		t.Fatal(err)
	}
	stableRefused, err := contractfile.PortablePaths(refused, folder, "C:/Projects/Alice")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "daw-link-refused", stableRefused)

	contractfile.Check(t, "daw-link-cancelled", map[string]any{"selected": false, "linked": false})
}

// TestContractProjectDefaultLocation pins ProjectDefaultLocation's result shape.
func TestContractProjectDefaultLocation(t *testing.T) {
	home := t.TempDir()
	t.Setenv("USERPROFILE", home)
	t.Setenv("HOME", home)
	raw, err := NewHost().ProjectDefaultLocation()
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		t.Fatal(err)
	}
	stable, err := contractfile.PortablePaths(result, home, "C:/Users/Alice")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "project-default-location", stable)
}

// TestContractDawLaunch pins DawLaunch's result shape.
func TestContractDawLaunch(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir()) // never read the real machine's global-settings.json
	folder := t.TempDir()
	rpp := filepath.Join(folder, "Alice.rpp")
	if err := os.WriteFile(rpp, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	link, err := project.BuildDawLink(folder, rpp)
	if err != nil {
		t.Fatal(err)
	}
	manifest := project.New("Alice", time.Now())
	manifest.DawProjectFile = &link
	if err := manifest.Save(folder); err != nil {
		t.Fatal(err)
	}
	svc := hostServices{config: config{projectFolder: folder}, settings: settings.New("", folder)}
	locate := func() (string, string, error) {
		return `C:\Program Files\REAPER (x64)\reaper.exe`, "uninstall_registry", nil
	}
	launched, err := launchReaper(svc, nil, locate, func(string, []string) error { return nil }, notRunning)
	if err != nil {
		t.Fatal(err)
	}
	stable, err := contractfile.PortablePaths(launched, folder, "C:/Projects/Alice")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "daw-launch", stable)
}

// CreditsTemplates' shipped defaults.
func TestContractCreditsTemplates(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := newTestHost(t)
	templates, err := host.creditTemplates.List()
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "credits-templates", templates)
}

// CreditsProjectValues' payload for a project with no credits saved yet, and CreditsPreview's Result for a template with
// one unresolved token (Success Metrics: "unresolved tokens are reported by name").
func TestContractCreditsProjectValuesAndPreview(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	folder := t.TempDir()
	host := newTestHost(t)
	host.config.projectFolder = folder
	host.config.projectName = "Alice"
	host.settings = settings.New(layout.FindRoot("."), folder)
	values, err := host.CreditsProjectValues()
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(values), &decoded); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "credits-project-values-empty", decoded)

	preview, err := host.CreditsPreview("[Title], written by [Author], narrated by [Narrator].")
	if err != nil {
		t.Fatal(err)
	}
	var decodedPreview map[string]any
	if err := json.Unmarshal([]byte(preview), &decodedPreview); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "credits-preview-unresolved", decodedPreview)
}

// CreditsChapterAnnouncements' answer: one per narration chapter, the second with its optional chapter
// title dropped and an unresolved project token reported.
func TestContractCreditsChapterAnnouncements(t *testing.T) {
	host := hostWithExtras(t, 10)
	encoded, err := host.CreditsChapterAnnouncements("[Chapter]{: [Chapter Title]}. [Title].")
	if err != nil {
		t.Fatal(err)
	}
	var decoded any
	decodeInto(t, encoded, &decoded)
	contractfile.Check(t, "credits-chapter-announcements", decoded)
}

// CreditsRetailSample's answers: a measured sample, none picked, and a saved one whose lines are gone.
func TestContractCreditsRetailSample(t *testing.T) {
	host := hostWithExtras(t, 100)
	check := func(name, encoded string) {
		t.Helper()
		var decoded any
		decodeInto(t, encoded, &decoded)
		contractfile.Check(t, name, decoded)
	}
	none, err := host.CreditsRetailSample()
	if err != nil {
		t.Fatal(err)
	}
	check("credits-retail-sample-none", none)
	saved, err := host.CreditsSaveRetailSample("p4", "p5")
	if err != nil {
		t.Fatal(err)
	}
	check("credits-retail-sample", saved)
	manifest, _, _ := project.Load(host.persist, host.config.projectFolder)
	manifest.RetailSample.EndParagraphID = "gone"
	if err := manifest.Save(host.config.projectFolder); err != nil {
		t.Fatal(err)
	}
	stale, err := host.CreditsRetailSample()
	if err != nil {
		t.Fatal(err)
	}
	check("credits-retail-sample-stale", stale)
}

// CreditsStatuses' and CreditsSetStatus's payloads: empty before
// anything is set, then both kinds once set.
func TestContractCreditsStatuses(t *testing.T) {
	host := hostWithExtras(t, 10)
	check := func(name, encoded string) {
		t.Helper()
		var decoded any
		decodeInto(t, encoded, &decoded)
		contractfile.Check(t, name, decoded)
	}
	empty, err := host.CreditsStatuses()
	if err != nil {
		t.Fatal(err)
	}
	check("credits-status-empty", empty)
	if _, err := host.CreditsSetStatus("opening", "finalized"); err != nil {
		t.Fatal(err)
	}
	set, err := host.CreditsSetStatus("closing", "recording")
	if err != nil {
		t.Fatal(err)
	}
	check("credits-status-set", set)
}

// CreditsRecordedLengths' payload: both kinds unavailable before any track
// is linked and no saved project exists.
func TestContractCreditsRecordedLengths(t *testing.T) {
	host := hostWithExtras(t, 10)
	lengths, err := host.CreditsRecordedLengths()
	if err != nil {
		t.Fatal(err)
	}
	var decoded any
	decodeInto(t, lengths, &decoded)
	contractfile.Check(t, "credits-recorded-lengths", decoded)
}

// The findings the retired take review and take comparison saved, as FindingsList still sends them (#2765): plain
// findings the page lists and decides like any other, with the evidence they were saved with.
func TestContractRetiredTakeFindings(t *testing.T) {
	host := newRetiredFindingsHost(t, &fakeNavigator{})
	for analyzer, golden := range map[string]string{"take-review": "findings-list-take-review", "take-comparison": "findings-list-take-comparison"} {
		listed, err := host.FindingsList(FindingsQuery{Analyzer: analyzer})
		if err != nil {
			t.Fatal(err)
		}
		checkBindingContract(t, golden, listed)
	}
}

// The manuscript:dropped event: an import begun on a dropped file (it names the file and the job, never the path), and a drop the host refused.
func TestContractManuscriptDropped(t *testing.T) {
	contractfile.Check(t, "manuscript-dropped-begun", map[string]any{"jobId": "import-1", "name": "Alice in Wonderland.docx"})
	contractfile.Check(t, "manuscript-dropped-refused", NewHost().beginDropped([]string{"/a.txt", "/b.txt"}))
}
