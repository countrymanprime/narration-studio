package analysistools

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/assets"
	"github.com/countrymanprime/narration-utils/shell/internal/layout"
)

var sha256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// The hosts the production catalog may download from: the model publishers and PyPI's file host (D72: these downloads are the only
// network use of the analysis tools).
var approvedHosts = map[string]bool{"huggingface.co": true, "files.pythonhosted.org": true, "people.ischool.berkeley.edu": true}

func productionManager(t *testing.T) *Manager {
	t.Helper()
	manager, err := New(layout.RepoFile(layout.AnalysisCatalogFile), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return manager
}

// catalog-rows-exist-with-pins: the four rows, in the mock's order, each with its identity and every file with a URL, a size and a
// SHA-256 (or the Pending sentinel, which keeps the row from installing).
func TestTheProductionCatalogHasTheFourToolsWithTheirPins(t *testing.T) {
	manager := productionManager(t)
	var ids []string
	for _, tool := range manager.Tools() {
		ids = append(ids, tool.ID)
		for field, value := range map[string]string{"provider": tool.Provider, "displayName": tool.DisplayName, "description": tool.Description, "version": tool.Version,
			"publisher": tool.Publisher, "license": tool.License, "licenseUrl": tool.LicenseURL, "modelCardUrl": tool.ModelCardURL, "provenanceUrl": tool.ProvenanceURL,
			"attribution": tool.Attribution} {
			if value == "" {
				t.Errorf("%s has no %s", tool.ID, field)
			}
		}
		if tool.RAMGB <= 0 {
			t.Errorf("%s has no ramGB", tool.ID)
		}
		for _, file := range tool.Files {
			address, err := url.Parse(file.URL)
			if err != nil || address.Scheme != "https" || !approvedHosts[address.Hostname()] {
				t.Errorf("%s %s: %q is not an https address on an approved host", tool.ID, file.Name, file.URL)
			}
			if file.Size <= 0 {
				t.Errorf("%s %s has no size", tool.ID, file.Name)
			}
			if file.SHA256 != Pending && !sha256Pattern.MatchString(file.SHA256) {
				t.Errorf("%s %s: %q is neither a SHA-256 nor %s", tool.ID, file.Name, file.SHA256, Pending)
			}
		}
	}
	if strings.Join(ids, ",") != "gliner,booknlp-small,booknlp-big,local-llm" {
		t.Fatalf("tools = %v, want gliner, booknlp-small, booknlp-big and local-llm, in the mock's order", ids)
	}
}

// A wheel is code once it is loaded, so its pin is never optional: every wheel the catalog names carries its real SHA-256 and the size it
// unpacks to, whether or not the rest of its row is pinned yet.
func TestEveryWheelInTheProductionCatalogIsPinnedBySHA256(t *testing.T) {
	for _, tool := range productionManager(t).Tools() {
		for _, file := range tool.Files {
			if !strings.HasSuffix(file.Name, ".whl") {
				continue
			}
			if !sha256Pattern.MatchString(file.SHA256) {
				t.Errorf("%s %s: a wheel needs its SHA-256, got %q", tool.ID, file.Name, file.SHA256)
			}
			if file.Extract == "" || file.Expand <= 0 {
				t.Errorf("%s %s: a wheel is unpacked, so it needs a folder and the bytes it unpacks to", tool.ID, file.Name)
			}
		}
	}
}

// Until the owner pins the files the spikes could not reach, no row of the production catalog can be installed, and each says why in
// the narrator's words. When a row is pinned this test fails on purpose: update it with the row.
func TestNoProductionToolIsInstallableYetAndEachSaysWhy(t *testing.T) {
	for _, tool := range productionManager(t).Tools() {
		if tool.Available() {
			t.Errorf("%s reads as installable: pin it, then update this test", tool.ID)
		}
		if tool.UnavailableReason() == "" {
			t.Errorf("%s gives no reason", tool.ID)
		}
	}
}

// local-model-is-unavailable-with-a-reason: no files, the mock's sentence, and an install refuses it without a request.
func TestTheLocalModelIsUnavailableWithItsReasonAndNothingToDownload(t *testing.T) {
	manager := productionManager(t)
	tool, ok := manager.Tool("local-llm")
	if !ok {
		t.Fatal("no local-llm row")
	}
	if len(tool.Files) != 0 || tool.DownloadSize() != 0 {
		t.Fatalf("local-llm files = %v, want none: nothing is bundled or downloaded", tool.Files)
	}
	want := "A model small enough for this computer takes many hours per book. It will be offered once that is practical."
	if tool.UnavailableReason() != want {
		t.Fatalf("reason = %q, want %q", tool.UnavailableReason(), want)
	}
	if tool.Source != nil || tool.MinutesPerBook != nil {
		t.Fatalf("local-llm source %v, minutesPerBook %v: want both null", tool.Source, tool.MinutesPerBook)
	}
	err := manager.Install(context.Background(), "local-llm")
	var unavailable *UnavailableError
	if !errors.As(err, &unavailable) || err.Error() != want {
		t.Fatalf("Install = %v, want the reason", err)
	}
}

func TestTheConsentFactsFollowTheMock(t *testing.T) {
	manager := productionManager(t)
	for id, want := range map[string]struct {
		source      string
		rank        int
		recommended bool
		hosts       string
	}{
		"gliner":        {"gliner", 1, true, "huggingface.co, files.pythonhosted.org"},
		"booknlp-small": {"booknlp", 1, true, "people.ischool.berkeley.edu, files.pythonhosted.org"},
		"booknlp-big":   {"booknlp", 2, false, "people.ischool.berkeley.edu, files.pythonhosted.org"},
	} {
		tool, _ := manager.Tool(id)
		if tool.Source == nil || *tool.Source != want.source || tool.Rank != want.rank || tool.Recommended != want.recommended {
			t.Errorf("%s: source %v rank %d recommended %v, want %+v", id, tool.Source, tool.Rank, tool.Recommended, want)
		}
		if tool.DownloadHosts() != want.hosts {
			t.Errorf("%s hosts = %q, want %q", id, tool.DownloadHosts(), want.hosts)
		}
		if tool.MinutesPerBook == nil || *tool.MinutesPerBook <= 0 {
			t.Errorf("%s has no time per book", id)
		}
	}
}

// fixture is a catalog of test rows over a server that counts the requests it gets.
type fixture struct {
	manager  *Manager
	requests *atomic.Int64
	wheel    []byte
	data     []byte
}

func fakeWheel(t *testing.T) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, body := range map[string]string{"tool/__init__.py": "VERSION = '1'\n", "tool-1.dist-info/METADATA": "Name: tool\n"} {
		file, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = file.Write([]byte(body))
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func digest(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func newFixture(t *testing.T, rows func(server string, wheel, data []byte) []map[string]any) fixture {
	t.Helper()
	f := fixture{requests: &atomic.Int64{}, wheel: fakeWheel(t), data: []byte(strings.Repeat("weights", 100))}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.requests.Add(1)
		if strings.HasSuffix(r.URL.Path, ".whl") {
			_, _ = w.Write(f.wheel)
			return
		}
		_, _ = w.Write(f.data)
	}))
	t.Cleanup(server.Close)
	path := filepath.Join(t.TempDir(), "analysis.json")
	raw, _ := json.Marshal(map[string]any{"catalogVersion": 1, "tools": rows(server.URL, f.wheel, f.data)})
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	manager, err := New(path, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	f.manager = manager
	return f
}

func pinnedRow(server string, wheel, data []byte) map[string]any {
	return map[string]any{"id": "tool", "provider": "test", "displayName": "Test tool", "version": "1", "ramGB": 1,
		"files": []map[string]any{
			{"name": "weights.model", "url": server + "/weights.model", "sha256": digest(data), "size": len(data)},
			{"name": "tool-1-py3-none-any.whl", "url": server + "/tool-1-py3-none-any.whl", "sha256": digest(wheel), "size": len(wheel), "extract": "wheel-tool", "expand": 4096},
		}}
}

// catalog-rows-exist-with-pins, second half: a row whose pins are Pending is installed by nothing. Install and Repair refuse it with the
// "not yet available" sentence before a request is made (the Wiktextract pending-row rule).
func TestAPendingRowRefusesInstallAndRepairBeforeAnyRequest(t *testing.T) {
	f := newFixture(t, func(server string, wheel, data []byte) []map[string]any {
		pendingFile := pinnedRow(server, wheel, data)
		pendingFile["id"] = "pending-file"
		pendingFile["files"].([]map[string]any)[0]["sha256"] = Pending
		pendingNote := pinnedRow(server, wheel, data)
		pendingNote["id"] = "pending-note"
		pendingNote["pending"] = "The tokenizer is not pinned yet."
		unpacked := pinnedRow(server, wheel, data)
		unpacked["id"] = "no-expand"
		delete(unpacked["files"].([]map[string]any)[1], "expand")
		return []map[string]any{pendingFile, pendingNote, unpacked}
	})
	for _, id := range []string{"pending-file", "pending-note", "no-expand"} {
		tool, _ := f.manager.Tool(id)
		if tool.Available() {
			t.Fatalf("%s reads as available", id)
		}
		for name, err := range map[string]error{
			"Install": f.manager.Install(context.Background(), id),
			"Repair":  f.manager.Repair(context.Background(), id, assets.Options{}),
		} {
			if !errors.Is(err, ErrNotYetAvailable) || !strings.Contains(err.Error(), "not yet available") {
				t.Fatalf("%s %s = %v, want the not yet available sentence", name, id, err)
			}
		}
		if tool.UnavailableReason() != NotYetAvailableText("Test tool") {
			t.Fatalf("%s reason = %q", id, tool.UnavailableReason())
		}
	}
	if f.requests.Load() != 0 {
		t.Fatalf("%d requests were made for rows that are not pinned", f.requests.Load())
	}
}

// The job is the one internal/assets install: a pinned row downloads real bytes, unpacks its wheel, verifies and is removed.
func TestAPinnedRowInstallsVerifiesAndRemovesThroughTheSharedInstaller(t *testing.T) {
	f := newFixture(t, func(server string, wheel, data []byte) []map[string]any {
		return []map[string]any{pinnedRow(server, wheel, data)}
	})
	tool, _ := f.manager.Tool("tool")
	if !tool.Available() || tool.UnavailableReason() != "" {
		t.Fatalf("a pinned row reads as unavailable: %q", tool.UnavailableReason())
	}
	if f.manager.State(tool) != "not_installed" {
		t.Fatalf("state before = %q", f.manager.State(tool))
	}
	var progressed int64
	err := f.manager.InstallWith(context.Background(), "tool", assets.Options{OnProgress: func(_ assets.File, done int64) { progressed = max(progressed, done) }})
	if err != nil {
		t.Fatal(err)
	}
	if progressed == 0 {
		t.Fatal("the install reported no bytes")
	}
	if f.manager.State(tool) != "installed" {
		t.Fatalf("state after = %q", f.manager.State(tool))
	}
	if _, err := os.Stat(filepath.Join(f.manager.InstallDir("tool"), "wheel-tool", "tool", "__init__.py")); err != nil {
		t.Fatalf("the wheel was not unpacked: %v", err)
	}
	if state, err := f.manager.Verify("tool"); err != nil || state != "installed" {
		t.Fatalf("Verify = %q, %v", state, err)
	}
	if err := f.manager.Remove("tool"); err != nil {
		t.Fatal(err)
	}
	if f.manager.State(tool) != "not_installed" {
		t.Fatalf("state after remove = %q", f.manager.State(tool))
	}
}

// host-checks-disk-before-the-first-byte: the default preflight is the real free-space check of internal/assets/disk.go. A row no disk can
// hold is refused with the shortfall sentence and nothing is requested.
func TestTheDiskIsCheckedBeforeTheFirstByte(t *testing.T) {
	f := newFixture(t, func(server string, wheel, data []byte) []map[string]any {
		row := pinnedRow(server, wheel, data)
		row["files"].([]map[string]any)[0]["size"] = int64(1) << 60
		return []map[string]any{row}
	})
	err := f.manager.Install(context.Background(), "tool")
	var short *assets.InsufficientSpaceError
	if !errors.As(err, &short) || !strings.Contains(err.Error(), "not enough free space") {
		t.Fatalf("Install = %v, want the shortfall sentence", err)
	}
	if f.requests.Load() != 0 {
		t.Fatalf("%d requests were made before the disk check refused", f.requests.Load())
	}
}

// A host that cannot be reached is named in the failure, so the narrator knows which download is blocked.
func TestABlockedHostIsNamedInTheFailure(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	closed := "http://" + listener.Addr().String()
	_ = listener.Close()
	f := newFixture(t, func(_ string, wheel, data []byte) []map[string]any {
		return []map[string]any{pinnedRow(closed, wheel, data)}
	})
	err = f.manager.Install(context.Background(), "tool")
	var unreachable *UnreachableError
	if !errors.As(err, &unreachable) || unreachable.Host != "127.0.0.1" {
		t.Fatalf("Install = %v, want an UnreachableError naming 127.0.0.1", err)
	}
	if !strings.Contains(unreachable.Sentence(), "Could not reach 127.0.0.1.") {
		t.Fatalf("sentence = %q", unreachable.Sentence())
	}
}

func TestAToolThatIsNotInTheCatalogIsRefused(t *testing.T) {
	manager := productionManager(t)
	for name, err := range map[string]error{
		"Install": manager.Install(context.Background(), "nope"),
		"Repair":  manager.Repair(context.Background(), "nope", assets.Options{}),
		"Remove":  manager.Remove("nope"),
	} {
		if err == nil || !strings.Contains(err.Error(), "not in the approved catalog") {
			t.Fatalf("%s = %v", name, err)
		}
	}
	if _, err := manager.Verify("nope"); err == nil {
		t.Fatal("Verify accepted an unknown tool")
	}
}

func TestHostOfReadsTheHostNameOfAnAddress(t *testing.T) {
	for address, want := range map[string]string{
		"https://huggingface.co/urchade/x/resolve/abc/pytorch_model.bin": "huggingface.co",
		"http://127.0.0.1:8080/a.whl":                                    "127.0.0.1",
		"https://user@files.pythonhosted.org?x=1":                        "files.pythonhosted.org",
		"https://[::1]:443/x":                                            "::1",
		Pending:                                                          "",
		"":                                                               "",
	} {
		if got := hostOf(address); got != want {
			t.Errorf("hostOf(%q) = %q, want %q", address, got, want)
		}
	}
}
