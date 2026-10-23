package audacity

import (
	"errors"
	"strings"
	"testing"

	"desktop/internal/audacitybridge"
	abt "desktop/internal/audacitybridge/audacitybridgetest"
	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

var _ dawport.TrackCreator = (*Session)(nil)

func TestCreateTrackAddsANamedAudioTrackLastAndAnswersTheIDTheOtherRolesFindItBy(t *testing.T) {
	session, server := placesProject(t)
	ctx := t.Context()
	got, err := session.CreateTrack(ctx, "  Chapter 3: The Storm ")
	if err != nil {
		t.Fatal(err)
	}
	want := dawport.CreatedTrack{GUID: "audacity:Chapter 3: The Storm", Name: "Chapter 3: The Storm", Index: 4}
	if got != want {
		t.Fatalf("CreateTrack = %+v, want %+v", got, want)
	}
	server.With(func(p *abt.Project) {
		if len(p.Tracks) != 5 || p.Tracks[4].Name != "Chapter 3: The Storm" || p.Tracks[4].Kind != "wave" {
			t.Fatalf("tracks = %+v", p.Tracks)
		}
		if p.Tracks[0].Name != "Chapter 1" || p.Tracks[3].Name != LabelTrackName {
			t.Errorf("another track changed: %+v", p.Tracks)
		}
	})
	// The id answered is the one select_track and track_state resolve.
	if selected, err := session.SelectTrack(ctx, got.GUID); err != nil || selected.TrackGUID != got.GUID {
		t.Errorf("SelectTrack(%q) = %+v, %v", got.GUID, selected, err)
	}
}

func TestCreateTrackIsNotIdempotentAndARepeatedNameGetsTheNextID(t *testing.T) {
	session, _ := placesProject(t)
	ctx := t.Context()
	// placesProject already has two tracks named "Chapter 1".
	got, err := session.CreateTrack(ctx, "Chapter 1")
	if err != nil || got.GUID != "audacity:Chapter 1#3" || got.Index != 4 {
		t.Fatalf("first = %+v, %v", got, err)
	}
	got, err = session.CreateTrack(ctx, "Chapter 1")
	if err != nil || got.GUID != "audacity:Chapter 1#4" || got.Index != 5 {
		t.Fatalf("second = %+v, %v", got, err)
	}
}

func TestCreateTrackKeepsEmojiAndRightToLeftText(t *testing.T) {
	session, _ := placesProject(t)
	name := "Chapter 7 \U0001F30A הים البحر"
	got, err := session.CreateTrack(t.Context(), name)
	if err != nil || got.Name != name || got.GUID != "audacity:"+name {
		t.Fatalf("CreateTrack = %+v, %v", got, err)
	}
}

func TestCreateTrackRefusesBeforeAddingAnything(t *testing.T) {
	cases := map[string]struct {
		name string
		want error
	}{
		"blank":        {"  ", bridge.ErrTrackNameEmpty},
		"double quote": {`The "Sea"`, audacitybridge.ErrInvalidValue},
		"backslash":    {`A\B`, audacitybridge.ErrInvalidValue},
		"line break":   {"Chapter 2\nThe Storm", audacitybridge.ErrInvalidValue},
	}
	for label, c := range cases {
		t.Run(label, func(t *testing.T) {
			session, server := placesProject(t)
			if _, err := session.CreateTrack(t.Context(), c.name); !errors.Is(err, c.want) {
				t.Fatalf("err = %v, want %v", err, c.want)
			}
			server.With(func(p *abt.Project) {
				if len(p.Tracks) != 4 {
					t.Errorf("a track was added: %+v", p.Tracks)
				}
			})
		})
	}
}

func TestCreateTrackRefusesWhileThisAppRecords(t *testing.T) {
	session, server := placesProject(t)
	session.transport.set(true, true)
	if _, err := session.CreateTrack(t.Context(), "Chapter 3"); !errors.Is(err, bridge.ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}
	server.With(func(p *abt.Project) {
		if len(p.Tracks) != 4 {
			t.Errorf("a track was added while recording: %+v", p.Tracks)
		}
	})
}

func TestCreateTrackSendsTheNewTrackThenItsName(t *testing.T) {
	session, server := placesProject(t)
	if _, err := session.CreateTrack(t.Context(), "Chapter 3"); err != nil {
		t.Fatal(err)
	}
	log := strings.Join(server.Log(), "\n")
	newAt, nameAt := strings.Index(log, "NewMonoTrack:"), strings.Index(log, `SetTrackStatus: Name="Chapter 3"`)
	if newAt < 0 || nameAt < newAt {
		t.Fatalf("commands = %s", log)
	}
}
