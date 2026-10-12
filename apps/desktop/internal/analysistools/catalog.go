// Package analysistools owns the approved catalog of the optional Story Bible analysis tools (GLiNER, BookNLP small and large, and a
// local language model), each one a catalog entry of the one asset registry, installed through the same download, verify and install
// flow as the spaCy models (internal/spacy) and only when the narrator asks. A tool's weights are data files; its wheels are archives
// that are checked against their SHA-256, unpacked into the install folder and deleted, and are code only once a sidecar loads them.
// Nothing here runs or imports what it downloads.
//
// A row says what a consent screen states besides the download itself: what the tool does, the memory it needs, about how long a book
// takes, the extraction source its findings are filed under, its rank among the tools of one source and whether it is recommended.
// A row that cannot be installed says why: Unavailable for a tool that is not offered at all, and Pending (or the Pending sentinel in a
// file's URL or SHA-256, or an archive without the bytes it unpacks to) for one whose files are not all pinned yet. Install and Repair
// refuse such a row before a request is made, the Wiktextract pending-row rule (internal/wiktextract).
package analysistools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/assets"
)

type File = assets.File

// CacheDir is the folder under the asset cache the tools are installed in.
const CacheDir = "analysis"

// Pending is the sentinel a file's URL or SHA-256 carries until the owner pins it (docs/research/studio-next-gliner-spike.md and
// studio-next-booknlp-spike.md, Owner steps).
const Pending = "PENDING"

// ErrNotYetAvailable is an install or repair of a row whose files are not all pinned.
var ErrNotYetAvailable = errors.New("not yet available")

// UnavailableError refuses a tool that cannot be installed; its text is the sentence the narrator reads.
type UnavailableError struct {
	ID, Reason string
	pending    bool
}

func (e *UnavailableError) Error() string { return e.Reason }

// Is makes a pending row's refusal ErrNotYetAvailable.
func (e *UnavailableError) Is(target error) bool { return e.pending && target == ErrNotYetAvailable }

// NotYetAvailableText is the sentence a pending row is refused with.
func NotYetAvailableText(name string) string {
	return name + " is not yet available: its download is still being checked, and it will be offered once every file is pinned."
}

// UnreachableError is a download whose host did not answer. Host is the name the narrator reads; Err is the cause, for the log.
type UnreachableError struct {
	Host string
	Err  error
}

func (e *UnreachableError) Error() string { return "could not reach " + e.Host + ": " + e.Err.Error() }
func (e *UnreachableError) Unwrap() error { return e.Err }

// Sentence is what the narrator reads: which host, and what to do.
func (e *UnreachableError) Sentence() string {
	return "Could not reach " + e.Host + ". Check your internet connection and try again: what was downloaded so far is kept, so the download carries on from there."
}

// Tool is one approved analysis tool.
type Tool struct {
	ID            string `json:"id"`
	Provider      string `json:"provider"`
	DisplayName   string `json:"displayName"`
	Description   string `json:"description"`
	Version       string `json:"version"`
	Publisher     string `json:"publisher"`
	License       string `json:"license"`
	LicenseURL    string `json:"licenseUrl"`
	ModelCardURL  string `json:"modelCardUrl"`
	ProvenanceURL string `json:"provenanceUrl"`
	// Attribution opens with the licence sentence the consent screen shows, then the credit.
	Attribution string `json:"attribution"`
	// RAMGB is the memory a run needs, and MinutesPerBook about how long one book takes (nil when not known); both are the 2026-10-10
	// trial's figures and provisional until measured on the narrator's machine (SNX-Q6).
	RAMGB          float64  `json:"ramGB"`
	MinutesPerBook *float64 `json:"minutesPerBook"`
	// Source is the extraction source its findings are filed under (internal/extractionport), nil when it is not a scanner yet.
	Source *string `json:"source"`
	// Rank orders two tools of one source: the higher is used when both are installed. Recommended tools are offered together.
	Rank        int  `json:"rank"`
	Recommended bool `json:"recommended"`
	// Unavailable is the narrator's sentence for a tool that is not offered at all; Pending says, for the owner, what is not pinned yet.
	Unavailable string `json:"unavailable,omitempty"`
	Pending     string `json:"pending,omitempty"`
	Files       []File `json:"files"`
}

type Catalog struct {
	Version int    `json:"catalogVersion"`
	Tools   []Tool `json:"tools"`
}

type Manager struct {
	catalog Catalog
	root    string
}

func New(catalogPath, root string) (*Manager, error) {
	raw, err := os.ReadFile(catalogPath)
	if err != nil {
		return nil, err
	}
	var c Catalog
	if err = json.Unmarshal(raw, &c); err != nil {
		return nil, err
	}
	return &Manager{catalog: c, root: root}, nil
}

// pinned is whether every file has a real address, size and SHA-256, and every archive the bytes it may unpack to.
func (t Tool) pinned() bool {
	if t.Pending != "" || len(t.Files) == 0 {
		return false
	}
	for _, file := range t.Files {
		if file.URL == "" || file.URL == Pending || file.SHA256 == "" || file.SHA256 == Pending || file.Size <= 0 || (file.Extract != "" && file.Expand <= 0) {
			return false
		}
	}
	return true
}

// Available is whether the tool can be installed.
func (t Tool) Available() bool { return t.Unavailable == "" && t.pinned() }

// UnavailableReason is the sentence shown instead of a Download button, or "" for a tool that can be installed.
func (t Tool) UnavailableReason() string {
	switch {
	case t.Unavailable != "":
		return t.Unavailable
	case !t.pinned():
		return NotYetAvailableText(t.DisplayName)
	}
	return ""
}

func (t Tool) refusal() error {
	if t.Available() {
		return nil
	}
	return &UnavailableError{ID: t.ID, Reason: t.UnavailableReason(), pending: t.Unavailable == ""}
}

// DownloadHosts is every host the tool's files come from, in catalog order: what the consent screen names as the source.
func (t Tool) DownloadHosts() string {
	var hosts []string
	for _, file := range t.Files {
		if host := hostOf(file.URL); host != "" && !slices.Contains(hosts, host) {
			hosts = append(hosts, host)
		}
	}
	return strings.Join(hosts, ", ")
}

// hostOf is the host name of an absolute URL, without a port or user information, or "" when there is none. It is read from the text,
// because this package may not import net (the network fence of .golangci.yml).
func hostOf(address string) string {
	_, rest, ok := strings.Cut(address, "://")
	if !ok {
		return ""
	}
	if end := strings.IndexAny(rest, "/?#"); end >= 0 {
		rest = rest[:end]
	}
	if at := strings.LastIndex(rest, "@"); at >= 0 {
		rest = rest[at+1:]
	}
	if strings.HasPrefix(rest, "[") {
		host, _, _ := strings.Cut(rest[1:], "]")
		return host
	}
	host, _, _ := strings.Cut(rest, ":")
	return host
}

// DownloadSize is what is fetched; DiskSize is what the tool takes once installed (a wheel is unpacked and not kept).
func (t Tool) DownloadSize() int64 {
	var total int64
	for _, file := range t.Files {
		total += file.Size
	}
	return total
}

func (t Tool) DiskSize() int64 {
	var total int64
	for _, file := range t.Files {
		if file.Extract != "" {
			total += file.Expand
		} else {
			total += file.Size
		}
	}
	return total
}

// Tools is every approved tool, in catalog order (the mock's).
func (m *Manager) Tools() []Tool { return append([]Tool(nil), m.catalog.Tools...) }

func (m *Manager) Tool(id string) (Tool, bool) {
	for _, tool := range m.catalog.Tools {
		if tool.ID == id {
			return tool, true
		}
	}
	return Tool{}, false
}

func notInCatalog(id string) error {
	return fmt.Errorf("%q is not in the approved catalog of analysis tools", id)
}

// InstallDir is where a tool is (or will be) installed, whatever its state.
func (m *Manager) InstallDir(id string) string {
	tool, _ := m.Tool(id)
	return assets.Dir(m.root, tool.Provider, tool.ID, tool.Version)
}

func (m *Manager) State(tool Tool) string {
	return assets.State(m.root, tool.Provider, tool.ID, tool.Version, tool.Files)
}

// Refuse is the error an install of the tool would end with before any request: not in the catalog, or not installable; nil otherwise.
func (m *Manager) Refuse(id string) error {
	tool, ok := m.Tool(id)
	if !ok {
		return notInCatalog(id)
	}
	return tool.refusal()
}

// Install downloads only a catalog-owned URL, checks it, unpacks it and swaps it in.
func (m *Manager) Install(ctx context.Context, id string) error {
	return m.InstallWith(ctx, id, assets.Options{})
}

// InstallWith is Install with the options of assets.Options: progress and the check hook of a job that reports them.
func (m *Manager) InstallWith(ctx context.Context, id string, options assets.Options) error {
	tool, err := m.installable(id)
	if err != nil {
		return err
	}
	return named(tool, assets.InstallWith(ctx, m.root, tool.Provider, tool.ID, tool.Version, tool.Files, withDefaults(options)))
}

// Repair downloads a damaged tool again and swaps it in; a tool that verifies is left alone.
func (m *Manager) Repair(ctx context.Context, id string, options assets.Options) error {
	tool, err := m.installable(id)
	if err != nil {
		return err
	}
	return named(tool, assets.Repair(ctx, m.root, tool.Provider, tool.ID, tool.Version, tool.Files, withDefaults(options)))
}

func (m *Manager) installable(id string) (Tool, error) {
	if err := m.Refuse(id); err != nil {
		return Tool{}, err
	}
	tool, _ := m.Tool(id)
	return tool, nil
}

// Verify reads every installed file of a tool and says whether it is installed, damaged or absent.
func (m *Manager) Verify(id string) (string, error) {
	tool, ok := m.Tool(id)
	if !ok {
		return "", notInCatalog(id)
	}
	assets.Forget(m.root, tool.Provider, tool.ID, tool.Version)
	return assets.Verify(m.root, tool.Provider, tool.ID, tool.Version, tool.Files), nil
}

func (m *Manager) Remove(id string) error {
	tool, ok := m.Tool(id)
	if !ok {
		return notInCatalog(id)
	}
	return assets.Remove(m.root, tool.Provider, tool.ID, tool.Version)
}

// named turns a request that never reached its host into an UnreachableError naming the host; any other error is returned as it is. A
// failed request's error quotes the address it asked for (net/http's url.Error), so the file is found by its quoted URL; a host that
// answered with an error status (assets.StatusError) or a download cut off midway does not quote it and keeps its own sentence.
func named(tool Tool, err error) error {
	var status *assets.StatusError
	if err == nil || errors.Is(err, context.Canceled) || errors.As(err, &status) {
		return err
	}
	for _, file := range tool.Files {
		if host := hostOf(file.URL); host != "" && strings.Contains(err.Error(), `"`+file.URL+`"`) {
			return &UnreachableError{Host: host, Err: err}
		}
	}
	return err
}

// withDefaults asks the disk before a download unless the caller brought its own check.
func withDefaults(options assets.Options) assets.Options {
	if options.Preflight == nil {
		options.Preflight = assets.RequireFreeSpace
	}
	return options
}
