package zerocross

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"math"
	"testing"

	"github.com/countrymanprime/narration-studio/shell/internal/measure"
)

// pcm24 writes frames as 24-bit PCM over channels identical channels, the format an audiobook recording uses.
func pcm24(rate, channels int, mono []float64, finished bool) []byte {
	var data bytes.Buffer
	for _, value := range mono {
		sample := int32(math.Round(value * 8388607))
		for c := 0; c < channels; c++ {
			data.Write([]byte{byte(sample), byte(sample >> 8), byte(sample >> 16)})
		}
	}
	var format bytes.Buffer
	blockAlign := uint16(3 * channels)
	_ = binary.Write(&format, binary.LittleEndian, uint16(1))
	_ = binary.Write(&format, binary.LittleEndian, uint16(channels))
	_ = binary.Write(&format, binary.LittleEndian, uint32(rate))
	_ = binary.Write(&format, binary.LittleEndian, uint32(rate)*uint32(blockAlign))
	_ = binary.Write(&format, binary.LittleEndian, blockAlign)
	_ = binary.Write(&format, binary.LittleEndian, uint16(24))
	var out bytes.Buffer
	size := uint32(data.Len())
	riff := uint32(4 + 8 + format.Len() + 8 + data.Len())
	if !finished {
		size, riff = unfinishedSize, unfinishedSize
	}
	out.WriteString("RIFF")
	_ = binary.Write(&out, binary.LittleEndian, riff)
	out.WriteString("WAVEfmt ")
	_ = binary.Write(&out, binary.LittleEndian, uint32(format.Len()))
	out.Write(format.Bytes())
	out.WriteString("data")
	_ = binary.Write(&out, binary.LittleEndian, size)
	out.Write(data.Bytes())
	return out.Bytes()
}

func TestOpenSourceLocatesTheFramesOfAFinishedAndAnUnfinishedFile(t *testing.T) {
	for _, finished := range []bool{true, false} {
		file := pcm24(48000, 2, sine(440, 48000, 4800), finished)
		source, err := OpenSource(bytes.NewReader(file))
		if err != nil {
			t.Fatalf("finished=%v: %v", finished, err)
		}
		if source.Frames != 4800 || source.Format.SampleRate != 48000 || source.Format.Channels != 2 || source.Format.BitsPerSample != 24 {
			t.Fatalf("finished=%v: source = %+v", finished, source)
		}
	}
}

// A header that claims more audio than the file holds is read as far as the file goes, never past it.
func TestOpenSourceTrimsADataSizeThatOverstatesTheFile(t *testing.T) {
	file := pcm24(48000, 1, sine(440, 48000, 1000), true)
	binary.LittleEndian.PutUint32(file[40:44], 1<<30)
	source, err := OpenSource(bytes.NewReader(file))
	if err != nil {
		t.Fatal(err)
	}
	if source.Frames != 1000 {
		t.Fatalf("frames = %d, want the 1000 the file holds", source.Frames)
	}
}

func TestOpenSourceRefusesWhatIsNotAWAVOrNotOneItCanCopy(t *testing.T) {
	cases := map[string][]byte{
		"empty":         nil,
		"mp3":           append([]byte("ID3\x03\x00\x00\x00\x00\x00\x00"), make([]byte, 64)...),
		"riff-not-wave": append([]byte("RIFF\x24\x00\x00\x00AVI "), make([]byte, 64)...),
		"no-data":       []byte("RIFF\x04\x00\x00\x00WAVE"),
	}
	good := pcm24(48000, 1, sine(440, 48000, 100), true)
	eightBit := bytes.Clone(good)
	binary.LittleEndian.PutUint16(eightBit[34:36], 8)
	cases["8-bit"] = eightBit
	surround := bytes.Clone(good)
	binary.LittleEndian.PutUint16(surround[22:24], 6)
	cases["six-channels"] = surround
	zeroRate := bytes.Clone(good)
	binary.LittleEndian.PutUint32(zeroRate[24:28], 0)
	cases["zero-rate"] = zeroRate
	for name, file := range cases {
		if _, err := OpenSource(bytes.NewReader(file)); !errors.Is(err, ErrUnsupported) {
			t.Errorf("%s: err = %v, want ErrUnsupported", name, err)
		}
	}
}

// The clip decodes to exactly the samples of the window it was cut from, bit for bit, in the source's own format.
func TestCopyWritesAFinishedWAVOfExactlyTheWindowsFrames(t *testing.T) {
	const rate = 48000
	for _, channels := range []int{1, 2} {
		file := pcm24(rate, channels, sine(220, rate, rate), false)
		source, err := OpenSource(bytes.NewReader(file))
		if err != nil {
			t.Fatal(err)
		}
		const first, count = 12000, 24000
		var clip bytes.Buffer
		if err := source.Copy(&clip, bytes.NewReader(file), first, count); err != nil {
			t.Fatal(err)
		}
		if int64(clip.Len()) != source.ClipBytes(count) {
			t.Fatalf("clip is %d bytes, ClipBytes says %d", clip.Len(), source.ClipBytes(count))
		}
		clipSource, err := OpenSource(bytes.NewReader(clip.Bytes()))
		if err != nil {
			t.Fatal(err)
		}
		if clipSource.Frames != count || clipSource.Format != source.Format {
			t.Fatalf("channels=%d: clip = %+v, source = %+v", channels, clipSource, source)
		}
		// A finished header: its sizes name the file, so a player seeks without reading to the end.
		if got := binary.LittleEndian.Uint32(clip.Bytes()[4:8]); int64(got) != int64(clip.Len())-8 {
			t.Fatalf("RIFF size = %d, file is %d bytes", got, clip.Len())
		}
		want := file[source.dataOffset+int64(first)*source.frameBytes : source.dataOffset+int64(first+count)*source.frameBytes]
		if got := clip.Bytes()[clip.Len()-len(want):]; !bytes.Equal(got, want) {
			t.Fatalf("channels=%d: the clip's samples differ from the source window's", channels)
		}
		reader, err := measure.NewWAVReader(bytes.NewReader(clip.Bytes()))
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := reader.Read(count + 10)
		if err != nil && !errors.Is(err, io.EOF) {
			t.Fatal(err)
		}
		if len(decoded[0]) != count {
			t.Fatalf("decoded %d frames, want %d", len(decoded[0]), count)
		}
	}
}

func TestCopyRefusesAWindowOutsideTheAudio(t *testing.T) {
	file := pcm24(48000, 1, sine(440, 48000, 1000), true)
	source, err := OpenSource(bytes.NewReader(file))
	if err != nil {
		t.Fatal(err)
	}
	for name, window := range map[string][2]int64{"negative": {-1, 10}, "empty": {0, 0}, "past-the-end": {995, 10}, "beyond": {2000, 1}} {
		if err := source.Copy(io.Discard, bytes.NewReader(file), window[0], window[1]); err == nil {
			t.Errorf("%s: copied a window outside the audio", name)
		}
	}
}

// A source that ends early (a file truncated after OpenSource read its header) is an error, not a short clip.
func TestCopyFailsWhenTheSourceEndsEarly(t *testing.T) {
	file := pcm24(48000, 1, sine(440, 48000, 1000), true)
	source, err := OpenSource(bytes.NewReader(file))
	if err != nil {
		t.Fatal(err)
	}
	if err := source.Copy(io.Discard, bytes.NewReader(file[:len(file)-300]), 0, 1000); err == nil {
		t.Fatal("a truncated source produced a clip")
	}
}

func FuzzOpenSource(f *testing.F) {
	f.Add(pcm24(48000, 1, sine(440, 48000, 64), true))
	f.Add(pcm24(44100, 2, sine(440, 44100, 64), false))
	f.Add([]byte("RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80\xbb\x00\x00\x00\x77\x01\x00\x02\x00\x10\x00data\xff\xff\xff\xff"))
	f.Add([]byte("RIFF\xff\xff\xff\xffWAVEfmt \xff\xff\xff\xff"))
	f.Add([]byte{})
	f.Fuzz(func(t *testing.T, file []byte) {
		source, err := OpenSource(bytes.NewReader(file))
		if err != nil {
			return
		}
		// Whatever a header claims, a source that opens has a format the clip can carry and frames the file holds.
		if source.Frames < 0 || source.frameBytes <= 0 || source.Format.SampleRate <= 0 || source.Format.SampleRate > maxSampleRate {
			t.Fatalf("OpenSource accepted %+v", source)
		}
		if source.dataOffset+source.Frames*source.frameBytes > int64(len(file)) {
			t.Fatalf("frames run past the file: %+v in %d bytes", source, len(file))
		}
		if source.Frames == 0 {
			return
		}
		count := min(source.Frames, 16)
		var clip bytes.Buffer
		if err := source.Copy(&clip, bytes.NewReader(file), 0, count); err != nil {
			t.Fatalf("a source that opened would not copy: %v", err)
		}
		if int64(clip.Len()) != source.ClipBytes(count) {
			t.Fatalf("clip is %d bytes, ClipBytes says %d", clip.Len(), source.ClipBytes(count))
		}
		if again, err := OpenSource(bytes.NewReader(clip.Bytes())); err != nil || again.Frames != count || again.Format != source.Format {
			t.Fatalf("the clip does not open as the window: %+v, %v", again, err)
		}
	})
}
