package zerocross

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"os"

	"github.com/countrymanprime/narration-utils/shell/internal/measure"
)

// FileDecoder is the production Decoder: it seeks to the window inside a WAV file's data chunk and decodes only those
// bytes with measure's WAV reader, so a cut in an hour-long file costs what one in a short file does. A source that is
// not a RIFF/WAVE file answers measure.ErrNotWAV.
type FileDecoder struct{}

// maxFmtBytes bounds the fmt chunk read, as measure's own reader does.
const maxFmtBytes = 1 << 16

// maxSampleRate bounds the rate a header may claim, so a hostile one cannot size the window's buffer: at 768 kHz,
// stereo 64-bit, a 4 ms window is under 50 KB.
const maxSampleRate = 768000

// unfinishedSize is a data chunk size REAPER writes while still recording: the audio runs to the end of the file.
const unfinishedSize = 0xFFFFFFFF

// Window decodes the frames covering [startSeconds, startSeconds+lengthSeconds] of the WAV file at path.
func (FileDecoder) Window(ctx context.Context, path string, startSeconds, lengthSeconds float64) (Window, error) {
	file, err := os.Open(path)
	if err != nil {
		return Window{}, err
	}
	defer func() { _ = file.Close() }() // read-only
	return windowOf(ctx, file, startSeconds, lengthSeconds)
}

// windowOf is Window over an open source: it reads the RIFF chunk headers, the fmt chunk and the window's bytes, and
// nothing else.
func windowOf(ctx context.Context, src io.ReadSeeker, startSeconds, lengthSeconds float64) (Window, error) {
	if err := ctx.Err(); err != nil {
		return Window{}, err
	}
	fmtChunk, dataOffset, dataSize, err := locateData(src)
	if err != nil {
		return Window{}, err
	}
	// measure's reader parses the fmt chunk: a header with an unfinished data size reads whatever follows it.
	header := wavHeader(fmtChunk)
	probe, err := measure.NewWAVReader(bytes.NewReader(header))
	if err != nil {
		return Window{}, err
	}
	format := probe.Format()
	if format.SampleRate <= 0 || format.SampleRate > maxSampleRate || format.Channels <= 0 || format.BitsPerSample <= 0 {
		return Window{}, fmt.Errorf("unusable WAV format %+v", format)
	}
	frameBytes := int64(format.Channels * format.BitsPerSample / 8)
	if dataSize < 0 {
		end, err := src.Seek(0, io.SeekEnd)
		if err != nil {
			return Window{}, err
		}
		dataSize = max(0, end-dataOffset)
	}
	frames := dataSize / frameBytes
	rate := float64(format.SampleRate)
	first := int64(math.Floor(startSeconds * rate))
	last := min(int64(math.Ceil((startSeconds+lengthSeconds)*rate)), frames-1)
	window := Window{SampleRate: format.SampleRate, First: first}
	if first < 0 || first > last {
		return window, nil
	}
	if _, err := src.Seek(dataOffset+first*frameBytes, io.SeekStart); err != nil {
		return Window{}, err
	}
	count := last - first + 1
	raw := make([]byte, count*frameBytes)
	if _, err := io.ReadFull(src, raw); err != nil {
		return Window{}, fmt.Errorf("reading the window: %w", err)
	}
	reader, err := measure.NewWAVReader(io.MultiReader(bytes.NewReader(header), bytes.NewReader(raw)))
	if err != nil {
		return Window{}, err
	}
	channels, err := reader.Read(int(count))
	if err != nil {
		return Window{}, fmt.Errorf("decoding the window: %w", err)
	}
	window.Mono = make([]float64, len(channels[0]))
	for i := range window.Mono {
		var sum float64
		for _, channel := range channels {
			sum += channel[i]
		}
		window.Mono[i] = sum / float64(len(channels))
	}
	return window, nil
}

// locateData walks the RIFF chunk headers, seeking past every chunk body but fmt's, to the data chunk: its byte
// offset and size (-1 when the header was never finished). It returns the raw fmt chunk payload.
func locateData(src io.ReadSeeker) (fmtChunk []byte, dataOffset, dataSize int64, err error) {
	var riff [12]byte
	if _, err := io.ReadFull(src, riff[:]); err != nil {
		return nil, 0, 0, measure.ErrNotWAV
	}
	if string(riff[0:4]) != "RIFF" || string(riff[8:12]) != "WAVE" {
		return nil, 0, 0, measure.ErrNotWAV
	}
	offset := int64(len(riff))
	for {
		var chunk [8]byte
		if _, err := io.ReadFull(src, chunk[:]); err != nil {
			return nil, 0, 0, errors.New("WAV file has no data chunk")
		}
		offset += int64(len(chunk))
		size := binary.LittleEndian.Uint32(chunk[4:8])
		switch string(chunk[0:4]) {
		case "fmt ":
			if size > maxFmtBytes {
				return nil, 0, 0, fmt.Errorf("WAV fmt chunk of %d bytes", size)
			}
			fmtChunk = make([]byte, size)
			if _, err := io.ReadFull(src, fmtChunk); err != nil {
				return nil, 0, 0, fmt.Errorf("reading the WAV fmt chunk: %w", err)
			}
		case "data":
			if fmtChunk == nil {
				return nil, 0, 0, errors.New("WAV data chunk appears before the fmt chunk")
			}
			if size == unfinishedSize || size == 0 {
				return fmtChunk, offset, -1, nil
			}
			return fmtChunk, offset, int64(size), nil
		default:
			if _, err := src.Seek(int64(size), io.SeekCurrent); err != nil {
				return nil, 0, 0, err
			}
		}
		offset += int64(size)
		if size%2 == 1 {
			if _, err := src.Seek(1, io.SeekCurrent); err != nil {
				return nil, 0, 0, err
			}
			offset++
		}
	}
}

// wavHeader is a RIFF/WAVE header holding fmtChunk and an unfinished data chunk, so the bytes after it are the audio.
func wavHeader(fmtChunk []byte) []byte {
	var out bytes.Buffer
	out.WriteString("RIFF")
	_ = binary.Write(&out, binary.LittleEndian, uint32(unfinishedSize))
	out.WriteString("WAVEfmt ")
	_ = binary.Write(&out, binary.LittleEndian, uint32(len(fmtChunk))) //nolint:gosec // G115: bounded by maxFmtBytes
	out.Write(fmtChunk)
	if len(fmtChunk)%2 == 1 {
		out.WriteByte(0)
	}
	out.WriteString("data")
	_ = binary.Write(&out, binary.LittleEndian, uint32(unfinishedSize))
	return out.Bytes()
}
