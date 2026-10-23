package main

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"

	"github.com/countrymanprime/narration-studio/shell/internal/voicesample"
)

const mediaRoute = "/media"

// mediaSampleParam names a voice sample's clip: GET /media?sample=<id>.
const mediaSampleParam = "sample"

// mediaMiddleware serves local media files referenced by the current
// project's parsed tracks directly to the embedded webview, entirely
// in-process: Wails' AssetServer intercepts webview resource requests (on
// Windows, WebView2's virtual-host-mapped scheme handler), not a bound TCP
// socket - see docs/architecture/daw-integration.md's "no loopback server"
// rule. http.ServeContent gives Range-request support for free, which the
// track player needs to seek without loading a whole chapter-length file
// into memory.
//
// The route serves two classes of file, each named a different way and never both at once: a track source named by
// ?path= (authorizedMediaSource), and a voice sample's clip named by ?sample=<id> (serveSampleClip). A request that names both is
// refused, so a path can never be used to reach a clip and an id can never reach anything but a clip.
func (h *Host) mediaMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != mediaRoute {
			next.ServeHTTP(w, r)
			return
		}
		query := r.URL.Query()
		if _, named := query[mediaSampleParam]; named {
			h.serveSampleClip(w, r, query)
			return
		}
		path, ok := h.authorizedMediaSource(filepath.Clean(r.URL.Query().Get("path")))
		if !ok {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		file, err := os.Open(path)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		defer func() { _ = file.Close() }() // read-only
		info, err := file.Stat()
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.ServeContent(w, r, filepath.Base(path), info.ModTime(), file)
	})
}

// authorizedMediaSource refuses to serve anything that is not a source file
// the current project's currently selected .rpp actually references -
// otherwise the media route would be an arbitrary local file read. It
// re-resolves the project's tracks on every request rather than trusting a
// cache, so a project switch or an .rpp re-selection takes effect
// immediately instead of leaving a stale file servable. It returns the
// project's own copy of the matched path, never the requested string, so
// the file that gets opened is always one the parsed project vouched for.
//
// It authorizes every take of every item, not only each item's active take
// (item.SourceFile): take review's audition and comparison (docs/utilities/take-review.md)
// play a candidate take's own source without first making it the active take
// in REAPER.
func (h *Host) authorizedMediaSource(requested string) (string, bool) {
	// A take of the built-in recorder: only a file its Recordings list names, as its own path.
	if recorder := h.services().recorder; recorder != nil {
		if path, ok := recorder.TakePath(requested); ok {
			return path, true
		}
	}
	project, err := h.tracksList()
	if err != nil {
		return "", false
	}
	for _, track := range project.Tracks {
		for _, item := range track.Items {
			for _, take := range item.Takes {
				if take.SourceFile != "" && take.SourceFile == requested {
					return take.SourceFile, true
				}
			}
		}
	}
	return "", false
}

// serveSampleClip serves the clip of the voice sample the request names by id. The id is the only input: it must be exactly one
// 32-character lowercase hex value, the request must carry no path, and the host looks the id up in samples.json and serves
// clips/<id>.wav only when the file still has the size and SHA-256 that were saved (voicesample.Service.Clip). Anything else, an
// unlisted id included, is a 404 that says nothing about why, so the route cannot be used to probe the project folder. No string
// from the page is ever turned into a path here: the clip's path comes from the id alone.
func (h *Host) serveSampleClip(w http.ResponseWriter, r *http.Request, query url.Values) {
	ids := query[mediaSampleParam]
	if _, hasPath := query["path"]; hasPath || len(ids) != 1 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	clip, err := h.voiceSamples().Clip(ids[0])
	if err != nil || clip.State != voicesample.ClipOK || clip.Path == "" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	file, err := os.Open(clip.Path)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	defer func() { _ = file.Close() }() // read-only
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "audio/wav")
	http.ServeContent(w, r, ids[0]+".wav", info.ModTime(), file)
}
