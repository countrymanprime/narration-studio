package measure

import (
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"
)

// A tone at amplitude for seconds, then silence for as long: the stretch over the tone measures louder than the whole file.
func toneThenSilence(t *testing.T, amplitude float64) []byte {
	t.Helper()
	const rate, seconds = 48000, 2
	samples := make([]float64, rate*seconds*2)
	for i := range rate * seconds {
		samples[i] = amplitude * math.Sin(2*math.Pi*1000*float64(i)/rate)
	}
	return encodeWAV(t, 1, rate, 16, false, samples)
}

func TestMeasureStretchMeasuresOnlyTheStretchOfAWAV(t *testing.T) {
	path := writeWAVFile(t, toneThenSilence(t, 0.25))
	report, err := MeasureStretch(context.Background(), path, Range{StartSeconds: 0.2, LengthSeconds: 1.5}, nil)
	if err != nil || report.IntegratedLUFS == nil {
		t.Fatalf("MeasureStretch = %+v, %v", report, err)
	}
	// A 1 kHz sine at 0.25 is -12.04 dBFS peak, about -15.1 LUFS (the sine's RMS -15.05 dB, K-weighting near 0 at 1 kHz).
	if math.Abs(*report.IntegratedLUFS-(-15.1)) > 0.5 {
		t.Errorf("integrated loudness %.2f LUFS, want about -15.1", *report.IntegratedLUFS)
	}
	silence, err := MeasureStretch(context.Background(), path, Range{StartSeconds: 2.5, LengthSeconds: 1}, nil)
	if err != nil || (silence.IntegratedLUFS != nil && *silence.IntegratedLUFS > -70) {
		t.Errorf("the silent stretch measures %+v, %v", silence.IntegratedLUFS, err)
	}
}

func TestMeasureStretchDecodesAnythingButAWAVFirst(t *testing.T) {
	path := filepath.Join(t.TempDir(), "leach.mp3")
	if err := os.WriteFile(path, []byte("ID3 not really audio"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := MeasureStretch(context.Background(), path, Range{StartSeconds: 0, LengthSeconds: 1}, nil); !errors.Is(err, ErrDecoderNotAvailable) {
		t.Fatalf("no decoder = %v", err)
	}
	if _, err := MeasureStretch(context.Background(), path, Range{StartSeconds: 0, LengthSeconds: 1}, fakeDecoder{err: ErrDecoderNotAvailable}); !errors.Is(err, ErrDecoderNotAvailable) {
		t.Fatalf("a decoder with nothing to decode with = %v", err)
	}
	if _, err := MeasureStretch(context.Background(), path, Range{StartSeconds: 0, LengthSeconds: 1}, fakeDecoder{err: errors.New("bad frame")}); err == nil {
		t.Fatal("a failed decode measured")
	}
	report, err := MeasureStretch(context.Background(), path, Range{StartSeconds: 0.2, LengthSeconds: 1.5}, fakeDecoder{wav: toneThenSilence(t, 0.25)})
	if err != nil || report.IntegratedLUFS == nil || report.File != path {
		t.Fatalf("decoded = %+v, %v", report, err)
	}
}

func TestMeasureStretchRefusesABadRangeOrPath(t *testing.T) {
	path := writeWAVFile(t, toneThenSilence(t, 0.25))
	for _, rng := range []Range{{StartSeconds: -1, LengthSeconds: 1}, {StartSeconds: 0, LengthSeconds: 0}, {StartSeconds: math.NaN(), LengthSeconds: 1}} {
		if _, err := MeasureStretch(context.Background(), path, rng, nil); err == nil {
			t.Errorf("%+v was measured", rng)
		}
	}
	if _, err := MeasureStretch(context.Background(), filepath.Join(t.TempDir(), "gone.wav"), Range{LengthSeconds: 1}, nil); err == nil {
		t.Error("a missing file was measured")
	}
	if _, err := MeasureStretch(context.Background(), t.TempDir(), Range{LengthSeconds: 1}, nil); err == nil {
		t.Error("a folder was measured")
	}
}
