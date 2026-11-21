// This file holds the one rule for naming derived data: what goes into the key of a result computed from a file.
package evidence

import (
	"os"
	"strconv"
)

// KeyInput is the file a derived result was computed from, as its key sees it: where it is, how big it is and a hash of its content.
type KeyInput struct {
	Path        string
	Size        int64
	ContentHash string
}

// SourceInput is the KeyInput of an audio source: its PartialHash (three 64 KiB samples and the size) stands for its content, because
// hashing an hour of audio on every read costs seconds.
// shortcut: an edit in place that keeps the size and misses the samples keeps the key; a result that must see it also stores the file's
// modification time (the waveform peaks do), or uses FullHash.
func SourceInput(identity SourceIdentity) KeyInput {
	return KeyInput{Path: identity.Path, Size: identity.Size, ContentHash: identity.PartialHash}
}

// ProjectFileInput is the KeyInput of a project file that can change in place (a saved project, a settings file): its content is hashed in
// full, because an edit anywhere in it must change the key. Path is relative to projectFolder as SourceIdentity.Path is.
func ProjectFileInput(path, projectFolder string) (KeyInput, error) {
	info, err := os.Stat(path)
	if err != nil {
		return KeyInput{}, err
	}
	hash, err := FullHash(path)
	if err != nil {
		return KeyInput{}, err
	}
	return KeyInput{Path: identityPath(path, projectFolder), Size: info.Size(), ContentHash: hash}, nil
}

// DerivedKey names one derived result: the input it was computed from, the algorithm and its version, the hash of the algorithm's
// parameters, and an optional scope (a played range, a kind of result). A change to any part is another key, so a stored result is never
// read for an input, an algorithm or parameters it was not computed with.
func DerivedKey(input KeyInput, algorithmID, algorithmVersion, paramHash string, scope ...string) string {
	parts := append([]string{input.Path, strconv.FormatInt(input.Size, 10), input.ContentHash, algorithmID, algorithmVersion, paramHash}, scope...)
	return HashParts(parts...)
}
