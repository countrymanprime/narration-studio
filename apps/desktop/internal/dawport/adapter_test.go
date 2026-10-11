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

// The launch's kind: a DAW the label names wins; with none, the project's choice of the built-in recorder makes it the engine.
func TestLaunchKind(t *testing.T) {
	cases := []struct {
		label   string
		builtin bool
		want    Kind
	}{
		{"", false, KindNone},
		{"", true, KindBuiltIn},
		{"Standalone", true, KindBuiltIn},
		{"REAPER", true, KindREAPER},
		{"Audacity", true, KindAudacity},
		{"Built-in", false, KindBuiltIn},
		{"Pro Tools", false, KindNone},
	}
	for _, c := range cases {
		if got := LaunchKind(c.label, c.builtin); got != c.want {
			t.Errorf("LaunchKind(%q, %v) = %v, want %v", c.label, c.builtin, got, c.want)
		}
	}
}
