package dawport

import (
	"reflect"
	"regexp"
	"testing"
)

func TestEveryCapabilityHasASpec(t *testing.T) {
	snake := regexp.MustCompile(`^[a-z]+(_[a-z]+)*$`)
	seen := map[Capability]bool{}
	for _, spec := range Capabilities() {
		if seen[spec.Capability] {
			t.Errorf("%s is listed twice", spec.Capability)
		}
		seen[spec.Capability] = true
		if !snake.MatchString(string(spec.Capability)) {
			t.Errorf("%q is not a snake_case wire name", spec.Capability)
		}
		if spec.Label == "" {
			t.Errorf("%s has no label for the narrator", spec.Capability)
		}
		if spec.Role == nil || spec.Role.Kind() != reflect.Interface {
			t.Errorf("%s's role type %v is not an interface", spec.Capability, spec.Role)
		}
		if got, ok := SpecOf(spec.Capability); !ok || got.Capability != spec.Capability {
			t.Errorf("SpecOf(%s) = %+v, %v", spec.Capability, got, ok)
		}
	}
	if _, ok := SpecOf("time_travel"); ok {
		t.Error("SpecOf found a capability that does not exist")
	}
}

func TestEachRoleServesOneCapability(t *testing.T) {
	// ISP: a role interface is the whole of one capability, so two capabilities never share one (a caller that asked for
	// one would then be handed the other's switch).
	owner := map[reflect.Type]Capability{}
	for _, spec := range Capabilities() {
		if other, ok := owner[spec.Role]; ok {
			t.Errorf("%s and %s share the role %v", other, spec.Capability, spec.Role)
		}
		owner[spec.Role] = spec.Capability
	}
}

func TestCapabilitiesAreReturnedInAStableOrderAndCannotBeChangedByCallers(t *testing.T) {
	a := Capabilities()
	a[0].Label = "changed"
	b := Capabilities()
	if b[0].Label == "changed" {
		t.Fatal("Capabilities() hands out its own slice")
	}
	for i := range b {
		if a[i].Capability != b[i].Capability {
			t.Fatalf("order changed at %d: %s then %s", i, a[i].Capability, b[i].Capability)
		}
	}
}

func TestLevelsAreOrderedAndNamed(t *testing.T) {
	if Unsupported >= NotYetAvailable || NotYetAvailable >= Experimental || Experimental >= Supported {
		t.Fatal("levels are ordered least to most capable, so `level >= Experimental` means the adapter has a role")
	}
	for level, want := range map[Level]string{
		Unsupported: "unsupported", NotYetAvailable: "not_yet_available", Experimental: "experimental", Supported: "supported",
		Level(99): "unsupported",
	} {
		if got := level.String(); got != want {
			t.Errorf("Level(%d).String() = %q, want %q", level, got, want)
		}
	}
}

func TestReasonsKeepTodaysWireValues(t *testing.T) {
	// The first four are already on the wire (readaloudreaper.go, bindings_navigation.go); the UI switches on them.
	for reason, want := range map[Reason]string{
		ReasonStandalone: "standalone", ReasonNotRunning: "not_running", ReasonExperimentalOff: "experimental_off",
		ReasonFailed: "failed", ReasonTurnedOff: "turned_off", ReasonNotYet: "not_yet", ReasonUnsupported: "unsupported",
	} {
		if string(reason) != want {
			t.Errorf("reason %q, want %q", reason, want)
		}
	}
}

func TestCatalogueHasTheFourEditRowsInOrderAfterMacroRender(t *testing.T) {
	// SND-3: cutting, an effect on a range, stacking takes and backups follow macro_render, each its own role whose methods
	// answer a Result (ADR 0810).
	want := []struct {
		c       Capability
		label   string
		role    reflect.Type
		methods []string
	}{
		{CapCutRange, "Cut words and audio", reflect.TypeFor[RangeCutter](), []string{"DeleteRange"}},
		{CapFXRange, "Add an effect to words", reflect.TypeFor[RangeFXApplier](), []string{"ApplyFXToRange", "RemoveFXFromRange"}},
		{CapStackTakes, "Stack takes", reflect.TypeFor[TakeStacker](), []string{"StackTakes", "UnstackTakes"}},
		{CapBackups, "Audio backups", reflect.TypeFor[BackupKeeper](), []string{"BackupAround", "RestoreBackup"}},
	}
	all := Capabilities()
	at := -1
	for i, spec := range all {
		if spec.Capability == CapMacroRender {
			at = i
		}
	}
	if at < 0 || at+len(want) >= len(all) {
		t.Fatalf("macro_render at %d of %d", at, len(all))
	}
	result := reflect.TypeFor[Result]()
	errType := reflect.TypeFor[error]()
	for i, w := range want {
		spec := all[at+1+i]
		if spec.Capability != w.c || spec.Label != w.label || spec.Role != w.role || spec.Needs != NeedsRunning {
			t.Errorf("row %d = %+v, want %s %q %v", at+1+i, spec, w.c, w.label, w.role)
		}
		if w.role.NumMethod() != len(w.methods) {
			t.Errorf("%v has %d methods, want %v", w.role, w.role.NumMethod(), w.methods)
		}
		for _, name := range w.methods {
			m, ok := w.role.MethodByName(name)
			if !ok {
				t.Errorf("%v has no %s", w.role, name)
				continue
			}
			if m.Type.NumOut() != 2 || m.Type.Out(0) != result || m.Type.Out(1) != errType {
				t.Errorf("%v.%s returns %v, want (Result, error)", w.role, name, m.Type)
			}
		}
	}
}

func TestEditRequestsCarryNoPath(t *testing.T) {
	// The four edit roles act on the project the engine has open; a request names items, takes and times, never a file.
	for _, typ := range []reflect.Type{
		reflect.TypeFor[RangeRequest](), reflect.TypeFor[DeleteRangeRequest](), reflect.TypeFor[FXRangeRequest](),
		reflect.TypeFor[StackRequest](), reflect.TypeFor[StackGroup](), reflect.TypeFor[StackMove](), reflect.TypeFor[BackupRequest](),
	} {
		for i := range typ.NumField() {
			name := typ.Field(i).Name
			if regexp.MustCompile(`(?i)path|file|folder|dir`).MatchString(name) {
				t.Errorf("%v.%s looks like a path", typ, name)
			}
		}
	}
	if CutClose != "close" || CutGap != "gap" {
		t.Errorf("cut modes %q, %q; the mock's are close and gap", CutClose, CutGap)
	}
}
