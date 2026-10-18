package manuscript

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/importer"
)

// DroppedFile checks the paths the operating system handed over for a file dropped on the window and returns the one manuscript to
// import. A drop is untrusted input: the page never sees the path (the host starts the import itself), so this is the whole gate.
// Every refusal is a sentence for the narrator and names no path.
func DroppedFile(paths []string) (string, error) {
	switch {
	case len(paths) == 0:
		return "", errors.New("Nothing was dropped.")
	case len(paths) > 1:
		return "", errors.New("Drop one manuscript at a time.")
	}
	path := paths[0]
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return "", errors.New("This file could not be read from where it was dropped. Use Choose a file… instead.")
	}
	if !supported(filepath.Ext(path)) {
		return "", errors.New("Choose a Word (.docx), Markdown (.md), plain text (.txt) or EPUB (.epub) manuscript.")
	}
	info, err := os.Stat(path)
	switch {
	case err != nil || !info.Mode().IsRegular():
		return "", errors.New("This file could not be read from where it was dropped. Use Choose a file… instead.")
	case info.Size() == 0:
		return "", errors.New("This file is empty.")
	}
	return path, nil
}

func supported(extension string) bool {
	for _, accepted := range importer.Extensions() {
		if strings.EqualFold(extension, accepted) {
			return true
		}
	}
	return false
}
