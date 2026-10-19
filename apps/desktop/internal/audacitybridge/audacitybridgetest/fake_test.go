package audacitybridgetest

import (
	"reflect"
	"strings"
	"testing"
)

func TestParseCommand(t *testing.T) {
	cases := []struct {
		line   string
		name   string
		params map[string]string
		err    bool
	}{
		{"AddLabel:", "AddLabel", map[string]string{}, false},
		{`SetLabel: Label=2  Text="a b" Start=1.5`, "SetLabel", map[string]string{"Label": "2", "Text": "a b", "Start": "1.5"}, false},
		{`SetLabel: Text="a\nb\\d"`, "SetLabel", map[string]string{"Text": "a\nb\\d"}, false},
		{`SetLabel: Text="a" Text="b"`, "SetLabel", map[string]string{"Text": "b"}, false},
		{"NoColon", "NoColon", map[string]string{}, false}, // Audacity 3.7.7 answers a bare SelectNone, Play or Stop (A3-T3)
		{"SetLabel: Label", "", nil, true},
		{`SetLabel: Text="open`, "", nil, true},
	}
	for _, tc := range cases {
		got, err := ParseCommand(tc.line)
		if tc.err {
			if err == nil {
				t.Errorf("%q: parsed %+v, want an error", tc.line, got)
			}
			continue
		}
		if err != nil || got.Name != tc.name || !reflect.DeepEqual(got.Params, tc.params) {
			t.Errorf("%q = %+v, %v", tc.line, got, err)
		}
	}
}

func TestProjectHandlesEveryDocumentedCommand(t *testing.T) {
	p := NewProject()
	p.AddWaveTrack("a", 0, 10)
	p.AddLabelTrack("L", Label{Start: 3, End: 3, Text: "x"})
	steps := []struct {
		line string
		ok   bool
	}{
		{`Message: Text="hi"`, true},
		{"GetInfo: Type=Labels Format=JSON", true},
		{"GetInfo: Type=Tracks", true},
		{"GetInfo: Type=Clips Format=JSON", true},
		{"GetInfo: Type=Boxes Format=JSON", false},
		{"GetInfo: Type=Labels Format=LISP", false},
		{"SelectTime: Start=5 End=2", true},
		{"SelectTime: Start=1 End=2 RelativeTo=Selection", false},
		{"SelectTime: Start=x", false},
		{"SelectTime: End=x", false},
		{"SelectTracks: Track=1 TrackCount=1 Mode=Add", true},
		{"SelectTracks: Track=0 Mode=Remove", true},
		{"SelectTracks: Track=0 Mode=Toggle", false},
		{"SelectTracks: Track=x", false},
		{"SelectTracks: TrackCount=x", false},
		{"SelectNone:", true},
		{"AddLabel:", true},
		{"SetLabel: Label=9", false},
		{"SetLabel: Label=x", false},
		{"SetLabel: Label=0 Start=x", false},
		{"SetLabel: Label=0 End=x", false},
		{"SetTrackStatus: Name=\"x\"", true},
		{"SelectTracks: Track=0 TrackCount=1 Mode=Set", true},
		{"SetTrackAudio: Mute=1", true},
		{"ApplyMacro: MacroName=\"x\"", false},
		{"Macro_Nope:", false},
		{"Play:", true},
		{"PlayAtSpeedLooped:", true},
		{"Stop:", true},
		{"Export2: NumChannels=1", false},
		{`Export2: Filename="C:/a.wav" NumChannels=x`, false},
		{`Export2: Filename="C:/a.wav"`, true},
		{"Import2:", false},
		{`Import2: Filename="C:/b.wav"`, true},
		{`OpenProject2: Filename="C:/a.aup3"`, true},
		{`SaveProject2: Filename="C:/a.aup3"`, true},
		{"Nope:", false},
		{"no colon", false},
	}
	for _, s := range steps {
		if body, ok := p.handle(s.line); ok != s.ok {
			t.Errorf("%q: ok = %v (%q), want %v", s.line, ok, body, s.ok)
		}
	}
	if p.Saved != "C:/a.aup3" || p.Opened != "C:/a.aup3" || len(p.Imported) != 1 || len(p.Exports) != 1 {
		t.Errorf("project = %+v", p)
	}
	empty := NewProject()
	if body, ok := empty.handle(`Export2: Filename="C:/a.wav"`); ok || !strings.Contains(strings.Join(body, " "), "no audio") {
		t.Errorf("export with no audio = %q %v", body, ok)
	}
}

// Audacity 3.7.7 takes SetTrackStatus and SetTrackAudio on the selected track and ignores a Track parameter without an error: a call
// that names a track other than the selected one changes the selected one (tests/audacity3/real/edits, A3-T17 and A3-T19).
func TestTrackCommandsActOnTheSelectionAndIgnoreATrackParameter(t *testing.T) {
	p := NewProject()
	p.AddWaveTrack("a", 0, 10)
	p.AddWaveTrack("b", 0, 10)
	for _, line := range []string{"SelectTracks: Track=0 TrackCount=1 Mode=Set", "SetTrackAudio: Track=1 Mute=1", `SetTrackStatus: Track=1 Name="renamed"`} {
		if body, ok := p.handle(line); !ok {
			t.Fatalf("%q: %q", line, body)
		}
	}
	if !p.Tracks[0].Muted || p.Tracks[1].Muted || p.Tracks[0].Name != "renamed" || p.Tracks[1].Name != "b" {
		t.Errorf("tracks = %+v", p.Tracks)
	}
	p.handle("SelectNone:")
	if body, ok := p.handle("SetTrackAudio: Mute=1"); ok {
		t.Errorf("a mute with no track selected = %q, want a failure", body)
	}
}

// A macro is the menu command Macro_<name> and runs on the selected tracks; ApplyMacro does not exist.
func TestMacrosAreMenuCommands(t *testing.T) {
	p := NewProject()
	p.Macros = []string{"FadeEnds"}
	p.AddWaveTrack("a", 0, 10)
	if body, ok := p.handle(`ApplyMacro: MacroName="FadeEnds"`); ok || !strings.Contains(strings.Join(body, " "), "not recognized") {
		t.Errorf("ApplyMacro = %q %v", body, ok)
	}
	if body, ok := p.handle("Macro_FadeEnds:"); ok || !strings.Contains(strings.Join(body, " "), "tracks to be selected") {
		t.Errorf("a macro with no track selected = %q %v", body, ok)
	}
	p.handle("SelectTracks: Track=0")
	if body, ok := p.handle("Macro_FadeEnds:"); !ok {
		t.Errorf("Macro_FadeEnds = %q", body)
	}
	if len(p.MacrosApplied) != 1 || p.MacrosApplied[0] != "Macro_FadeEnds" {
		t.Errorf("applied = %v", p.MacrosApplied)
	}
}
