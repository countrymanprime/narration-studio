package zerocross

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"

	"desktop/internal/measure"
)

// ErrUnsupported is the answer for a source that is not a WAV file whose audio can be copied as it is: not a RIFF/WAVE file,
// a header with no usable format or data, or a format measure's reader does not decode (anything but 16, 24 or 32-bit PCM and
// 32 or 64-bit float, in mono or stereo).
var ErrUnsupported = errors.New("not a WAV file this app can copy")

// Source is a WAV file located for cutting: its format, how many frames it holds and where they start. It is read from the
// RIFF chunk headers only, so a chapter-length file costs the same as a short one.
type Source struct {
	// Format is the file's sample format, as measure's reader decodes it.
	Format measure.Format
	// Frames is how many whole frames the file holds: the header's data size, or the rest of the file when the header was
	// never finished or claims more than the file has.
	Frames     int64
	fmtChunk   []byte
	dataOffset int64
	frameBytes int64
}

// OpenSource locates the audio of the WAV file src. A file it cannot read this way answers ErrUnsupported.
func OpenSource(src io.ReadSeeker) (Source, error) {
	fmtChunk, dataOffset, dataSize, err := locateData(src)
	if err != nil {
		return Source{}, fmt.Errorf("%w: %v", ErrUnsupported, err)
	}
	probe, err := measure.NewWAVReader(bytes.NewReader(wavHeader(fmtChunk)))
	if err != nil {
		return Source{}, fmt.Errorf("%w: %v", ErrUnsupported, err)
	}
	format := probe.Format()
	if format.SampleRate <= 0 || format.SampleRate > maxSampleRate || format.Channels <= 0 || format.BitsPerSample <= 0 {
		return Source{}, fmt.Errorf("%w: unusable format %+v", ErrUnsupported, format)
	}
	end, err := src.Seek(0, io.SeekEnd)
	if err != nil {
		return Source{}, err
	}
	frameBytes := int64(format.Channels * format.BitsPerSample / 8)
	held := max(0, end-dataOffset)
	if dataSize >= 0 {
		held = min(held, dataSize)
	}
	return Source{Format: format, Frames: held / frameBytes, fmtChunk: fmtChunk, dataOffset: dataOffset, frameBytes: frameBytes}, nil
}

// paddedFmt is the fmt chunk's body as a RIFF chunk holds it: even in length.
func (s Source) paddedFmt() int64 { return int64(len(s.fmtChunk)) + int64(len(s.fmtChunk)%2) }

// ClipBytes is the size of the file Copy writes for count frames.
func (s Source) ClipBytes(count int64) int64 {
	data := count * s.frameBytes
	return 12 + 8 + s.paddedFmt() + 8 + data + data%2
}

// Copy writes a finished WAV file holding frames [first, first+count) of src, in the source's own format: the fmt chunk and the
// sample bytes are copied as they are, so nothing is resampled, dithered or converted. src must be the file OpenSource read.
func (s Source) Copy(dst io.Writer, src io.ReadSeeker, first, count int64) error {
	if first < 0 || count < 1 || first > s.Frames-count {
		return fmt.Errorf("frames %d to %d are not in a file of %d", first, first+count, s.Frames)
	}
	data := count * s.frameBytes
	if data > math.MaxUint32-1<<16 {
		return fmt.Errorf("%d frames do not fit in a WAV file", count)
	}
	if _, err := src.Seek(s.dataOffset+first*s.frameBytes, io.SeekStart); err != nil {
		return err
	}
	var header bytes.Buffer
	header.WriteString("RIFF")
	_ = binary.Write(&header, binary.LittleEndian, uint32(s.ClipBytes(count)-8)) //nolint:gosec // G115: bounded by the check above
	header.WriteString("WAVEfmt ")
	_ = binary.Write(&header, binary.LittleEndian, uint32(len(s.fmtChunk))) //nolint:gosec // G115: bounded by maxFmtBytes
	header.Write(s.fmtChunk)
	if len(s.fmtChunk)%2 == 1 {
		header.WriteByte(0)
	}
	header.WriteString("data")
	_ = binary.Write(&header, binary.LittleEndian, uint32(data)) //nolint:gosec // G115: bounded by the check above
	if _, err := dst.Write(header.Bytes()); err != nil {
		return err
	}
	if _, err := io.CopyN(dst, src, data); err != nil {
		if errors.Is(err, io.EOF) {
			return fmt.Errorf("the source ended before frame %d", first+count)
		}
		return err
	}
	if data%2 == 1 {
		if _, err := dst.Write([]byte{0}); err != nil {
			return err
		}
	}
	return nil
}
