package zerocross

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/measure"
)

// sine is f Hz at rate, amplitude 0.5, for frames frames, as 16-bit PCM over channels identical channels (or, with
// invert, a second channel of opposite sign scaled by 0.5, so the mono mix is a quarter-amplitude sine).
func sine(f float64, rate, frames int) []float64 {
	out := make([]float64, frames)
	for i := range out {
		out[i] = 0.5 * math.Sin(2*math.Pi*f*float64(i)/float64(rate))
	}
	return out
}

// wavBytes writes channels as a 16-bit PCM WAV at rate, with a LIST chunk before the data so the chunk walk is tested.
func wavBytes(t *testing.T, rate int, channels ...[]float64) []byte {
	t.Helper()
	var data bytes.Buffer
	for i := range channels[0] {
		for _, channel := range channels {
			if err := binary.Write(&data, binary.LittleEndian, int16(math.Round(channel[i]*32767))); err != nil {
				t.Fatal(err)
			}
		}
	}
	var format bytes.Buffer
	blockAlign := uint16(2 * len(channels))
	_ = binary.Write(&format, binary.LittleEndian, uint16(1))
	_ = binary.Write(&format, binary.LittleEndian, uint16(len(channels)))
	_ = binary.Write(&format, binary.LittleEndian, uint32(rate))
	_ = binary.Write(&format, binary.LittleEndian, uint32(rate)*uint32(blockAlign))
	_ = binary.Write(&format, binary.LittleEndian, blockAlign)
	_ = binary.Write(&format, binary.LittleEndian, uint16(16))
	chunk := func(out *bytes.Buffer, id string, payload []byte) {
		out.WriteString(id)
		_ = binary.Write(out, binary.LittleEndian, uint32(len(payload)))
		out.Write(payload)
		if len(payload)%2 == 1 {
			out.WriteByte(0)
		}
	}
	var body bytes.Buffer
	body.WriteString("WAVE")
	chunk(&body, "fmt ", format.Bytes())
	chunk(&body, "LIST", []byte("INFOodd"))
	chunk(&body, "data", data.Bytes())
	var out bytes.Buffer
	out.WriteString("RIFF")
	_ = binary.Write(&out, binary.LittleEndian, uint32(body.Len()))
	out.Write(body.Bytes())
	return out.Bytes()
}

func writeWAV(t *testing.T, wav []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "take.wav")
	if err := os.WriteFile(path, wav, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func snapFile(t *testing.T, path string, at float64) Result {
	t.Helper()
	got, err := Snap(context.Background(), FileDecoder{}, path, at)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// isCrossing reports whether frame of samples is where Snap would cut a sign change.
func isCrossing(samples []float64, frame int) bool {
	if frame >= 0 && frame < len(samples) && samples[frame] == 0 {
		return true
	}
	for _, i := range []int{frame - 1, frame} {
		if i < 0 || i+1 >= len(samples) {
			continue
		}
		a, b := samples[i], samples[i+1]
		if a != 0 && b != 0 && (a < 0) != (b < 0) {
			cut := i
			if math.Abs(b) < math.Abs(a) {
				cut++
			}
			if cut == frame {
				return true
			}
		}
	}
	return false
}

func TestFindsTheNearestCrossingWithinTwoMilliseconds(t *testing.T) {
	const rate = 8000
	// 220 Hz: a crossing every ~2.27 ms, so one is always within 2 ms.
	samples := sine(220, rate, rate)
	quantized := make([]float64, len(samples))
	for i, v := range samples {
		quantized[i] = math.Round(v*32767) / 32768
	}
	path := writeWAV(t, wavBytes(t, rate, samples))

	for _, at := range []float64{0.1003, 0.25, 0.4321, 0.5, 0.77777} {
		got := snapFile(t, path, at)
		if got.Reason != "" {
			t.Fatalf("snap(%v) = %+v", at, got)
		}
		if math.Abs(got.Moved) > MaxShift || math.Abs(got.Time-at-got.Moved) > 1e-12 {
			t.Fatalf("snap(%v) moved %v to %v", at, got.Moved, got.Time)
		}
		frame := got.Time * rate
		if frame != math.Round(frame) || !isCrossing(quantized, int(frame)) {
			t.Fatalf("snap(%v) = frame %v, not a crossing", at, frame)
		}
		// Nothing nearer: no crossing frame closer to the asked time.
		target := at * rate
		for f := int(math.Ceil(target - math.Abs(got.Moved)*rate)); float64(f) < target+math.Abs(got.Moved)*rate; f++ {
			if isCrossing(quantized, f) && math.Abs(float64(f)-target) < math.Abs(frame-target) {
				t.Fatalf("snap(%v) = frame %v, but frame %d is nearer", at, frame, f)
			}
		}
	}

	// On a crossing: frame 0 of a sine and the half-period frame of 200 Hz at 8 kHz (frame 20) do not move.
	onCrossing := writeWAV(t, wavBytes(t, rate, sine(200, rate, rate)))
	for _, at := range []float64{0, 20.0 / rate, 40.0 / rate} {
		if got := snapFile(t, onCrossing, at); got.Reason != "" || got.Moved != 0 || got.Time != at {
			t.Fatalf("snap(%v) on a crossing = %+v", at, got)
		}
	}
}

func TestNoCrossingLeavesTheTimeAndSaysSo(t *testing.T) {
	const rate = 8000
	silence := make([]float64, rate)
	if got := snapFile(t, writeWAV(t, wavBytes(t, rate, silence)), 0.5); got != (Result{Time: 0.5, Reason: ReasonSilent}) {
		t.Fatalf("silence = %+v", got)
	}
	// A 20 Hz sine near its peak: audio, but no sign change within 2 ms.
	slow := writeWAV(t, wavBytes(t, rate, sine(20, rate, rate)))
	if got := snapFile(t, slow, 0.0125); got != (Result{Time: 0.0125, Reason: ReasonNoCrossing}) {
		t.Fatalf("no crossing = %+v", got)
	}
	// Past the end of the audio.
	if got := snapFile(t, slow, 5); got != (Result{Time: 5, Reason: ReasonNoAudio}) {
		t.Fatalf("past the end = %+v", got)
	}
	for _, bad := range []float64{-0.1, math.NaN(), math.Inf(1)} {
		if _, err := Snap(context.Background(), FileDecoder{}, slow, bad); !errors.Is(err, ErrBadTime) {
			t.Fatalf("snap(%v) err = %v", bad, err)
		}
	}
}

type spyDecoder struct {
	inner   Decoder
	lengths []float64
}

func (s *spyDecoder) Window(ctx context.Context, path string, start, length float64) (Window, error) {
	s.lengths = append(s.lengths, length)
	return s.inner.Window(ctx, path, start, length)
}

// countingSeeker counts the bytes read through it.
type countingSeeker struct {
	io.ReadSeeker
	read int64
}

func (c *countingSeeker) Read(p []byte) (int, error) {
	n, err := c.ReadSeeker.Read(p)
	c.read += int64(n)
	return n, err
}

func TestReadsAWindowNotTheFile(t *testing.T) {
	const rate = 48000
	spy := &spyDecoder{inner: FileDecoder{}}
	path := writeWAV(t, wavBytes(t, rate, sine(220, rate, rate)))
	if _, err := Snap(context.Background(), spy, path, 0.5); err != nil {
		t.Fatal(err)
	}
	if len(spy.lengths) != 1 || spy.lengths[0] > 2*MaxShift+1e-12 {
		t.Fatalf("decode asked for %v seconds", spy.lengths)
	}

	readAt := func(seconds float64) int64 {
		wav := wavBytes(t, rate, sine(220, rate, int(seconds*rate)))
		counter := &countingSeeker{ReadSeeker: bytes.NewReader(wav)}
		if _, err := windowOf(context.Background(), counter, 0.5-MaxShift, 2*MaxShift); err != nil {
			t.Fatal(err)
		}
		return counter.read
	}
	short, long := readAt(1), readAt(60)
	if short != long {
		t.Fatalf("a 60 s file read %d bytes, a 1 s file %d", long, short)
	}
	// The headers, and 4 ms of 16-bit mono at 48 kHz (193 frames): well under a kilobyte.
	if short > 1024 {
		t.Fatalf("read %d bytes for a 4 ms window", short)
	}
}

func TestMultiChannelAndRate(t *testing.T) {
	// Stereo: the left channel a 220 Hz sine, the right silent. The mono mix is half the sine, crossing where it does.
	const rate = 48000
	left := sine(220, rate, rate)
	stereo := writeWAV(t, wavBytes(t, rate, left, make([]float64, rate)))
	mono := writeWAV(t, wavBytes(t, rate, left))
	for _, at := range []float64{0.1, 0.3333, 0.75} {
		fromStereo, fromMono := snapFile(t, stereo, at), snapFile(t, mono, at)
		if fromStereo.Reason != "" || fromStereo != fromMono {
			t.Fatalf("snap(%v): stereo %+v, mono %+v", at, fromStereo, fromMono)
		}
		if frame := fromStereo.Time * rate; math.Abs(frame-math.Round(frame)) > 1e-6 {
			t.Fatalf("snap(%v) = %v, not on a 48 kHz sample", at, fromStereo.Time)
		}
	}

	// Two channels of opposite sign cancel: the mix is silent, whatever each channel holds.
	inverse := make([]float64, rate)
	for i, v := range left {
		inverse[i] = -v
	}
	if got := snapFile(t, writeWAV(t, wavBytes(t, rate, left, inverse)), 0.5); got.Reason != ReasonSilent {
		t.Fatalf("a cancelling pair = %+v", got)
	}

	// A header claiming a rate no recording has is refused before the window is sized.
	huge := wavBytes(t, rate, left[:100])
	binary.LittleEndian.PutUint32(huge[24:28], 0xFFFFFFF0)
	if _, err := Snap(context.Background(), FileDecoder{}, writeWAV(t, huge), 0.001); err == nil {
		t.Fatal("a 4 GHz header was decoded")
	}

	// Not a WAV.
	notWAV := writeWAV(t, []byte("ID3 not a wav at all"))
	if _, err := Snap(context.Background(), FileDecoder{}, notWAV, 0.1); !errors.Is(err, measure.ErrNotWAV) {
		t.Fatalf("not a WAV err = %v", err)
	}
}
