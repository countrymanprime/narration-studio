package main

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"sync"
	"sync/atomic"

	"desktop/internal/dawport"
	"desktop/internal/dawport/audacity"
	"desktop/internal/dawport/reaper"
	"desktop/internal/persist"
	"desktop/internal/project"
	"desktop/internal/settings"
	"desktop/internal/tracks"
)

// tracksDiscover lists every *.rpp file discovered in the project folder,
// along with a resolved "selected" path when the choice isn't ambiguous: the
// narrator's previously saved choice if it still exists among the candidates,
// or the sole candidate when there's only one. It reads the project folder and
// settings from one h.services() snapshot, so both belong to the same project
// even if a project switch lands mid-call.
func (h *Host) tracksDiscover() (map[string]any, error) {
	return discoverTracks(h.services())
}

func discoverTracks(svc hostServices) (map[string]any, error) {
	candidates, selected, err := discoverProjectFiles(svc.config.projectFolder, svc.settings)
	if err != nil {
		return nil, err
	}
	return map[string]any{"candidates": candidates, "selected": selected}, nil
}

// discoverProjectFiles lists the *.rpp files directly in folder, plus the file the project's manifest links when that file
// exists (it may live in another folder, since REAPER keeps its projects wherever the narrator saved them), and resolves
// the selected one: the linked file, else the narrator's saved choice, else the only candidate, "" when the choice is
// ambiguous.
func discoverProjectFiles(folder string, store *settings.Store) (candidates []string, selected string, err error) {
	if folder == "" {
		return nil, "", fmt.Errorf("open a project before viewing tracks")
	}
	// A project that records with Audacity has no .rpp: what the offline readers read is the snapshot taken while Audacity answered.
	if snapshot := audacitySnapshotFor(folder, store); snapshot != "" {
		return []string{snapshot}, snapshot, nil
	}
	candidates, err = tracks.Discover(folder)
	if err != nil {
		return nil, "", fmt.Errorf("could not look for a REAPER project file: %w", err)
	}
	linked := linkedProjectFile(store.Reporter(), folder)
	if linked != "" {
		candidates = withLinkedFile(candidates, linked)
		return candidates, linked, nil
	}
	if saved, ok := store.Project("Tracks")["selectedRpp"]; ok && contains(candidates, saved) {
		selected = saved
	} else if len(candidates) == 1 {
		selected = candidates[0]
	}
	return candidates, selected, nil
}

// audacitySnapshotFor is the project's Audacity snapshot when the project records with Audacity and one has been taken, "" otherwise.
// The saved engine choice decides (the host's own Recording.engine row); a project with no choice and no REAPER project file at all
// but a snapshot is an Audacity project too, so a launch from the installer's Audacity shortcut finds its tracks.
func audacitySnapshotFor(folder string, store *settings.Store) string {
	path := audacity.SnapshotPath(folder)
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return ""
	}
	if store != nil && dawport.Classify(store.Project(recordingSettingsTool)[recordingEngineKey]).HasScriptingPipe() {
		return path
	}
	if store != nil && store.Project(recordingSettingsTool)[recordingEngineKey] != "" {
		return "" // chosen another engine: a snapshot left from when it was Audacity is not this project's tracks
	}
	if found, _ := tracks.Discover(folder); len(found) == 0 && linkedProjectFile(store.Reporter(), folder) == "" {
		return path
	}
	return ""
}

// linkedProjectFile is the REAPER project file folder's manifest links, as it is on disk now ("" when there is no link or the
// file is gone).
func linkedProjectFile(reporter *persist.Reporter, folder string) string {
	manifest, ok, err := project.Load(reporter, folder)
	if err != nil || !ok || manifest == nil || manifest.DawProjectFile == nil {
		return ""
	}
	path, _ := manifest.DawProjectFile.Resolve(folder)
	return path
}

// withLinkedFile returns candidates with linked in it exactly once, in path order. A candidate that is the same file as linked
// (another spelling of its path) is replaced by it, so the linked spelling is the one selected.
func withLinkedFile(candidates []string, linked string) []string {
	merged := make([]string, 0, len(candidates)+1)
	linkedInfo, linkedErr := os.Stat(linked)
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); linkedErr == nil && err == nil && os.SameFile(info, linkedInfo) {
			continue
		}
		merged = append(merged, candidate)
	}
	merged = append(merged, linked)
	sort.Strings(merged)
	return merged
}

// selectedProjectFile is the saved .rpp the analyses read (the recording
// coverage service's Config.ProjectFile): the audio engine panel's selection, with
// the same errors tracksList gives when there is none.
func selectedProjectFile(folder string, store *settings.Store) (string, error) {
	candidates, selected, err := discoverProjectFiles(folder, store)
	if err != nil {
		return "", err
	}
	if selected == "" {
		if len(candidates) == 0 {
			return "", fmt.Errorf("no REAPER project (.rpp) file was found in this project folder")
		}
		return "", fmt.Errorf("choose which REAPER project file to use before viewing tracks")
	}
	return selected, nil
}

// tracksSelect persists the narrator's explicit choice among an ambiguous
// set of discovered .rpp files, refusing anything that isn't one of them so
// the saved path can never point outside the current project folder. The
// candidates and the store the choice is saved to come from one snapshot.
func (h *Host) tracksSelect(path string) (map[string]any, error) {
	svc := h.services()
	discovery, err := discoverTracks(svc)
	if err != nil {
		return nil, err
	}
	candidates, _ := discovery["candidates"].([]string)
	if !contains(candidates, path) {
		return nil, fmt.Errorf("that file is not a REAPER project in the current project folder")
	}
	value := path
	if err := svc.settings.Save("Tracks", "project", map[string]*string{"selectedRpp": &value}); err != nil {
		return nil, err
	}
	h.goBackground(func() { h.chapterSyncTrigger(syncTriggerDawLink) }) // the .rpp chapter sync reads changed (chaptersync.go)
	return map[string]any{"candidates": candidates, "selected": path}, nil
}

// tracksList resolves the current selection (see tracksDiscover) and parses
// it. An unresolved selection is reported as a distinct, actionable error
// rather than an empty track list, so the frontend can tell "no project
// file exists yet" apart from "choose which one to use."
func (h *Host) tracksList() (tracks.Project, error) {
	return selectedProject(h.services())
}

// selectedProject parses the .rpp svc's project has selected, with
// tracksList's errors when none is selected; shared by every binding that
// reads the project's tracks.
func selectedProject(svc hostServices) (tracks.Project, error) {
	selected, err := selectedProjectFile(svc.config.projectFolder, svc.settings)
	if err != nil {
		return tracks.Project{}, err
	}
	project, err := readProject(selected)
	if err != nil {
		return tracks.Project{}, fmt.Errorf("could not read %s: %w", filepath.Base(selected), err)
	}
	return project, nil
}

// offlineProjectReader is the DAW port's declaration for reading a saved .rpp with no live session: project_read is NeedsNothing
// (dawport's capability.go), so a resolver built over it reports the capability available with no bridge at all,
// which is why this app can browse a project's tracks before REAPER has ever been launched from it. Every other capability answers unsupported: this
// adapter is never handed to bridge.Actions or the review workflow.
type offlineProjectReader struct{}

var _ dawport.Adapter = offlineProjectReader{}

func (offlineProjectReader) Kind() dawport.Kind { return dawport.KindREAPER }
func (offlineProjectReader) Declares() map[dawport.Capability]dawport.Level {
	return map[dawport.Capability]dawport.Level{dawport.CapProjectRead: dawport.Supported}
}
func (offlineProjectReader) Role(c dawport.Capability) any {
	if c == dawport.CapProjectRead {
		return reaper.ProjectReader{}
	}
	return nil
}

// projectReaderRole is dawport.Role[dawport.ProjectReader] over offlineProjectReader: a package var so a test can
// substitute a fake reader or force a resolver failure without touching a real file.
var projectReaderRole = func() (dawport.ProjectReader, error) {
	resolver := dawport.NewResolver(dawport.ResolverConfig{Adapter: offlineProjectReader{}})
	return dawport.Role[dawport.ProjectReader](resolver, dawport.CapProjectRead)
}

// readProject is the host's one way to read a saved project file (a REAPER .rpp, or an Audacity snapshot): tracks.go, chapterlinks.go,
// recordedlengths.go and the analyses (projectFileReader) all come here. Every call reads the file and hashes it, and the parse is
// kept while the file's bytes are the ones it was made from (savedProjects), so a call on an unchanged file costs the read and the
// hash. The Project it returns is shared: callers read it and never write into it (mergeLiveTracks copies the tracks it changes).
func readProject(path string) (tracks.Project, error) { return savedProjects.read(path, parseProject) }

// projectParse parses the project file at path: from raw when it has bytes and the reader parses bytes (fromRaw), or else by opening
// path itself.
type projectParse func(path string, raw []byte) (project tracks.Project, fromRaw bool, err error)

// projectParser is a project-read role that parses bytes the host has already read, so the bytes the cache hashed are the ones parsed.
type projectParser interface {
	ParseProject(path string, raw []byte) (tracks.Project, error)
}

// parseProject parses raw, the bytes of the file at path: an Audacity snapshot through the Audacity adapter's reader, anything else
// through the DAW port's project-read role (a REAPER .rpp). When raw is nil the file could not be read, and the reader opens path
// itself to report why; so does a role that only reads by path, and fromRaw is false for both.
func parseProject(path string, raw []byte) (project tracks.Project, fromRaw bool, err error) {
	var reader dawport.ProjectReader = audacity.SnapshotReader{}
	if !audacity.IsSnapshot(path) {
		if reader, err = projectReaderRole(); err != nil {
			return tracks.Project{}, false, err
		}
	}
	if parser, ok := reader.(projectParser); ok && raw != nil {
		project, err = parser.ParseProject(path, raw)
		return project, true, err
	}
	project, err = reader.ReadProject(path)
	return project, false, err
}

// projectCacheSize is how many saved projects the cache keeps: the selected file and the one it was switched from, with room to spare.
const projectCacheSize = 4

// maxCachedProjectBytes is the largest file the cache reads and hashes: the largest saved project measured is 11.9 MB (300 chapters)
// and the Audacity reader's own limit is 32 MB, so a larger file goes to the reader by path, for its own limit and error.
const maxCachedProjectBytes = 64 << 20

// projectCache keeps the parse of each of the last few saved project files while the file's bytes are the ones it was parsed from
// (#3287, #3863): every read hashes the file, so a rewrite that keeps its size and its modification time is parsed again, and a save
// of the same bytes at a newer time is not. A parse that fails is not kept.
type projectCache struct {
	mu sync.Mutex
	// +checklocks:mu
	entries []projectCacheEntry // oldest first
	// reads counts the calls of read, for the tests that guard how often one binding asks for the saved project: each call reads and
	// hashes the file and looks up every take's source file on disk, whatever the cache holds.
	reads atomic.Int64
}

type projectCacheEntry struct {
	path    string
	sum     persist.Digest // of the bytes project was parsed from
	project tracks.Project
}

// read answers path's parse from the cache when the file's bytes are the ones it holds the parse of, or parses them (parse) and keeps
// it. A file that cannot be read, or is larger than maxCachedProjectBytes, is handed to parse with no bytes and nothing is kept, so
// the parser reports why; a parse that was not made from the bytes read here (a reader that only reads by path) is not kept either,
// so that reader parses on every call. The file is read with persist.ReadFile: the host opens it on every call, and on Windows that
// open does not stop the DAW from replacing the file while it is read.
func (c *projectCache) read(path string, parse projectParse) (tracks.Project, error) {
	c.reads.Add(1)
	if info, err := os.Stat(path); err != nil || info.Size() > maxCachedProjectBytes {
		project, _, err := parse(path, nil)
		return project, err
	}
	raw, err := persist.ReadFile(path)
	if err != nil {
		project, _, err := parse(path, nil)
		return project, err
	}
	sum := persist.Sum(raw)
	if project, ok := c.lookup(path, sum); ok {
		return withCurrentSources(project), nil
	}
	// Parsed outside the lock: a slow parse of one project must not hold up cached reads of another. Two callers that miss together parse twice.
	project, fromRaw, err := parse(path, raw)
	if err != nil {
		c.forget(path)
		return tracks.Project{}, err
	}
	if !fromRaw {
		// The reader read the file a second time, so sum may not be of the bytes it parsed.
		c.forget(path)
		return withCurrentSources(project), nil
	}
	c.mu.Lock()
	c.entries = slices.DeleteFunc(c.entries, func(entry projectCacheEntry) bool { return entry.path == path })
	if len(c.entries) >= projectCacheSize {
		c.entries = c.entries[1:]
	}
	c.entries = append(c.entries, projectCacheEntry{path: path, sum: sum, project: project})
	c.mu.Unlock()
	// The caller gets a copy, as on a hit: what it writes into never reaches the cached parse.
	return withCurrentSources(project), nil
}

func (c *projectCache) lookup(path string, sum persist.Digest) (tracks.Project, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, entry := range c.entries {
		if entry.path == path && entry.sum == sum {
			return entry.project, true
		}
	}
	return tracks.Project{}, false
}

func (c *projectCache) forget(path string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = slices.DeleteFunc(c.entries, func(entry projectCacheEntry) bool { return entry.path == path })
}

// withCurrentSources is project with each item's and take's SourceAvailable asked of the disk again: the parse records whether the
// audio file was there, and that changes without the .rpp changing (a take deleted, a drive mounted). It copies the track, item,
// take, region and marker lists, so the cached parse stays as it was when a caller writes into them; a track's PlayingLanes and an
// item's or take's Ext are shared with it.
func withCurrentSources(project tracks.Project) tracks.Project {
	list := make([]tracks.Track, len(project.Tracks))
	for i, track := range project.Tracks {
		track.Items = slices.Clone(track.Items)
		for j := range track.Items {
			item := &track.Items[j]
			item.SourceAvailable = sourceAvailable(item.SourceFile, item.SourceAvailable)
			item.Takes = slices.Clone(item.Takes)
			for k := range item.Takes {
				take := &item.Takes[k]
				take.SourceAvailable = sourceAvailable(take.SourceFile, take.SourceAvailable)
			}
		}
		list[i] = track
	}
	project.Tracks = list
	project.Regions = slices.Clone(project.Regions)
	project.Markers = slices.Clone(project.Markers)
	return project
}

// sourceAvailable is whether file is a readable file now; a source with no file (an Audacity clip) keeps what the reader said.
func sourceAvailable(file string, parsed bool) bool {
	if file == "" {
		return parsed
	}
	info, err := os.Stat(file)
	return err == nil && !info.IsDir()
}

// reset forgets every parse. Only for tests, and benchmarks that want a cold read.
func (c *projectCache) reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = nil
}

// savedProjects is the host's one cache of saved project parses.
var savedProjects = &projectCache{}

// projectFileReader is the offline reader the analyses are given (coverage, editing, the character bible, voice samples): a REAPER
// project through the REAPER adapter, or an Audacity snapshot through the Audacity adapter's, told apart by the file (the snapshot's
// fixed name), never by a label from the page.
type projectFileReader struct{}

var _ dawport.ProjectReader = projectFileReader{}

func (projectFileReader) ReadProject(path string) (tracks.Project, error) { return readProject(path) }
