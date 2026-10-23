package audacitybridge

import (
	"bufio"
	"bytes"
)

// Test hooks for the external golden tests: the unexported reader and parsers, over raw reply bytes.

// ReadReplyForTest reads one reply from raw bytes and reports the terminator's verdict and the reply's lines.
func ReadReplyForTest(raw []byte) (ok bool, lines []string) {
	reply, ok, err := readReply(bufio.NewReader(bytes.NewReader(raw)))
	if err != nil {
		return false, []string{"ERROR: " + err.Error()}
	}
	return ok, reply.Lines
}

// ParseTracksForTest parses a whole GetInfo Tracks reply.
func ParseTracksForTest(raw []byte) ([]TrackInfo, error) {
	reply, _, err := readReply(bufio.NewReader(bytes.NewReader(raw)))
	if err != nil {
		return nil, err
	}
	return parseTracks(reply)
}

// ParseClipsForTest parses a whole GetInfo Clips reply.
func ParseClipsForTest(raw []byte) ([]ClipInfo, error) {
	reply, _, err := readReply(bufio.NewReader(bytes.NewReader(raw)))
	if err != nil {
		return nil, err
	}
	return parseClips(reply)
}

// ParseLabelsForTest parses a whole GetInfo Labels reply.
func ParseLabelsForTest(raw []byte) ([]LabelInfo, error) {
	reply, _, err := readReply(bufio.NewReader(bytes.NewReader(raw)))
	if err != nil {
		return nil, err
	}
	return parseLabels(reply)
}
