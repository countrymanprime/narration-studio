package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/analysistools"
	"github.com/countrymanprime/narration-utils/shell/internal/assets"
	"github.com/countrymanprime/narration-utils/shell/internal/layout"
)

// answer reads a binding JSON answer into a map, so a test looks at what the UI receives: answer(t)(host.AssetsList()).
func answer(t *testing.T) func(string, error) map[string]any {
	return func(raw string, err error) map[string]any {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var out map[string]any
		if err := json.Unmarshal([]byte(raw), &out); err != nil {
			t.Fatalf("%q is not a JSON object: %v", raw, err)
		}
		return out
	}
}

func listedAsset(t *testing.T, catalog map[string]any, kind, id string) map[string]any {
	t.Helper()
	for _, entry := range catalog["assets"].([]any) {
		asset := entry.(map[string]any)
		if asset["kind"] == kind && asset["id"] == id {
			return asset
		}
	}
	t.Fatalf("%s %s is not in the list %v", kind, id, catalog["assets"])
	return nil
}

func TestAssetsListNamesEveryApprovedAssetOfEveryKindWithItsState(t *testing.T) {
	f := newInstallFixture(t, false)
	close(f.release)
	first, _ := f.host.startTtsInstall("v1")
	waitForPhase(t, voiceState(f, first["id"].(string)), "success")

	catalog := answer(t)(f.host.AssetsList())
	if catalog["cacheRoot"] == "" || !strings.Contains(catalog["cacheRoot"].(string), "cache") {
		t.Fatalf("cacheRoot = %v, want the folder downloads go to", catalog["cacheRoot"])
	}
	voice := listedAsset(t, catalog, "tts", "v1")
	model := listedAsset(t, catalog, "whisper", "m1")
	if voice["installState"] != "installed" || model["installState"] != "not_installed" {
		t.Fatalf("states = %v and %v", voice["installState"], model["installState"])
	}
	if voice["downloadSize"] != float64(5000) || voice["displayName"] != "V" || voice["version"] != "1" {
		t.Fatalf("voice = %v", voice)
	}
	if path, _ := voice["path"].(string); !strings.HasSuffix(filepath.ToSlash(path), "piper/v1/1") {
		t.Fatalf("voice path = %q, want where it is installed", path)
	}
	if voice["installedAt"] == "" || voice["verifiedAt"] == "" || model["installedAt"] != "" {
		t.Fatalf("installedAt/verifiedAt: voice %v %v, model %v", voice["installedAt"], voice["verifiedAt"], model["installedAt"])
	}
	if catalog["totalInstalledBytes"] != float64(5000) {
		t.Fatalf("totalInstalledBytes = %v, want the 5000 bytes of the one installed asset", catalog["totalInstalledBytes"])
	}
	if voice["kindLabel"] == "" || voice["kindLabel"] == model["kindLabel"] {
		t.Fatalf("kind labels %v and %v should tell a voice from a model", voice["kindLabel"], model["kindLabel"])
	}
}

func TestAssetsListShowsADownloadThatIsRunningSoAPageCanFollowIt(t *testing.T) {
	f := newInstallFixture(t, false)
	started := answer(t)(f.host.AssetsInstall("whisper", "m1"))
	if started["kind"] != "whisper" || started["assetId"] != "m1" || started["phase"] != "downloading" {
		t.Fatalf("started = %v", started)
	}
	model := listedAsset(t, answer(t)(f.host.AssetsList()), "whisper", "m1")
	if model["activeJobId"] != started["id"] {
		t.Fatalf("activeJobId = %v, want %v", model["activeJobId"], started["id"])
	}
	cancelled := answer(t)(f.host.AssetsInstallCancel(started["id"].(string)))
	if cancelled["id"] != started["id"] {
		t.Fatalf("cancel = %v", cancelled)
	}
	waitForPhase(t, func() map[string]any { return answer(t)(f.host.AssetsInstallState(started["id"].(string))) }, "cancelled")
	if again := listedAsset(t, answer(t)(f.host.AssetsList()), "whisper", "m1"); again["activeJobId"] != "" {
		t.Fatalf("activeJobId = %v after the download ended", again["activeJobId"])
	}
}

func TestAssetsInstallRefusesAKindOrAnAssetThatIsNotInTheApprovedCatalog(t *testing.T) {
	f := newInstallFixture(t, false)
	if _, err := f.host.AssetsInstall("moonshine", "x"); err == nil || !strings.Contains(err.Error(), "not an approved kind") {
		t.Fatalf("unknown kind: %v", err)
	}
	if _, err := f.host.AssetsInstall("tts", "nope"); err == nil || !strings.Contains(err.Error(), "not in the approved catalog") {
		t.Fatalf("unknown id: %v", err)
	}
}

func TestAssetsVerifyReportsADamagedAssetAndInstallRepairsIt(t *testing.T) {
	f := newInstallFixture(t, false)
	close(f.release)
	first, _ := f.host.startTtsInstall("v1")
	waitForPhase(t, voiceState(f, first["id"].(string)), "success")
	voice, _ := f.host.registry().tts.Voice("v1")
	file := filepath.Join(f.host.registry().tts.InstallDir("v1"), voice.Files[0].Name)
	if err := os.WriteFile(file, []byte(strings.Repeat("x", 4000)), 0o600); err != nil { // same size, different bytes
		t.Fatal(err)
	}
	if got := answer(t)(f.host.AssetsVerify("tts", "v1")); got["installState"] != "verification_failed" || got["kind"] != "tts" || got["id"] != "v1" {
		t.Fatalf("verify = %v, want verification_failed", got)
	}
	if listed := listedAsset(t, answer(t)(f.host.AssetsList()), "tts", "v1"); listed["installState"] != "verification_failed" {
		t.Fatalf("the list says %v: a damaged asset must be listed as needing repair", listed["installState"])
	}
	repair := answer(t)(f.host.AssetsInstall("tts", "v1"))
	waitForPhase(t, func() map[string]any { return answer(t)(f.host.AssetsInstallState(repair["id"].(string))) }, "success")
	if got := answer(t)(f.host.AssetsVerify("tts", "v1")); got["installState"] != "installed" {
		t.Fatalf("after the repair verify = %v", got)
	}
}

func TestAssetsRemoveDeletesOnlyThatAssetAndRefusesWhileItDownloads(t *testing.T) {
	f := newInstallFixture(t, false)
	started := answer(t)(f.host.AssetsInstall("tts", "v1"))
	if _, err := f.host.AssetsRemove("tts", "v1"); err == nil || !strings.Contains(err.Error(), "downloading") {
		t.Fatalf("remove while downloading: %v", err)
	}
	close(f.release)
	waitForPhase(t, func() map[string]any { return answer(t)(f.host.AssetsInstallState(started["id"].(string))) }, "success")
	other, _ := f.host.startWhisperInstall("m1")
	waitForPhase(t, func() map[string]any { s, _ := f.host.whisperInstallState(other["id"].(string)); return s }, "success")

	if _, err := f.host.AssetsRemove("tts", "v1"); err != nil {
		t.Fatal(err)
	}
	catalog := answer(t)(f.host.AssetsList())
	if listedAsset(t, catalog, "tts", "v1")["installState"] != "not_installed" || listedAsset(t, catalog, "whisper", "m1")["installState"] != "installed" {
		t.Fatalf("removing the voice must not touch the model: %v", catalog["assets"])
	}
}

// The registry is built once and outlives every project: attaching another project does not rebuild the managers (they are not
// project-scoped), so nothing that holds one can see it swapped underneath it.
func TestTheAssetRegistryIsNotRebuiltWhenAProjectIsAttached(t *testing.T) {
	f := newInstallFixture(t, false)
	before := f.host.registry()
	f.host.mu.Lock()
	f.host.configureLocked(config{repoRoot: t.TempDir(), manuscriptPython: "python", comparePython: "python", teleprompterPython: "python"})
	f.host.mu.Unlock()
	if f.host.registry() != before {
		t.Fatal("configureLocked replaced the asset registry")
	}
	if f.host.registry().tts != before.tts || f.host.registry().whisper != before.whisper {
		t.Fatal("configureLocked replaced a manager")
	}
}

func TestAssetsListSaysWhyWhenThereIsNoCacheFolder(t *testing.T) {
	host := &Host{assets: &assetRegistry{unavailable: "the per-user cache folder for downloaded models could not be found"}, installJobs: map[string]*installJob{}}
	if _, err := host.AssetsList(); err == nil || !strings.Contains(err.Error(), "per-user cache folder") {
		t.Fatalf("err = %v, want the reason and not a bare 'unavailable'", err)
	}
	if _, err := host.startTtsInstall("v1"); err == nil || !strings.Contains(err.Error(), "per-user cache folder") {
		t.Fatalf("install err = %v", err)
	}
}

// Every list entry carries its installed-or-not detail without hashing: a listing of installed assets reads no file contents.
func TestAssetsListReadsNoFileContents(t *testing.T) {
	f := newInstallFixture(t, false)
	close(f.release)
	first, _ := f.host.startTtsInstall("v1")
	waitForPhase(t, voiceState(f, first["id"].(string)), "success")
	before := assets.FilesHashed()
	for range 5 {
		_, _ = f.host.AssetsList()
	}
	if read := assets.FilesHashed() - before; read != 0 {
		t.Fatalf("listing read %d files: a list must trust the manifest", read)
	}
	_ = time.Now()
}

// A download cannot start under a removal: the asset would come back after it was removed.
func TestAnInstallCannotStartWhileTheSameAssetIsBeingRemoved(t *testing.T) {
	f := newInstallFixture(t, false)
	f.host.mu.Lock()
	f.host.removing = map[string]bool{"tts/v1": true}
	f.host.mu.Unlock()
	if _, err := f.host.AssetsInstall("tts", "v1"); err == nil || !strings.Contains(err.Error(), "being removed") {
		t.Fatalf("err = %v, want the start refused while the asset is being removed", err)
	}
	if _, err := f.host.startTtsInstall("v1"); err == nil || !strings.Contains(err.Error(), "being removed") {
		t.Fatalf("legacy start err = %v", err)
	}
	other, err := f.host.AssetsInstall("whisper", "m1")
	if err != nil {
		t.Fatalf("another asset is not affected: %v", err)
	}
	close(f.release)
	id := answer(t)(other, nil)["id"].(string)
	waitForPhase(t, func() map[string]any { return answer(t)(f.host.AssetsInstallState(id)) }, "success")
}

// analysisFixture adds an analysis-tool catalog to the install fixture: rows is given the fixture's server address and file entries.
func analysisFixture(t *testing.T, rows func(server string, files []map[string]any) []map[string]any) *installFixture {
	t.Helper()
	f := newInstallFixture(t, false)
	files := []map[string]any{}
	for _, name := range []string{"/a.onnx", "/a.onnx.json"} {
		sum := sha256.Sum256(f.bodies[name])
		files = append(files, map[string]any{"name": name[1:], "url": f.server.URL + name, "sha256": hex.EncodeToString(sum[:]), "size": len(f.bodies[name])})
	}
	dir := t.TempDir()
	path := writeJSON(t, filepath.Join(dir, "analysis.json"), map[string]any{"catalogVersion": 1, "tools": rows(f.server.URL, files)})
	tools, err := analysistools.New(path, filepath.Join(dir, "cache", analysistools.CacheDir))
	if err != nil {
		t.Fatal(err)
	}
	f.host.assets.registerAnalysisTools(tools)
	return f
}

func analysisRow(id string, files []map[string]any) map[string]any {
	return map[string]any{"id": id, "provider": "test", "displayName": "Test tool", "description": "Finds names.", "version": "1", "publisher": "P",
		"license": "MIT", "ramGB": 1.5, "minutesPerBook": 3, "source": "gliner", "rank": 1, "recommended": true, "files": files}
}

// provider-is-registered-and-lists and item-carries-the-consent-facts: the four production rows are listed under one kind, "Analysis
// tool", with the facts a consent screen states; the other kinds carry none of those fields.
func TestTheAnalysisToolsAreListedUnderOneKindWithTheirConsentFacts(t *testing.T) {
	f := newInstallFixture(t, false)
	tools, err := analysistools.New(layout.RepoFile(layout.AnalysisCatalogFile), filepath.Join(t.TempDir(), analysistools.CacheDir))
	if err != nil {
		t.Fatal(err)
	}
	f.host.assets.registerAnalysisTools(tools)
	catalog := answer(t)(f.host.AssetsList())
	var ids []string
	for _, entry := range catalog["assets"].([]any) {
		asset := entry.(map[string]any)
		if asset["kind"] != installKindAnalysis {
			for _, key := range []string{"description", "downloadHost", "ramGB", "minutesPerBook", "rank", "recommended", "source", "unavailableReason"} {
				if _, ok := asset[key]; ok {
					t.Errorf("%s %s carries %s: the consent facts are the analysis tools' only", asset["kind"], asset["id"], key)
				}
			}
			continue
		}
		ids = append(ids, asset["id"].(string))
		if asset["kindLabel"] != "Analysis tool" {
			t.Errorf("%s kindLabel = %v", asset["id"], asset["kindLabel"])
		}
	}
	if strings.Join(ids, ",") != "gliner,booknlp-small,booknlp-big,local-llm" {
		t.Fatalf("analysis rows = %v", ids)
	}
	gliner := listedAsset(t, catalog, installKindAnalysis, "gliner")
	if gliner["downloadHost"] != "huggingface.co, files.pythonhosted.org" || gliner["ramGB"] != float64(2) || gliner["minutesPerBook"] != float64(2) ||
		gliner["rank"] != float64(1) || gliner["recommended"] != true || gliner["source"] != "gliner" || gliner["description"] == "" {
		t.Fatalf("gliner = %v", gliner)
	}
	if reason, _ := gliner["unavailableReason"].(string); !strings.Contains(reason, "not yet available") {
		t.Fatalf("gliner unavailableReason = %q, want the not yet available sentence until it is pinned", reason)
	}
	llm := listedAsset(t, catalog, installKindAnalysis, "local-llm")
	if _, ok := llm["minutesPerBook"]; ok {
		t.Fatalf("local-llm minutesPerBook = %v, want it absent: the time per book is not known", llm["minutesPerBook"])
	}
	if _, ok := llm["source"]; ok {
		t.Fatalf("local-llm source = %v, want it absent: it is not a scanner", llm["source"])
	}
	if llm["downloadSize"] != float64(0) || !strings.Contains(llm["unavailableReason"].(string), "many hours per book") {
		t.Fatalf("local-llm = %v", llm)
	}
}

// catalog-rows-exist-with-pins and local-model-is-unavailable-with-a-reason, through the binding: an unavailable or pending row is refused
// by AssetsInstall with its sentence, and no job starts.
func TestAssetsInstallRefusesAnAnalysisToolThatIsNotAvailableBeforeAJobStarts(t *testing.T) {
	f := analysisFixture(t, func(_ string, files []map[string]any) []map[string]any {
		pending := analysisRow("pending", files)
		pending["pending"] = "The tokenizer is not pinned yet."
		unavailable := analysisRow("unavailable", []map[string]any{})
		unavailable["unavailable"] = "A model small enough for this computer takes many hours per book."
		return []map[string]any{pending, unavailable}
	})
	if _, err := f.host.AssetsInstall(installKindAnalysis, "pending"); err == nil || !strings.Contains(err.Error(), "not yet available") {
		t.Fatalf("pending: %v", err)
	}
	if _, err := f.host.AssetsInstall(installKindAnalysis, "unavailable"); err == nil || !strings.Contains(err.Error(), "many hours per book") {
		t.Fatalf("unavailable: %v", err)
	}
	if len(f.host.installJobs) != 0 {
		t.Fatalf("a job started for a tool that cannot be installed: %v", f.host.installJobs)
	}
}

// nothing-downloads-without-the-click, the job half: an analysis tool installs through the one internal/assets job (ADR 0077), with real
// bytes and a cancel, and a second start installs it.
func TestAnAnalysisToolInstallsThroughTheGenericJobAndCanBeCancelled(t *testing.T) {
	f := analysisFixture(t, func(_ string, files []map[string]any) []map[string]any {
		return []map[string]any{analysisRow("tool", files)}
	})
	started := answer(t)(f.host.AssetsInstall(installKindAnalysis, "tool"))
	if started["kind"] != installKindAnalysis || started["assetId"] != "tool" || started["bytesTotal"] != float64(5000) {
		t.Fatalf("started = %v", started)
	}
	<-f.first
	deadline := time.Now().Add(20 * time.Second)
	for running := answer(t)(f.host.AssetsInstallState(started["id"].(string))); running["bytesDone"].(float64) == 0; running = answer(t)(f.host.AssetsInstallState(started["id"].(string))) {
		if running["phase"] != "downloading" || time.Now().After(deadline) {
			t.Fatalf("running = %v, want real bytes while it downloads", running)
		}
		time.Sleep(5 * time.Millisecond)
	}
	answer(t)(f.host.AssetsInstallCancel(started["id"].(string)))
	waitForPhase(t, func() map[string]any { return answer(t)(f.host.AssetsInstallState(started["id"].(string))) }, "cancelled")
	close(f.release)
	again := answer(t)(f.host.AssetsInstall(installKindAnalysis, "tool"))
	done := waitForPhase(t, func() map[string]any { return answer(t)(f.host.AssetsInstallState(again["id"].(string))) }, "success")
	if done["percent"] != float64(100) || done["message"] != "Analysis tool installed and verified." {
		t.Fatalf("done = %v", done)
	}
	if listed := listedAsset(t, answer(t)(f.host.AssetsList()), installKindAnalysis, "tool"); listed["installState"] != "installed" {
		t.Fatalf("listed = %v", listed)
	}
	if got := answer(t)(f.host.AssetsVerify(installKindAnalysis, "tool")); got["installState"] != "installed" {
		t.Fatalf("verify = %v", got)
	}
	if _, err := f.host.AssetsRemove(installKindAnalysis, "tool"); err != nil {
		t.Fatal(err)
	}
	if listed := listedAsset(t, answer(t)(f.host.AssetsList()), installKindAnalysis, "tool"); listed["installState"] != "not_installed" {
		t.Fatalf("after remove = %v", listed)
	}
}

// host-checks-disk-before-the-first-byte: a tool the disk cannot hold ends with the shortfall sentence and no request is made; a host that
// does not answer is named in the failure.
func TestAnAnalysisToolInstallSaysWhenTheDiskIsShortOrTheHostIsBlocked(t *testing.T) {
	var requests atomic.Int64
	counting := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests.Add(1) }))
	t.Cleanup(counting.Close)
	f := analysisFixture(t, func(_ string, files []map[string]any) []map[string]any {
		huge := analysisRow("huge", []map[string]any{{"name": "weights.model", "url": counting.URL + "/huge", "sha256": files[0]["sha256"], "size": int64(1) << 60}})
		blocked := analysisRow("blocked", []map[string]any{{"name": "weights.model", "url": "http://127.0.0.1:1/weights.model", "sha256": files[0]["sha256"], "size": 4000}})
		return []map[string]any{huge, blocked}
	})
	short := answer(t)(f.host.AssetsInstall(installKindAnalysis, "huge"))
	ended := waitForPhase(t, func() map[string]any { return answer(t)(f.host.AssetsInstallState(short["id"].(string))) }, "error")
	if !strings.Contains(ended["error"].(string), "not enough free space") || requests.Load() != 0 {
		t.Fatalf("huge: %v after %d requests", ended["error"], requests.Load())
	}
	blocked := answer(t)(f.host.AssetsInstall(installKindAnalysis, "blocked"))
	ended = waitForPhase(t, func() map[string]any { return answer(t)(f.host.AssetsInstallState(blocked["id"].(string))) }, "error")
	if !strings.HasPrefix(ended["error"].(string), "Could not reach 127.0.0.1.") {
		t.Fatalf("blocked: %v", ended["error"])
	}
}

// nothing-downloads-without-the-click, the code half: a provider's install is called from one place, the AssetsInstall binding's start;
// the analysis-tool catalog is held by the registry files alone; and the extraction code cannot reach the installer at all.
func TestNothingButAssetsInstallStartsAnAnalysisToolDownload(t *testing.T) {
	fset := token.NewFileSet()
	installers := map[string]bool{"Install": true, "InstallWith": true, "Repair": true}
	sources, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range sources {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		for _, spec := range file.Imports {
			// installjobs.go reads only its error types, for the failure sentences.
			if strings.HasSuffix(spec.Path.Value, "/internal/analysistools\"") && !map[string]bool{"assetproviders.go": true, "assetregistry.go": true, "assetcache.go": true, "installjobs.go": true}[path] {
				t.Errorf("%s imports internal/analysistools: only the registry may hold the analysis-tool catalog", path)
			}
		}
		file, err = parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			selector, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			receiver := strings.ToLower(types.ExprString(selector.X))
			if selector.Sel.Name == "install" && path != "bindings_assets.go" {
				t.Errorf("%s: %s.install is called outside the AssetsInstall start", fset.Position(call.Pos()), receiver)
			}
			if installers[selector.Sel.Name] && strings.Contains(receiver, "analysis") {
				t.Errorf("%s: %s.%s starts an analysis-tool download outside its provider", fset.Position(call.Pos()), receiver, selector.Sel.Name)
			}
			return true
		})
	}
	for _, dir := range []string{"internal/extraction", "internal/extractionport"} {
		err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
			if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return err
			}
			file, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
			if err != nil {
				return err
			}
			for _, spec := range file.Imports {
				if strings.HasSuffix(spec.Path.Value, "/internal/analysistools\"") || strings.HasSuffix(spec.Path.Value, "/internal/assets\"") {
					t.Errorf("%s imports %s: the extraction code never installs a tool", path, spec.Path.Value)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}
