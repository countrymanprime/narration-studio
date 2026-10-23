// Spike: transcribe a 16 kHz mono PCM16 WAV with whisper.cpp through its Go cgo bindings.
package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/ggerganov/whisper.cpp/bindings/go/pkg/whisper"
)

func readWav(path string) []float32 {
	b, err := os.ReadFile(path)
	if err != nil {
		panic(err)
	}
	// Find the "data" chunk.
	i := 12
	for i+8 <= len(b) {
		id := string(b[i : i+4])
		n := int(binary.LittleEndian.Uint32(b[i+4 : i+8]))
		if id == "data" {
			pcm := b[i+8 : i+8+n]
			out := make([]float32, n/2)
			for k := range out {
				out[k] = float32(int16(binary.LittleEndian.Uint16(pcm[2*k:]))) / 32768
			}
			return out
		}
		i += 8 + n
	}
	panic("no data chunk")
}

func main() {
	t0 := time.Now()
	model, err := whisper.New(os.Args[1])
	if err != nil {
		panic(err)
	}
	defer model.Close()
	tLoad := time.Since(t0)
	samples := readWav(os.Args[2])
	threads, _ := strconv.Atoi(os.Args[3])
	ctx, err := model.NewContext()
	if err != nil {
		panic(err)
	}
	ctx.SetLanguage("en")
	ctx.SetThreads(uint(threads))
	ctx.SetBeamSize(5)
	ctx.SetTokenTimestamps(true)
	t1 := time.Now()
	if err := ctx.Process(samples, nil, nil, nil); err != nil {
		panic(err)
	}
	tRun := time.Since(t1)
	f, _ := os.Create(os.Args[4])
	defer f.Close()
	for {
		seg, err := ctx.NextSegment()
		if err != nil {
			break
		}
		fmt.Fprintln(f, seg.Text)
	}
	fmt.Printf("load=%.2fs transcribe=%.2fs audio=%.0fs\n", tLoad.Seconds(), tRun.Seconds(), float64(len(samples))/16000)
}
