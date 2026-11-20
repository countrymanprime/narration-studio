package main

import (
	"desktop/internal/brand"
	"desktop/internal/persist"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
)

// resourceKeyMemoFile holds the content key of the resources embedded in one executable, so a launch of the same executable does not
// hash them again (docs/reference/data-files.md, per-user cache).
const resourceKeyMemoFile = "resource-key.json"

// resourceKeyMemo names the executable a key was computed from. The resources are bytes of that executable, so a file with the same
// path, size and modification time embeds the same resources; an update or a rebuild changes one of them and the key is computed again.
type resourceKeyMemo struct {
	Executable  string `json:"executable"`
	Size        int64  `json:"size"`
	ModUnixNano int64  `json:"mod_unix_nano"`
	Key         string `json:"key"`
}

// resourceKeyShape is what resourceKeyFor writes: the key is a folder name, so a memo holding anything else is not used.
var resourceKeyShape = regexp.MustCompile(`^v1-[0-9a-f]{24}$`)

// memoizedResourceKey answers resourceKeyFor(source) for the resources embedded in executable. A release embeds about 400 MB, and
// hashing it took over a second of every launch before the window could load (#3769); the key is now hashed once for each executable
// and kept under userCache. A memo that is missing, unreadable or of another executable is ignored and replaced.
func memoizedResourceKey(source fs.FS, userCache, executable string) (string, error) {
	path := filepath.Join(userCache, brand.DataFolder, "runtime", resourceKeyMemoFile)
	info, statErr := os.Stat(executable)
	current := resourceKeyMemo{Executable: executable}
	if statErr == nil {
		current.Size, current.ModUnixNano = info.Size(), info.ModTime().UnixNano()
		var saved resourceKeyMemo
		if bytes, err := os.ReadFile(path); err == nil && json.Unmarshal(bytes, &saved) == nil {
			current.Key = saved.Key
			if saved == current && resourceKeyShape.MatchString(saved.Key) {
				return saved.Key, nil
			}
		}
	}
	key, err := resourceKeyFor(source)
	if err != nil || statErr != nil {
		return key, err
	}
	current.Key = key
	if bytes, err := json.Marshal(current); err == nil && os.MkdirAll(filepath.Dir(path), 0o755) == nil {
		_ = persist.WriteFile(path, bytes, 0o600) // best effort: without the memo the next launch hashes again
	}
	return key, nil
}
