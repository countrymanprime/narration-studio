package dawport

import "testing"

// --daw is a free-form launch label (the REAPER launcher passes "REAPER", ProjectSwitch sets "Standalone"); only the engines
// the suite knows change what the host does, and neither the launcher's casing nor stray spaces may decide which.
func TestClassifyKnowsReaperAudacityAndTheBuiltInRecorderAndNothingElse(t *testing.T) {
	cases := map[string]Kind{
		"REAPER": KindREAPER, "reaper": KindREAPER, " Reaper ": KindREAPER,
		"Audacity": KindAudacity, "audacity": KindAudacity, "AUDACITY": KindAudacity,
		"Built-in": KindBuiltIn, "built-in": KindBuiltIn, "builtin": KindBuiltIn, " BUILTIN ": KindBuiltIn, "Built in": KindBuiltIn,
		"": KindNone, "Standalone": KindNone, "Pro Tools": KindNone, "Audacity2": KindNone, "built-in recorder": KindNone,
	}
	for label, want := range cases {
		if got := Classify(label); got != want {
			t.Errorf("Classify(%q) = %v, want %v", label, got, want)
		}
	}
}

func TestKindStringNamesEachEngine(t *testing.T) {
	cases := map[Kind]string{KindNone: "none", KindREAPER: "REAPER", KindAudacity: "Audacity", KindBuiltIn: "Built-in"}
	for kind, want := range cases {
		if got := kind.String(); got != want {
			t.Errorf("%v.String() = %q, want %q", kind, got, want)
		}
	}
}

func TestIsREAPERLaunch(t *testing.T) {
	if IsREAPERLaunch("Audacity") {
		t.Error("IsREAPERLaunch(Audacity) = true, want false")
	}
	if !IsREAPERLaunch("REAPER") {
		t.Error("IsREAPERLaunch(REAPER) = false, want true")
	}
}

// project-daw-order: the launch's label wins; then the project's own Recording.engine row; then what the folder holds (a linked
// DAW file or any .rpp means REAPER, never the built-in recorder); then the built-in recorder where its capture row runs.
func TestProjectKind(t *testing.T) {
	cases := []struct {
		name   string
		in     ProjectFacts
		kind   Kind
		source Source
	}{
		{"launch REAPER beats a built-in choice", ProjectFacts{Label: "REAPER", Saved: "builtin", BuiltinAvailable: true}, KindREAPER, SourceLaunch},
		{"launch Audacity beats an .rpp", ProjectFacts{Label: "Audacity", ProjectFiles: 1}, KindAudacity, SourceLaunch},
		{"launch Built-in", ProjectFacts{Label: "Built-in"}, KindBuiltIn, SourceLaunch},
		{"a picker switch is no launch", ProjectFacts{Label: "Standalone", ProjectFiles: 1}, KindREAPER, SourceFound},
		{"an unknown label is no launch", ProjectFacts{Label: "Pro Tools"}, KindNone, SourceDefault},
		{"chosen REAPER over an empty folder", ProjectFacts{Saved: "reaper", BuiltinAvailable: true}, KindREAPER, SourceChosen},
		{"chosen Audacity over an .rpp", ProjectFacts{Saved: "audacity", ProjectFiles: 1}, KindAudacity, SourceChosen},
		{"chosen built-in over an .rpp", ProjectFacts{Saved: "builtin", ProjectFiles: 1, BuiltinAvailable: true}, KindBuiltIn, SourceChosen},
		{"built-in chosen where it cannot run falls to the folder", ProjectFacts{Saved: "builtin", ProjectFiles: 1}, KindREAPER, SourceFound},
		{"linked file", ProjectFacts{Linked: true, BuiltinAvailable: true}, KindREAPER, SourceLinked},
		{"one .rpp", ProjectFacts{ProjectFiles: 1, BuiltinAvailable: true}, KindREAPER, SourceFound},
		{"several .rpp are still REAPER", ProjectFacts{ProjectFiles: 3, BuiltinAvailable: true}, KindREAPER, SourceFound},
		{"empty folder records in the app", ProjectFacts{BuiltinAvailable: true}, KindBuiltIn, SourceDefault},
		{"empty folder where the built-in recorder cannot run", ProjectFacts{}, KindNone, SourceDefault},
		{"an unknown saved value is no choice", ProjectFacts{Saved: "daw", BuiltinAvailable: true}, KindBuiltIn, SourceDefault},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			kind, source := ProjectKind(c.in)
			if kind != c.kind || source != c.source {
				t.Errorf("ProjectKind(%+v) = %v/%q, want %v/%q", c.in, kind, source, c.kind, c.source)
			}
		})
	}
}

// A saved choice reads back as the same kind, and every choosable kind has one.
func TestSavedValueRoundTrips(t *testing.T) {
	for _, kind := range Choosable() {
		if kind.SavedValue() == "" || Classify(kind.SavedValue()) != kind {
			t.Errorf("%v: SavedValue %q does not classify back", kind, kind.SavedValue())
		}
	}
	if KindNone.SavedValue() != "" {
		t.Error("KindNone has a saved value")
	}
}

// Only a move onto or off Audacity changes what the host builds at attach.
func TestRebuildsServices(t *testing.T) {
	if !RebuildsServices(KindREAPER, KindAudacity) || !RebuildsServices(KindAudacity, KindBuiltIn) {
		t.Error("a move onto or off Audacity rebuilds")
	}
	if RebuildsServices(KindREAPER, KindBuiltIn) || RebuildsServices(KindAudacity, KindAudacity) {
		t.Error("a move between REAPER and the built-in recorder rebuilds nothing")
	}
}
