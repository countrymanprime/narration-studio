package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

// The project's DAW is a per-project choice (dawport.ProjectKind): the launch's --daw label is an override, then the project's
// own Recording.engine row, then what the folder holds. A Start-menu launch of a folder with a REAPER project in it is REAPER's,
// so the capability report, the Recording panel and the Booth's chip name REAPER without any command-line flag.

// dawFolderTTL is how long one reading of the project folder stands.
const dawFolderTTL = time.Second

// dawFolderFacts is what the project folder holds for its DAW: the linked REAPER project file (its path, when the manifest links
// one that still exists) and the .rpp files directly in the folder, by name.
type dawFolderFacts struct {
	linkedPath string
	found      []string
}

// dawFolderCache holds one dawFolderFacts per folder for dawFolderTTL. It has its own lock, so reading it never needs h.mu.
type dawFolderCache struct {
	mu sync.Mutex
	// +checklocks:mu
	folder string
	// +checklocks:mu
	at time.Time
	// +checklocks:mu
	facts dawFolderFacts
}

// read answers folder's facts, from the cache while it is fresh.
func (c *dawFolderCache) read(reporter *persist.Reporter, folder string) dawFolderFacts {
	c.mu.Lock()
	defer c.mu.Unlock()
	if folder == c.folder && time.Since(c.at) < dawFolderTTL {
		return c.facts
	}
	c.folder, c.at, c.facts = folder, time.Now(), readDawFolder(reporter, folder)
	return c.facts
}

// forget drops the cached reading, after a link changed the manifest.
func (c *dawFolderCache) forget() {
	c.mu.Lock()
	c.folder = ""
	c.mu.Unlock()
}

func readDawFolder(reporter *persist.Reporter, folder string) dawFolderFacts {
	if folder == "" {
		return dawFolderFacts{}
	}
	facts := dawFolderFacts{found: scanRppFiles(folder)}
	if manifest, ok, err := project.Load(reporter, folder); err == nil && ok && manifest != nil && manifest.DawProjectFile != nil {
		if path, resolved := manifest.DawProjectFile.Resolve(folder); resolved {
			facts.linkedPath = path
		}
	}
	return facts
}

// scanRppFiles names the REAPER project files directly in folder (".rpp" in any case; REAPER's ".rpp-bak" backups and
// subfolders do not count), sorted.
func scanRppFiles(folder string) []string {
	found := []string{}
	if folder == "" {
		return found
	}
	entries, err := os.ReadDir(folder)
	if err != nil {
		return found
	}
	for _, entry := range entries {
		if entry.Type().IsRegular() && strings.EqualFold(filepath.Ext(entry.Name()), ".rpp") {
			found = append(found, entry.Name())
		}
	}
	sort.Strings(found)
	return found
}

// projectDaw is the project's engine, where it came from, and the folder facts behind it.
type projectDaw struct {
	kind   dawport.Kind
	source dawport.Source
	folder dawFolderFacts
}

// projectDaw answers svc's project's engine (dawport.ProjectKind) from the launch's label, the project's Recording.engine row
// (the host's own settings row, never a label from the page: docs/architecture/threat-model.md, row 6f) and the folder.
func (h *Host) projectDaw(svc hostServices) projectDaw {
	saved := ""
	if svc.config.projectFolder != "" && svc.settings != nil {
		saved = svc.settings.Project(recordingSettingsTool)[recordingEngineKey]
	}
	folder := h.dawFolder.read(h.persist, svc.config.projectFolder)
	kind, source := dawport.ProjectKind(dawport.ProjectFacts{
		Label:            svc.config.daw,
		Saved:            saved,
		Linked:           folder.linkedPath != "",
		ProjectFiles:     len(folder.found),
		BuiltinAvailable: svc.config.projectFolder != "" && recorderSupport(h.recorderPlatform()).Available,
	})
	return projectDaw{kind: kind, source: source, folder: folder}
}
