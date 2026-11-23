package measure

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math"
	"os"
	"runtime"
)

const (
	// DefaultPeaksPerSecond is the waveform's resolution: 50 buckets a second, 20 ms each, which is finer than a word.
	DefaultPeaksPerSecond = 50
	// MaxPeaksPerSecond bounds a zoomed-in request, so one call can never ask for more buckets than frames.
	MaxPeaksPerSecond = 1000
)

// Peaks is a waveform overview of a stretch of a WAV source: for each bucket of 1/BucketsPerSecond
// seconds, the lowest and highest sample over every channel. MinMax holds two signed bytes per
// bucket, the minimum then the maximum, scaled so full scale is ±127; a caller that sends it as JSON
// gets base64. The minimum is rounded down and the maximum up, so a peak is never drawn smaller than
// it is. RMS holds one byte per bucket: the root mean square of every sample of every channel in the
// bucket, 0 to 127 with full scale at 127 and rounded up, the level REAPER draws inside its peaks. The
// last bucket may be partial. Buckets is 0 when the range starts after the audio ends.
type Peaks struct {
	StartSeconds     float64 `json:"startSeconds"`
	BucketsPerSecond int     `json:"bucketsPerSecond"`
	Buckets          int     `json:"buckets"`
	MinMax           []byte  `json:"minMax"`
	RMS              []byte  `json:"rms,omitempty"`
	SampleRate       int     `json:"sampleRate"`
	Channels         int     `json:"channels"`
}

// ComputePeaks reads the WAV audio from r and returns its peaks at perSecond buckets a second, over
// rng when it is not nil (an item's played range in source seconds, whose earlier audio is skipped
// without being decoded) or over the whole file. A source that is not a WAV answers ErrNotWAV. It
// stops with ctx's error when ctx is cancelled.
func ComputePeaks(ctx context.Context, r io.Reader, rng *Range, perSecond int) (Peaks, error) {
	if perSecond <= 0 || perSecond > MaxPeaksPerSecond {
		return Peaks{}, fmt.Errorf("peaks need 1 to %d buckets a second, not %d", MaxPeaksPerSecond, perSecond)
	}
	if rng != nil {
		if err := rng.validate(); err != nil {
			return Peaks{}, err
		}
	}
	if err := ctx.Err(); err != nil {
		return Peaks{}, err
	}
	reader, err := NewWAVReader(r)
	if err != nil {
		return Peaks{}, err
	}
	format := reader.Format()
	first, count := int64(0), int64(math.MaxInt64)
	peaks := Peaks{BucketsPerSecond: perSecond, SampleRate: format.SampleRate, Channels: format.Channels}
	if rng != nil {
		first, count = rng.frames(format.SampleRate)
		peaks.StartSeconds = rng.StartSeconds
	}
	if err := skipFrames(ctx, reader, first, &progressMeter{reader: reader}); err != nil {
		return Peaks{}, err
	}

	// Bucket k holds the frames n with k*rate <= n*perSecond < (k+1)*rate, so it ends before frame
	// ceil((k+1)*rate/perSecond).
	rate, per := int64(format.SampleRate), int64(perSecond)
	bucket, end := int64(0), (rate+per-1)/per
	low, high, filled := math.Inf(1), math.Inf(-1), false
	var sumSquares float64
	var samples int64
	flush := func() {
		if filled {
			peaks.MinMax = append(peaks.MinMax, peakByte(math.Floor(low*127)), peakByte(math.Ceil(high*127)))
			peaks.RMS = append(peaks.RMS, peakByte(math.Ceil(math.Sqrt(sumSquares/float64(samples))*127)))
		}
		bucket++
		end = ((bucket+1)*rate + per - 1) / per
		low, high, filled = math.Inf(1), math.Inf(-1), false
		sumSquares, samples = 0, 0
	}
	for read := int64(0); read < count; {
		if err := ctx.Err(); err != nil {
			return Peaks{}, err
		}
		block, err := reader.Read(int(min(readBlockFrames*16, count-read)))
		if err == io.EOF {
			break
		}
		if err != nil {
			return Peaks{}, err
		}
		frames := int64(len(block[0]))
		for i := int64(0); i < frames; {
			stop := min(frames, i+end-read)
			for _, channel := range block {
				for _, v := range channel[i:stop] {
					if v < low {
						low = v
					}
					if v > high {
						high = v
					}
					sumSquares += v * v
				}
				samples += stop - i
			}
			filled = filled || stop > i
			read += stop - i
			i = stop
			if read == end {
				flush()
			}
		}
	}
	flush()
	peaks.Buckets = len(peaks.MinMax) / 2
	return peaks, nil
}

// parallelPeaksMinSeconds is how long a whole file must be before PeaksFile reads it in segments: below it the one read is as quick as the
// split and its merge.
const parallelPeaksMinSeconds = 120

// maxPeaksSegments is how many segments one file is split into; the host's RunSegments bounds how many decode at once (#4042).
const maxPeaksSegments = 4

// maxSegmentHeader is the longest header (every byte before the sample data) a file may have and still be read in segments: each segment is handed
// a copy of it, so a file with a huge chunk before its data (someone else's WAV, with a LIST or JUNK chunk of any size) is read whole, not copied.
const maxSegmentHeader = 4096

// RunSegments runs work(ctx, i) for i from 0 to n-1 and answers the first error that is not a cancellation (or the cancellation when that is all
// there is). This one runs them one after the other, so this package holds no goroutine, lock or channel and its numeric tests need no race
// detector (#4097: under it the package took 527 s on Windows). The host sets a concurrent one, bounded to its cores for the whole process
// (runDecodes in bindings_workspace_peaks.go), once at start, before any read.
var RunSegments = func(ctx context.Context, n int, work func(ctx context.Context, i int) error) error {
	for i := range n {
		if err := work(ctx, i); err != nil {
			return err
		}
	}
	return nil
}

// segmentData is the reader of one segment's data bytes: a variable so a test makes a segment come up short, as a file cut during the read does.
var segmentData = func(file *os.File, offset, length int64) io.Reader { return io.NewSectionReader(file, offset, length) }

// peaksSegmentCount is how many segments a file is split into: a variable so a test runs the split at each count.
var peaksSegmentCount = func() int { return min(maxPeaksSegments, max(1, runtime.GOMAXPROCS(0))) }

// PeaksFile computes the peaks of the WAV file at path (see ComputePeaks). A whole file of two minutes or more is read in segments of whole
// seconds, one per core up to maxPeaksSegments, and their peaks joined: a bucket never spans two seconds, so the result is the one a single
// read gives (TestPeaksFileInSegmentsEqualsOneRead).
func PeaksFile(ctx context.Context, path string, rng *Range, perSecond int) (Peaks, error) {
	file, err := os.Open(path)
	if err != nil {
		return Peaks{}, err
	}
	defer func() { _ = file.Close() }()
	if rng == nil && perSecond > 0 && perSecond <= MaxPeaksPerSecond {
		if peaks, ok, err := segmentedPeaks(ctx, file, perSecond); ok || err != nil {
			return peaks, err
		}
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return Peaks{}, err
	}
	var peaks Peaks
	err = RunSegments(ctx, 1, func(ctx context.Context, _ int) (err error) {
		peaks, err = ComputePeaks(ctx, file, rng, perSecond)
		return err
	})
	return peaks, err
}

// segmentedPeaks reads file's data chunk in segments of whole seconds, each through a reader of the file's own header and its slice of the
// data, and joins the results. ok is false, with no error, when the file is not worth splitting (short, an unfinished header, a header it
// cannot parse): the caller reads it whole, and answers the error the header gives.
func segmentedPeaks(ctx context.Context, file *os.File, perSecond int) (peaks Peaks, ok bool, err error) {
	head, err := NewWAVReader(file)
	if err != nil {
		return Peaks{}, false, nil
	}
	format := head.Format()
	if head.dataSize < 0 || head.dataStart > maxSegmentHeader || format.SampleRate <= 0 || head.frameBytes <= 0 {
		return Peaks{}, false, nil
	}
	frames := head.dataSize / int64(head.frameBytes)
	if frames < int64(parallelPeaksMinSeconds)*int64(format.SampleRate) {
		return Peaks{}, false, nil
	}
	count := peaksSegmentCount()
	if count < 2 {
		return Peaks{}, false, nil
	}
	seconds := (frames + int64(format.SampleRate) - 1) / int64(format.SampleRate)
	segmentSeconds := (seconds + int64(count) - 1) / int64(count)
	segmentFrames := segmentSeconds * int64(format.SampleRate)
	header := make([]byte, head.dataStart)
	if _, err := file.ReadAt(header, 0); err != nil {
		return Peaks{}, false, nil
	}
	parts := make([]Peaks, count)
	err = RunSegments(ctx, count, func(ctx context.Context, i int) error {
		first := int64(i) * segmentFrames
		if first >= frames {
			return nil
		}
		offset := head.dataStart + first*int64(head.frameBytes)
		length := min(segmentFrames, frames-first) * int64(head.frameBytes)
		var err error
		parts[i], err = ComputePeaks(ctx, io.MultiReader(bytes.NewReader(header), segmentData(file, offset, length)), nil, perSecond)
		return err
	})
	if err != nil {
		return Peaks{}, true, err
	}
	if !segmentsComplete(parts, int(segmentSeconds)*perSecond) {
		return Peaks{}, false, nil // a file that shrank during the read: one read answers what the file is now
	}
	joined := Peaks{BucketsPerSecond: perSecond, SampleRate: format.SampleRate, Channels: format.Channels}
	for _, part := range parts {
		joined.MinMax = append(joined.MinMax, part.MinMax...)
		joined.RMS = append(joined.RMS, part.RMS...)
	}
	joined.Buckets = len(joined.MinMax) / 2
	return joined, true, nil
}

// segmentsComplete says whether every part before the last holds all the buckets of its seconds: a part short of them would draw the audio after it at
// the wrong time, which is what a file cut short while it is read gives.
func segmentsComplete(parts []Peaks, perSegment int) bool {
	last := len(parts) - 1
	for last > 0 && parts[last].Buckets == 0 {
		last--
	}
	for _, part := range parts[:last] {
		if part.Buckets != perSegment {
			return false
		}
	}
	return true
}

// peakByte stores a scaled sample, clamped to ±127, as a two's complement byte.
func peakByte(scaled float64) byte {
	return byte(int8(math.Max(-127, math.Min(127, scaled)))) //nolint:gosec // G115: clamped to the int8 range just above
}
