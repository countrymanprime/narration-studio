package voicesample

import (
	"bytes"
	"context"
	"errors"
	"os"
	"testing"

	"github.com/countrymanprime/narration-studio/shell/internal/zerocross"
)

// FuzzMarkSource marks a sample from whatever bytes a take's source file holds. Any header must end in a refusal, an error, or a
// clip that is a WAV file of the window it claims: never a panic, a clip that does not open, or a clip over the limits.
func FuzzMarkSource(f *testing.F) {
	good := wavBytes(testRate, 1, 16, sineFrames(testRate, 12*testRate))
	f.Add(good)
	f.Add(wavBytes(48000, 2, 24, sineFrames(48000, 3*48000)))
	f.Add(good[:44])
	f.Add(good[:len(good)/2])
	short := bytes.Clone(good)
	copy(short[40:44], []byte{0xff, 0xff, 0xff, 0xff}) // an unfinished data size
	f.Add(short)
	huge := bytes.Clone(good)
	copy(huge[24:28], []byte{0xff, 0xff, 0xff, 0x7f}) // a sample rate of two billion
	f.Add(huge)
	f.Add([]byte("RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x40\x1f\x00\x00\x80\x3e\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"))
	f.Add([]byte{})
	f.Fuzz(func(t *testing.T, source []byte) {
		r := newRigWith(t, source, 12)
		sample, err := r.service.Mark(context.Background(), request(2, 4))
		if err != nil {
			var refusal *Refusal
			if errors.As(err, &refusal) && refusal.Message == "" {
				t.Fatalf("refusal %s has no sentence", refusal.Reason)
			}
			if got := r.clipFiles(); len(got) != 0 {
				t.Fatalf("a failed mark left clips: %v", got)
			}
			return
		}
		clip, err := os.Open(r.clipPath(sample.ID))
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = clip.Close() }()
		opened, err := zerocross.OpenSource(clip)
		if err != nil {
			t.Fatalf("the clip is not a WAV file: %v", err)
		}
		seconds := float64(opened.Frames) / float64(opened.Format.SampleRate)
		if seconds < MinSeconds || seconds > MaxSeconds {
			t.Fatalf("a %v s clip passed the limits", seconds)
		}
		if sample.Bytes != r.stored().Samples[0].Clip.Bytes {
			t.Fatal("the row and the answer disagree about the clip's size")
		}
	})
}
