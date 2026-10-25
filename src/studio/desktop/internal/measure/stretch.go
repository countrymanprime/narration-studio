package measure

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// MeasureStretch measures rng of the audio file at path: a WAV is read where it is; any other file (an MP3, a FLAC) is decoded to a
// temporary WAV with decoder first, and nil decoder, or one with nothing to decode with, is ErrDecoderNotAvailable. It never changes
// the file. Replace audio uses it for the loudness of another narrator's stretch (#2251).
func MeasureStretch(ctx context.Context, path string, rng Range, decoder Decoder) (Report, error) {
	if err := rng.validate(); err != nil {
		return Report{}, err
	}
	file, _, err := openForReading(path)
	if err != nil {
		return Report{}, err
	}
	head := make([]byte, 12)
	n, _ := file.ReadAt(head, 0)
	_ = file.Close() // read-only
	if n == 12 && string(head[:4]) == "RIFF" && string(head[8:12]) == "WAVE" {
		return AnalyzeFileRange(path, rng)
	}
	if decoder == nil {
		return Report{}, ErrDecoderNotAvailable
	}
	dir, err := os.MkdirTemp("", "stretch-*")
	if err != nil {
		return Report{}, err
	}
	defer func() { _ = os.RemoveAll(dir) }()
	wav := filepath.Join(dir, "decoded.wav")
	if err := decoder.DecodeToWAV(ctx, path, wav); err != nil {
		if errors.Is(err, ErrDecoderNotAvailable) || ctx.Err() != nil {
			return Report{}, err
		}
		return Report{}, fmt.Errorf("the file could not be decoded: %w", err)
	}
	report, err := AnalyzeFileRange(wav, rng)
	if err != nil {
		return Report{}, err
	}
	report.File = path
	return report, nil
}
