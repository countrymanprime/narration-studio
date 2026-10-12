package audacity

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	abt "github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// editAudacity is the backups' fake Audacity (pipeAudacity) with the edit commands the steps send: Split (no change to the fake's
// audio, which has no clips), SplitDelete (takes the selection out and leaves a gap), Delete (takes the selection out and moves
// what follows up), ApplyMacro (marks the selection's audio "fx:"), and PunchAndRoll (clears the selected track from the cursor on,
// as a recording over it would). They are answered as the published scripting reference documents them; what only a real
// Audacity can show is the owner's pass (docs/operations/audacity-verification-pass.md).
type editAudacity struct {
	*pipeAudacity
	macros  []string
	punched []float64
}

func newEditAudacity() *editAudacity { return &editAudacity{pipeAudacity: newPipeAudacity()} }

func (f *editAudacity) handle(line string) ([]string, bool) {
	cmd, err := abt.ParseCommand(line)
	if err != nil {
		return f.pipeAudacity.handle(line)
	}
	switch cmd.Name {
	case "Split", "SplitDelete", "Delete", "ApplyMacro", "PunchAndRoll":
	default:
		return f.pipeAudacity.handle(line)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.log = append(f.log, line)
	if f.failOn == cmd.Name {
		f.failOn = ""
		return []string{cmd.Name + " failed."}, false
	}
	t := f.selectedWave()
	if t == nil {
		return []string{"Select a track first."}, false
	}
	a, b := int(math.Floor(f.selStart)), int(math.Ceil(f.selEnd))
	switch cmd.Name {
	case "SplitDelete":
		for s := a; s < b; s++ {
			delete(t.audio, s)
		}
	case "Delete":
		next := map[int]string{}
		for s, v := range t.audio {
			switch {
			case s < a:
				next[s] = v
			case s >= b:
				next[s-(b-a)] = v
			}
		}
		t.audio = next
	case "ApplyMacro":
		f.macros = append(f.macros, cmd.Params["MacroName"])
		for s := a; s < b; s++ {
			if v, ok := t.audio[s]; ok {
				t.audio[s] = "fx:" + v
			}
		}
	case "PunchAndRoll":
		f.punched = append(f.punched, f.selStart)
		for s := range t.audio {
			if s >= a {
				delete(t.audio, s)
			}
		}
	}
	return nil, true
}

// transport serves the fake as pipeAudacity.transport does, through the edit commands first.
func (f *editAudacity) transport() audacitybridge.Transport {
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

// stepsOver is the adapter over fake, with backups kept in a fresh project folder (window 10 s); project false builds it with no
// project folder, so its backups can never be made.
func stepsOver(t *testing.T, fake *editAudacity, project bool) (*Adapter, string) {
	t.Helper()
	client := audacitybridge.New(fake.transport(), audacitybridge.Options{Timeout: 2 * time.Second})
	t.Cleanup(func() { _ = client.Close() })
	if !project {
		return New(client), ""
	}
	folder := t.TempDir()
	now := time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	return NewWithBackups(client, BackupsConfig{
		Project: func() string { return folder },
		Window:  10,
		Now:     func() time.Time { return now },
	}), folder
}

// commandNames is the name of each command in the log, in order.
func commandNames(log []string) []string {
	names := make([]string, 0, len(log))
	for _, line := range log {
		name, _, _ := strings.Cut(line, ":")
		names = append(names, name)
	}
	return names
}

// afterBackup is the commands sent after the backup's track was muted (the backup's last command), and whether there was one.
func afterBackup(log []string) ([]string, bool) {
	for i, line := range log {
		if strings.HasPrefix(line, "SetTrackAudio:") && strings.Contains(line, "Mute=1") {
			return log[i+1:], true
		}
	}
	return nil, false
}

// withoutReads drops GetInfo, which reads and changes nothing, from a list of command names.
func withoutReads(names []string) []string {
	return slices.DeleteFunc(slices.Clone(names), func(n string) bool { return n == "GetInfo" })
}

// editCommands are the commands that change the narrator's audio.
var editCommands = []string{"Split", "SplitDelete", "Delete", "ApplyMacro", "PunchAndRoll", "RemoveTracks"}

func editsIn(log []string) []string {
	var found []string
	for _, name := range commandNames(log) {
		if slices.Contains(editCommands, name) {
			found = append(found, name)
		}
	}
	return found
}

func onlyBackup(t *testing.T, project string) Backup {
	t.Helper()
	table := readTable(t, project)
	if len(table.Backups) != 1 {
		t.Fatalf("table has %d rows, want 1: %+v", len(table.Backups), table.Backups)
	}
	return table.Backups[0]
}

func cutRequest(start, end float64, mode dawport.CutMode) dawport.DeleteRangeRequest {
	return dawport.DeleteRangeRequest{
		RangeRequest: dawport.RangeRequest{ChapterID: "ch-1", ItemKey: "ps-1", ItemGUID: "Chapter 1", Start: start, End: end, Words: 3},
		Mode:         mode,
	}
}

func fxRequest(start, end float64, chain string) dawport.FXRangeRequest {
	return dawport.FXRangeRequest{
		RangeRequest: dawport.RangeRequest{ChapterID: "ch-1", ItemKey: "ps-1", ItemGUID: "Chapter 1", Start: start, End: end, Words: 2},
		ChainID:      chain, ChainName: chain,
	}
}

// stackRequest is one passage on Chapter 1: the first read at 10 to 18 s, a pause, and the later read at 20 to 28 s, so the read
// goes to 10 s and the audio from 28 s on moves up to 18 s (Shift -10).
func stackRequest() dawport.StackRequest {
	return dawport.StackRequest{ChapterID: "ch-1", Shift: -10, Groups: []dawport.StackGroup{{
		PassageID: "ps-1", ItemGUID: "Chapter 1", Base: "take-1",
		Moves: []dawport.StackMove{{TakeID: "take-2", From: 20, To: 10, Len: 8}},
	}}}
}

// unstackRequest moves stackRequest's read back.
func unstackRequest() dawport.StackRequest {
	return dawport.StackRequest{ChapterID: "ch-1", Shift: 10, Groups: []dawport.StackGroup{{
		PassageID: "ps-1", ItemGUID: "Chapter 1", Base: "take-1",
		Moves: []dawport.StackMove{{TakeID: "take-2", From: 10, To: 20, Len: 8}},
	}}}
}

func roles(a *Adapter) (dawport.Puncher, dawport.RangeCutter, dawport.RangeFXApplier, dawport.TakeStacker) {
	return a.Role(dawport.CapPunch).(dawport.Puncher), a.Role(dawport.CapCutRange).(dawport.RangeCutter),
		a.Role(dawport.CapFXRange).(dawport.RangeFXApplier), a.Role(dawport.CapStackTakes).(dawport.TakeStacker)
}

// every-edit-is-backed-up-first: each step implementation clones its window before its first edit, and the clone holds the audio
// as it was before the edit.
func TestEveryEditIsBackedUpFirst(t *testing.T) {
	cases := []struct {
		name  string
		start float64
		run   func(context.Context, *Adapter) (dawport.Result, error)
	}{
		{"cut close", 30, func(ctx context.Context, a *Adapter) (dawport.Result, error) {
			_, cut, _, _ := roles(a)
			return cut.DeleteRange(ctx, cutRequest(30, 33, dawport.CutClose))
		}},
		{"cut gap", 30, func(ctx context.Context, a *Adapter) (dawport.Result, error) {
			_, cut, _, _ := roles(a)
			return cut.DeleteRange(ctx, cutRequest(30, 33, dawport.CutGap))
		}},
		{"effect", 30, func(ctx context.Context, a *Adapter) (dawport.Result, error) {
			_, _, fx, _ := roles(a)
			return fx.ApplyFXToRange(ctx, fxRequest(30, 33, "Warm voice"))
		}},
		{"stack", 10, func(ctx context.Context, a *Adapter) (dawport.Result, error) {
			_, _, _, stack := roles(a)
			return stack.StackTakes(ctx, stackRequest())
		}},
		{"roll", 30, func(ctx context.Context, a *Adapter) (dawport.Result, error) {
			roll, _, _, _ := roles(a)
			return roll.Roll(ctx, "Chapter 1", 30)
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fake := newEditAudacity()
			fake.addAudio("Chapter 1", 0, 60, "a")
			original := audioIn(fake.track("Chapter 1"), 0, 60)
			adapter, project := stepsOver(t, fake, true)
			result, err := c.run(t.Context(), adapter)
			if err != nil || !result.OK {
				t.Fatalf("%s = %+v, %v", c.name, result, err)
			}
			log := fake.commands()
			after, ok := afterBackup(log)
			if !ok {
				t.Fatalf("no backup was made: %v", commandNames(log))
			}
			if before := editsIn(log[:len(log)-len(after)]); len(before) != 0 {
				t.Errorf("edits %v were sent before the backup was complete", before)
			}
			if len(editsIn(after)) == 0 {
				t.Errorf("no edit was sent after the backup: %v", commandNames(after))
			}
			row := onlyBackup(t, project)
			if row.GUID != "Chapter 1" || row.Start > c.start {
				t.Errorf("row = %+v, want the window on Chapter 1 from %v s or earlier", row, c.start)
			}
			backup := fake.track(BackupTrackName(row.ID))
			if backup == nil || !backup.muted {
				t.Fatalf("the backup track is missing or not muted")
			}
			a, b := int(row.Start), int(row.End)
			if got, want := audioIn(backup, a, b), original[a:b]; fmt.Sprint(got) != fmt.Sprint(want) {
				t.Errorf("the backup holds %v, want the audio before the edit %v", got, want)
			}
		})
	}
}

// A backup that fails stops the edit: Audacity's error is returned, a refusal is answered as it is, and no edit is sent.
func TestAnEditStopsWhenItsBackupFails(t *testing.T) {
	fake := newEditAudacity()
	fake.addAudio("Chapter 1", 0, 60, "a")
	fake.failOn = "Copy"
	adapter, project := stepsOver(t, fake, true)
	_, cut, _, _ := roles(adapter)
	if _, err := cut.DeleteRange(t.Context(), cutRequest(30, 33, dawport.CutClose)); err == nil {
		t.Fatal("a backup Audacity refused did not stop the cut")
	}
	if got := editsIn(fake.commands()); len(got) != 0 {
		t.Errorf("edits %v were sent after the backup failed", got)
	}
	if _, err := os.Stat(BackupsFile(project)); err == nil && len(readTable(t, project).Backups) != 0 {
		t.Errorf("a row was written for a failed backup")
	}

	full := backupsTable{SchemaVersion: BackupsSchemaVersion}
	for range MaxBackups {
		full.Backups = append(full.Backups, Backup{ID: newBackupID(), GUID: "Chapter 1", ChapterID: "ch-1", Start: 0, End: 1, CreatedAt: time.Now().UTC()})
	}
	if err := os.MkdirAll(filepath.Dir(BackupsFile(project)), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := writeBackups(BackupsFile(project), full); err != nil {
		t.Fatal(err)
	}
	fake.log = nil
	_, _, fx, _ := roles(adapter)
	result, err := fx.ApplyFXToRange(t.Context(), fxRequest(30, 33, "Warm voice"))
	if err != nil || result.OK || result.Refused != messageBackupTableFull {
		t.Errorf("ApplyFXToRange with a full table = %+v, %v; want the backup's refusal", result, err)
	}
	if got := editsIn(fake.commands()); len(got) != 0 {
		t.Errorf("edits %v were sent after the backup was refused", got)
	}
}

// result-lists-the-steps-in-order: Steps are the edits in the order of the log, UndoSteps counts the undo points they add, and the
// audio is what each edit says.
func TestResultListsTheStepsInOrder(t *testing.T) {
	t.Run("cut close", func(t *testing.T) {
		fake := newEditAudacity()
		fake.addAudio("Chapter 1", 0, 60, "a")
		adapter, _ := stepsOver(t, fake, true)
		_, cut, _, _ := roles(adapter)
		result, err := cut.DeleteRange(t.Context(), cutRequest(30, 33, dawport.CutClose))
		want := dawport.Result{OK: true, Changed: true, Message: "Deleted 3 words and their audio in Audacity.", UndoSteps: 2,
			Steps: []string{stepSelectWords, stepDeleteWords, stepCloseUp}}
		if err != nil || fmt.Sprint(result) != fmt.Sprint(want) {
			t.Fatalf("DeleteRange = %+v, %v; want %+v", result, err, want)
		}
		after, _ := afterBackup(fake.commands())
		if got := withoutReads(commandNames(after)); fmt.Sprint(got) != "[SelectTracks SelectTime SplitDelete Delete]" {
			t.Errorf("the cut sent %v", got)
		}
		source := fake.track("Chapter 1")
		if source.audio[29] != "a29" || source.audio[30] != "a33" || source.audio[56] != "a59" || source.audio[57] != "" {
			t.Errorf("after the cut, 29..30 s hold %q %q and 56..57 s %q %q; want a29 a33 a59 and nothing", source.audio[29],
				source.audio[30], source.audio[56], source.audio[57])
		}
	})
	t.Run("cut gap", func(t *testing.T) {
		fake := newEditAudacity()
		fake.addAudio("Chapter 1", 0, 60, "a")
		adapter, _ := stepsOver(t, fake, true)
		_, cut, _, _ := roles(adapter)
		result, err := cut.DeleteRange(t.Context(), cutRequest(30, 33, dawport.CutGap))
		if err != nil || !result.OK || result.UndoSteps != 1 || !slices.Equal(result.Steps, []string{stepSelectWords, stepDeleteLeaveGap}) {
			t.Fatalf("DeleteRange gap = %+v, %v", result, err)
		}
		source := fake.track("Chapter 1")
		if source.audio[30] != "" || source.audio[32] != "" || source.audio[33] != "a33" {
			t.Errorf("the gap cut moved or kept audio: 30 %q, 32 %q, 33 %q", source.audio[30], source.audio[32], source.audio[33])
		}
	})
	t.Run("effect", func(t *testing.T) {
		fake := newEditAudacity()
		fake.addAudio("Chapter 1", 0, 60, "a")
		adapter, _ := stepsOver(t, fake, true)
		_, _, fx, _ := roles(adapter)
		result, err := fx.ApplyFXToRange(t.Context(), fxRequest(30, 33, "Warm voice"))
		want := dawport.Result{OK: true, Changed: true, Message: "Added Warm voice to 2 words in Audacity.", UndoSteps: 2,
			Steps: []string{stepSelectWords, stepSplitEnds, "Apply the macro Warm voice"}}
		if err != nil || fmt.Sprint(result) != fmt.Sprint(want) {
			t.Fatalf("ApplyFXToRange = %+v, %v; want %+v", result, err, want)
		}
		after, _ := afterBackup(fake.commands())
		if got := withoutReads(commandNames(after)); fmt.Sprint(got) != "[SelectTracks SelectTime Split ApplyMacro]" {
			t.Errorf("the effect sent %v", got)
		}
		source := fake.track("Chapter 1")
		if !slices.Equal(fake.macros, []string{"Warm voice"}) || source.audio[29] != "a29" || source.audio[30] != "fx:a30" ||
			source.audio[32] != "fx:a32" || source.audio[33] != "a33" {
			t.Errorf("macros %v; audio 29..33 = %v", fake.macros, audioIn(source, 29, 34))
		}
	})
	t.Run("stack", func(t *testing.T) {
		fake := newEditAudacity()
		fake.addAudio("Chapter 1", 0, 60, "a")
		adapter, project := stepsOver(t, fake, true)
		_, _, _, stack := roles(adapter)
		result, err := stack.StackTakes(t.Context(), stackRequest())
		want := dawport.Result{OK: true, Changed: true, Message: "Stacked 1 take in Audacity. Done in 5 steps.", UndoSteps: 5,
			Steps: []string{
				"Add a take track",
				"Paste each later read into it",
				"Split at the point where the reads line up",
				"Shift the audio that follows to close the gap",
				"Mute the reads that are not on top",
			}}
		if err != nil || fmt.Sprint(result) != fmt.Sprint(want) {
			t.Fatalf("StackTakes = %+v, %v; want %+v", result, err, want)
		}
		after, _ := afterBackup(fake.commands())
		wantLog := "[NewMonoTrack SetTrackStatus SelectTracks SelectTime Copy SelectTracks SelectTime Paste " +
			"SelectTracks SelectTime Split Delete SetTrackAudio]"
		if got := withoutReads(commandNames(after)); fmt.Sprint(got) != wantLog {
			t.Errorf("the stack sent %v, want %v", got, wantLog)
		}
		row := onlyBackup(t, project)
		take := fake.track(takeTrackName("take-2", 20, row.ID))
		if take == nil || !take.muted {
			t.Fatalf("no muted take track %q", takeTrackName("take-2", 20, row.ID))
		}
		if got := audioIn(take, 10, 18); fmt.Sprint(got) != fmt.Sprint(audioIn(fake.track(BackupTrackName(row.ID)), 20, 28)) {
			t.Errorf("the take track holds %v at 10 s, want the later read", got)
		}
		source := fake.track("Chapter 1")
		if source.audio[17] != "a17" || source.audio[18] != "a28" || source.audio[49] != "a59" || source.audio[50] != "" {
			t.Errorf("after the stack, 17..18 s hold %q %q and 49..50 s %q %q; want a17 a28 a59 and nothing", source.audio[17],
				source.audio[18], source.audio[49], source.audio[50])
		}
	})
}

// unstack-restores-by-recorded-offsets: a stack and an un-stack put the audio back as it was, and remove the take tracks.
func TestUnstackRestoresByRecordedOffsets(t *testing.T) {
	fake := newEditAudacity()
	fake.addAudio("Chapter 1", 0, 60, "a")
	original := audioIn(fake.track("Chapter 1"), 0, 60)
	adapter, project := stepsOver(t, fake, true)
	_, _, _, stack := roles(adapter)
	if result, err := stack.StackTakes(t.Context(), stackRequest()); err != nil || !result.OK {
		t.Fatalf("StackTakes = %+v, %v", result, err)
	}
	stacked := onlyBackup(t, project)
	result, err := stack.UnstackTakes(t.Context(), unstackRequest())
	want := dawport.Result{OK: true, Changed: true, Message: "Moved back 1 take in Audacity. Done in 2 steps.", UndoSteps: 2,
		Steps: []string{stepPutReadsBack, stepRemoveTakeTracks}}
	if err != nil || fmt.Sprint(result) != fmt.Sprint(want) {
		t.Fatalf("UnstackTakes = %+v, %v; want %+v", result, err, want)
	}
	if got := audioIn(fake.track("Chapter 1"), 0, 60); fmt.Sprint(got) != fmt.Sprint(original) {
		t.Errorf("after the un-stack the chapter is %v, want %v", got, original)
	}
	if fake.track(takeTrackName("take-2", 20, stacked.ID)) != nil {
		t.Errorf("the take track is still there")
	}
	if rows := readTable(t, project).Backups; len(rows) != 2 || fake.track(BackupTrackName(stacked.ID)) == nil {
		t.Errorf("the un-stack did not back up, or removed the stack's backup: %d rows", len(rows))
	}
}

// A take moved by hand since it was stacked, a take track that is gone, or a plan that no longer matches what the take track
// recorded is refused, and nothing is backed up or changed.
func TestUnstackRefusesATakeMovedByHand(t *testing.T) {
	stacked := func(t *testing.T) (*editAudacity, dawport.TakeStacker, string, Backup) {
		fake := newEditAudacity()
		fake.addAudio("Chapter 1", 0, 60, "a")
		adapter, project := stepsOver(t, fake, true)
		_, _, _, stack := roles(adapter)
		if result, err := stack.StackTakes(t.Context(), stackRequest()); err != nil || !result.OK {
			t.Fatalf("StackTakes = %+v, %v", result, err)
		}
		fake.log = nil
		return fake, stack, project, onlyBackup(t, project)
	}
	t.Run("moved", func(t *testing.T) {
		fake, stack, project, row := stacked(t)
		take := fake.track(takeTrackName("take-2", 20, row.ID))
		fake.mu.Lock()
		moved := map[int]string{}
		for s, v := range take.audio {
			moved[s+3] = v
		}
		take.audio = moved
		fake.mu.Unlock()
		result, err := stack.UnstackTakes(t.Context(), unstackRequest())
		if err != nil || result.OK || result.Code != dawport.CodeStale || result.Refused != messageTakeMoved {
			t.Errorf("UnstackTakes = %+v, %v; want the moved-take refusal", result, err)
		}
		if got := editsIn(fake.commands()); len(got) != 0 || len(readTable(t, project).Backups) != 1 {
			t.Errorf("a refused un-stack sent %v or backed up", got)
		}
	})
	t.Run("gone", func(t *testing.T) {
		fake, stack, _, row := stacked(t)
		fake.track(takeTrackName("take-2", 20, row.ID)).name = "renamed"
		result, err := stack.UnstackTakes(t.Context(), unstackRequest())
		if err != nil || result.Code != dawport.CodeStale || result.Refused != messageTakeGone {
			t.Errorf("UnstackTakes = %+v, %v; want the take-gone refusal", result, err)
		}
	})
	t.Run("recorded elsewhere", func(t *testing.T) {
		fake, stack, _, _ := stacked(t)
		request := unstackRequest()
		request.Groups[0].Moves[0].To = 25
		request.Shift = 15
		result, err := stack.UnstackTakes(t.Context(), request)
		if err != nil || result.OK || result.Refused != messageUnstackChanged {
			t.Errorf("UnstackTakes to another spot = %+v, %v; want the plan-changed refusal", result, err)
		}
		if got := editsIn(fake.commands()); len(got) != 0 {
			t.Errorf("a refused un-stack sent %v", got)
		}
	})
	t.Run("backup gone", func(t *testing.T) {
		fake, stack, _, row := stacked(t)
		fake.track(BackupTrackName(row.ID)).name = "renamed"
		result, err := stack.UnstackTakes(t.Context(), unstackRequest())
		if err != nil || result.Code != dawport.CodeStale || result.Refused != messageStackBackupGone {
			t.Errorf("UnstackTakes = %+v, %v; want the backup-gone refusal", result, err)
		}
	})
}

// refusals-without-backups: an adapter that cannot make a backup refuses a cut, an effect, a stack and an un-stack with the
// capability's sentence, and sends nothing to the pipe.
func TestRefusalsWithoutBackups(t *testing.T) {
	fake := newEditAudacity()
	fake.addAudio("Chapter 1", 0, 60, "a")
	adapter, _ := stepsOver(t, fake, false)
	_, cut, fx, stack := roles(adapter)
	ctx := t.Context()
	check := func(name, want string, result dawport.Result, err error) {
		t.Helper()
		if err != nil || result.OK || result.Refused != want {
			t.Errorf("%s = %+v, %v; want Refused %q", name, result, err, want)
		}
	}
	result, err := cut.DeleteRange(ctx, cutRequest(30, 33, dawport.CutClose))
	check("DeleteRange", "Cutting words and their audio needs Audacity backups. Turn on Audio backups in Settings.", result, err)
	result, err = fx.ApplyFXToRange(ctx, fxRequest(30, 33, "Warm voice"))
	check("ApplyFXToRange", "Adding an effect to words needs Audacity backups. Turn on Audio backups in Settings.", result, err)
	result, err = stack.StackTakes(ctx, stackRequest())
	check("StackTakes", "Stacking takes needs Audacity backups. Turn on Audio backups in Settings.", result, err)
	result, err = stack.UnstackTakes(ctx, unstackRequest())
	check("UnstackTakes", "Stacking takes needs Audacity backups. Turn on Audio backups in Settings.", result, err)
	if log := fake.commands(); len(log) != 0 {
		t.Errorf("refusals sent %v", log)
	}
}

// stale-and-bounds: a track that is gone is stale, and a range that is empty, reversed or outside the track's audio is refused,
// all before a backup or an edit; a row already in the table is kept.
func TestStaleAndBounds(t *testing.T) {
	fake := newEditAudacity()
	fake.addAudio("Chapter 1", 0, 60, "a")
	adapter, project := stepsOver(t, fake, true)
	roll, cut, fx, stack := roles(adapter)
	ctx := t.Context()
	if result, err := adapter.Backups().BackupAround(ctx, dawport.BackupRequest{GUID: "Chapter 1", ChapterID: "ch-1", Start: 1, End: 2}); err != nil || !result.OK {
		t.Fatalf("BackupAround = %+v, %v", result, err)
	}
	fake.log = nil

	gone := cutRequest(30, 33, dawport.CutClose)
	gone.ItemGUID = "Chapter 9"
	goneFX := fxRequest(30, 33, "Warm voice")
	goneFX.ItemGUID = "Chapter 9"
	goneStack := stackRequest()
	goneStack.Groups[0].ItemGUID = "Chapter 9"
	stale := map[string]func() (dawport.Result, error){
		"DeleteRange":    func() (dawport.Result, error) { return cut.DeleteRange(ctx, gone) },
		"ApplyFXToRange": func() (dawport.Result, error) { return fx.ApplyFXToRange(ctx, goneFX) },
		"StackTakes":     func() (dawport.Result, error) { return stack.StackTakes(ctx, goneStack) },
		"Roll":           func() (dawport.Result, error) { return roll.Roll(ctx, "Chapter 9", 30) },
	}
	fake.log = nil
	if result, err := roll.Roll(ctx, "Chapter 9", 30); err != nil || result.Code != dawport.CodeStale {
		t.Errorf("Roll on a track that is gone = %+v, %v", result, err)
	}
	if got := withoutReads(commandNames(fake.commands())); len(got) != 0 {
		t.Errorf("a roll on a track that is gone sent %v; the recording must not be stopped", got)
	}
	for name, call := range stale {
		result, err := call()
		if err != nil || result.OK || result.Code != dawport.CodeStale || result.Refused != messageStepTrackGone {
			t.Errorf("%s on a track that is gone = %+v, %v; want RefusedStale", name, result, err)
		}
	}

	bad := map[string]dawport.DeleteRangeRequest{
		"empty":    cutRequest(30, 30, dawport.CutClose),
		"reversed": cutRequest(33, 30, dawport.CutClose),
		"negative": cutRequest(-1, 3, dawport.CutClose),
		"NaN":      cutRequest(math.NaN(), 3, dawport.CutClose),
		"mode":     cutRequest(30, 33, "shuffle"),
	}
	for name, request := range bad {
		if result, err := cut.DeleteRange(ctx, request); err != nil || result.OK || result.Code != "" {
			t.Errorf("DeleteRange %s = %+v, %v; want Refused", name, result, err)
		}
	}
	if result, err := cut.DeleteRange(ctx, cutRequest(58, 65, dawport.CutClose)); err != nil || result.Refused != messageRangeOutside {
		t.Errorf("DeleteRange past the audio = %+v, %v", result, err)
	}
	if result, err := fx.ApplyFXToRange(ctx, fxRequest(30, 33, "")); err != nil || result.Refused != messageNoMacro {
		t.Errorf("ApplyFXToRange with no macro = %+v, %v", result, err)
	}
	if result, err := fx.ApplyFXToRange(ctx, fxRequest(30, 33, `Say "hi"`)); err != nil || result.Refused != messageNoMacro {
		t.Errorf("ApplyFXToRange with a macro name the pipe cannot carry = %+v, %v", result, err)
	}
	if result, err := roll.Roll(ctx, "Chapter 1", 75); err != nil || result.Refused != messageRollOutside {
		t.Errorf("Roll past the audio = %+v, %v", result, err)
	}

	two := stackRequest()
	two.Groups = append(two.Groups, two.Groups[0])
	longer := stackRequest()
	longer.Groups[0].Moves[0].Len = 12
	longer.Shift = -14
	wrongSpot := stackRequest()
	wrongSpot.Groups[0].Moves = append(wrongSpot.Groups[0].Moves, dawport.StackMove{TakeID: "take-3", From: 30, To: 11, Len: 5})
	wrongSign := stackRequest()
	wrongSign.Shift = 4
	for name, request := range map[string]dawport.StackRequest{
		"no group": {ChapterID: "ch-1", Shift: -1}, "two groups": two, "read longer than the first": longer,
		"another spot": wrongSpot, "wrong sign": wrongSign,
	} {
		if result, err := stack.StackTakes(ctx, request); err != nil || result.OK {
			t.Errorf("StackTakes %s = %+v, %v; want Refused", name, result, err)
		}
	}

	if got := editsIn(fake.commands()); len(got) != 0 {
		t.Errorf("refused calls sent edits %v", got)
	}
	if rows := readTable(t, project).Backups; len(rows) != 1 {
		t.Errorf("refused calls changed the table: %d rows, want the one row kept", len(rows))
	}
}

// roll-is-non-destructive-with-backups: Roll backs up from the roll point to the end of the track, then records again with
// Punch and Roll; with no backups it rolls without one, as the destructive capability the page confirmed says.
func TestRollBacksUpFromTheRollPointThenRecordsAgain(t *testing.T) {
	fake := newEditAudacity()
	fake.addAudio("Chapter 1", 0, 60, "a")
	adapter, project := stepsOver(t, fake, true)
	roll, _, _, _ := roles(adapter)
	result, err := roll.Roll(t.Context(), "Chapter 1", 30)
	want := dawport.Result{OK: true, Changed: true, Message: "Rolled again in Audacity from 0:30. The earlier audio from there on is in Backups.",
		Steps: []string{stepStopRecording, stepRollCursor, stepPunchAndRoll}}
	if err != nil || fmt.Sprint(result) != fmt.Sprint(want) {
		t.Fatalf("Roll = %+v, %v; want %+v", result, err, want)
	}
	row := onlyBackup(t, project)
	if row.Start != 20 || row.End != 60 || row.Label != "Roll again from 0:30" {
		t.Errorf("row = %+v, want 20 to 60 s labelled for the roll", row)
	}
	names := withoutReads(commandNames(fake.commands()))
	if names[0] != "Stop" || names[len(names)-1] != "PunchAndRoll" || !slices.Equal(fake.punched, []float64{30}) {
		t.Errorf("the roll sent %v, punched at %v", names, fake.punched)
	}

	destructive := newEditAudacity()
	destructive.addAudio("Chapter 1", 0, 60, "a")
	plain, _ := stepsOver(t, destructive, false)
	roll, _, _, _ = roles(plain)
	result, err = roll.Roll(t.Context(), "Chapter 1", 30)
	if err != nil || !result.OK || result.Message != "Rolled again in Audacity from 0:30. The audio from there on was replaced." {
		t.Fatalf("Roll without backups = %+v, %v", result, err)
	}
	if got := commandNames(destructive.commands()); slices.Contains(got, "Copy") || !slices.Equal(destructive.punched, []float64{30}) {
		t.Errorf("a roll without backups sent %v", got)
	}

	on := audacityWith(adapter, dawport.ToggleOn).Support(dawport.CapPunch)
	if !on.Available || on.Destructive {
		t.Errorf("with backups on, punch = %+v, want available and not destructive", on)
	}
}

// Removing an effect from part of a track is not something Audacity can do; the role says how to put the audio back instead.
func TestRemovingAnEffectPointsToTheBackup(t *testing.T) {
	fake := newEditAudacity()
	adapter, _ := stepsOver(t, fake, true)
	_, _, fx, _ := roles(adapter)
	result, err := fx.RemoveFXFromRange(t.Context(), "Chapter 1", "Warm voice")
	if err != nil || result.OK || result.Refused != messageRemoveFX {
		t.Errorf("RemoveFXFromRange = %+v, %v", result, err)
	}
	if log := fake.commands(); len(log) != 0 {
		t.Errorf("RemoveFXFromRange sent %v", log)
	}
}
