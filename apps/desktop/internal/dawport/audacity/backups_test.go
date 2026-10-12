package audacity

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	abt "github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// pipeAudacity is a fake Audacity for the backups: the scripting commands spike 1g sends (docs/operations/daw-spike-run-sheet.md,
// "1g Audacity backups"), answered as the published scripting reference documents them, over a project whose audio is one value
// per whole second, so a clone and a restore can be compared by content. Commands are parsed as Audacity parses them
// (audacitybridgetest.ParseCommand). What only a real Audacity can show is on the QA pass (#1495).
type pipeAudacity struct {
	mu       sync.Mutex
	tracks   []*fakeTrack
	selStart float64
	selEnd   float64
	clip     []string
	log      []string
	// failOn answers Failed! to the first command of that name.
	failOn string
}

type fakeTrack struct {
	name     string
	kind     string
	channels int
	selected bool
	muted    bool
	audio    map[int]string
}

func newPipeAudacity() *pipeAudacity { return &pipeAudacity{} }

// addAudio adds a wave track whose second s holds "<prefix><s>" for s in [start, end).
func (f *pipeAudacity) addAudio(name string, start, end int, prefix string) {
	t := &fakeTrack{name: name, kind: "wave", channels: 1, audio: map[int]string{}}
	for s := start; s < end; s++ {
		t.audio[s] = prefix + strconv.Itoa(s)
	}
	f.tracks = append(f.tracks, t)
}

func (f *pipeAudacity) track(name string) *fakeTrack {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, t := range f.tracks {
		if t.name == name {
			return t
		}
	}
	return nil
}

func (f *pipeAudacity) commands() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.log...)
}

func (t *fakeTrack) span() (start, end int, ok bool) {
	first := true
	for s := range t.audio {
		if first || s < start {
			start = s
		}
		if first || s+1 > end {
			end = s + 1
		}
		first = false
	}
	return start, end, !first
}

func (f *pipeAudacity) selectedWave() *fakeTrack {
	for _, t := range f.tracks {
		if t.selected && t.kind == "wave" {
			return t
		}
	}
	return nil
}

func param(cmd abt.Parsed, key string) (float64, bool) {
	v, ok := cmd.Params[key]
	if !ok {
		return 0, false
	}
	n, err := strconv.ParseFloat(v, 64)
	return n, err == nil
}

func (f *pipeAudacity) handle(line string) ([]string, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.log = append(f.log, line)
	cmd, err := abt.ParseCommand(line)
	if err != nil {
		return []string{err.Error()}, false
	}
	if f.failOn != "" && cmd.Name == f.failOn {
		f.failOn = ""
		return []string{cmd.Name + " failed."}, false
	}
	switch cmd.Name {
	case "GetInfo":
		if cmd.Params["Type"] != "Tracks" {
			return []string{"The fake only answers Type=Tracks."}, false
		}
		rows := []map[string]any{}
		for _, t := range f.tracks {
			row := map[string]any{"name": t.name, "kind": t.kind, "selected": boolInt(t.selected), "focused": 0}
			if t.kind == "wave" {
				row["channels"], row["mute"] = t.channels, boolInt(t.muted)
				if start, end, ok := t.span(); ok {
					row["start"], row["end"] = start, end
				}
			}
			rows = append(rows, row)
		}
		raw, _ := json.MarshalIndent(rows, "", " ")
		return strings.Split(string(raw), "\n"), true
	case "Stop":
		return nil, true
	case "SelectTracks":
		first, ok1 := param(cmd, "Track")
		count, ok2 := param(cmd, "TrackCount")
		if !ok1 || !ok2 || cmd.Params["Mode"] != "Set" {
			return []string{"The fake selects tracks with Track, TrackCount and Mode=Set."}, false
		}
		for i, t := range f.tracks {
			t.selected = float64(i) >= first && float64(i) < first+count
		}
		return nil, true
	case "SelectTime":
		start, ok1 := param(cmd, "Start")
		end, ok2 := param(cmd, "End")
		if !ok1 || !ok2 {
			return []string{"SelectTime needs Start and End."}, false
		}
		f.selStart, f.selEnd = start, end
		return nil, true
	case "Copy":
		t := f.selectedWave()
		if t == nil {
			return []string{"Nothing is selected to copy."}, false
		}
		f.clip = nil
		for s := int(math.Floor(f.selStart)); s < int(math.Ceil(f.selEnd)); s++ {
			f.clip = append(f.clip, t.audio[s])
		}
		return nil, true
	case "Paste":
		t := f.selectedWave()
		if t == nil || f.clip == nil {
			return []string{"There is nothing to paste, or no track to paste into."}, false
		}
		a, b := int(math.Floor(f.selStart)), int(math.Ceil(f.selEnd))
		shift := len(f.clip) - (b - a)
		next := map[int]string{}
		for s, v := range t.audio {
			switch {
			case s < a:
				next[s] = v
			case s >= b:
				next[s+shift] = v
			}
		}
		for i, v := range f.clip {
			if v != "" {
				next[a+i] = v
			}
		}
		t.audio = next
		return nil, true
	case "NewMonoTrack", "NewStereoTrack":
		channels := 1
		if cmd.Name == "NewStereoTrack" {
			channels = 2
		}
		for _, t := range f.tracks {
			t.selected = false
		}
		f.tracks = append(f.tracks, &fakeTrack{name: "Audio Track", kind: "wave", channels: channels, selected: true, audio: map[int]string{}})
		return nil, true
	case "SetTrackStatus", "SetTrackAudio":
		index, ok := param(cmd, "Track")
		if !ok || int(index) < 0 || int(index) >= len(f.tracks) {
			return []string{"Track is out of range."}, false
		}
		t := f.tracks[int(index)]
		if name, ok := cmd.Params["Name"]; ok {
			t.name = name
		}
		if mute, ok := cmd.Params["Mute"]; ok {
			t.muted = mute == "1"
		}
		return nil, true
	case "SilenceAudio":
		t := f.selectedWave()
		if t == nil {
			return []string{"Nothing is selected."}, false
		}
		for s := int(math.Floor(f.selStart)); s < int(math.Ceil(f.selEnd)); s++ {
			if _, ok := t.audio[s]; ok {
				t.audio[s] = "0"
			}
		}
		return nil, true
	case "RemoveTracks":
		kept := f.tracks[:0]
		for _, t := range f.tracks {
			if !t.selected {
				kept = append(kept, t)
			}
		}
		f.tracks = kept
		return nil, true
	default:
		return []string{fmt.Sprintf("Your batch command of %s was not recognized.", cmd.Name)}, false
	}
}

// transport serves the fake on an in-memory duplex pipe, framed as mod-script-pipe frames its replies.
func (f *pipeAudacity) transport() audacitybridge.Transport {
	return audacitybridge.TransportFunc(func(context.Context) (audacitybridge.Conn, error) {
		toServerR, toServerW := io.Pipe()
		toClientR, toClientW := io.Pipe()
		go func() {
			defer func() { _ = toClientW.Close() }()
			r := bufio.NewReader(toServerR)
			for {
				line, err := r.ReadString('\n')
				if err != nil {
					return
				}
				line = strings.NewReplacer("\x00", "", "\r", "", "\n", "").Replace(line)
				body, ok := f.handle(line)
				var out strings.Builder
				for _, l := range body {
					out.WriteString(l + "\n")
				}
				if ok {
					out.WriteString("BatchCommand finished: OK\n\n")
				} else {
					out.WriteString("BatchCommand finished: Failed!\n\n")
				}
				if _, err := toClientW.Write([]byte(out.String())); err != nil {
					return
				}
			}
		}()
		return &duplex{r: toClientR, w: toServerW}, nil
	})
}

type duplex struct {
	r *io.PipeReader
	w *io.PipeWriter
}

func (d *duplex) Read(b []byte) (int, error)  { return d.r.Read(b) }
func (d *duplex) Write(b []byte) (int, error) { return d.w.Write(b) }
func (d *duplex) Close() error {
	_ = d.r.CloseWithError(io.ErrClosedPipe)
	return d.w.Close()
}

// backupsOver is the backups role over fake, with its table in a fresh project folder and the clock at now.
func backupsOver(t *testing.T, fake *pipeAudacity, now *time.Time) (*Backups, string) {
	t.Helper()
	project := t.TempDir()
	client := audacitybridge.New(fake.transport(), audacitybridge.Options{Timeout: 2 * time.Second})
	t.Cleanup(func() { _ = client.Close() })
	return NewBackups(client, BackupsConfig{
		Project: func() string { return project },
		Now:     func() time.Time { return *now },
	}), project
}

func readTable(t *testing.T, project string) backupsTable {
	t.Helper()
	raw, err := os.ReadFile(BackupsFile(project))
	if err != nil {
		t.Fatalf("read the table: %v", err)
	}
	var table backupsTable
	if err := json.Unmarshal(raw, &table); err != nil {
		t.Fatalf("the table is not JSON: %v", err)
	}
	return table
}

func audioIn(t *fakeTrack, start, end int) []string {
	out := make([]string, 0, end-start)
	for s := start; s < end; s++ {
		out = append(out, t.audio[s])
	}
	return out
}

// clone-then-restore-roundtrip-over-a-fake-pipe
func TestBackupClonesTheWindowAndRestoreRoundTrips(t *testing.T) {
	ctx := context.Background()
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	backups, project := backupsOver(t, fake, &now)

	result, err := backups.BackupAround(ctx, dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "ch-1", Start: 140, End: 160})
	if err != nil {
		t.Fatalf("BackupAround: %v", err)
	}
	want := dawport.Result{OK: true, Message: "Backed up 260 s of audio in Audacity."}
	if fmt.Sprint(result) != fmt.Sprint(want) {
		t.Fatalf("BackupAround = %+v, want %+v (the window is 120 s either side, clamped to the project's 300 s)", result, want)
	}
	table := readTable(t, project)
	if table.SchemaVersion != 1 || len(table.Backups) != 1 {
		t.Fatalf("table = %+v, want one row at version 1", table)
	}
	row := table.Backups[0]
	if !backupID.MatchString(row.ID) || row.GUID != "Chapter 1" || row.ChapterID != "ch-1" || row.Start != 20 || row.End != 280 ||
		!row.CreatedAt.Equal(now) {
		t.Fatalf("row = %+v", row)
	}
	backupTrack := fake.track(BackupTrackName(row.ID))
	if backupTrack == nil || !backupTrack.muted {
		t.Fatalf("the backup track %q is missing or not muted: %+v", BackupTrackName(row.ID), backupTrack)
	}
	source := fake.track("Chapter 1")
	if got, want := audioIn(backupTrack, 20, 280), audioIn(source, 20, 280); fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("the backup holds %v, want the source's %v", got[:3], want[:3])
	}
	if _, _, ok := backupTrack.span(); !ok || backupTrack.audio[19] != "" || backupTrack.audio[280] != "" {
		t.Errorf("the backup holds audio outside its window")
	}
	original := audioIn(source, 0, 300)

	// Damage the original, as an edit would, then restore.
	fake.mu.Lock()
	for s := 100; s < 140; s++ {
		source.audio[s] = "0"
	}
	fake.mu.Unlock()
	restored, err := backups.RestoreBackup(ctx, row.ID)
	if err != nil {
		t.Fatalf("RestoreBackup: %v", err)
	}
	if !restored.OK || !restored.Changed || restored.UndoSteps != 1 || restored.Message != "Restored 260 s of audio from the backup in Audacity." {
		t.Fatalf("RestoreBackup = %+v", restored)
	}
	if got := audioIn(fake.track("Chapter 1"), 0, 300); fmt.Sprint(got) != fmt.Sprint(original) {
		t.Fatalf("after the restore the source does not equal the original")
	}
	if fake.track(BackupTrackName(row.ID)) == nil || len(readTable(t, project).Backups) != 1 {
		t.Errorf("the restore removed the backup track or its row")
	}
}

func TestABackupIsClampedToTheProjectStartAndUsesAStereoTrackForStereo(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Narration", 0, 50, "n")
	fake.tracks[0].channels = 2
	now := time.Now()
	backups, project := backupsOver(t, fake, &now)
	backups.config.Window = 10
	result, err := backups.BackupAround(context.Background(), dawport.BackupRequest{GUID: "Narration", ChapterID: "c", Start: 3, End: 4})
	if err != nil || !result.OK {
		t.Fatalf("BackupAround = %+v, %v", result, err)
	}
	row := readTable(t, project).Backups[0]
	if row.Start != 0 || row.End != 14 || result.Message != "Backed up 14 s of audio in Audacity." {
		t.Errorf("window = [%v, %v], message %q; want [0, 14]", row.Start, row.End, result.Message)
	}
	if !strings.Contains(strings.Join(fake.commands(), "\n"), "NewStereoTrack:") {
		t.Errorf("a stereo source was backed up to a mono track: %v", fake.commands())
	}
}

// An unknown id refuses with a sentence and changes nothing.
func TestRestoreOfAnUnknownIDIsRefusedAndSendsNothing(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Now()
	backups, _ := backupsOver(t, fake, &now)
	for _, id := range []string{"{11111111-1111-4111-8111-111111111111}", "not-an-id", "", "../x"} {
		result, err := backups.RestoreBackup(context.Background(), id)
		if err != nil || result.OK || result.Changed || result.Refused != messageNoBackup || result.Code != "" {
			t.Errorf("RestoreBackup(%q) = %+v, %v; want refused with %q", id, result, err, messageNoBackup)
		}
	}
	for _, c := range fake.commands() {
		if !strings.HasPrefix(c, "GetInfo") {
			t.Errorf("a refused restore sent %q", c)
		}
	}
}

func TestABackupIsRefusedWithoutAProjectATrackOrAudio(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 30, "a")
	fake.addAudio("Twin", 0, 30, "b")
	fake.addAudio("Twin", 0, 30, "c")
	now := time.Now()
	backups, project := backupsOver(t, fake, &now)
	cases := []struct {
		name    string
		request dawport.BackupRequest
		refused string
		code    string
	}{
		{"a track that is gone", dawport.BackupRequest{GUID: "Chapter 2", ChapterID: "c", Start: 1, End: 2}, messageBackupNoTrack, dawport.CodeStale},
		{"two tracks with the name", dawport.BackupRequest{GUID: "Twin", ChapterID: "c", Start: 1, End: 2}, messageBackupTwoTracks, ""},
		{"no audio there", dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 500, End: 600}, messageBackupNoAudio, ""},
		{"a reversed range", dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 5, End: 2}, messageBackupBadRequest, ""},
		{"a negative time", dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: -1, End: 2}, messageBackupBadRequest, ""},
		{"no chapter", dawport.BackupRequest{GUID: "Chapter 1", Start: 1, End: 2}, messageBackupBadRequest, ""},
		{"a control character", dawport.BackupRequest{GUID: "Chapter\x001", ChapterID: "c", Start: 1, End: 2}, messageBackupBadRequest, ""},
		{"not a number", dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: math.NaN(), End: 2}, messageBackupBadRequest, ""},
	}
	for _, tc := range cases {
		result, err := backups.BackupAround(context.Background(), tc.request)
		if err != nil || result.OK || result.Changed || result.Refused != tc.refused || result.Code != tc.code {
			t.Errorf("%s: %+v, %v; want refused %q code %q", tc.name, result, err, tc.refused, tc.code)
		}
	}
	if _, err := os.Stat(BackupsFile(project)); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("a refused backup wrote the table: %v", err)
	}
	for _, c := range fake.commands() {
		if !strings.HasPrefix(c, "GetInfo") {
			t.Errorf("a refused backup sent %q", c)
		}
	}

	none := NewBackups(audacitybridge.New(fake.transport(), audacitybridge.Options{}), BackupsConfig{})
	relative := NewBackups(audacitybridge.New(fake.transport(), audacitybridge.Options{}), BackupsConfig{Project: func() string { return "project" }})
	for _, b := range []*Backups{none, relative} {
		r, err := b.BackupAround(context.Background(), dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 1, End: 2})
		if err != nil || r.Refused != messageBackupNoProject {
			t.Errorf("no project: %+v, %v", r, err)
		}
		r, err = b.RestoreBackup(context.Background(), "{11111111-1111-4111-8111-111111111111}")
		if err != nil || r.Refused != messageBackupNoProject {
			t.Errorf("no project, restore: %+v, %v", r, err)
		}
	}
}

func TestABackupThatAudacityRefusesWritesNoRow(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	fake.failOn = "Paste"
	now := time.Now()
	backups, project := backupsOver(t, fake, &now)
	_, err := backups.BackupAround(context.Background(), dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 10, End: 20})
	if !errors.Is(err, audacitybridge.ErrCommandFailed) {
		t.Fatalf("err = %v, want the failed command", err)
	}
	if _, err := os.Stat(BackupsFile(project)); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("a failed backup wrote a row: %v", err)
	}
}

// table-is-narrator-data, mirroring the bookmarks tests.
func TestACorruptTableIsKeptAsideAndAnEmptyOneStarts(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Now()
	backups, project := backupsOver(t, fake, &now)
	var notices []string
	backups.config.Reporter = &persist.Reporter{Notify: func(text string) { notices = append(notices, text) }}
	path := BackupsFile(project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := backups.BackupAround(context.Background(), dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 10, End: 20})
	if err != nil || !result.OK {
		t.Fatalf("BackupAround over a corrupt table = %+v, %v", result, err)
	}
	kept, _ := filepath.Glob(path + ".corrupt-*")
	if len(kept) != 1 {
		t.Fatalf("corrupt copies = %v, want one", kept)
	}
	if raw, _ := os.ReadFile(kept[0]); string(raw) != "{not json" {
		t.Errorf("the kept copy is %q", raw)
	}
	if len(readTable(t, project).Backups) != 1 || len(notices) != 1 {
		t.Errorf("table = %+v, notices = %v; want a fresh table with the new row and one notice", readTable(t, project), notices)
	}
}

func TestATableFromANewerAppIsRefusedAndNeverOverwritten(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Now()
	backups, project := backupsOver(t, fake, &now)
	path := BackupsFile(project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	newer := `{"schemaVersion": 2, "backups": [], "somethingNew": true}`
	if err := os.WriteFile(path, []byte(newer), 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := backups.BackupAround(context.Background(), dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 10, End: 20})
	if err != nil || result.OK || result.Refused != messageBackupsNewer {
		t.Errorf("BackupAround = %+v, %v; want refused with %q", result, err, messageBackupsNewer)
	}
	restored, err := backups.RestoreBackup(context.Background(), "{11111111-1111-4111-8111-111111111111}")
	if err != nil || restored.Refused != messageBackupsNewer {
		t.Errorf("RestoreBackup = %+v, %v", restored, err)
	}
	if _, err := backups.Prune(context.Background(), time.Hour); err == nil {
		t.Errorf("Prune over a newer table did not refuse")
	}
	if raw, _ := os.ReadFile(path); string(raw) != newer {
		t.Errorf("the newer table was overwritten: %s", raw)
	}
	for _, c := range fake.commands() {
		if !strings.HasPrefix(c, "GetInfo") {
			t.Errorf("a refused call sent %q", c)
		}
	}
}

func TestTheTableIsWrittenByATemporaryFileAndARename(t *testing.T) {
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Now()
	backups, project := backupsOver(t, fake, &now)
	if _, err := backups.BackupAround(context.Background(), dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 10, End: 20}); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Dir(BackupsFile(project)))
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	if fmt.Sprint(names) != "[backups.json]" {
		t.Errorf("the folder holds %v, want only backups.json (no temporary file left)", names)
	}
	// A temporary file in the way of the write is replaced, never read as the table.
	if err := os.Mkdir(BackupsFile(project)+".tmp", 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := backups.BackupAround(context.Background(), dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 30, End: 40}); err == nil {
		t.Errorf("a write that cannot make its temporary file succeeded")
	}
	if len(readTable(t, project).Backups) != 1 {
		t.Errorf("a failed write changed the table")
	}
}

// rows-are-validated-on-read
func TestARowThatBreaksARuleMakesTheTableCorrupt(t *testing.T) {
	good := `{"id":"{11111111-1111-4111-8111-111111111111}","guid":"Chapter 1","chapterId":"c","start":1,"end":2,"createdAt":"2026-10-12T09:00:00Z"}`
	bad := map[string]string{
		"an id that is not a GUID":  strings.Replace(good, `{11111111-1111-4111-8111-111111111111}`, `../../x`, 1),
		"a negative start":          strings.Replace(good, `"start":1`, `"start":-1`, 1),
		"a reversed window":         strings.Replace(good, `"start":1`, `"start":3`, 1),
		"an empty window":           strings.Replace(good, `"start":1`, `"start":2`, 1),
		"a control character":       strings.Replace(good, `"Chapter 1"`, `"Chapter\u00071"`, 1),
		"no chapter":                strings.Replace(good, `"chapterId":"c"`, `"chapterId":""`, 1),
		"no time":                   strings.Replace(good, `,"createdAt":"2026-10-12T09:00:00Z"`, ``, 1),
		"an unknown key":            strings.Replace(good, `"end":2`, `"end":2,"path":"C:/x"`, 1),
		"a duplicate id":            good + "," + good,
		"a time that is not finite": strings.Replace(good, `"end":2`, `"end":1e400`, 1),
		"too many rows":             strings.TrimSuffix(strings.Repeat(good+",", MaxBackups+1), ","),
		"a track name that is long": strings.Replace(good, `"Chapter 1"`, `"`+strings.Repeat("x", maxBackupTextBytes+1)+`"`, 1),
		"no version":                "",
	}
	for name, rows := range bad {
		t.Run(name, func(t *testing.T) {
			if name == "too many rows" {
				// Make the ids unique so only the count breaks the rule.
				var parts []string
				for i := range MaxBackups + 1 {
					parts = append(parts, strings.Replace(good, "111111111111}", fmt.Sprintf("%012X}", i), 1))
				}
				rows = strings.Join(parts, ",")
			}
			body := `{"schemaVersion":1,"backups":[` + rows + `]}`
			if name == "no version" {
				body = `{"backups":[` + good + `]}`
			}
			path := BackupsFile(t.TempDir())
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
				t.Fatal(err)
			}
			table, err := readBackups(path, nil)
			if err != nil || len(table.Backups) != 0 {
				t.Fatalf("readBackups = %+v, %v; want an empty table", table, err)
			}
			if kept, _ := filepath.Glob(path + ".corrupt-*"); len(kept) != 1 {
				t.Errorf("the file was not kept aside: %v", kept)
			}
		})
	}
	path := BackupsFile(t.TempDir())
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	_ = os.WriteFile(path, []byte(`{"schemaVersion":1,"backups":[`+good+`]}`), 0o600)
	if table, err := readBackups(path, nil); err != nil || len(table.Backups) != 1 {
		t.Errorf("a good table read as %+v, %v", table, err)
	}
}

// A row whose backup track Audacity no longer has reads back missing, and is never restored from a guess.
func TestARowWhoseTrackIsGoneIsMissingAndNotRestored(t *testing.T) {
	ctx := context.Background()
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Now()
	backups, _ := backupsOver(t, fake, &now)
	var ids []string
	for _, at := range []float64{10, 200} {
		if _, err := backups.BackupAround(ctx, dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: at, End: at + 1}); err != nil {
			t.Fatal(err)
		}
	}
	entries, err := backups.List(ctx)
	if err != nil || len(entries) != 2 || entries[0].Missing || entries[1].Missing {
		t.Fatalf("List = %+v, %v", entries, err)
	}
	for _, e := range entries {
		ids = append(ids, e.ID)
	}
	// The narrator deletes the first backup's track, and renames another track to look like it in all but the id.
	fake.mu.Lock()
	for i, tr := range fake.tracks {
		if tr.name == BackupTrackName(ids[0]) {
			fake.tracks = append(fake.tracks[:i], fake.tracks[i+1:]...)
			break
		}
	}
	fake.mu.Unlock()
	entries, err = backups.List(ctx)
	if err != nil || !entries[0].Missing || entries[1].Missing {
		t.Fatalf("List after the track went = %+v, %v", entries, err)
	}
	before := len(fake.commands())
	result, err := backups.RestoreBackup(ctx, ids[0])
	if err != nil || result.OK || result.Code != dawport.CodeStale || result.Refused != messageBackupTrackGone {
		t.Errorf("RestoreBackup of a missing track = %+v, %v", result, err)
	}
	for _, c := range fake.commands()[before:] {
		if !strings.HasPrefix(c, "GetInfo") {
			t.Errorf("a refused restore sent %q", c)
		}
	}
	// The source track gone is stale too.
	fake.mu.Lock()
	fake.tracks[0].name = "Renamed"
	fake.mu.Unlock()
	result, err = backups.RestoreBackup(ctx, ids[1])
	if err != nil || result.Code != dawport.CodeStale || result.Refused != messageBackupSourceGone {
		t.Errorf("RestoreBackup with the source gone = %+v, %v", result, err)
	}
}

// nothing-is-deleted-by-restore-or-prune: prune removes only rows older than the retention and the tracks they name.
func TestPruneRemovesOnlyRowsOlderThanTheRetentionAndTheirTracks(t *testing.T) {
	ctx := context.Background()
	fake := newPipeAudacity()
	fake.addAudio("Chapter 1", 0, 300, "a")
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	backups, project := backupsOver(t, fake, &now)
	var ids []string
	for i, day := range []int{1, 4, 9} {
		now = time.Date(2026, 10, day, 9, 0, 0, 0, time.UTC)
		if _, err := backups.BackupAround(ctx, dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "c", Start: 10, End: 11}); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, readTable(t, project).Backups[i].ID)
	}
	now = time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	// The narrator already deleted the oldest backup's track by hand.
	fake.mu.Lock()
	for i, tr := range fake.tracks {
		if tr.name == BackupTrackName(ids[0]) {
			fake.tracks = append(fake.tracks[:i], fake.tracks[i+1:]...)
			break
		}
	}
	fake.mu.Unlock()

	removed, err := backups.Prune(ctx, 7*24*time.Hour)
	if err != nil || fmt.Sprint(removed) != fmt.Sprint(ids[:2]) {
		t.Fatalf("Prune = %v, %v; want the two rows older than seven days, %v", removed, err, ids[:2])
	}
	table := readTable(t, project)
	if len(table.Backups) != 1 || table.Backups[0].ID != ids[2] {
		t.Errorf("table after the prune = %+v", table)
	}
	if fake.track(BackupTrackName(ids[1])) != nil || fake.track(BackupTrackName(ids[2])) == nil || fake.track("Chapter 1") == nil {
		t.Errorf("the prune removed the wrong tracks")
	}
	if removed, err := backups.Prune(ctx, 7*24*time.Hour); err != nil || len(removed) != 0 {
		t.Errorf("a second prune = %v, %v; want nothing", removed, err)
	}
	if _, err := backups.Prune(ctx, 0); err == nil {
		t.Errorf("a prune with no retention did not refuse")
	}
}

func TestNewBackupIDsAreGUIDShapedAndDistinct(t *testing.T) {
	seen := map[string]bool{}
	for range 100 {
		id := newBackupID()
		if !backupID.MatchString(id) || seen[id] {
			t.Fatalf("newBackupID = %q", id)
		}
		seen[id] = true
	}
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
