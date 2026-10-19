//go:build audacityreal && linux

package audacityreal

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"testing"
)

// Tone writes a sine WAV of the given length, rate and channel count under the run's work folder and returns its path. It is
// 16-bit PCM; a known signal is the point, so no dither or fade.
func (e Env) Tone(t testing.TB, name string, seconds float64, rate, channels int, freq float64) string {
	t.Helper()
	dir := filepath.Join(e.Work, "audio")
	_ = os.MkdirAll(dir, 0o755)
	path := filepath.Join(dir, name)
	args := []string{"-v", "error", "-y", "-f", "lavfi", "-i", fmt.Sprintf("sine=frequency=%g:sample_rate=%d:duration=%g", freq, rate, seconds),
		"-ac", fmt.Sprint(channels), "-c:a", "pcm_s16le", path}
	if out, err := exec.Command("ffmpeg", args...).CombinedOutput(); err != nil {
		t.Fatalf("ffmpeg tone: %v: %s", err, out)
	}
	return path
}

// Silence writes a silent WAV, with an optional tone burst of burstS seconds starting at burstAt (burstS 0: none).
func (e Env) Silence(t testing.TB, name string, seconds float64, rate int, burstAt, burstS float64) string {
	t.Helper()
	dir := filepath.Join(e.Work, "audio")
	_ = os.MkdirAll(dir, 0o755)
	path := filepath.Join(dir, name)
	var args []string
	if burstS > 0 {
		expr := fmt.Sprintf(`0.5*sin(2*PI*440*t)*between(t\,%g\,%g)`, burstAt, burstAt+burstS)
		args = []string{"-v", "error", "-y", "-f", "lavfi", "-i", fmt.Sprintf("aevalsrc=exprs=%s:s=%d:d=%g", expr, rate, seconds), "-ac", "1", "-c:a", "pcm_s16le", path}
	} else {
		args = []string{"-v", "error", "-y", "-f", "lavfi", "-i", fmt.Sprintf("anullsrc=r=%d:cl=mono", rate), "-t", fmt.Sprint(seconds), "-c:a", "pcm_s16le", path}
	}
	if out, err := exec.Command("ffmpeg", args...).CombinedOutput(); err != nil {
		t.Fatalf("ffmpeg silence: %v: %s", err, out)
	}
	return path
}

// Probe is what ffprobe says about an audio file.
type Probe struct {
	Seconds  float64
	Rate     int
	Channels int
	Codec    string
	Bits     int
	Bytes    int64
}

// ProbeFile reads a file's stream facts with ffprobe.
func ProbeFile(path string) (Probe, error) {
	out, err := exec.Command("ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
		"stream=codec_name,sample_rate,channels,duration,bits_per_sample,bits_per_raw_sample:format=duration,size", "-of", "json", path).Output()
	if err != nil {
		return Probe{}, fmt.Errorf("ffprobe %s: %w", path, err)
	}
	// ffprobe's JSON keys are snake_case; decode through a map.
	var m struct {
		Streams []map[string]any `json:"streams"`
		Format  map[string]any   `json:"format"`
	}
	if err := json.Unmarshal(out, &m); err != nil || len(m.Streams) == 0 {
		return Probe{}, fmt.Errorf("ffprobe %s: no audio stream: %v", path, err)
	}
	s := m.Streams[0]
	str := func(v any) string { s, _ := v.(string); return s }
	p := Probe{Codec: str(s["codec_name"])}
	p.Rate, _ = strconv.Atoi(str(s["sample_rate"]))
	if c, ok := s["channels"].(float64); ok {
		p.Channels = int(c)
	}
	p.Seconds, _ = strconv.ParseFloat(str(s["duration"]), 64)
	if p.Seconds == 0 {
		p.Seconds, _ = strconv.ParseFloat(str(m.Format["duration"]), 64)
	}
	p.Bits, _ = strconv.Atoi(str(s["bits_per_sample"]))
	if p.Bits == 0 {
		p.Bits, _ = strconv.Atoi(str(s["bits_per_raw_sample"]))
	}
	p.Bytes, _ = strconv.ParseInt(str(m.Format["size"]), 10, 64)
	return p, nil
}

var volRe = regexp.MustCompile(`(mean|max)_volume: (-?[0-9.]+|-inf) dB`)

// Volume is a file's mean and peak level in dB, from ffmpeg's volumedetect. A file with no samples or pure silence reports -inf.
func Volume(path string, filter string) (mean, peak float64, err error) {
	af := "volumedetect"
	if filter != "" {
		af = filter + "," + af
	}
	out, _ := exec.Command("ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", af, "-f", "null", "-").CombinedOutput()
	mean, peak = math.Inf(-1), math.Inf(-1)
	found := false
	for _, m := range volRe.FindAllStringSubmatch(string(out), -1) {
		v := math.Inf(-1)
		if m[2] != "-inf" {
			v, _ = strconv.ParseFloat(m[2], 64)
		}
		found = true
		if m[1] == "mean" {
			mean = v
		} else {
			peak = v
		}
	}
	if !found {
		return 0, 0, fmt.Errorf("volumedetect printed nothing for %s: %s", path, out)
	}
	return mean, peak, nil
}

// WAV is what a PCM WAV file says about itself, and its samples' root mean square as a fraction of full scale.
type WAV struct {
	Rate, Channels, Bits int
	Frames               int
	Seconds, RMS         float64
	DataBytes            int
}

// ReadWAV parses a RIFF WAVE file (16-bit PCM or 32-bit float).
func ReadWAV(path string) (WAV, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return WAV{}, err
	}
	if len(b) < 12 || string(b[0:4]) != "RIFF" || string(b[8:12]) != "WAVE" {
		return WAV{}, fmt.Errorf("%s is not a RIFF WAVE file (%d bytes)", path, len(b))
	}
	var w WAV
	var data []byte
	var format int
	for p := 12; p+8 <= len(b); {
		id, size := string(b[p:p+4]), int(binary.LittleEndian.Uint32(b[p+4:]))
		body := b[p+8 : min(p+8+size, len(b))]
		switch id {
		case "fmt ":
			format = int(binary.LittleEndian.Uint16(body[0:]))
			w.Channels = int(binary.LittleEndian.Uint16(body[2:]))
			w.Rate = int(binary.LittleEndian.Uint32(body[4:]))
			w.Bits = int(binary.LittleEndian.Uint16(body[14:]))
		case "data":
			data = body
		}
		p += 8 + size + size%2
	}
	if w.Rate == 0 || w.Channels == 0 {
		return WAV{}, fmt.Errorf("%s: no fmt chunk", path)
	}
	w.DataBytes = len(data)
	width := w.Bits / 8
	if width == 0 {
		return WAV{}, fmt.Errorf("%s: %d-bit samples", path, w.Bits)
	}
	n := len(data) / width
	w.Frames = n / w.Channels
	w.Seconds = float64(w.Frames) / float64(w.Rate)
	var sum float64
	for i := range n {
		var v float64
		switch {
		case format == 3 && width == 4:
			v = float64(math.Float32frombits(binary.LittleEndian.Uint32(data[i*4:])))
		case width == 2:
			v = float64(int16(binary.LittleEndian.Uint16(data[i*2:]))) / 32768
		case width == 3:
			v = float64(int32(uint32(data[i*3])<<8|uint32(data[i*3+1])<<16|uint32(data[i*3+2])<<24)>>8) / 8388608
		case width == 4:
			v = float64(int32(binary.LittleEndian.Uint32(data[i*4:]))) / 2147483648
		}
		sum += v * v
	}
	if n > 0 {
		w.RMS = math.Sqrt(sum / float64(n))
	}
	return w, nil
}
