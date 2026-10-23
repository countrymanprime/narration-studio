package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitylink"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/audacity"
)

// Linking Audacity 3: AudacityLink and its live event audacity_link_changed tell the UI how far the project is from talking to
// Audacity (installed, started once, scripting on, answering, the right project open) and the one thing the narrator does next, in
// a sentence. AudacityLinkCheck forces a fresh read (the "Check again" button), AudacityEnableModule turns scripting on in
// Audacity's settings file, AudacityLinkFile records the .aup3 the project's Audacity work lives in, AudacityLinkOpenProject
// stamps the project open in Audacity with this project's link label, and AudacityUnlink forgets both. DawLaunch starts Audacity on
// the linked file. The project's engine choice stays DawChoose's. The wire schema, golden payloads, wireContracts rows and mock live
// in apps/ui/src/api (docs/architecture/wire-contracts.md); the states are described in docs/reference/daw/audacity-3.md.

const (
	// audacityLinkFileKey and audacityLinkIDKey are project rows of the Recording settings (like the engine choice): the linked
	// Audacity project file's path, and the id written into that project as its link label. Neither is a generic Settings field.
	audacityLinkFileKey = "audacity_file"
	audacityLinkIDKey   = "audacity_link"
	// audacityProbeEvery is how often the heartbeat asks Audacity whether it answers.
	audacityProbeEvery = 2 * time.Second
	// audacityExe is the program name the running check looks for.
	audacityExe = "audacity.exe"
	// snapshotEvery is how often the heartbeat looks at the project's tracks, clips and labels for the snapshot (three GetInfo commands).
	snapshotEvery = 10 * time.Second
)

// AudacityLink is the AudacityLink, AudacityLinkCheck, AudacityEnableModule, AudacityLinkFile, AudacityLinkOpenProject and
// AudacityUnlink payload and the audacity_link_changed event's data.
type AudacityLink struct {
	HasProject bool `json:"hasProject"`
	// Chosen is whether the project records with Audacity. Nothing else is read from Audacity while it does not.
	Chosen bool `json:"chosen"`
	// State is an audacitylink.State: "unsupported", "not_installed", "not_running", "module_off", "needs_restart", "audacity4",
	// "dialog", "no_project" or "answering".
	State string `json:"state"`
	// Message is the whole sentence for the narrator: what is wrong and what to do.
	Message string `json:"message"`
	// Action is the one thing the app can do for the state: "launch", "enable_module" or "none".
	Action string `json:"action"`
	// Steps is the first-start walk-through, each line done or not.
	Steps     []audacitylink.Step `json:"steps"`
	Installed bool                `json:"installed"`
	Running   bool                `json:"running"`
	// OpenProject is how the project open in Audacity relates to this one: "unknown", "linked", "other" or "unlabelled".
	OpenProject string `json:"openProject"`
	// Linked is whether this project has an Audacity link recorded; LinkedFile is the linked file's name, never its path.
	Linked     bool    `json:"linked"`
	LinkedFile *string `json:"linkedFile"`
	// HeardSecondsAgo is how long since Audacity last answered; null when it has not answered since the app opened this project.
	HeardSecondsAgo *int `json:"heardSecondsAgo"`
}

// AudacityLink answers the link state: the last heartbeat's, or a fresh read when there is none yet.
func (h *Host) AudacityLink() (string, error) {
	svc := h.services()
	if svc.audacity != nil {
		svc.audacity.mu.Lock()
		cached := svc.audacity.cached
		svc.audacity.mu.Unlock()
		if cached != nil {
			return encodeBinding(h.withHeard(*cached, svc), nil)
		}
	}
	return encodeBinding(h.audacityLinkRefresh(svc, false), nil)
}

// AudacityLinkCheck reads the link state afresh, asking Audacity now, and tells the window if it changed. It can take as long as
// the pipe's timeout when Audacity is showing a dialog.
func (h *Host) AudacityLinkCheck() (string, error) {
	return encodeBinding(h.audacityLinkRefresh(h.services(), true), nil)
}

// AudacityEnableModule turns Audacity's scripting module on in its settings file. Audacity writes that file when it closes, so it
// refuses while Audacity runs; the refusal is the sentence the narrator reads.
func (h *Host) AudacityEnableModule() (string, error) {
	svc := h.services()
	if err := audacitylink.EnableModule(h.audacitySettingsPath(), h.isAudacityRunning()); err != nil {
		if errors.Is(err, audacitylink.ErrAudacityRunning) {
			return "", errors.New("Audacity is open. Close it first, because it saves its settings when it closes; then turn scripting on.") //nolint:staticcheck // a sentence the narrator reads
		}
		return "", err
	}
	return encodeBinding(h.audacityLinkRefresh(svc, true), nil)
}

// AudacityLinkFile opens a file dialog for the Audacity project (.aup3) this project's work lives in, records it, and chooses
// Audacity for the project. Cancelling the dialog changes nothing and answers the state as it was.
func (h *Host) AudacityLinkFile() (string, error) {
	svc := h.services()
	if svc.config.projectFolder == "" {
		return "", errors.New("open a project before linking an Audacity project")
	}
	path, err := pickFile("Select Audacity project", []fileFilter{{"Audacity projects", "*.aup3"}})
	if err != nil {
		return "", err
	}
	if path == "" {
		return encodeBinding(h.audacityLinkRefresh(svc, false), nil)
	}
	if err := h.linkAudacityFile(path); err != nil {
		return "", err
	}
	return encodeBinding(h.audacityLinkRefresh(h.services(), true), nil)
}

// linkAudacityFile is AudacityLinkFile's logic apart from the dialog. It refuses a file that is not a .aup3 or is missing, with a
// sentence, records the path and a link id (kept when the project already has one), and chooses Audacity.
func (h *Host) linkAudacityFile(path string) error {
	svc := h.services()
	if svc.settings == nil || svc.config.projectFolder == "" {
		return errors.New("open a project before linking an Audacity project")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return errors.New("That is not a path to an Audacity project. Choose a file ending in .aup3.") //nolint:staticcheck // a sentence the narrator reads
	}
	name := filepath.Base(abs)
	if !strings.EqualFold(filepath.Ext(abs), ".aup3") {
		return fmt.Errorf("%s is not an Audacity project. Choose a file ending in .aup3.", name) //nolint:staticcheck // a sentence the narrator reads
	}
	if info, err := os.Stat(abs); err != nil || info.IsDir() {
		return fmt.Errorf("%s could not be found. Choose the Audacity project again.", name) //nolint:staticcheck // a sentence the narrator reads
	}
	rows := map[string]*string{audacityLinkFileKey: &abs}
	if svc.settings.Project(recordingSettingsTool)[audacityLinkIDKey] == "" {
		id, err := newAudacityLinkID()
		if err != nil {
			return err
		}
		rows[audacityLinkIDKey] = &id
	}
	if err := svc.settings.Save(recordingSettingsTool, "project", rows); err != nil {
		return err
	}
	if !h.projectDaw(svc).kind.HasScriptingPipe() {
		return h.chooseProjectDaw(dawport.KindAudacity)
	}
	return nil
}

// AudacityLinkOpenProject writes this project's link label into the project open in Audacity, so the app can tell that project
// from any other. It adds one label to the "Narration Utils" label track and touches nothing else. It needs Audacity to answer.
func (h *Host) AudacityLinkOpenProject() (string, error) {
	svc := h.services()
	conn := svc.audacity
	if conn == nil || svc.settings == nil {
		return "", errors.New("Audacity is not connected to this project. Choose Audacity under Record with first.") //nolint:staticcheck // a sentence the narrator reads
	}
	id := svc.settings.Project(recordingSettingsTool)[audacityLinkIDKey]
	if id == "" {
		minted, err := newAudacityLinkID()
		if err != nil {
			return "", err
		}
		id = minted
	}
	ctx, cancel := context.WithTimeout(context.Background(), backupTimeout)
	defer cancel()
	if _, err := conn.adapter.Session().LinkProject(ctx, id); err != nil {
		return "", err
	}
	if err := svc.settings.Save(recordingSettingsTool, "project", map[string]*string{audacityLinkIDKey: &id}); err != nil {
		return "", err
	}
	return encodeBinding(h.audacityLinkRefresh(h.services(), true), nil)
}

// AudacityUnlink forgets the linked Audacity project. The label stays in the Audacity project, where it is one line in the
// "Narration Utils" label track that the narrator can delete.
func (h *Host) AudacityUnlink() (string, error) {
	svc := h.services()
	if svc.settings == nil || svc.config.projectFolder == "" {
		return "", errors.New("open a project before unlinking an Audacity project")
	}
	if err := svc.settings.Save(recordingSettingsTool, "project", map[string]*string{audacityLinkFileKey: nil, audacityLinkIDKey: nil}); err != nil {
		return "", err
	}
	return encodeBinding(h.audacityLinkRefresh(svc, true), nil)
}

// newAudacityLinkID is a fresh link id: ten lower-case letters and digits, which the label text rules carry unchanged.
func newAudacityLinkID() (string, error) {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	raw := make([]byte, 10)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("could not make a link id: %w", err)
	}
	for i, b := range raw {
		raw[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(raw), nil
}

// audacitySettingsPath is Audacity's settings file; the seam is for tests.
func (h *Host) audacitySettingsPath() string {
	if h.audacityConfig != nil {
		return h.audacityConfig()
	}
	return audacitylink.SettingsPath(os.Getenv("APPDATA"))
}

func (h *Host) isAudacityRunning() bool {
	if h.audacityRunning != nil {
		return h.audacityRunning()
	}
	return daw.IsRunning(audacityExe)
}

func (h *Host) locateAudacity() (string, error) {
	locate := h.audacityLocate
	if locate == nil {
		locate = daw.LocateAudacityExecutable
	}
	path, _, err := locate()
	return path, err
}

// audacityLinkRefresh reads the link state now (asking Audacity when probe is set, and when the project records with Audacity),
// caches it on the connection and tells the window when it changed.
func (h *Host) audacityLinkRefresh(svc hostServices, probe bool) AudacityLink {
	return h.audacityLinkRefreshWith(svc, probe, probe)
}

// audacityLinkRefreshWith is audacityLinkRefresh that also says whether to take the project snapshot now (a narrator's action) or
// only when it is due (the heartbeat).
func (h *Host) audacityLinkRefreshWith(svc hostServices, probe, forceSnapshot bool) AudacityLink {
	ctx, cancel := context.WithTimeout(context.Background(), backupTimeout)
	defer cancel()
	link := h.audacityLinkNow(ctx, svc, probe)
	if svc.audacity != nil {
		h.storeAudacityLink(svc.audacity, link)
		if probe && link.State == string(audacitylink.StateAnswering) {
			h.snapshotAudacity(ctx, svc, forceSnapshot)
		}
	}
	return h.withHeard(link, svc)
}

// snapshotAudacity writes the project's snapshot (the tracks, clips and labels the offline readers use, internal/dawport/audacity
// snapshot.go) when it is due or forced, and only when the project changed since the last one (a selection change is not a change).
// A failure is not the link's: it is logged and the last snapshot stays.
func (h *Host) snapshotAudacity(ctx context.Context, svc hostServices, force bool) {
	conn, folder := svc.audacity, svc.config.projectFolder
	if conn == nil || folder == "" {
		return
	}
	conn.mu.Lock()
	due := force || conn.lastSnap == nil || time.Since(conn.lastSnapAt) >= snapshotEvery
	conn.mu.Unlock()
	if !due {
		return
	}
	snap, err := conn.adapter.Session().TakeSnapshot(ctx, time.Now())
	if err != nil {
		return // Audacity went quiet between the probe and the reads; the next heartbeat tries again
	}
	path := audacity.SnapshotPath(folder)
	conn.mu.Lock()
	unchanged := conn.lastSnap != nil && conn.lastSnap.Same(snap)
	conn.lastSnap, conn.lastSnapAt = &snap, time.Now()
	conn.mu.Unlock()
	if _, statErr := os.Stat(path); unchanged && statErr == nil {
		return
	}
	if err := audacity.WriteSnapshot(path, snap); err != nil {
		_ = h.log.Report("audacity_snapshot", "The Audacity project's tracks could not be saved for offline reading: "+err.Error())
	}
}

// storeAudacityLink caches link on conn and emits audacity_link_changed when it differs from the last one sent.
func (h *Host) storeAudacityLink(conn *audacityConn, link AudacityLink) {
	link.HeardSecondsAgo = nil
	encoded, err := json.Marshal(link)
	if err != nil {
		return
	}
	conn.mu.Lock()
	conn.cached = &link
	changed := string(encoded) != conn.lastEmitted
	conn.lastEmitted = string(encoded)
	conn.mu.Unlock()
	if !changed || conn.closed.Load() {
		return
	}
	emitEvent("audacity_link_changed", h.withHeardOf(link, conn))
}

// withHeard fills the heard-ago from the connection.
func (h *Host) withHeard(link AudacityLink, svc hostServices) AudacityLink {
	if svc.audacity == nil {
		return link
	}
	return h.withHeardOf(link, svc.audacity)
}

func (h *Host) withHeardOf(link AudacityLink, conn *audacityConn) AudacityLink {
	link.HeardSecondsAgo = nil
	if seen := conn.client.LastSeen(); !seen.IsZero() {
		ago := max(0, int(time.Since(seen).Seconds()))
		link.HeardSecondsAgo = &ago
	}
	return link
}

// audacityLinkNow is the link state for svc's project. The pipe is asked only when probe is set and the project records with
// Audacity (a project that does not never touches Audacity's pipe).
func (h *Host) audacityLinkNow(ctx context.Context, svc hostServices, probe bool) AudacityLink {
	project := h.projectDaw(svc)
	link := AudacityLink{HasProject: svc.config.projectFolder != "", Chosen: project.kind.HasScriptingPipe()}
	facts := audacitylink.Facts{Supported: h.recorderPlatform() == "windows", Running: h.isAudacityRunning(), Project: audacitylink.ProjectUnknown}
	exe, err := h.locateAudacity()
	facts.Installed = err == nil
	facts.Looks4 = audacitylink.LooksLikeAudacity4(exe)
	facts.Module, _ = audacitylink.ReadModule(h.audacitySettingsPath())
	savedID, savedFile := "", ""
	if svc.settings != nil && link.HasProject {
		rows := svc.settings.Project(recordingSettingsTool)
		savedID, savedFile = rows[audacityLinkIDKey], rows[audacityLinkFileKey]
	}
	link.Linked = savedID != ""
	if savedFile != "" {
		name := filepath.Base(savedFile)
		link.LinkedFile = &name
	}
	if probe && link.Chosen && svc.audacity != nil {
		facts.Pipe = audacitylink.Probe(ctx, svc.audacity.client)
		if facts.Pipe == audacitylink.PipeAnswering {
			facts.Project = h.openProjectRelation(ctx, svc.audacity, savedID)
		}
	} else if !probe && link.Chosen && svc.audacity != nil && svc.audacity.client.Reachable() {
		// A cached read keeps what the last probe saw.
		facts.Pipe = audacitylink.PipeAnswering
	}
	status := audacitylink.Classify(facts)
	link.State, link.Message, link.Action = string(status.State), status.Message, string(status.Action)
	link.Steps, link.OpenProject = status.Steps, string(status.Project)
	link.Installed, link.Running = facts.Installed, facts.Running
	return link
}

// openProjectRelation reads the project open in Audacity and says whether it carries this project's link id.
func (h *Host) openProjectRelation(ctx context.Context, conn *audacityConn, savedID string) audacitylink.OpenProject {
	id, found, err := conn.adapter.Session().ProjectLink(ctx)
	switch {
	case err != nil:
		return audacitylink.ProjectUnknown
	case !found, savedID == "":
		// With no id recorded for this project (never linked, or the narrator pressed Unlink, which leaves the label in the Audacity
		// project) the app has nothing to tell the label from: it cannot say the project is another one's, only that it is not linked.
		return audacitylink.ProjectUnlabelled
	case id == savedID:
		return audacitylink.ProjectLinked
	default:
		return audacitylink.ProjectOther
	}
}

// pollAudacityLink is one tick of transcriptLoop: when the project records with Audacity it starts a probe every
// audacityProbeEvery, in the background, so a dialog that holds Audacity's answer for the pipe's timeout never stalls the loop. The
// probe's result is cached and sent as audacity_link_changed only when it changed.
func (h *Host) pollAudacityLink() {
	svc := h.services()
	conn := svc.audacity
	if conn == nil || conn.closed.Load() {
		return
	}
	conn.mu.Lock()
	if conn.probing || time.Since(conn.lastProbe) < audacityProbeEvery {
		conn.mu.Unlock()
		return
	}
	conn.probing, conn.lastProbe = true, time.Now()
	conn.mu.Unlock()
	go func() {
		defer func() {
			conn.mu.Lock()
			conn.probing = false
			conn.mu.Unlock()
		}()
		link := h.audacityLinkRefreshWith(svc, true, false)
		h.audacityAutoConnect(svc, conn, link)
	}()
}

// audacityLinkFacts is Bootstrap's three DAW facts (dawfacts.go) for a project that records with Audacity, read from the last heartbeat
// without asking Audacity: linked is a link recorded for the project, reachable is Audacity answering, and matches is the open project
// carrying this project's link label. ok is false for any other project, whose facts are REAPER's.
func (h *Host) audacityLinkFacts(svc hostServices) (linked, reachable, matches, ok bool) {
	conn := svc.audacity
	if conn == nil || svc.config.projectFolder == "" {
		return false, false, false, false
	}
	conn.mu.Lock()
	link := conn.cached
	conn.mu.Unlock()
	if link == nil {
		read := h.audacityLinkNow(context.Background(), svc, false)
		link = &read
	}
	return link.Linked, link.State == string(audacitylink.StateAnswering), link.OpenProject == string(audacitylink.ProjectLinked), true
}

// inAudacityWords says a sentence worded for REAPER in Audacity's name, for the bindings that serve both. The Experimental switch's name
// ("Experimental DAW actions") names no DAW, so it passes through unchanged.
func inAudacityWords(message string) string {
	return strings.ReplaceAll(message, "REAPER", "Audacity")
}
