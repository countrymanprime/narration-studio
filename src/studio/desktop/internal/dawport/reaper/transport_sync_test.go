package reaper

import (
	"errors"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

func syncerAnswering(t *testing.T, answer func(command []string) [][]string) dawport.TransportSyncer {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	return adapter.Role(dawport.CapTransportSync).(dawport.TransportSyncer)
}

// transport_sync is the four commands of narration_transport.lua, Experimental and gated by its own capability. It is not destructive: it moves the
// transport and the edit cursor and changes no item.
func TestTransportSyncIsExperimentalAndEveryCommandBelongsToIt(t *testing.T) {
	if declares[dawport.CapTransportSync] != dawport.Experimental || depthOf(dawport.CapTransportSync).Destructive {
		t.Fatal("transport_sync must be an Experimental, non-destructive capability")
	}
	for _, command := range []string{"set_cursor", "play_from", "stop_play", "watch_transport"} {
		if commandCapability[command] != dawport.CapTransportSync || !bridge.Experimental(command) {
			t.Errorf("%s must be an Experimental command of transport_sync", command)
		}
	}
}

func TestTransportSyncTranslatesTheFourCalls(t *testing.T) {
	var seen []string
	syncer := syncerAnswering(t, func(command []string) [][]string {
		seen = append(seen, command[0])
		switch command[0] {
		case "set_cursor":
			return [][]string{{"CURSOR_SET", command[1], command[2]}}
		case "play_from":
			return [][]string{{"TRANSPORT_PLAYING", command[1], command[2]}}
		case "stop_play":
			return [][]string{{"TRANSPORT_STOPPED", command[1], "7.000000"}}
		default:
			return [][]string{{"TRANSPORT_WATCHING", command[1], command[2]}}
		}
	})
	if got, err := syncer.SetCursor(t.Context(), 12.5); err != nil || got != 12.5 {
		t.Fatalf("SetCursor = %v, %v", got, err)
	}
	if got, err := syncer.PlayFrom(t.Context(), 40); err != nil || got != 40 {
		t.Fatalf("PlayFrom = %v, %v", got, err)
	}
	if got, err := syncer.Stop(t.Context()); err != nil || got != 7 {
		t.Fatalf("Stop = %v, %v", got, err)
	}
	if got, err := syncer.Watch(t.Context(), 4*time.Second); err != nil || got != 4*time.Second {
		t.Fatalf("Watch = %v, %v", got, err)
	}
	if len(seen) != 4 {
		t.Fatalf("commands = %v", seen)
	}
}

func TestTransportSyncRefusesWithTheCapabilitysOwnSentenceBeforeAnythingIsSent(t *testing.T) {
	refused := "Experimental DAW actions are off. Turn them on in Settings to play from the app through the DAW."
	adapter, _ := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: refused}}
	})
	syncer := adapter.Role(dawport.CapTransportSync).(dawport.TransportSyncer)
	calls := map[string]func() error{
		"SetCursor": func() error { _, err := syncer.SetCursor(t.Context(), 1); return err },
		"PlayFrom":  func() error { _, err := syncer.PlayFrom(t.Context(), 1); return err },
		"Stop":      func() error { _, err := syncer.Stop(t.Context()); return err },
		"Watch":     func() error { _, err := syncer.Watch(t.Context(), time.Second); return err },
	}
	for name, call := range calls {
		err := call()
		if result, ok := dawport.RefusedFrom(err); !ok || result.Message != refused {
			t.Errorf("%s: err = %v, want the capability's own sentence", name, err)
		}
	}
}

func TestTransportSyncPassesARecordingRefusalOn(t *testing.T) {
	syncer := syncerAnswering(t, func(command []string) [][]string {
		return [][]string{{"ERROR", command[1], "REAPER is recording. Stop recording first."}}
	})
	if _, err := syncer.PlayFrom(t.Context(), 3); !errors.Is(err, bridge.ErrRecording) {
		t.Fatalf("err = %v, want bridge.ErrRecording", err)
	}
}
