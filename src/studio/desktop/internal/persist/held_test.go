package persist

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"testing/iotest"

	"desktop/internal/filetest"
)

type heldNote struct {
	Text string `json:"text"`
}

// countingDecode decodes a heldNote and counts how often it was asked to.
func countingDecode(calls *int) func([]byte) (heldNote, error) {
	return func(raw []byte) (heldNote, error) {
		*calls++
		var note heldNote
		return note, json.Unmarshal(raw, &note)
	}
}

func TestAnUnchangedFileIsAnsweredFromWhatIsHeldWithoutADecode(t *testing.T) {
	path := filepath.Join(t.TempDir(), "note.json")
	write(t, path, `{"text":"first"}`)
	reporter, recorded := newReporter()
	var held Held[heldNote]
	calls := 0
	counted, _ := Work()
	for range 3 {
		note, outcome := ReadHeld(reporter, path, "note", Disposable, &held, countingDecode(&calls))
		if outcome != Loaded || note.Text != "first" {
			t.Fatalf("read = %+v, %v; want first, Loaded", note, outcome)
		}
	}
	if now, _ := Work(); calls != 1 || now-counted != 1 {
		t.Fatalf("three reads decoded %d times and counted %d, want 1 and 1", calls, now-counted)
	}
	if note, ok := held.Value(); !ok || note.Text != "first" || len(recorded.logs) != 0 {
		t.Fatalf("held = %+v, %v; logs %v", note, ok, recorded.logs)
	}
}

func TestAFileRewrittenAtTheSameSizeAndTimeIsDecodedAgain(t *testing.T) {
	path := filepath.Join(t.TempDir(), "note.json")
	write(t, path, `{"text":"first"}`)
	var held Held[heldNote]
	calls := 0
	ReadHeld(nil, path, "note", Disposable, &held, countingDecode(&calls))
	filetest.RewriteInPlace(t, path, "first", "other")
	note, outcome := ReadHeld(nil, path, "note", Disposable, &held, countingDecode(&calls))
	if outcome != Loaded || note.Text != "other" || calls != 2 {
		t.Fatalf("after the rewrite: %+v, %v, %d decodes; want other, Loaded, 2", note, outcome, calls)
	}
}

func TestADisposableFileThatDoesNotDecodeIsLoggedOnceAndItsRepairIsRead(t *testing.T) {
	path := filepath.Join(t.TempDir(), "note.json")
	write(t, path, `{"text":"first"}`)
	reporter, recorded := newReporter()
	var held Held[heldNote]
	calls := 0
	ReadHeld(reporter, path, "note", Disposable, &held, countingDecode(&calls))
	write(t, path, `{not json`)
	for range 2 {
		note, outcome := ReadHeld(reporter, path, "note", Disposable, &held, countingDecode(&calls))
		if outcome != Healed || note.Text != "" {
			t.Fatalf("a corrupt file read as %+v, %v; want nothing, Healed", note, outcome)
		}
	}
	if _, ok := held.Value(); ok || calls != 2 || len(recorded.logs) != 1 {
		t.Fatalf("held a value: %v; %d decodes, logs %v; want none, 2 and one line", ok, calls, recorded.logs)
	}
	write(t, path, `{"text":"first"}`)
	if note, outcome := ReadHeld(reporter, path, "note", Disposable, &held, countingDecode(&calls)); outcome != Loaded || note.Text != "first" || calls != 3 {
		t.Fatalf("the repaired file read as %+v, %v after %d decodes", note, outcome, calls)
	}
}

// What ReadJSON does with narrator data that does not decode, a file that is gone and one that cannot be read, ReadHeld does too,
// and none of them leaves a value held.
func TestAReadThatIsNotLoadedOrHealedDropsWhatWasHeld(t *testing.T) {
	cases := []struct {
		name  string
		spoil func(t *testing.T, path string)
		want  Outcome
	}{
		{"narrator data that does not decode", func(t *testing.T, path string) { write(t, path, `{not json`) }, Quarantined},
		{"a file that is gone", func(t *testing.T, path string) {
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
		}, Missing},
		{"a folder in its place", func(t *testing.T, path string) {
			if err := os.Remove(path); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(path, 0o755); err != nil {
				t.Fatal(err)
			}
		}, Unreadable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "note.json")
			write(t, path, `{"text":"first"}`)
			reporter, _ := newReporter()
			var held Held[heldNote]
			calls := 0
			ReadHeld(reporter, path, "note", NarratorData, &held, countingDecode(&calls))
			tc.spoil(t, path)
			note, outcome := ReadHeld(reporter, path, "note", NarratorData, &held, countingDecode(&calls))
			same := (&Reporter{}).ReadJSON(path, "note", NarratorData, decodeObject)
			if outcome != tc.want || note.Text != "" {
				t.Fatalf("read = %+v, %v; want nothing, %v", note, outcome, tc.want)
			}
			// The quarantined file was moved aside, so ReadJSON after it finds none; the other two read the same both ways.
			if tc.want != Quarantined && same != outcome {
				t.Fatalf("ReadJSON says %v where ReadHeld said %v", same, outcome)
			}
			if _, ok := held.Value(); ok {
				t.Fatal("a value stayed held")
			}
		})
	}
}

func TestDropForgetsWhatIsHeldSoTheNextReadDecodes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "note.json")
	write(t, path, `{"text":"first"}`)
	var held Held[heldNote]
	calls := 0
	ReadHeld(nil, path, "note", Disposable, &held, countingDecode(&calls))
	held.Drop()
	if _, ok := held.Value(); ok {
		t.Fatal("a dropped value is still held")
	}
	if _, outcome := ReadHeld(nil, path, "note", Disposable, &held, countingDecode(&calls)); outcome != Loaded || calls != 2 {
		t.Fatalf("after a drop: %v, %d decodes; want Loaded, 2", outcome, calls)
	}
}

// ReadFile reads into one buffer of the file's size: a megabyte file read through a growing buffer was copied several times over.
func TestReadFileOfALargeFileAllocatesOneBufferOfItsSize(t *testing.T) {
	path := filepath.Join(t.TempDir(), "large.json")
	if err := os.WriteFile(path, make([]byte, 1<<20), 0o600); err != nil {
		t.Fatal(err)
	}
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	raw, err := ReadFile(path)
	runtime.ReadMemStats(&after)
	if err != nil || len(raw) != 1<<20 {
		t.Fatalf("ReadFile = %d bytes, %v", len(raw), err)
	}
	allocated := after.TotalAlloc - before.TotalAlloc
	if allocated > 3<<19 {
		t.Fatalf("one read of a 1 MiB file allocated %d bytes, want about its size", allocated)
	}
}

// A file that grew after it was opened holds more than the size its buffer was made for: all of it is still read.
func TestReadSizedReadsPastTheSizeItWasGiven(t *testing.T) {
	content := bytes.Repeat([]byte("grown "), 1000)
	got, err := readSized(bytes.NewReader(content), 10)
	if err != nil || !bytes.Equal(got, content) {
		t.Fatalf("readSized = %d bytes, %v; want all %d", len(got), err, len(content))
	}
}

func TestReadSizedAnswersTheReadersError(t *testing.T) {
	broken := errors.New("the disk went away")
	if got, err := readSized(iotest.ErrReader(broken), 10); !errors.Is(err, broken) || got != nil {
		t.Fatalf("readSized = %v, %v; want nothing and the reader's error", got, err)
	}
}
