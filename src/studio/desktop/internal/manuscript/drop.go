package manuscript

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"desktop/internal/importer"
)

// DroppedFile checks the paths the operating system handed over for a file dropped on the window and returns the one manuscript to
// import. A drop is untrusted input: the page never sees the path (the host starts the import itself), so this is the whole gate.
// Every refusal is a sentence for the narrator and names no path.
func DroppedFile(paths []string) (string, error) {
	switch {
	case len(paths) == 0:
		return "", refusal("Nothing was dropped.")
	case len(paths) > 1:
		return "", refusal("Drop one manuscript at a time.")
	}
	path := paths[0]
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return "", refusal("This file could not be read from where it was dropped. Use Choose a file… instead.")
	}
	if !supported(filepath.Ext(path)) {
		return "", refusal("Choose a Word (.docx), Markdown (.md), plain text (.txt) or EPUB (.epub) manuscript.")
	}
	info, err := os.Stat(path)
	switch {
	case err != nil || !info.Mode().IsRegular():
		return "", refusal("This file could not be read from where it was dropped. Use Choose a file… instead.")
	case info.Size() == 0:
		return "", refusal("This file is empty.")
	}
	return path, nil
}

// refusal makes the error for a refused drop. Its text is a sentence for the narrator, shown as written (beginDropped sends err.Error() to
// the window), so it starts with a capital and ends with a full stop: ST1005's rule is for errors wrapped into other messages, and
// TestDroppedFileRefusesWhatItCannotImportInPlainWords holds these to the full stop.
func refusal(sentence string) error {
	return errors.New(sentence)
}

func supported(extension string) bool {
	for _, accepted := range importer.Extensions() {
		if strings.EqualFold(extension, accepted) {
			return true
		}
	}
	return false
}
