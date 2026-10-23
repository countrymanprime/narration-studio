// Spike: call libmoonshine's C ABI from Go without cgo (purego dlopen), the same calls moonshine-voice makes with ctypes.
package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"time"
	"unsafe"

	"github.com/ebitengine/purego"
)

func readWav(path string) []float32 {
	b, _ := os.ReadFile(path)
	for i := 12; i+8 <= len(b); {
		n := int(binary.LittleEndian.Uint32(b[i+4:]))
		if string(b[i:i+4]) == "data" {
			out := make([]float32, n/2)
			for k := range out {
				out[k] = float32(int16(binary.LittleEndian.Uint16(b[i+8+2*k:]))) / 32768
			}
			return out
		}
		i += 8 + n
	}
	panic("no data")
}

func main() {
	t0 := time.Now()
	lib, err := purego.Dlopen(os.Args[1], purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		panic(err)
	}
	var load func(path string, arch uint32, opts unsafe.Pointer, n uint64, ver int32) int32
	var transcribe func(h int32, audio *float32, n uint64, rate int32, flags uint32, out *unsafe.Pointer) int32
	var toString func(t unsafe.Pointer) string
	purego.RegisterLibFunc(&load, lib, "moonshine_load_transcriber_from_files")
	purego.RegisterLibFunc(&transcribe, lib, "moonshine_transcribe_without_streaming")
	purego.RegisterLibFunc(&toString, lib, "moonshine_transcript_to_string")
	h := load(os.Args[2], 1, nil, 0, 30000) // 1 = ModelArch.BASE, 30000 = MOONSHINE_HEADER_VERSION
	if h < 0 {
		panic(fmt.Sprint("load failed ", h))
	}
	tLoad := time.Since(t0)
	audio := readWav(os.Args[3])
	t1 := time.Now()
	var tr unsafe.Pointer
	if rc := transcribe(h, &audio[0], uint64(len(audio)), 16000, 0, &tr); rc != 0 {
		panic(fmt.Sprint("transcribe failed ", rc))
	}
	tRun := time.Since(t1)
	os.WriteFile(os.Args[4], []byte(toString(tr)), 0o644)
	fmt.Printf("load=%.2fs transcribe=%.2fs\n", tLoad.Seconds(), tRun.Seconds())
}
