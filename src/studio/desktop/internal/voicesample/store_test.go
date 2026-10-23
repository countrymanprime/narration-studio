package voicesample

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"desktop/internal/persist"
)

// keptAside lists the samples.json.corrupt-* copies next to the store.
func keptAside(t *testing.T, r *rig) []string {
	t.Helper()
	matches, err := filepath.Glob(r.storePath() + ".corrupt-*")
	if err != nil {
		t.Fatal(err)
	}
	return matches
}

func TestCorruptStoresAreKeptAside(t *testing.T) {
	long := strings.Repeat("a", 61)
	emoji := strings.Repeat("🎩", 31) // 62 UTF-16 units
	tooBig := row(1, "hatter", true, MaxProjectBytes+1)
	badID := row(1, "hatter", true, 1000)
	badID.ID = "../../escape"
	upperID := row(1, "hatter", true, 1000)
	upperID.ID = strings.ToUpper(upperID.ID[:31]) + "A"
	shortID := row(1, "hatter", true, 1000)
	shortID.ID = "abc123"
	badLabel := row(1, "hatter", true, 1000)
	badLabel.Label = long
	emojiLabel := row(1, "hatter", true, 1000)
	emojiLabel.Label = emoji
	badNote := row(1, "hatter", true, 1000)
	badNote.Note = strings.Repeat("n", 501)
	noCharacter := row(1, "", true, 1000)
	badHash := row(1, "hatter", true, 1000)
	badHash.Clip.SHA256 = "xyz"
	noChapter := row(1, "hatter", true, 1000)
	noChapter.Source.ChapterID = ""
	backwards := row(1, "hatter", true, 1000)
	backwards.Source.SourceStart, backwards.Source.SourceEnd = 5, 4
	zeroBytes := row(1, "hatter", true, 0)
	longText := row(1, "hatter", true, 1000)
	longText.Source.Text = strings.Repeat("x", 10001)
	duplicate := row(2, "hatter", false, 1000)
	duplicate.ID = row(1, "hatter", true, 1000).ID

	cases := map[string][]byte{
		"not json":                  []byte("{ this is not json"),
		"a list":                    []byte(`[1, 2, 3]`),
		"two primaries":             nil,
		"an id with a path":         nil,
		"an id in capitals":         nil,
		"a short id":                nil,
		"the same id twice":         nil,
		"a label over its limit":    nil,
		"a label of emoji over it":  nil,
		"a note over its limit":     nil,
		"no character":              nil,
		"a clip over the cap":       nil,
		"a clip of no bytes":        nil,
		"a hash that is not sha256": nil,
		"no chapter":                nil,
		"a window that ends first":  nil,
		"source text over its cap":  nil,
	}
	rows := map[string][]Stored{
		"two primaries":             {row(1, "hatter", true, 1000), row(2, "hatter", true, 1000)},
		"an id with a path":         {badID},
		"an id in capitals":         {upperID},
		"a short id":                {shortID},
		"the same id twice":         {row(1, "hatter", true, 1000), duplicate},
		"a label over its limit":    {badLabel},
		"a label of emoji over it":  {emojiLabel},
		"a note over its limit":     {badNote},
		"no character":              {noCharacter},
		"a clip over the cap":       {tooBig},
		"a clip of no bytes":        {zeroBytes},
		"a hash that is not sha256": {badHash},
		"no chapter":                {noChapter},
		"a window that ends first":  {backwards},
		"source text over its cap":  {longText},
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			r := newRig(t)
			var notices []string
			r.config.Reporter = &persist.Reporter{Notify: func(text string) { notices = append(notices, text) }}
			r.service = r.build()
			if raw == nil {
				encoded, err := json.Marshal(storeFile{SchemaVersion: Version, Samples: rows[name]})
				if err != nil {
					t.Fatal(err)
				}
				raw = encoded
			}
			writeFile(t, r.storePath(), raw)
			list, err := r.service.List()
			if err != nil || len(list.Samples) != 0 {
				t.Fatalf("list = %+v, %v; a store that breaks a rule reads as an empty one", list, err)
			}
			aside := keptAside(t, r)
			if len(aside) != 1 {
				t.Fatalf("kept aside = %v, want one copy", aside)
			}
			if kept, err := os.ReadFile(aside[0]); err != nil || !bytes.Equal(kept, raw) {
				t.Fatalf("the copy kept aside is not the original: %v", err)
			}
			if len(notices) != 1 {
				t.Fatalf("the narrator was told %d times: %v", len(notices), notices)
			}
			// A fresh store starts, and the narrator can mark again.
			r.mustMark(request(10, 12))
			if got := len(r.list().Samples); got != 1 {
				t.Fatalf("samples after starting fresh = %d", got)
			}
		})
	}
}

func TestANewerStoreIsRefusedAndNeverOverwritten(t *testing.T) {
	r := newRig(t)
	newer := []byte(`{"schemaVersion": 2, "samples": [], "somethingNew": true}`)
	writeFile(t, r.storePath(), newer)
	steps := map[string]func() error{
		"list": func() error { _, err := r.service.List(); return err },
		"mark": func() error { _, err := r.mark(request(10, 12)); return err },
		"update": func() error {
			_, err := r.service.Update(strings.Repeat("a", 32), Change{CharacterID: "hatter"})
			return err
		},
		"primary":    func() error { _, err := r.service.SetPrimary(strings.Repeat("a", 32)); return err },
		"remove":     func() error { _, err := r.service.Remove(strings.Repeat("a", 32)); return err },
		"remove all": func() error { _, err := r.service.RemoveAll(); return err },
		"clip":       func() error { _, err := r.service.Clip(strings.Repeat("a", 32)); return err },
	}
	for name, step := range steps {
		err := step()
		var refusal *Refusal
		if err == nil || errors.As(err, &refusal) || !strings.Contains(err.Error(), "newer version") {
			t.Errorf("%s: err = %v, want the newer-version message", name, err)
		}
	}
	if got, err := os.ReadFile(r.storePath()); err != nil || !bytes.Equal(got, newer) {
		t.Fatalf("a newer samples.json was changed: %q, %v", got, err)
	}
	if aside := keptAside(t, r); len(aside) != 0 {
		t.Fatalf("a newer file was moved aside: %v", aside)
	}
	if len(r.clipFiles()) != 0 {
		t.Fatalf("clip files = %v", r.clipFiles())
	}
}

func TestAnUnreadableStoreIsNotOverwritten(t *testing.T) {
	r := newRig(t)
	// A directory where the file should be: it exists, and cannot be read as a file.
	if err := os.MkdirAll(filepath.Join(r.storePath(), "inside"), 0o755); err != nil {
		t.Fatal(err)
	}
	for name, step := range map[string]func() error{
		"list":       func() error { _, err := r.service.List(); return err },
		"mark":       func() error { _, err := r.mark(request(10, 12)); return err },
		"remove all": func() error { _, err := r.service.RemoveAll(); return err },
	} {
		if err := step(); err == nil || !strings.Contains(err.Error(), "could not be read") {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	if info, err := os.Stat(r.storePath()); err != nil || !info.IsDir() {
		t.Fatalf("the unreadable store was replaced: %v", err)
	}
	if len(r.clipFiles()) != 0 {
		t.Fatalf("clip files = %v", r.clipFiles())
	}
}

// A hand edit can change a label, a note, the primary flag or the character, and nothing else the host would open.
func TestHandEditedFileNamesAreIgnored(t *testing.T) {
	r := newRig(t)
	sample := r.mustMark(request(10, 12))
	decoy := filepath.Join(t.TempDir(), "decoy.wav")
	writeFile(t, decoy, []byte("not the clip"))

	var edited map[string]any
	raw, err := os.ReadFile(r.storePath())
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &edited); err != nil {
		t.Fatal(err)
	}
	row := edited["samples"].([]any)[0].(map[string]any)
	row["clip"].(map[string]any)["file"] = decoy
	row["clip"].(map[string]any)["path"] = decoy
	row["source"].(map[string]any)["sourceFile"] = decoy
	row["file"] = decoy
	row["label"] = "Edited by hand"
	row["note"] = "and so is this"
	raw, err = json.Marshal(edited)
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, r.storePath(), raw)

	list := r.list()
	if len(list.Samples) != 1 || list.Samples[0].Label != "Edited by hand" || list.Samples[0].Note != "and so is this" {
		t.Fatalf("a hand edit of the label was not read: %+v", list.Samples)
	}
	clip, err := r.service.Clip(sample.ID)
	if err != nil {
		t.Fatal(err)
	}
	if clip.Path != r.clipPath(sample.ID) || clip.State != ClipOK {
		t.Fatalf("clip = %+v, want the file named by the id", clip)
	}
	// The decoy exists and the real clip does not: the sample is missing, not served from the decoy.
	if err := os.Remove(r.clipPath(sample.ID)); err != nil {
		t.Fatal(err)
	}
	clip, err = r.service.Clip(sample.ID)
	if err != nil || clip.State != ClipMissing || clip.Path != "" {
		t.Fatalf("clip = %+v, %v; a stored file name must not stand in for the clip", clip, err)
	}
	if r.list().Samples[0].ClipState != ClipMissing {
		t.Fatal("the list reads the decoy")
	}
	// The host writes the file back without the names it ignores.
	if _, err := r.service.Update(sample.ID, Change{CharacterID: "hatter", Label: "Edited again"}); err != nil {
		t.Fatal(err)
	}
	var rewritten struct {
		Samples []map[string]any `json:"samples"`
	}
	if err := json.Unmarshal(mustRead(t, r.storePath()), &rewritten); err != nil {
		t.Fatal(err)
	}
	stored := rewritten.Samples[0]
	if _, has := stored["file"]; has {
		t.Fatal("the host kept a file name it ignores on the sample")
	}
	for _, key := range []string{"file", "path"} {
		if _, has := stored["clip"].(map[string]any)[key]; has {
			t.Fatalf("the host kept clip.%s, which it ignores", key)
		}
	}
}

func TestClipPathOnlyNamesFilesInTheClipsFolder(t *testing.T) {
	project := t.TempDir()
	good := strings.Repeat("0f", 16)
	path, ok := ClipPath(project, good)
	if !ok || path != filepath.Join(project, "narration-studio", "voice-samples", "clips", good+".wav") {
		t.Fatalf("ClipPath = %q, %v", path, ok)
	}
	for _, id := range []string{"", "..", "../x", good + ".wav", strings.ToUpper(good), good[:31], good + "0", strings.Repeat("g", 32), "C:\\x", good[:30] + "/x", good[:31] + "\x00"} {
		if path, ok := ClipPath(project, id); ok || path != "" {
			t.Errorf("ClipPath(%q) = %q, %v", id, path, ok)
		}
	}
}

func TestAStoreIsReadBackByANewService(t *testing.T) {
	r := newRig(t)
	sample := r.mustMark(request(10, 12))
	again := r.build()
	list, err := again.List()
	if err != nil || len(list.Samples) != 1 || list.Samples[0].ID != sample.ID || list.Samples[0].ClipState != ClipOK {
		t.Fatalf("list = %+v, %v", list, err)
	}
	// What the first service wrote is what the second writes over, not beside.
	if _, err := again.Remove(sample.ID); err != nil {
		t.Fatal(err)
	}
	if got := len(r.list().Samples); got != 0 || len(r.clipFiles()) != 0 {
		t.Fatalf("samples = %d, clips = %v", got, r.clipFiles())
	}
}

func TestStoreWritesGoThroughATemporaryFile(t *testing.T) {
	r := newRig(t)
	var renamed []string
	r.service.rename = func(from, to string) error {
		renamed = append(renamed, filepath.Base(to))
		if !strings.HasSuffix(from, ".tmp") {
			t.Errorf("%s was renamed from %s, which is not a temporary file", to, from)
		}
		return os.Rename(from, to)
	}
	sample := r.mustMark(request(10, 12))
	if len(renamed) != 2 || renamed[0] != sample.ID+".wav" || renamed[1] != "samples.json" {
		t.Fatalf("renames = %v, want the clip and then the row", renamed)
	}
	if entries, _ := filepath.Glob(filepath.Join(Dir(r.project), "*.tmp")); len(entries) != 0 {
		t.Fatalf("temporary files left: %v", entries)
	}
}

func TestListOfAProjectWithNoSamples(t *testing.T) {
	r := newRig(t)
	list := r.list()
	if list.Samples == nil || len(list.Samples) != 0 || list.Totals.Count != 0 || list.Totals.Bytes != 0 || list.Limits != Limits() {
		t.Fatalf("list = %+v", list)
	}
	// Reading creates nothing.
	if _, err := os.Stat(Dir(r.project)); err == nil {
		t.Fatal("List created the voice-samples folder")
	}
	if empty := New(Config{}); empty != nil {
		list, err := empty.List()
		if err != nil || len(list.Samples) != 0 {
			t.Fatalf("a service with no project: %+v, %v", list, err)
		}
		if _, err := empty.Mark(t.Context(), request(10, 12)); err == nil {
			t.Fatal("a mark with no project succeeded")
		}
	}
}

func TestConcurrentCuratingKeepsTheFileWhole(t *testing.T) {
	r := newRig(t)
	rows := make([]Stored, 0, 12)
	for i := 1; i <= 12; i++ {
		rows = append(rows, row(i, "hatter", i == 1, 1000))
	}
	r.seed(rows...)
	var wg sync.WaitGroup
	for i := 1; i <= 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			service := r.build()
			if i%2 == 0 {
				_, _ = service.Remove(row(i, "hatter", false, 0).ID)
			} else {
				_, _ = service.SetPrimary(row(i, "hatter", false, 0).ID)
			}
		}()
	}
	wg.Wait()
	list := r.list()
	primaries := 0
	for _, sample := range list.Samples {
		if sample.Primary {
			primaries++
		}
	}
	if len(list.Samples) != 6 || primaries != 1 {
		t.Fatalf("samples = %d, primaries = %d", len(list.Samples), primaries)
	}
}
