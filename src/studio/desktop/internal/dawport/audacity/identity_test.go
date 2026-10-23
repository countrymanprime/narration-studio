package audacity

import (
	"errors"
	"reflect"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	abt "github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
)

func TestProjectLabelRoundTrip(t *testing.T) {
	text, err := ProjectLabelText("a1B2c3D4")
	if err != nil || text != "[nu:project a1B2c3D4]" {
		t.Fatalf("text = %q, %v", text, err)
	}
	if id, ok := ParseProjectLabel(text); !ok || id != "a1B2c3D4" {
		t.Errorf("parse = %q, %v", id, ok)
	}
	for _, bad := range []string{"", "short", "has space1", "x]y12345", "ünïcode12", "a1B2c3D4\n"} {
		if _, err := ProjectLabelText(bad); !errors.Is(err, audacitybridge.ErrInvalidValue) {
			t.Errorf("id %q accepted: %v", bad, err)
		}
	}
	for _, text := range []string{"", "[nu:project ]", "[nu:project abc]", "[nu:f1] words", "[nu:project a1B2c3D4] extra", " [nu:project a1B2c3D4]", "nu:project a1B2c3D4"} {
		if id, ok := ParseProjectLabel(text); ok {
			t.Errorf("%q read as link %q", text, id)
		}
	}
}

func TestProjectLinkIsNotAFindingAndFindingsAreNotALink(t *testing.T) {
	if _, _, _, ok := ParseFindingLabel("[nu:project a1B2c3D4]"); ok {
		t.Error("a link label was read as a finding")
	}
	if _, ok := ParseProjectLabel("[nu:f-1] words"); ok {
		t.Error("a finding label was read as a link")
	}
}

func TestLinkProjectStampsOnceAndReadsBack(t *testing.T) {
	session, server := newSession(t)
	server.With(func(p *abt.Project) { p.AddWaveTrack("Chapter 1", 0, 300) })
	ctx := t.Context()
	if _, found, err := session.ProjectLink(ctx); err != nil || found {
		t.Fatalf("a fresh project: found=%v err=%v", found, err)
	}
	if changed, err := session.LinkProject(ctx, "a1B2c3D4"); err != nil || !changed {
		t.Fatalf("first link: changed=%v err=%v", changed, err)
	}
	if changed, err := session.LinkProject(ctx, "a1B2c3D4"); err != nil || changed {
		t.Errorf("second link: changed=%v err=%v", changed, err)
	}
	if id, found, err := session.ProjectLink(ctx); err != nil || !found || id != "a1B2c3D4" {
		t.Errorf("read back = %q %v %v", id, found, err)
	}
	server.With(func(p *abt.Project) {
		want := []abt.Label{{Start: 0, End: 0, Text: "[nu:project a1B2c3D4]"}}
		if got := p.AllLabels(); !reflect.DeepEqual(got, want) {
			t.Errorf("labels = %+v, want %+v", got, want)
		}
		if last := p.Tracks[len(p.Tracks)-1]; last.Name != LabelTrackName {
			t.Errorf("the label went to track %q", last.Name)
		}
	})
}

func TestLinkProjectRenamesAnotherLinkAndKeepsTheNarratorsLabels(t *testing.T) {
	session, server := newSession(t)
	server.With(func(p *abt.Project) {
		p.AddWaveTrack("Chapter 1", 0, 300)
		p.AddLabelTrack("My notes", abt.Label{Start: 5, End: 5, Text: "breath here"})
		p.AddLabelTrack(LabelTrackName, abt.Label{Start: 0, End: 0, Text: "[nu:project OLDOLD12]"}, abt.Label{Start: 9, End: 9, Text: "[nu:f1] words"})
	})
	ctx := t.Context()
	if id, found, err := session.ProjectLink(ctx); err != nil || !found || id != "OLDOLD12" {
		t.Fatalf("other link = %q %v %v", id, found, err)
	}
	if changed, err := session.LinkProject(ctx, "NEWNEW34"); err != nil || !changed {
		t.Fatalf("relink: changed=%v err=%v", changed, err)
	}
	server.With(func(p *abt.Project) {
		got := p.AllLabels()
		want := []abt.Label{{Start: 5, End: 5, Text: "breath here"}, {Start: 0, End: 0, Text: "[nu:project NEWNEW34]"}, {Start: 9, End: 9, Text: "[nu:f1] words"}}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("labels = %+v, want %+v", got, want)
		}
	})
}

func TestLinkProjectRefusesABadIDBeforeSendingAnything(t *testing.T) {
	session, server := newSession(t)
	if _, err := session.LinkProject(t.Context(), "no way"); !errors.Is(err, audacitybridge.ErrInvalidValue) {
		t.Errorf("err = %v", err)
	}
	if n := len(server.Log()); n != 0 {
		t.Errorf("%d commands sent for a bad id", n)
	}
}

func TestProjectLinkWithNoProjectOpen(t *testing.T) {
	session, server := newSession(t)
	server.With(func(p *abt.Project) { p.NoProject = true })
	if _, _, err := session.ProjectLink(t.Context()); !errors.Is(err, audacitybridge.ErrNoProject) {
		t.Errorf("err = %v", err)
	}
}
