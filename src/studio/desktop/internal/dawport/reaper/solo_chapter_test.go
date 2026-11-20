package reaper

import (
	"errors"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

func soloerAnswering(t *testing.T, allowed func(dawport.Capability) error, answer func(command []string) [][]string) dawport.ChapterSoloer {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, allowed)
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	soloer, ok := adapter.Role(dawport.CapFollowPosition).(dawport.ChapterSoloer)
	if !ok {
		t.Fatal("the follow_position role of REAPER must also solo a chapter")
	}
	return soloer
}

func TestSoloChapterIsAnExperimentalCommandOfFollowPositionAndAddsNoCapability(t *testing.T) {
	for _, command := range []string{"solo_chapter", "solo_restore"} {
		if commandCapability[command] != dawport.CapFollowPosition || !bridge.Experimental(command) {
			t.Errorf("%s must be an Experimental command of follow_position", command)
		}
	}
}

func TestSoloChapterSendsTheTrackAndSoloRestoreSendsNoArgument(t *testing.T) {
	soloer := soloerAnswering(t, func(dawport.Capability) error { return nil }, func(command []string) [][]string {
		if command[0] == "solo_chapter" {
			if len(command) != 3 || command[2] != "{G}" {
				t.Errorf("solo_chapter = %v", command)
			}
			return [][]string{{"CHAPTER_SOLOED", command[1], "{G}", "1", "0"}}
		}
		if command[0] != "solo_restore" || len(command) != 2 {
			t.Errorf("command = %v", command)
		}
		return [][]string{{"SOLO_RESTORED", command[1], "1", "0", "0"}}
	})
	soloed, err := soloer.SoloChapter(t.Context(), "{G}")
	if err != nil || !soloed.Changed || soloed.Waiting {
		t.Fatalf("SoloChapter = %+v, %v", soloed, err)
	}
	released, err := soloer.SoloRestore(t.Context())
	if err != nil || released.Restored != 1 {
		t.Fatalf("SoloRestore = %+v, %v", released, err)
	}
}

func TestSoloChapterWithNoTrackSendsNothing(t *testing.T) {
	soloer := soloerAnswering(t, func(dawport.Capability) error { return nil }, func(command []string) [][]string {
		t.Errorf("sent %v with no track", command)
		return nil
	})
	if _, err := soloer.SoloChapter(t.Context(), ""); err == nil {
		t.Fatal("a chapter with no track is an error")
	}
}

func TestSoloChapterAndRestoreAnswerTheCapabilitysRefusalFirst(t *testing.T) {
	refusal := errors.New("follow_position is off")
	soloer := soloerAnswering(t, func(dawport.Capability) error { return refusal }, func(command []string) [][]string {
		t.Errorf("sent %v past a refused capability", command)
		return nil
	})
	if _, err := soloer.SoloChapter(t.Context(), "{G}"); !errors.Is(err, refusal) {
		t.Errorf("SoloChapter err = %v, want the capability's refusal", err)
	}
	if _, err := soloer.SoloRestore(t.Context()); !errors.Is(err, refusal) {
		t.Errorf("SoloRestore err = %v, want the capability's refusal", err)
	}
}
