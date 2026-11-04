package main

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"desktop/internal/audacitybridge"
	"desktop/internal/bridge"
	"desktop/internal/creditsid"
	"desktop/internal/masteringport"
	"desktop/internal/packager"
	"desktop/internal/port"
)

// What an export will do, checked before it starts: ExportPlan answers it for the approval dialog, and ExportStart checks it again
// and then the narrator's approval (#2739). Both refuse the same requests, so the dialog never asks to approve an export the host
// would refuse for any reason but the approval.

// MasteringApproval is the narrator's approval of one export's masters: the row they approved, by name, and, for a row that
// needs one (MasteringProvider.NeedsMacro), the effect macro they named. It holds for the one ExportStart call that carries it:
// the host checks it against the row it would master with now, hands it to that job only, and never stores it. It is the page's
// word that the narrator approved: the host cannot tell that a dialog was shown (threat model row 14f).
//
// For a row whose steps live in the DAW (masteringport.ChainLister), ChainDigest is ExportPlan's chainDigest of the chain the dialog
// showed: the approval binds that chain, and each render refuses another (threat model row 5o). Without it such an approval is refused.
type MasteringApproval struct {
	Provider    string `json:"provider"`
	Macro       string `json:"macro"`
	ChainDigest string `json:"chainDigest"`
}

// ExportPlan is ExportPlan's answer: the mastering row the export masters with (empty when it does not master), whether each
// master needs the narrator's approval or a macro, the items as the host will export them, and, for a row whose steps live in the
// DAW (masteringport.ChainLister), the chain it would run, read when the plan is asked for, and its masteringport.ChainDigest, which
// the approval sends back (both empty for any other row).
type ExportPlan struct {
	Master        bool              `json:"master"`
	Provider      string            `json:"provider"`
	Label         string            `json:"label"`
	NeedsApproval bool              `json:"needsApproval"`
	NeedsMacro    bool              `json:"needsMacro"`
	Items         []ExportPlanItem  `json:"items"`
	Chain         []ExportPlanTrack `json:"chain"`
	ChainDigest   string            `json:"chainDigest"`
}

// ExportPlanTrack is one track in the chain a DAW render runs, in chain order: every track, with FX or not, then the master. Mute,
// Solo and Mix (the DAW's fingerprint of its volume, pan, routing and sends) are bound by ChainDigest with the plug-ins (#2995).
type ExportPlanTrack struct {
	Name   string         `json:"name"`
	Master bool           `json:"master"`
	Mute   bool           `json:"mute"`
	Solo   int            `json:"solo"`
	Mix    string         `json:"mix"`
	FX     []ExportPlanFX `json:"fx"`
}

// ExportPlanFX is one plug-in as the DAW names it, whether it is switched on, and Params, the DAW's fingerprint of its parameter
// values, which ChainDigest binds (#2995).
type ExportPlanFX struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	Params  string `json:"params"`
}

// ExportPlanItem is one item as the host will export it: its path cleaned, its title trimmed, and the DAW region it renders from
// when the row renders regions (masteringport.ModeDAWRegion); Region is empty with any other row.
type ExportPlanItem struct {
	Kind   string `json:"kind"`
	Title  string `json:"title"`
	Path   string `json:"path"`
	Region string `json:"region"`
}

// exportPlanned is a checked export: its items, the region each renders from ("" unless the row renders regions), and the row and
// its capabilities when it masters.
type exportPlanned struct {
	master  bool
	items   []ExportItem
	regions []string
	row     port.Entry[masteringport.Mastering]
	caps    masteringport.Capabilities
	chain   []masteringport.ChainTrack
	// listed is whether the row lists its chain, so the plan answers the chain's digest (an empty chain has one too).
	listed bool
}

// masteringApproved is what an export's approval allows its masters: Approved and Macro of each masteringport.Request.
type masteringApproved struct {
	approved    bool
	macro       string
	chainDigest string
}

// errStaleApproval is an approval of a row the project no longer masters with.
var errStaleApproval = errors.New("approve the render again")

func (h *Host) masteringRowsOrDefault() *port.Registry[masteringport.Mastering] {
	if h.masteringRows != nil {
		return h.masteringRows
	}
	return masteringport.Rows
}

// planExport checks req without the narrator's approval: the items (exportPaths), an open project and, when it masters, the
// project's effective row (effectiveMasteringRow, the one MasteringProviders reports, over h.masteringRows, a seam for tests) and
// the region each item renders from with a row that renders regions. An item with no region (a retail sample) is refused for the
// whole export, naming it, rather than failing on its own once the export runs.
func (h *Host) planExport(svc hostServices, req ExportRequest) (exportPlanned, error) {
	items, err := h.exportPaths(req.Items)
	if err != nil {
		return exportPlanned{}, err
	}
	if svc.config.projectFolder == "" {
		return exportPlanned{}, errors.New("open a project before exporting")
	}
	plan := exportPlanned{master: req.Master, items: items, regions: make([]string, len(items))}
	if !req.Master {
		return plan, nil
	}
	choice := ""
	if svc.settings != nil {
		choice = svc.settings.Project(masteringSettingsTool)[masteringProviderKey]
	}
	row, _, ok := effectiveMasteringRow(h.masteringRowsOrDefault(), runtime.GOOS, choice)
	if !ok {
		return exportPlanned{}, errors.New("this version has no mastering chain")
	}
	plan.row, plan.caps = row, row.New().Capabilities()
	if row.Descriptor.Supports(masteringport.ModeWAV) {
		return plan, nil
	}
	var none []string
	for i, item := range items {
		plan.regions[i] = exportRegion(item)
		if plan.regions[i] == "" {
			none = append(none, filepath.Base(item.Path))
		}
	}
	if len(none) > 0 {
		return exportPlanned{}, noRegionError{label: row.Descriptor.Label, files: strings.Join(none, ", ")}
	}
	return plan, nil
}

// approvalFor is what the narrator's approval allows plan's masters. An approval holds only for the row it names: one for another
// row is refused as stale, whether or not the row the project masters with now needs one. A row that needs approval is refused
// without one, and a row that needs a macro without its name (with no approval at all too, whatever the row declares).
func (h *Host) approvalFor(plan exportPlanned, approval *MasteringApproval) (masteringApproved, error) {
	if !plan.master {
		return masteringApproved{}, nil
	}
	row, caps := plan.row, plan.caps
	if approval != nil && approval.Provider != row.Name {
		approved := approval.Provider
		if entry, err := h.masteringRowsOrDefault().Lookup(approval.Provider); err == nil {
			approved = entry.Descriptor.Label
		}
		return masteringApproved{}, fmt.Errorf("you approved %s, but this project now masters with %s: %w", approved, row.Descriptor.Label, errStaleApproval)
	}
	if caps.NeedsApproval && approval == nil {
		return masteringApproved{}, fmt.Errorf("%s runs only after you approve this render: %w", row.Descriptor.Label, masteringport.ErrNotApproved)
	}
	allowed := masteringApproved{approved: approval != nil}
	// Fail closed: an approval of a row whose steps live in the DAW binds the chain the narrator was shown, or nothing.
	if _, lists := row.New().(masteringport.ChainLister); lists && approval != nil {
		if approval.ChainDigest == "" {
			return masteringApproved{}, fmt.Errorf("%s: %w", row.Descriptor.Label, masteringport.ErrNoChainDigest)
		}
		allowed.chainDigest = approval.ChainDigest
	}
	if caps.NeedsMacro {
		if approval != nil {
			allowed.macro = strings.TrimSpace(approval.Macro)
		}
		if allowed.macro == "" {
			return masteringApproved{}, fmt.Errorf("%s: %w", row.Descriptor.Label, masteringport.ErrNoMacro)
		}
		if err := audacitybridge.CheckMacroName(allowed.macro); err != nil {
			return masteringApproved{}, err
		}
	}
	return allowed, nil
}

// exportRegion is the DAW region an item masters from with a row that renders one (masteringport.ModeDAWRegion), by the name
// the chapter regions step gives it (chapterregions.go): a chapter's title, or the credits' own title. A retail sample has none.
func exportRegion(item ExportItem) string {
	switch packager.Kind(item.Kind) {
	case packager.KindChapter:
		return item.Title
	case packager.KindCreditsOpening:
		return creditsid.Title(creditsid.Opening)
	case packager.KindCreditsClosing:
		return creditsid.Title(creditsid.Closing)
	default:
		return ""
	}
}

// exportPlanPayload is plan on the wire.
func exportPlanPayload(plan exportPlanned) ExportPlan {
	out := ExportPlan{Master: plan.master, Items: make([]ExportPlanItem, 0, len(plan.items))}
	if plan.master {
		out.Provider, out.Label = plan.row.Name, plan.row.Descriptor.Label
		out.NeedsApproval, out.NeedsMacro = plan.caps.NeedsApproval, plan.caps.NeedsMacro
	}
	for i, item := range plan.items {
		out.Items = append(out.Items, ExportPlanItem{Kind: item.Kind, Title: item.Title, Path: item.Path, Region: plan.regions[i]})
	}
	if plan.listed {
		out.ChainDigest = masteringport.ChainDigest(plan.chain)
	}
	out.Chain = make([]ExportPlanTrack, 0, len(plan.chain))
	for _, track := range plan.chain {
		fx := make([]ExportPlanFX, 0, len(track.FX))
		for _, slot := range track.FX {
			fx = append(fx, ExportPlanFX{Name: slot.Name, Enabled: slot.Enabled, Params: slot.Params})
		}
		out.Chain = append(out.Chain, ExportPlanTrack{Name: track.Name, Master: track.Master, Mute: track.Mute, Solo: track.Solo, Mix: track.Mix, FX: fx})
	}
	return out
}

// exportChainWait bounds ExportPlan's read of the DAW's chain, under the page's own 15 s wait for the answer; a var for tests.
var exportChainWait = 10 * time.Second

// noRegionError refuses an export through a row that renders regions when an item has none: a toast naming the file and the
// checkbox that encodes it without mastering, as one full sentence (round 3 walkthrough on #2932).
type noRegionError struct {
	label string
	files string
}

func (e noRegionError) Error() string {
	return e.label + " masters the regions your DAW renders, and " + e.files +
		" has no region: remove it from this export, or untick Master before encoding to encode it without mastering."
}

// chainUnreadableError is ExportPlan's refusal of a chain it could not read whole: one short toast with the reason and what to do
// instead (#2932's walkthrough; the DAW's own reason was cut off mid-sentence). It still is the DAW's error, for errors.Is.
type chainUnreadableError struct {
	label string
	cause error
}

func (e chainUnreadableError) Error() string {
	// A script older than #2995 cannot answer the settings, routing and mute the approval binds: what to do is import it again.
	if errors.Is(e.cause, bridge.ErrScriptOutdated) {
		return e.label + " can't be checked: the app's script in REAPER is older than this app. Import it again from this app's REAPER folder, or choose the built-in chain."
	}
	return e.label + " couldn't be read, so it can't be approved. Choose the built-in chain, or untick Master before encoding."
}

func (e chainUnreadableError) Unwrap() error { return e.cause }

// exportPlan is ExportPlan's answer for req. With a row whose steps live in the DAW it reads the chain the render would run, so
// the approval dialog shows it (threat model row 5o); a chain that cannot be read whole refuses the plan. ExportStart does not read
// it: each render reads it again itself.
func (h *Host) exportPlan(req ExportRequest) (ExportPlan, error) {
	plan, err := h.planExport(h.services(), req)
	if err != nil {
		return ExportPlan{}, err
	}
	if plan.master {
		if lister, ok := plan.row.New().(masteringport.ChainLister); ok {
			ctx, cancel := context.WithTimeout(context.Background(), exportChainWait)
			defer cancel()
			chain, err := lister.Chain(ctx)
			if err != nil {
				return ExportPlan{}, chainUnreadableError{label: plan.row.Descriptor.Label, cause: err}
			}
			plan.chain, plan.listed = chain, true
		}
	}
	return exportPlanPayload(plan), nil
}
