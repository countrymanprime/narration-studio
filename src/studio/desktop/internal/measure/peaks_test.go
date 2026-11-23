package measure

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

// minMax reads bucket k of a Peaks back as two signed values.
func minMax(p Peaks, k int) (int8, int8) {
	return int8(p.MinMax[2*k]), int8(p.MinMax[2*k+1]) //nolint:gosec // G115: the bytes are two's complement by definition
}

func peaksOf(t *testing.T, wav []byte, rng *Range, perSecond int) Peaks {
	t.Helper()
	peaks, err := ComputePeaks(context.Background(), bytes.NewReader(wav), rng, perSecond)
	if err != nil {
		t.Fatal(err)
	}
	return peaks
}

func near1(a, b int8) bool { return a-b <= 1 && b-a <= 1 }

// The host draws the waveform from min and max peaks per bucket, computed from the WAV source with the existing reader.
func TestPeaksAreTheMinimumAndMaximumOfEachBucket(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, sine(8000, 1, 220, -6, 0))
	peaks := peaksOf(t, wav, nil, 50)
	if peaks.Buckets != 50 || len(peaks.MinMax) != 100 || peaks.BucketsPerSecond != 50 || peaks.StartSeconds != 0 {
		t.Fatalf("peaks = %d buckets, %d bytes at %d/s from %v; want 50 buckets, 100 bytes at 50/s from 0", peaks.Buckets, len(peaks.MinMax), peaks.BucketsPerSecond, peaks.StartSeconds)
	}
	if peaks.SampleRate != 8000 || peaks.Channels != 1 {
		t.Fatalf("format = %d Hz, %d channels", peaks.SampleRate, peaks.Channels)
	}
	// -6 dB is 0.501 of full scale, 63.6 of 127: every 20 ms bucket holds several whole periods of 220 Hz.
	for k := range peaks.Buckets {
		low, high := minMax(peaks, k)
		if !near1(high, 64) || !near1(low, -64) {
			t.Fatalf("bucket %d = [%d, %d], want about [-64, 64]", k, low, high)
		}
	}
}

// A -6 dB sine has a peak of 0.501 and an RMS of 0.501/sqrt(2) = 0.354, 45 of 127: the level REAPER draws inside its peaks.
func TestPeaksCarryTheRMSOfEachBucket(t *testing.T) {
	peaks := peaksOf(t, encodeWAV(t, 1, 8000, 16, false, sine(8000, 1, 220, -6, 0)), nil, 50)
	if len(peaks.RMS) != peaks.Buckets {
		t.Fatalf("%d RMS bytes for %d buckets", len(peaks.RMS), peaks.Buckets)
	}
	for k, v := range peaks.RMS {
		if v < 45 || v > 46 {
			t.Fatalf("bucket %d RMS = %d, want 45 or 46", k, v)
		}
	}
	silent := peaksOf(t, encodeWAV(t, 1, 8000, 16, false, silence(8000, 0.5)), nil, 50)
	for k, v := range silent.RMS {
		if v != 0 {
			t.Fatalf("silent bucket %d RMS = %d, want 0", k, v)
		}
	}
}

func TestSilenceIsAFlatLine(t *testing.T) {
	peaks := peaksOf(t, encodeWAV(t, 1, 8000, 16, false, silence(8000, 0.5)), nil, 50)
	for k := range peaks.Buckets {
		if low, high := minMax(peaks, k); low != 0 || high != 0 {
			t.Fatalf("bucket %d = [%d, %d], want [0, 0]", k, low, high)
		}
	}
}

func TestFullScaleIsNeverClippedBeyond127(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 32, true, []float64{1, -1, 1, -1})
	low, high := minMax(peaksOf(t, wav, nil, 50), 0)
	if low != -127 || high != 127 {
		t.Fatalf("full scale = [%d, %d], want [-127, 127]", low, high)
	}
}

func TestAStereoBucketCoversBothChannels(t *testing.T) {
	left := silence(8000, 1)
	right := sine(8000, 1, 220, -6, 0)
	peaks := peaksOf(t, encodeWAV(t, 2, 8000, 24, false, interleave(left, right)), nil, 10)
	if peaks.Channels != 2 || peaks.Buckets != 10 {
		t.Fatalf("peaks = %d channels, %d buckets", peaks.Channels, peaks.Buckets)
	}
	if low, high := minMax(peaks, 3); !near1(high, 64) || !near1(low, -64) {
		t.Fatalf("bucket 3 = [%d, %d], want the right channel's [-64, 64]", low, high)
	}
}

func TestAPartialLastBucketStillCounts(t *testing.T) {
	// 1.01 s at 50 buckets a second: 50 whole buckets and half of one more.
	peaks := peaksOf(t, encodeWAV(t, 1, 8000, 16, false, sine(8000, 1.01, 220, -6, 0)), nil, 50)
	if peaks.Buckets != 51 {
		t.Fatalf("buckets = %d, want 51", peaks.Buckets)
	}
}

func TestPeaksOfAPlayedRangeSkipTheAudioBeforeIt(t *testing.T) {
	// Silence, a tone, silence: the item plays only the middle second.
	samples := concat(silence(8000, 1), sine(8000, 1, 220, -6, 0), silence(8000, 1))
	peaks := peaksOf(t, encodeWAV(t, 1, 8000, 16, false, samples), &Range{StartSeconds: 1, LengthSeconds: 1}, 50)
	if peaks.Buckets != 50 || peaks.StartSeconds != 1 {
		t.Fatalf("peaks = %d buckets from %v s, want 50 from 1 s", peaks.Buckets, peaks.StartSeconds)
	}
	for k := range peaks.Buckets {
		if low, high := minMax(peaks, k); !near1(high, 64) || !near1(low, -64) {
			t.Fatalf("bucket %d = [%d, %d], want the tone", k, low, high)
		}
	}
}

func TestARangePastTheEndHasPeaksForWhatExists(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, sine(8000, 1, 220, -6, 0))
	if peaks := peaksOf(t, wav, &Range{StartSeconds: 0.5, LengthSeconds: 10}, 50); peaks.Buckets != 25 {
		t.Fatalf("buckets = %d, want 25 (the half second that exists)", peaks.Buckets)
	}
	if peaks := peaksOf(t, wav, &Range{StartSeconds: 5, LengthSeconds: 1}, 50); peaks.Buckets != 0 || len(peaks.MinMax) != 0 {
		t.Fatalf("peaks after the end = %d buckets, want none", peaks.Buckets)
	}
}

func TestPeaksRefuseABucketRateOutsideTheirLimits(t *testing.T) {
	wav := encodeWAV(t, 1, 8000, 16, false, silence(8000, 0.1))
	for _, perSecond := range []int{0, -5, MaxPeaksPerSecond + 1} {
		if _, err := ComputePeaks(context.Background(), bytes.NewReader(wav), nil, perSecond); err == nil {
			t.Fatalf("%d buckets a second was accepted", perSecond)
		}
	}
	if _, err := ComputePeaks(context.Background(), bytes.NewReader(wav), &Range{StartSeconds: -1, LengthSeconds: 1}, 50); err == nil {
		t.Fatal("a negative range start was accepted")
	}
}

func TestPeaksOfSomethingThatIsNotAWAVFail(t *testing.T) {
	_, err := ComputePeaks(context.Background(), bytes.NewReader([]byte("ID3\x04\x00 an mp3")), nil, 50)
	if !errors.Is(err, ErrNotWAV) {
		t.Fatalf("err = %v, want ErrNotWAV (a non-WAV source shows no waveform)", err)
	}
}

func TestPeaksStopWhenCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := ComputePeaks(ctx, newToneStream(t, 48000, 60), nil, 50)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

func TestAnHourOfPeaksIsSmall(t *testing.T) {
	if testing.Short() {
		t.Skip("reads an hour of generated audio")
	}
	// The size depends only on the duration, so an 8 kHz hour keeps the test quick; the benchmark reads 48 kHz.
	peaks, err := ComputePeaks(context.Background(), newToneStream(t, 8000, 3600), nil, DefaultPeaksPerSecond)
	if err != nil {
		t.Fatal(err)
	}
	if peaks.Buckets != 3600*DefaultPeaksPerSecond || len(peaks.MinMax) != 2*peaks.Buckets {
		t.Fatalf("an hour = %d buckets, %d bytes", peaks.Buckets, len(peaks.MinMax))
	}
	// Two bytes a bucket: 360 KB for an hour at 50 a second, 480 KB as base64 on the wire.
	if len(peaks.MinMax) > 400*1024 {
		t.Fatalf("an hour of peaks is %d bytes", len(peaks.MinMax))
	}
}

// BenchmarkPeaksOneHourStereo48k measures peaks over 60 minutes of 48 kHz stereo 24-bit WAV (about 1 GB of audio data).
func BenchmarkPeaksOneHourStereo48k(b *testing.B) {
	for range b.N {
		stream := newToneStream(b, 48000, 3600)
		b.SetBytes(stream.left)
		if _, err := ComputePeaks(context.Background(), stream, nil, DefaultPeaksPerSecond); err != nil {
			b.Fatal(err)
		}
	}
}

func TestPeaksReportAnIOFailureWhileSkippingOrReading(t *testing.T) {
	raw := encodeWAV(t, 1, 8000, 16, false, sine(8000, 2, 220, -6, 0))
	dataAt := bytes.Index(raw, []byte("data"))
	if _, err := ComputePeaks(context.Background(), ioChain(raw[:dataAt+8], failingReader{errBoom}), &Range{StartSeconds: 1, LengthSeconds: 1}, 50); !errors.Is(err, errBoom) {
		t.Fatalf("skipping: err = %v, want the I/O failure", err)
	}
	if _, err := ComputePeaks(context.Background(), ioChain(raw[:dataAt+8], failingReader{errBoom}), nil, 50); !errors.Is(err, errBoom) {
		t.Fatalf("reading: err = %v, want the I/O failure", err)
	}
}

// cancelAfter cancels its context once the reader behind it has served more than limit bytes.
type cancelAfter struct {
	reader *bytes.Reader
	limit  int
	served int
	cancel context.CancelFunc
}

func (c *cancelAfter) Read(p []byte) (int, error) {
	n, err := c.reader.Read(p)
	c.served += n
	if c.served > c.limit {
		c.cancel()
	}
	return n, err
}

func TestPeaksStopWhenCancelledPartWayThrough(t *testing.T) {
	raw := encodeWAV(t, 1, 8000, 16, false, sine(8000, 60, 220, -6, 0))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, err := ComputePeaks(ctx, &cancelAfter{reader: bytes.NewReader(raw), limit: 1024, cancel: cancel}, nil, 50)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

func TestPeaksFileReadsAFileAndReportsAMissingOne(t *testing.T) {
	path := filepath.Join(t.TempDir(), "take.wav")
	if err := os.WriteFile(path, encodeWAV(t, 1, 8000, 16, false, sine(8000, 1, 220, -6, 0)), 0o600); err != nil {
		t.Fatal(err)
	}
	peaks, err := PeaksFile(context.Background(), path, &Range{StartSeconds: 0.5, LengthSeconds: 0.5}, 50)
	if err != nil || peaks.Buckets != 25 {
		t.Fatalf("peaks = %d buckets, err %v; want 25", peaks.Buckets, err)
	}
	if _, err := PeaksFile(context.Background(), filepath.Join(t.TempDir(), "missing.wav"), nil, 50); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("err = %v, want a missing file", err)
	}
}

// A whole file read in segments gives exactly the peaks of one read (#4042): a bucket never spans two seconds, so the segments join without a seam,
// at a rate whose frames a bucket do not divide evenly, in mono and stereo, with a length that is not a whole number of segments.
func TestPeaksFileInSegmentsEqualsOneRead(t *testing.T) {
	cases := []struct {
		name     string
		channels int
		rate     int
		seconds  float64
	}{
		{"mono 8 kHz, 131 s", 1, 8000, 131},
		{"stereo 11.025 kHz, 127.4 s", 2, 11025, 127.4},
		{"mono 44.1 kHz, 123.9 s", 1, 44100, 123.9},
		{"mono 48 kHz 24-bit, 126 s", 1, 48000, 126},
	}
	saved := peaksSegmentCount
	t.Cleanup(func() { peaksSegmentCount = saved })
	for _, c := range cases {
		for _, segments := range []int{2, 3, 4} {
			t.Run(fmt.Sprintf("%s in %d segments", c.name, segments), func(t *testing.T) {
				peaksSegmentCount = func() int { return segments }
				// A tone whose level changes with time, so a seam or a shifted bucket shows in the bytes.
				mono := sine(c.rate, c.seconds, 220, -12, 0)
				for i := range mono {
					mono[i] *= 0.2 + 0.8*float64(i%(c.rate*7))/float64(c.rate*7)
				}
				samples := mono
				if c.channels == 2 {
					samples = stereo(mono)
				}
				path := filepath.Join(t.TempDir(), "long.wav")
				if err := os.WriteFile(path, encodeWAV(t, c.channels, c.rate, bitsFor(c.rate), false, samples), 0o600); err != nil {
					t.Fatal(err)
				}
				whole, err := os.Open(path)
				if err != nil {
					t.Fatal(err)
				}
				defer func() { _ = whole.Close() }()
				one, err := ComputePeaks(context.Background(), whole, nil, DefaultPeaksPerSecond)
				if err != nil {
					t.Fatal(err)
				}
				file, err := os.Open(path)
				if err != nil {
					t.Fatal(err)
				}
				defer func() { _ = file.Close() }()
				if _, ran, err := segmentedPeaks(context.Background(), file, DefaultPeaksPerSecond); err != nil || !ran {
					t.Fatalf("the segmented read did not run (ran %v, err %v): the test would compare a read with itself", ran, err)
				}
				segmented, err := PeaksFile(context.Background(), path, nil, DefaultPeaksPerSecond)
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(one, segmented) {
					t.Fatalf("buckets %d vs %d, first difference at byte %d", one.Buckets, segmented.Buckets, firstDifference(one.MinMax, segmented.MinMax))
				}
			})
		}
	}
}

func firstDifference(a, b []byte) int {
	for i := range min(len(a), len(b)) {
		if a[i] != b[i] {
			return i
		}
	}
	return min(len(a), len(b))
}

// One segment, many more segments than seconds, a corrupt sample and a done context each answer what one read answers (#4042).
func TestPeaksFileInSegmentsAnswersTheSameInTheEdgeCases(t *testing.T) {
	saved := peaksSegmentCount
	t.Cleanup(func() { peaksSegmentCount = saved })
	dir := t.TempDir()
	clean := filepath.Join(dir, "clean.wav")
	if err := os.WriteFile(clean, encodeWAV(t, 1, 8000, 16, false, sine(8000, 130, 220, -12, 0)), 0o600); err != nil {
		t.Fatal(err)
	}
	one := func(path string) (Peaks, error) {
		file, err := os.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = file.Close() }()
		return ComputePeaks(context.Background(), file, nil, DefaultPeaksPerSecond)
	}
	want, err := one(clean)
	if err != nil {
		t.Fatal(err)
	}
	for _, count := range []int{1, 100} { // one segment is one read; 100 asks for more segments than the file has seconds
		peaksSegmentCount = func() int { return count }
		got, err := PeaksFile(context.Background(), clean, nil, DefaultPeaksPerSecond)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("%d segments: err %v, equal %v", count, err, reflect.DeepEqual(got, want))
		}
	}
	// A corrupt sample in the middle: the same error as one read, and the other segments stop.
	peaksSegmentCount = func() int { return 4 }
	samples := sine(8000, 130, 220, -12, 0)
	samples[8000*70] = math.NaN()
	corrupt := filepath.Join(dir, "corrupt.wav")
	if err := os.WriteFile(corrupt, encodeWAV(t, 1, 8000, 32, true, samples), 0o600); err != nil {
		t.Fatal(err)
	}
	_, wantErr := one(corrupt)
	if _, err := PeaksFile(context.Background(), corrupt, nil, DefaultPeaksPerSecond); wantErr == nil || err == nil || err.Error() != wantErr.Error() {
		t.Fatalf("corrupt sample: err %v, want %v", err, wantErr)
	}
	// A context that is done: every segment answers its error.
	done, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := PeaksFile(done, clean, nil, DefaultPeaksPerSecond); !errors.Is(err, context.Canceled) {
		t.Fatalf("done context: err %v", err)
	}
}

// A segment that comes up short while the file is read (the file was cut) is not joined to the ones after it: the read answers what the file is now.
func TestPeaksFileReadsAgainWhenASegmentComesUpShort(t *testing.T) {
	savedCount, savedData := peaksSegmentCount, segmentData
	t.Cleanup(func() { peaksSegmentCount, segmentData = savedCount, savedData })
	peaksSegmentCount = func() int { return 4 }
	path := filepath.Join(t.TempDir(), "cut.wav")
	if err := os.WriteFile(path, encodeWAV(t, 1, 8000, 16, false, sine(8000, 130, 220, -12, 0)), 0o600); err != nil {
		t.Fatal(err)
	}
	segmentData = func(file *os.File, offset, length int64) io.Reader {
		if offset > 44+int64(8000*2*10) && offset < 44+int64(8000*2*40) { // the second segment loses its last half
			return io.NewSectionReader(file, offset, length/2)
		}
		return io.NewSectionReader(file, offset, length)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = file.Close() }()
	if _, ran, err := segmentedPeaks(context.Background(), file, DefaultPeaksPerSecond); err != nil || ran {
		t.Fatalf("ran %v, err %v: a short middle segment must not be joined", ran, err)
	}
	got, err := PeaksFile(context.Background(), path, nil, DefaultPeaksPerSecond)
	if err != nil || got.Buckets != 130*DefaultPeaksPerSecond {
		t.Fatalf("the fallback read answered %d buckets (err %v), want %d", got.Buckets, err, 130*DefaultPeaksPerSecond)
	}
}

// bitsFor gives the 24-bit file the rig and the owner's recordings are (48 kHz), 16-bit for the rest.
func bitsFor(rate int) int {
	if rate == 48000 {
		return 24
	}
	return 16
}

// The count of segments is at least one and at most maxPeaksSegments, whatever the machine has.
func TestPeaksSegmentCountIsBoundedByTheCores(t *testing.T) {
	if n := peaksSegmentCount(); n < 1 || n > maxPeaksSegments {
		t.Fatalf("%d segments, want 1 to %d", n, maxPeaksSegments)
	}
}

// A part short of its seconds, before the last, is not joined: it would draw the audio after it at the wrong time (a file cut short during the read).
func TestSegmentsCompleteRefusesAPartShortOfItsSeconds(t *testing.T) {
	whole := func(n int) Peaks { return Peaks{Buckets: n} }
	if !segmentsComplete([]Peaks{whole(100), whole(100), whole(40)}, 100) {
		t.Fatal("a short last part is the end of the file")
	}
	if !segmentsComplete([]Peaks{whole(100), whole(0), whole(0)}, 100) {
		t.Fatal("parts after the end of the file are empty")
	}
	if segmentsComplete([]Peaks{whole(100), whole(60), whole(100)}, 100) {
		t.Fatal("a short middle part would shift the audio after it")
	}
}

// A file with a large chunk before its data is read whole, not copied into memory for every segment.
func TestPeaksFileDoesNotCopyAChunkBeforeTheData(t *testing.T) {
	const rate, seconds = 8000, 130
	body := encodeWAV(t, 1, rate, 16, false, sine(rate, seconds, 220, -12, 0))
	// fmt chunk, a 64 MB JUNK chunk of holes, then the data chunk of the file above.
	file := filepath.Join(t.TempDir(), "junk.wav")
	out, err := os.Create(file)
	if err != nil {
		t.Fatal(err)
	}
	junk := 64 << 20
	head := append([]byte{}, body[:36]...) // RIFF header and fmt chunk
	head = append(head, 'J', 'U', 'N', 'K', byte(junk&0xff), byte(junk>>8&0xff), byte(junk>>16&0xff), byte(junk>>24&0xff))
	if _, err := out.Write(head); err != nil {
		t.Fatal(err)
	}
	if err := out.Truncate(int64(len(head) + junk)); err != nil {
		t.Fatal(err)
	}
	if _, err := out.WriteAt(body[36:], int64(len(head)+junk)); err != nil {
		t.Fatal(err)
	}
	_ = out.Close()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	peaks, err := PeaksFile(context.Background(), file, nil, DefaultPeaksPerSecond)
	runtime.ReadMemStats(&after)
	if err != nil {
		t.Fatal(err)
	}
	if peaks.Buckets != seconds*DefaultPeaksPerSecond {
		t.Fatalf("%d buckets, want %d", peaks.Buckets, seconds*DefaultPeaksPerSecond)
	}
	if grown := after.TotalAlloc - before.TotalAlloc; grown > 16<<20 {
		t.Fatalf("reading allocated %d MB: the chunk before the data was copied", grown>>20)
	}
}
