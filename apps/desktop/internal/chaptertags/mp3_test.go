package chaptertags

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The fixtures under testdata/ are synthetic sine-wave MP3s generated with ffmpeg (libmp3lame, 44.1 kHz mono,
// 32 kbps): chapter1.mp3 is exactly 1.0s, chapter2.mp3 is exactly 1.5s, book.mp3 is exactly 2.6s (ffprobe
// -show_entries format=duration at authoring time). mp3Duration is a frame-summing estimate, not a decode, so
// tests allow a small tolerance rather than asserting exact equality.

func TestMp3DurationMatchesKnownFixtureLengths(t *testing.T) {
	cases := []struct {
		file string
		want time.Duration
	}{
		{"chapter1.mp3", 1000 * time.Millisecond},
		{"chapter2.mp3", 1500 * time.Millisecond},
		{"book.mp3", 2600 * time.Millisecond},
	}
	const tolerance = 100 * time.Millisecond // LAME's info frame plus encoder priming/padding samples

	for _, tc := range cases {
		t.Run(tc.file, func(t *testing.T) {
			got, err := mp3Duration(filepath.Join("testdata", tc.file))
			if err != nil {
				t.Fatalf("mp3Duration(%s) error: %v", tc.file, err)
			}
			diff := got - tc.want
			if diff < 0 {
				diff = -diff
			}
			if diff > tolerance {
				t.Fatalf("mp3Duration(%s) = %v, want close to %v (tolerance %v)", tc.file, got, tc.want, tolerance)
			}
		})
	}
}

func TestMp3DurationRejectsNonAudio(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "not-audio.mp3")
	if err := os.WriteFile(path, []byte("this is not an mp3 file at all"), 0o644); err != nil {
		t.Fatalf("os.WriteFile: %v", err)
	}
	if _, err := mp3Duration(path); err == nil {
		t.Fatal("mp3Duration on non-audio data: want error, got nil")
	}
}

func TestMp3DurationMissingFile(t *testing.T) {
	if _, err := mp3Duration(filepath.Join("testdata", "does-not-exist.mp3")); err == nil {
		t.Fatal("mp3Duration on a missing file: want error, got nil")
	}
}

func TestParseFrameHeaderRejectsGarbage(t *testing.T) {
	if _, ok := parseFrameHeader([]byte{0x00, 0x00, 0x00, 0x00}); ok {
		t.Fatal("parseFrameHeader on all-zero bytes: want ok=false")
	}
	if _, ok := parseFrameHeader([]byte{0xFF}); ok {
		t.Fatal("parseFrameHeader on too-short input: want ok=false")
	}
}

// header builds the 4 bytes of an MPEG audio frame header: sync, version/layer (protection bit off), bitrate and
// sample-rate indexes with the padding bit, and a zero channel byte.
func header(versionBits, layerBits, bitrateIndex, sampleRateIndex byte, padding bool) []byte {
	b1 := 0xE0 | versionBits<<3 | layerBits<<1 | 1
	b2 := bitrateIndex<<4 | sampleRateIndex<<2
	if padding {
		b2 |= 0x02
	}
	return []byte{0xFF, b1, b2, 0x00}
}

func TestParseFrameHeaderComputesFrameSizeForEveryVersionAndLayer(t *testing.T) {
	// Sizes follow ISO/IEC 11172-3 and 13818-3: FrameSize = (constant * bitrate / sampleRate + padding) * slot.
	// 128 kbps at 44.1 kHz is the well-known 417-byte Layer III frame (418 with padding).
	cases := []struct {
		name        string
		header      []byte
		wantRate    int
		wantSamples int
		wantSize    int
	}{
		{"MPEG1 Layer III 128k", header(0b11, 0b01, 9, 0, false), 44100, 1152, 417},
		{"MPEG1 Layer III 128k padded", header(0b11, 0b01, 9, 0, true), 44100, 1152, 418},
		{"MPEG1 Layer II 128k", header(0b11, 0b10, 8, 0, false), 44100, 1152, 417},
		{"MPEG1 Layer I 128k", header(0b11, 0b11, 4, 0, false), 44100, 384, 136},
		{"MPEG2 Layer III 64k", header(0b10, 0b01, 8, 0, false), 22050, 576, 208},
		{"MPEG2 Layer II 64k", header(0b10, 0b10, 8, 0, false), 22050, 1152, 417},
		{"MPEG2.5 Layer III 64k at 8 kHz", header(0b00, 0b01, 8, 2, false), 8000, 576, 576},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseFrameHeader(tc.header)
			if !ok {
				t.Fatalf("parseFrameHeader(% x): want a valid header", tc.header)
			}
			if got.sampleRate != tc.wantRate || got.samples != tc.wantSamples || got.sizeBytes != tc.wantSize {
				t.Fatalf("parseFrameHeader(% x) = rate %d, samples %d, size %d; want %d, %d, %d",
					tc.header, got.sampleRate, got.samples, got.sizeBytes, tc.wantRate, tc.wantSamples, tc.wantSize)
			}
		})
	}
}

func TestParseFrameHeaderRejectsReservedAndBadFields(t *testing.T) {
	cases := []struct {
		name   string
		header []byte
	}{
		{"missing sync byte", []byte{0x00, 0xFB, 0x90, 0x00}},
		{"sync bits too short", []byte{0xFF, 0x7B, 0x90, 0x00}},
		{"reserved version", header(0b01, 0b01, 9, 0, false)},
		{"reserved layer", header(0b11, 0b00, 9, 0, false)},
		{"free bitrate", header(0b11, 0b01, 0, 0, false)},
		{"bad bitrate", header(0b11, 0b01, 15, 0, false)},
		{"reserved sample rate", header(0b11, 0b01, 9, 3, false)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got, ok := parseFrameHeader(tc.header); ok {
				t.Fatalf("parseFrameHeader(% x) = %+v, want ok=false", tc.header, got)
			}
		})
	}
}

func TestID3v2HeaderSizeReadsTheSyncsafeLength(t *testing.T) {
	tag := []byte{'I', 'D', '3', 4, 0, 0, 0x00, 0x00, 0x02, 0x01} // syncsafe 0x101 = 2<<7 | 1 = 257
	if got := id3v2HeaderSize(tag); got != 10+257 {
		t.Fatalf("id3v2HeaderSize = %d, want %d", got, 10+257)
	}
	if got := id3v2HeaderSize([]byte("not an id3 tag")); got != 0 {
		t.Fatalf("id3v2HeaderSize on a non-tag = %d, want 0", got)
	}
}
