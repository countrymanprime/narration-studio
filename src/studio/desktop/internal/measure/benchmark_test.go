package measure

import (
	"fmt"
	"os"
	"path/filepath"

	"context"
	"desktop/internal/evidence"
	"io"
	"testing"
)

// toneStream serves a canonical WAV header and then a repeating one-second 24-bit stereo tone, so an hour of audio can
// be measured without an hour of audio on disk.
type toneStream struct {
	header []byte
	block  []byte
	left   int64
	pos    int
}

func newToneStream(tb testing.TB, rate int, seconds int64) *toneStream {
	tb.Helper()
	second := encodeWAV(tb, 2, rate, 24, false, stereo(fadeInOut(sine(rate, 1, 997, -18, 0), rate/100)))
	block := second[44:]
	dataBytes := int64(len(block)) * seconds
	header := riff(fmtChunk(1, 2, rate, 24), dataChunk(nil, uint32(dataBytes))) //nolint:gosec // G115: an hour of 48 kHz stereo 24-bit fits in 32 bits
	return &toneStream{header: header, block: block, left: dataBytes}
}

func (s *toneStream) Read(p []byte) (int, error) {
	if len(s.header) > 0 {
		n := copy(p, s.header)
		s.header = s.header[n:]
		return n, nil
	}
	if s.left == 0 {
		return 0, io.EOF
	}
	n := copy(p[:min(int64(len(p)), s.left)], s.block[s.pos:])
	s.pos = (s.pos + n) % len(s.block)
	s.left -= int64(n)
	return n, nil
}

func TestToneStreamIsAWholeWAV(t *testing.T) {
	report, err := Analyze(newToneStream(t, 8000, 3))
	if err != nil {
		t.Fatal(err)
	}
	if report.DurationSeconds != 3 || report.Channels != 2 {
		t.Fatalf("tone stream measured as %.3f s of %d channels, want 3 s of 2", report.DurationSeconds, report.Channels)
	}
}

// BenchmarkAnalyzeOneHourStereo48k is the throughput baseline: one hour of 24-bit
// stereo at 48 kHz with every measurement at once. Run it with
// go test ./internal/measure -run '^$' -bench OneHour -benchtime 1x
func BenchmarkAnalyzeOneHourStereo48k(b *testing.B) {
	for range b.N {
		stream := newToneStream(b, 48000, 3600)
		b.SetBytes(stream.left)
		if _, err := AnalyzeContext(context.Background(), stream, Options{}); err != nil {
			b.Fatal(err)
		}
	}
}

// waveformLengths are the recordings the waveform benchmark reads, in minutes: a short chapter, a long one and an hour (#4042).
var waveformLengths = []int{10, 30, 60}

// writeSparseRecording writes a silent mono 24-bit 48 kHz WAV of minutes, its audio a hole the file system reads back as zeros, so an hour of
// recording costs a header on disk and the whole decode on read.
func writeSparseRecording(tb testing.TB, minutes int) string {
	tb.Helper()
	const rate = 48000
	dataBytes := rate * 3 * 60 * minutes
	header := riff(fmtChunk(1, 1, rate, 24), dataChunk(nil, uint32(dataBytes))) //nolint:gosec // G115: an hour of 48 kHz mono 24-bit fits in 32 bits
	path := filepath.Join(tb.TempDir(), "chapter.wav")
	file, err := os.Create(path) //nolint:gosec // G304: a path under the test's own folder
	if err != nil {
		tb.Fatal(err)
	}
	if _, err := file.Write(header); err == nil {
		err = file.Truncate(int64(len(header) + dataBytes))
		if err != nil {
			tb.Fatal(err)
		}
	} else {
		tb.Fatal(err)
	}
	if err := file.Close(); err != nil {
		tb.Fatal(err)
	}
	return path
}

// BenchmarkWaveformTimeToFirst is what a chapter's waveform costs the host from the call to the peaks (#4042): the first read of a recording
// (no cache entry: the whole file decoded), and a revisit (the cache entry read back). Run it with
// go test ./internal/measure -run '^$' -bench WaveformTimeToFirst -benchtime 1x
func BenchmarkWaveformTimeToFirst(b *testing.B) {
	for _, minutes := range waveformLengths {
		path := writeSparseRecording(b, minutes)
		folder := b.TempDir()
		store := evidence.NewCacheStore(folder)
		identity, err := evidence.Identify(path, folder)
		if err != nil {
			b.Fatal(err)
		}
		read := func() {
			if _, err := CachedPeaksFile(context.Background(), store, identity, path, nil, DefaultPeaksPerSecond); err != nil {
				b.Fatal(err)
			}
		}
		b.Run(fmt.Sprintf("cold/%dmin", minutes), func(b *testing.B) {
			for range b.N {
				b.StopTimer()
				if err := os.RemoveAll(evidence.CacheDir(folder)); err != nil {
					b.Fatal(err)
				}
				b.StartTimer()
				read()
			}
		})
		b.Run(fmt.Sprintf("revisit/%dmin", minutes), func(b *testing.B) {
			read()
			b.ResetTimer()
			for range b.N {
				read()
			}
		})
	}
}
