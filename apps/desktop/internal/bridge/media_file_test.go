package bridge

import (
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// mediaFile writes a small file named name in a fresh folder and returns its path.
func mediaFile(t *testing.T, name string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte("RIFF....WAVE"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// mediaFileAnswer is what media_file_test.lua pins for each command.
func mediaFileAnswer(command []string) [][]string {
	switch command[1] {
	case "preview_file_range":
		return [][]string{{"FILE_PREVIEW_STARTED", run(command), command[3], "12.500000", "5.000000"}}
	case "stop_file_preview":
		return [][]string{{"FILE_PREVIEW_STOPPED", run(command), "1"}}
	case "reveal_file":
		return [][]string{{"FILE_REVEALED", run(command), command[3]}}
	}
	return nil
}

func TestTheFileCommandsAreRefusedWhileTheirSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, mediaFileAnswer)
	path := mediaFile(t, "Chapter 01.wav")
	ctx := context.Background()
	if _, err := actions.PreviewFileRange(ctx, FilePreview{Path: path, Start: 1, Length: 5}); !errors.Is(err, ErrExperimentalOff) {
		t.Errorf("preview: err = %v, want ErrExperimentalOff", err)
	}
	if _, err := actions.StopFilePreview(ctx); !errors.Is(err, ErrExperimentalOff) {
		t.Errorf("stop: err = %v, want ErrExperimentalOff", err)
	}
	if _, err := actions.RevealFile(ctx, path); !errors.Is(err, ErrExperimentalOff) {
		t.Errorf("reveal: err = %v, want ErrExperimentalOff", err)
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a command was written while the setting is off: %v", got)
	}
	for _, command := range []string{"preview_file_range", "stop_file_preview", "reveal_file"} {
		if !Experimental(command) {
			t.Errorf("%s must stay experimental until the verification pass has confirmed it", command)
		}
	}
}

func TestPreviewFileRangeSendsThePathAndStretchAndReadsBackWhatPlays(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, mediaFileAnswer)
	path := mediaFile(t, "Chapter 01.wav")
	got, err := actions.PreviewFileRange(context.Background(), FilePreview{Path: path, Start: 12.5, Length: 5})
	if err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	if len(commands) != 1 || commands[0][1] != "preview_file_range" || commands[0][3] != path || commands[0][4] != "12.500000" || commands[0][5] != "5.000000" {
		t.Fatalf("commands = %v, want one preview_file_range naming the path, start and length", commands)
	}
	if got != (FilePreviewStarted{Path: path, Start: 12.5, Length: 5}) {
		t.Fatalf("got %+v", got)
	}
}

func TestStopFilePreviewSaysWhetherAPreviewWasPlaying(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	stopped := "1"
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"FILE_PREVIEW_STOPPED", run(command), stopped}}
	})
	got, err := actions.StopFilePreview(context.Background())
	if err != nil || !got.Stopped {
		t.Fatalf("got %+v, %v; want stopped", got, err)
	}
	stopped = "0"
	got, err = actions.StopFilePreview(context.Background())
	if err != nil || got.Stopped {
		t.Fatalf("got %+v, %v; want nothing stopped", got, err)
	}
}

func TestRevealFileSendsThePathAndReadsItBack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, mediaFileAnswer)
	path := mediaFile(t, "Chapter 01.flac")
	got, err := actions.RevealFile(context.Background(), path)
	if err != nil || got.Path != path {
		t.Fatalf("got %+v, %v", got, err)
	}
	if commands := fake.commands(); len(commands) != 1 || commands[0][1] != "reveal_file" || commands[0][3] != path {
		t.Fatalf("commands = %v", commands)
	}
}

// The host checks a path before it is sent: the script checks it again, but a path that never reaches REAPER cannot be
// misread there.
func TestAFileCommandRefusesAPathThatIsNotALocalAudioFileAndSendsNothing(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, mediaFileAnswer)
	folder := t.TempDir()
	text := mediaFile(t, "notes.txt")
	cases := map[string]error{
		"":                                ErrNotMediaFile,
		"Chapter 01.wav":                  ErrNotMediaFile,
		`\\server\share\Chapter 01.wav`:   ErrNotMediaFile,
		"//server/share/Chapter 01.wav":   ErrNotMediaFile,
		folder + "/x/../Chapter 01.wav":   ErrNotMediaFile,
		text:                              ErrNotMediaFile,
		folder:                            ErrNotMediaFile,
		filepath.Join(folder, "Gone.wav"): ErrMediaFileGone,
	}
	if err := os.Mkdir(filepath.Join(folder, "Folder.wav"), 0o700); err != nil {
		t.Fatal(err)
	}
	cases[filepath.Join(folder, "Folder.wav")] = ErrNotMediaFile
	ctx := context.Background()
	for path, want := range cases {
		if _, err := actions.PreviewFileRange(ctx, FilePreview{Path: path, Start: 0, Length: 5}); !errors.Is(err, want) {
			t.Errorf("preview %q: err = %v, want %v", path, err, want)
		}
		if _, err := actions.RevealFile(ctx, path); !errors.Is(err, want) {
			t.Errorf("reveal %q: err = %v, want %v", path, err, want)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a refused path was sent: %v", got)
	}
}

func TestPreviewFileRangeRefusesAStretchThatIsNotUsableAndSendsNothing(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, mediaFileAnswer)
	path := mediaFile(t, "Chapter 01.wav")
	for _, c := range []FilePreview{
		{Start: -1, Length: 5}, {Start: math.NaN(), Length: 5}, {Start: math.Inf(1), Length: 5},
		{Start: 0, Length: 0}, {Start: 0, Length: -1}, {Start: 0, Length: MaxPreviewSeconds + 0.5}, {Start: 0, Length: math.NaN()},
	} {
		c.Path = path
		if _, err := actions.PreviewFileRange(context.Background(), c); !errors.Is(err, ErrBadPreviewRange) {
			t.Errorf("%+v: err = %v, want ErrBadPreviewRange", c, err)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a refused stretch was sent: %v", got)
	}
}

// The script's refusals, in its own words (narration_media_file.lua), are told apart so the host can word them.
func TestTheScriptsFileRefusalsAreToldApart(t *testing.T) {
	cases := map[string]error{
		"That is not an audio file this app can play or show.":          ErrNotMediaFile,
		"The file is not there any more.":                               ErrMediaFileGone,
		"The stretch to play is not a usable number of seconds.":        ErrBadPreviewRange,
		"The stretch starts after the end of the file.":                 ErrPreviewPastEnd,
		"REAPER is recording. Stop recording first.":                    ErrRecording,
		"Playing part of a file needs the SWS extension in REAPER.":     ErrPreviewUnsupported,
		"REAPER could not open the file to play it.":                    ErrMediaFileUnreadable,
		"This REAPER version cannot show a file in its Media Explorer.": ErrRevealUnsupported,
	}
	path := mediaFile(t, "Chapter 01.wav")
	for sentence, want := range cases {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{{"ERROR", run(command), sentence}}
		})
		if _, err := actions.PreviewFileRange(context.Background(), FilePreview{Path: path, Start: 0, Length: 5}); !errors.Is(err, want) {
			t.Errorf("%q: err = %v, want %v", sentence, err, want)
		}
	}
}

func TestAFileCommandSaysWhenTheScriptIsOlderThanTheApp(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "Unsupported workspace command"}}
	})
	if _, err := actions.RevealFile(context.Background(), mediaFile(t, "Chapter 01.wav")); !errors.Is(err, ErrScriptOutdated) {
		t.Fatalf("err = %v, want ErrScriptOutdated", err)
	}
}
