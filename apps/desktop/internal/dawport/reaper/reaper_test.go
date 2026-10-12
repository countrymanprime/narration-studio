package reaper

import (
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"maps"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/dawporttest"
)

// newClient is a bridge client over a fresh session directory, and that directory.
func newClient(t testing.TB) (*bridge.Client, string) {
	t.Helper()
	dir := t.TempDir()
	client, err := bridge.New(dir)
	if err != nil {
		t.Fatalf("bridge.New: %v", err)
	}
	return client, dir
}

func newAdapter(t testing.TB, allowed func(dawport.Capability) error) (*Adapter, string) {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, allowed)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return adapter, dir
}

// The adapter over a session whose directory has gone (REAPER closed and the launcher cleaned up): every command fails to write.
func TestConformance(t *testing.T) {
	for name, allowed := range map[string]func(dawport.Capability) error{
		"experimental actions off": nil,
		"experimental actions on":  func(dawport.Capability) error { return nil },
	} {
		t.Run(name, func(t *testing.T) {
			dawporttest.Run(t, func(tb testing.TB) dawport.Adapter {
				adapter, dir := newAdapter(tb, allowed)
				if err := os.RemoveAll(dir); err != nil {
					tb.Fatalf("closing the transport: %v", err)
				}
				return adapter
			})
		})
	}
}

func TestTheFactoryIsRegisteredForREAPER(t *testing.T) {
	factory, ok := dawport.Lookup(dawport.KindREAPER)
	if !ok {
		t.Fatal("no factory registered for REAPER")
	}
	dir := t.TempDir()
	var logged []string
	adapter, err := factory(dawport.Env{SessionDir: dir, Log: func(kind, message string) { logged = append(logged, kind+": "+message) }})
	if err != nil {
		t.Fatalf("factory: %v", err)
	}
	if adapter.Kind() != dawport.KindREAPER {
		t.Errorf("Kind() = %v, want REAPER", adapter.Kind())
	}
	if _, err := os.Stat(filepath.Join(dir, "commands")); err != nil {
		t.Errorf("the factory did not open the session's bridge: %v", err)
	}
	// The factory hands Env.Log to the client: an event that fails the wire table is reported through it.
	if err := os.WriteFile(filepath.Join(dir, "events.log"), []byte(bridge.EncodeFields([]string{"NAVIGATED", "run"})+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := adapter.Role(dawport.CapPickups).(dawport.PickupList).Dispatch(); err != nil {
		t.Fatalf("Dispatch: %v", err)
	}
	if len(logged) == 0 {
		t.Error("an invalid event was not reported through Env.Log")
	}
}

func TestTheFactoryRefusesALaunchWithNoSession(t *testing.T) {
	factory, _ := dawport.Lookup(dawport.KindREAPER)
	adapter, err := factory(dawport.Env{})
	if !errors.Is(err, ErrNoSession) || adapter != nil {
		t.Errorf("factory(no session) = %v, %v; want nil, ErrNoSession", adapter, err)
	}
}

func TestNewRefusesANilClient(t *testing.T) {
	if adapter, err := New(nil, nil); !errors.Is(err, ErrNoSession) || adapter != nil {
		t.Errorf("New(nil) = %v, %v; want nil, ErrNoSession", adapter, err)
	}
}

// experimentalCapability is the capability each of bridge.Actions' experimental commands belongs to.
var experimentalCapability = map[string]dawport.Capability{
	"chapter_track_state": dawport.CapTrackState,
	"select_track":        dawport.CapTrackSelect,
	"arm_only":            dawport.CapRecord,
	"record_start":        dawport.CapRecord,
	"record_stop":         dawport.CapRecord,
	"set_active_take":     dawport.CapTakes,
	"hide_takes":          dawport.CapTakes,
	"split_take":          dawport.CapTakes,
	"list_fx_chains":      dawport.CapFXChains,
	"apply_fx_chain":      dawport.CapFXChains,
	"create_regions":      dawport.CapRegions,
	"play_position":       dawport.CapPunch,
	"roll":                dawport.CapPunch,
	"punch_to":            dawport.CapPunch,
	"master_chain_read":   dawport.CapMasterChainRead,
	"delete_range":        dawport.CapCutRange,
	"apply_fx_range":      dawport.CapFXRange,
	"remove_fx_range":     dawport.CapFXRange,
	"stack_takes":         dawport.CapStackTakes,
	"unstack_takes":       dawport.CapStackTakes,
	"preview_file_range":  dawport.CapFilePreview,
	"stop_file_preview":   dawport.CapFilePreview,
	"reveal_file":         dawport.CapFileReveal,
}

// supportedCommands are the commands the Supported capabilities send, none of which is gated today.
var supportedCommands = map[string]dawport.Capability{
	"prepare_compare": dawport.CapReview, "inspect_compare_results": dawport.CapReview,
	"jump_to_compare_marker": dawport.CapReview, "export_compare_markers": dawport.CapReview,
	"import_pickups": dawport.CapPickups, "export_pickups": dawport.CapPickups, "next_pickup": dawport.CapPickups,
	"resolve_pickup": dawport.CapPickups, "count_pickups": dawport.CapPickups,
	"stamp_item_lines": dawport.CapLineIdentity, "read_line_ids": dawport.CapLineIdentity,
	"configure_chapter_render": dawport.CapRenderConfig,
	"launch_cleanup_tool":      dawport.CapCleanupTools,
	"pick_retake_lane":         dawport.CapRetakeLanes,
	"project_state":            dawport.CapProjectState,
	"create_take":              dawport.CapTakeCreate,
}

// experimentalCommandsInSource reads the keys of bridge.experimentalCommands from actions.go itself, so a command added to (or
// promoted out of) that map fails this test until the declaration follows it.
func experimentalCommandsInSource(t *testing.T) []string {
	t.Helper()
	file, err := parser.ParseFile(token.NewFileSet(), filepath.Join("..", "..", "bridge", "actions.go"), nil, 0)
	if err != nil {
		t.Fatalf("parsing bridge/actions.go: %v", err)
	}
	var commands []string
	ast.Inspect(file, func(n ast.Node) bool {
		spec, ok := n.(*ast.ValueSpec)
		if !ok || len(spec.Names) != 1 || spec.Names[0].Name != "experimentalCommands" {
			return true
		}
		for _, elt := range spec.Values[0].(*ast.CompositeLit).Elts {
			key, err := strconv.Unquote(elt.(*ast.KeyValueExpr).Key.(*ast.BasicLit).Value)
			if err != nil {
				t.Fatalf("an experimentalCommands key: %v", err)
			}
			commands = append(commands, key)
		}
		return false
	})
	if len(commands) == 0 {
		t.Fatal("found no experimentalCommands map in bridge/actions.go")
	}
	slices.Sort(commands)
	return commands
}

// The declaration is today's behaviour exactly: a capability is Experimental when bridge.Actions gates its
// commands behind the old switch, plus the one client that was built but never wired; everything else is Supported. This is
// also the guard that keeps record, punch, regions and item_gain (plus track_state, takes and fx_chains) from
// silently drifting from bridge.Experimental before any of them is promoted (ADR 0400).
func TestTheDeclarationMatchesTodaysGating(t *testing.T) {
	inSource := experimentalCommandsInSource(t)
	if mapped := slices.Sorted(maps.Keys(experimentalCapability)); !slices.Equal(inSource, mapped) {
		t.Fatalf("bridge's experimentalCommands are %v, but this test maps %v: a command was added or promoted, so move its "+
			"capability's declaration with it", inSource, mapped)
	}
	adapter, _ := newAdapter(t, nil)
	declared := adapter.Declares()

	for command, c := range experimentalCapability {
		if !bridge.Experimental(command) {
			t.Errorf("bridge.Experimental(%q) is false", command)
		}
		if declared[c] != dawport.Experimental {
			t.Errorf("%s (sends %s, gated today) is declared %v, want Experimental", c, command, declared[c])
		}
	}
	for command, c := range supportedCommands {
		if bridge.Experimental(command) {
			t.Errorf("%s's command %s is gated today, but %s is declared Supported", c, command, c)
		}
	}

	want := map[dawport.Capability]dawport.Level{}
	for _, spec := range dawport.Capabilities() {
		want[spec.Capability] = dawport.Supported
	}
	for _, c := range experimentalCapability {
		want[c] = dawport.Experimental
	}
	// Built, never wired, so never gated: declared Experimental so it stays off by default.
	want[dawport.CapItemGain] = dawport.Experimental
	// The mastering port's DAW row (ADR 0306): render_with_fx is not one of bridge.Actions'
	// commands (it answers through the fan-out), so it is not gated by bridge.Actions; like every Experimental capability, the
	// resolver hands its role out only when the narrator's settings allow it. master_chain_read is gated above.
	want[dawport.CapRenderWithFX] = dawport.Experimental
	// macro_render is the mastering port's Audacity row (ADR 0306, ADR 0460): REAPER has no macro manager, so it is Unsupported,
	// not Supported like everything else this loop defaults to.
	want[dawport.CapMacroRender] = dawport.Unsupported
	// cut_range is delete_range's (SN-D62), fx_range apply_fx_range's and remove_fx_range's (SN-D63), and stack_takes
	// stack_takes' and unstack_takes' (SN-D71). backups has no bridge command: NotYetAvailable, with no role.
	want[dawport.CapCutRange] = dawport.Experimental
	want[dawport.CapFXRange] = dawport.Experimental
	want[dawport.CapStackTakes] = dawport.Experimental
	want[dawport.CapBackups] = dawport.NotYetAvailable
	if !maps.Equal(declared, want) {
		t.Errorf("Declares() = %v, want %v", declared, want)
	}
}

// The roles hand out today's types as they are, so a consumer moved onto a role keeps its behaviour.
func TestTheSynchronousRolesAreTodaysTypes(t *testing.T) {
	adapter, _ := newAdapter(t, nil)
	for c, want := range map[dawport.Capability]string{
		dawport.CapReview:     "reaper.review",
		dawport.CapNavigate:   "*bridge.Navigator",
		dawport.CapMarkers:    "*bridge.Navigator",
		dawport.CapHeartbeat:  "*daw.Reachability",
		dawport.CapTrackState: "*bridge.Actions",
		dawport.CapRecord:     "*bridge.Actions",
		dawport.CapPunch:      "reaper.puncher",
		dawport.CapRegions:    "*bridge.Actions",
		dawport.CapTakes:      "reaper.takeSelector",
		dawport.CapFXChains:   "*bridge.Actions",
		dawport.CapItemGain:   "*bridge.LevelMatchClient",
	} {
		if got := typeName(adapter.Role(c)); got != want {
			t.Errorf("%s's role is %s, want %s", c, got, want)
		}
	}
	if adapter.Role(dawport.CapNavigate) != adapter.Role(dawport.CapMarkers) {
		t.Error("navigate and markers have different navigators: one client subscription each is enough")
	}
}

func typeName(v any) string { return fmt.Sprintf("%T", v) }

// bridge.Actions' gating is the resolver's (ADR 0304): with nothing allowed, an experimental command is refused before anything
// is written, as it was behind the old switch.
func TestActionsWithNothingAllowedWriteNothing(t *testing.T) {
	adapter, dir := newAdapter(t, nil)
	punch := adapter.Role(dawport.CapPunch).(dawport.Puncher)
	if _, err := punch.PlayPosition(t.Context()); !errors.Is(err, bridge.ErrExperimentalOff) {
		t.Errorf("PlayPosition with nothing allowed = %v, want ErrExperimentalOff", err)
	}
	if entries, _ := os.ReadDir(filepath.Join(dir, "commands")); len(entries) != 0 {
		t.Errorf("a refused command wrote %d files", len(entries))
	}
}

// resolverOver is the composition root's wiring in miniature: the adapter's Env.Allowed is a closure over the resolver built over
// that same adapter, reading the narrator's settings from values.
func resolverOver(t *testing.T, values map[string]string) (*dawport.Resolver, *Adapter, string) {
	t.Helper()
	var resolver *dawport.Resolver
	adapter, dir := newAdapter(t, func(c dawport.Capability) error { return resolver.Allowed(c) })
	effective := func(tool, key, fallback string) (string, string) {
		if v, ok := values[tool+"."+key]; ok {
			return v, "global"
		}
		return fallback, "hardcoded"
	}
	resolver = dawport.NewResolver(dawport.ResolverConfig{
		Adapter:      adapter,
		Runtime:      adapter.Runtime,
		Toggle:       dawport.SettingsToggles(effective),
		Experimental: dawport.SettingsExperimental(effective),
	})
	return resolver, adapter, dir
}

func commandsWritten(t *testing.T, dir string) int {
	t.Helper()
	entries, _ := os.ReadDir(filepath.Join(dir, "commands"))
	return len(entries)
}

// Turning punch on alone in Settings lets punch's commands out and nothing else.
func TestTurningPunchOnAloneSendsPunchAndNothingElse(t *testing.T) {
	_, adapter, dir := resolverOver(t, map[string]string{"DAW.capability.punch": "on"})
	fx := adapter.Role(dawport.CapFXChains).(dawport.FXManager)
	if _, err := fx.ListFXChains(t.Context()); !errors.Is(err, bridge.ErrExperimentalOff) {
		t.Fatalf("ListFXChains with only punch on = %v, want ErrExperimentalOff", err)
	}
	if n := commandsWritten(t, dir); n != 0 {
		t.Fatalf("a refused FX command wrote %d files", n)
	}
	adapter.roles[dawport.CapPunch].(puncher).SetTimeout(time.Millisecond)
	punch := adapter.Role(dawport.CapPunch).(dawport.Puncher)
	if _, err := punch.PlayPosition(t.Context()); errors.Is(err, bridge.ErrExperimentalOff) {
		t.Fatalf("PlayPosition with punch on = %v: it was refused", err)
	}
	if n := commandsWritten(t, dir); n != 1 {
		t.Fatalf("PlayPosition with punch on wrote %d command files, want 1", n)
	}
}

// The old switch keeps working through the resolver: on, it lets every Experimental capability on auto out, but not one the
// narrator turned off.
func TestTheOldSwitchStillTurnsExperimentalCapabilitiesOn(t *testing.T) {
	_, adapter, dir := resolverOver(t, map[string]string{"DAW.experimental_reaper_actions": "true", "DAW.capability.fx_chains": "off"})
	fx := adapter.Role(dawport.CapFXChains).(dawport.FXManager)
	_, err := fx.ListFXChains(t.Context())
	var refusal *dawport.NotSupportedError
	if !errors.As(err, &refusal) || refusal.Support.Reason != dawport.ReasonTurnedOff {
		t.Fatalf("ListFXChains turned off = %v, want a turned_off refusal", err)
	}
	if n := commandsWritten(t, dir); n != 0 {
		t.Fatalf("a refused FX command wrote %d files", n)
	}
	adapter.roles[dawport.CapPunch].(puncher).SetTimeout(time.Millisecond)
	if _, err := adapter.Role(dawport.CapPunch).(dawport.Puncher).PlayPosition(t.Context()); errors.Is(err, bridge.ErrExperimentalOff) {
		t.Fatalf("PlayPosition on auto with the old switch on = %v: it was refused", err)
	}
	if n := commandsWritten(t, dir); n != 1 {
		t.Fatalf("wrote %d command files, want 1", n)
	}
}

// Gate knows every command bridge.Actions sends: each experimental command (parsed from actions.go) maps to the capability this
// test file says it belongs to, and an unknown command is refused rather than let through.
func TestGateMapsEveryActionsCommandToItsCapability(t *testing.T) {
	for _, command := range experimentalCommandsInSource(t) {
		if got, want := commandCapability[command], experimentalCapability[command]; got != want {
			t.Errorf("commandCapability[%q] = %q, want %q", command, got, want)
		}
	}
	var asked []dawport.Capability
	gate := Gate(func(c dawport.Capability) error { asked = append(asked, c); return nil })
	if err := gate("punch_to"); err != nil || len(asked) != 1 || asked[0] != dawport.CapPunch {
		t.Errorf("gate(punch_to) = %v, asked %v; want nil after asking about punch", err, asked)
	}
	if err := gate("no_such_command"); err == nil {
		t.Error("gate(no_such_command) let an unknown command through")
	}
	if err := Gate(nil)("punch_to"); !errors.Is(err, bridge.ErrExperimentalOff) {
		t.Errorf("Gate(nil)(punch_to) = %v, want ErrExperimentalOff", err)
	}
}

// Declaration is the same declaration and wording as the adapter, with no roles: the host gates with it until its consumers move onto the roles.
func TestDeclarationIsTheAdaptersDeclarationWithNoRoles(t *testing.T) {
	adapter, _ := newAdapter(t, nil)
	d := Declaration()
	if d.Kind() != dawport.KindREAPER || !maps.Equal(d.Declares(), adapter.Declares()) {
		t.Fatalf("Declaration() = %v %v, want the adapter's %v", d.Kind(), d.Declares(), adapter.Declares())
	}
	for _, spec := range dawport.Capabilities() {
		if role := d.Role(spec.Capability); role != nil {
			t.Errorf("Declaration().Role(%s) = %T, want nil", spec.Capability, role)
		}
	}
	for _, reason := range []dawport.Reason{dawport.ReasonStandalone, dawport.ReasonNotRunning, dawport.ReasonTurnedOff} {
		if got, want := d.(dawport.Explainer).Explain(dawport.CapPunch, reason), adapter.Explain(dawport.CapPunch, reason); got != want {
			t.Errorf("Explain(%s) = %q, want the adapter's %q", reason, got, want)
		}
	}
}

func TestProjectReaderParsesTheSavedProject(t *testing.T) {
	adapter, _ := newAdapter(t, nil)
	reader := adapter.Role(dawport.CapProjectRead).(dawport.ProjectReader)
	path := filepath.Join(t.TempDir(), "book.rpp")
	rpp := "<REAPER_PROJECT 0.1 \"7.0\" 0\n  <TRACK {AAAAAAAA-0000-0000-0000-000000000001}\n    NAME \"Chapter 1\"\n  >\n>\n"
	if err := os.WriteFile(path, []byte(rpp), 0o600); err != nil {
		t.Fatal(err)
	}
	project, err := reader.ReadProject(path)
	if err != nil {
		t.Fatalf("ReadProject: %v", err)
	}
	if len(project.Tracks) != 1 || project.Tracks[0].Name != "Chapter 1" {
		t.Errorf("ReadProject = %+v, want the one track", project)
	}
	if _, err := reader.ReadProject(filepath.Join(t.TempDir(), "missing.rpp")); err == nil {
		t.Error("ReadProject of a missing file did not fail")
	}
}

func TestRuntimeFollowsTheHeartbeat(t *testing.T) {
	adapter, dir := newAdapter(t, nil)
	if got := adapter.Runtime(); got != (dawport.Runtime{Bridge: true}) {
		t.Errorf("Runtime() before a heartbeat = %+v, want a quiet bridge", got)
	}
	heartbeat := bridge.EncodeFields([]string{"PROJECT_STATUS", "", "C:/book.rpp", "0"}) + "\n"
	if err := os.WriteFile(filepath.Join(dir, "events.log"), []byte(heartbeat), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := adapter.Role(dawport.CapPickups).(dawport.PickupList).Dispatch(); err != nil {
		t.Fatalf("Dispatch: %v", err)
	}
	if got := adapter.Runtime(); got != (dawport.Runtime{Bridge: true, Reachable: true}) {
		t.Errorf("Runtime() after a heartbeat = %+v, want an answering bridge", got)
	}
}

// REAPER words its runtime refusals the way the host already does (bindings_navigation.go, bridge.ErrUnavailable).
func TestExplainUsesREAPERsWording(t *testing.T) {
	adapter, _ := newAdapter(t, nil)
	resolver := func(rt dawport.Runtime) *dawport.Resolver {
		return dawport.NewResolver(dawport.ResolverConfig{Adapter: adapter, Runtime: func() dawport.Runtime { return rt }})
	}
	if got := resolver(dawport.Runtime{}).Support(dawport.CapNavigate).Message; got != messageStandalone {
		t.Errorf("standalone message = %q, want %q", got, messageStandalone)
	}
	if got := resolver(dawport.Runtime{Bridge: true}).Support(dawport.CapNavigate).Message; got != messageNotRunning {
		t.Errorf("not running message = %q, want %q", got, messageNotRunning)
	}
	if got := resolver(dawport.Runtime{Bridge: true, Reachable: true}).Support(dawport.CapPunch).Message; got != "Experimental: switched off in Settings." {
		t.Errorf("experimental_off message = %q, want the resolver's own", got)
	}
}

const (
	hideItem = "{AAAAAAAA-0000-4000-8000-000000000001}"
	hideTake = "{00000004-0000-4000-8000-000000000004}"
)

func takeSelectorAnswering(t *testing.T, answer func(command []string) [][]string) dawport.TakeSelector {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	return adapter.Role(dawport.CapTakes).(dawport.TakeSelector)
}

func TestHideTakesIsOneUndoStepWhenItChangedAndNoneWhenNot(t *testing.T) {
	for _, tc := range []struct {
		answer []string
		want   dawport.Result
	}{
		{[]string{"2", "1"}, dawport.OK("Muted 2 other takes in REAPER. They are still in the project.", true)},
		{[]string{"1", "1"}, dawport.OK("Muted 1 other take in REAPER. It is still in the project.", true)},
		{[]string{"0", "1"}, dawport.OK("No other take to mute in REAPER; the kept take is the active one.", true)},
		{[]string{"0", "0"}, dawport.OK("No other take to mute in REAPER.", false)},
	} {
		takes := takeSelectorAnswering(t, func(command []string) [][]string {
			return [][]string{append([]string{"TAKES_HIDDEN", command[1], hideItem}, tc.answer...)}
		})
		got, err := takes.HideTakes(t.Context(), hideItem, hideTake)
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("answer %v: HideTakes = %+v, %v; want %+v", tc.answer, got, err, tc.want)
		}
	}
	if r := dawport.OK("x", true); r.UndoSteps != 1 {
		t.Fatalf("a change is %d undo steps, want 1", r.UndoSteps)
	}
}

func TestHideTakesRefusesAStaleItemOrTakeWithTheStaleCode(t *testing.T) {
	for reason, sentence := range map[string]string{
		"item": "That passage's item is no longer in the REAPER project. Read the project again.",
		"take": "That item no longer has the take you kept. Read the project again.",
	} {
		takes := takeSelectorAnswering(t, func(command []string) [][]string {
			return [][]string{{"ITEM_STALE", command[1], hideItem, reason}}
		})
		got, err := takes.HideTakes(t.Context(), hideItem, hideTake)
		if err != nil || !reflect.DeepEqual(got, dawport.RefusedStale(sentence)) {
			t.Errorf("%s: HideTakes = %+v, %v; want RefusedStale(%q)", reason, got, err, sentence)
		}
	}
}

func TestHideTakesRefusesWhileRecordingAndPassesOnACallThatNeverAnswered(t *testing.T) {
	takes := takeSelectorAnswering(t, func(command []string) [][]string {
		return [][]string{{"ERROR", command[1], "REAPER is recording. Stop recording first."}}
	})
	got, err := takes.HideTakes(t.Context(), hideItem, hideTake)
	if err != nil || !reflect.DeepEqual(got, dawport.Refused("REAPER is recording. Stop recording first.")) {
		t.Errorf("HideTakes while recording = %+v, %v", got, err)
	}
	outdated := takeSelectorAnswering(t, func(command []string) [][]string {
		return [][]string{{"ERROR", command[1], "Unsupported workspace command"}}
	})
	if _, err := outdated.HideTakes(t.Context(), hideItem, hideTake); !errors.Is(err, bridge.ErrScriptOutdated) {
		t.Errorf("an older script: err = %v, want ErrScriptOutdated", err)
	}
}

// A capability the resolver refuses is a refused Result in the refusal's own sentence, and nothing is written.
func TestHideTakesIsGatedByTheResolver(t *testing.T) {
	sentence := "Experimental REAPER actions are off. Turn them on in Settings to choose takes."
	var asked []dawport.Capability
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		asked = append(asked, c)
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: sentence}}
	})
	got, err := adapter.Role(dawport.CapTakes).(dawport.TakeSelector).HideTakes(t.Context(), hideItem, hideTake)
	if err != nil || !reflect.DeepEqual(got, dawport.Refused(sentence)) {
		t.Errorf("HideTakes with takes refused = %+v, %v; want Refused(%q)", got, err, sentence)
	}
	if len(asked) == 0 || asked[0] != dawport.CapTakes {
		t.Errorf("asked about %v, want takes", asked)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused hide wrote %d commands", n)
	}

	ungated, dir := newAdapter(t, nil)
	got, err = ungated.Role(dawport.CapTakes).(dawport.TakeSelector).HideTakes(t.Context(), hideItem, hideTake)
	if err != nil || !reflect.DeepEqual(got, dawport.Refused(bridge.ErrExperimentalOff.Error())) {
		t.Errorf("HideTakes with nothing allowed = %+v, %v; want refused as experimental and off", got, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused hide wrote %d commands", n)
	}
}

// split_take is the takes capability's second role (dawport.TakeSplitter): Experimental with takes, gated by takes, one
// undo step when it cut, and every refusal a DawResult in a whole sentence (ADR 0810).
func TestSplitTakeIsExperimentalAndAnswersADawResult(t *testing.T) {
	if declares[dawport.CapTakes] != dawport.Experimental || !bridge.Experimental("split_take") || commandCapability["split_take"] != dawport.CapTakes {
		t.Fatalf("split_take must be an Experimental command of the takes capability")
	}
	const newTake = "{00000005-0000-4000-8000-000000000005}"
	splitter := takeSelectorAnswering(t, func(command []string) [][]string {
		if command[0] != "split_take" || command[2] != hideItem || command[3] != hideTake || command[4] != "15.500" {
			t.Errorf("command = %v", command)
		}
		return [][]string{{"TAKE_SPLIT", command[1], hideItem, hideTake, newTake, "15.500", "1"}}
	}).(dawport.TakeSplitter)
	got, err := splitter.SplitTake(t.Context(), hideItem, hideTake, 15.5)
	want := dawport.OK("Split the take into 2 takes in REAPER. Undo it there in one step.", true).WithUndoSteps(1)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("SplitTake = %+v, %v; want %+v", got, err, want)
	}

	for _, tc := range []struct {
		answer []string
		want   dawport.Result
	}{
		{[]string{"ITEM_STALE", "", hideItem, "item"}, dawport.RefusedStale("That take's item moved or changed in the REAPER project. Read the project again.")},
		{[]string{"ITEM_STALE", "", hideTake, "take"}, dawport.RefusedStale("That item no longer has the take to split. Read the project again.")},
		{[]string{"ERROR", "", "REAPER is recording. Stop recording first."}, dawport.Refused("REAPER is recording. Stop recording first.")},
		{[]string{"ERROR", "", "The second read is longer than the first, so it cannot be one of its takes. Nothing was split."},
			dawport.Refused("The second read is longer than the first, so it cannot be one of its takes. Nothing was split.")},
	} {
		splitter := takeSelectorAnswering(t, func(command []string) [][]string {
			answer := append([]string(nil), tc.answer...)
			answer[1] = command[1]
			return [][]string{answer}
		}).(dawport.TakeSplitter)
		got, err := splitter.SplitTake(t.Context(), hideItem, hideTake, 15.5)
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("answer %v: SplitTake = %+v, %v; want %+v", tc.answer, got, err, tc.want)
		}
	}

	sentence := "Experimental REAPER actions are off. Turn them on in Settings to choose takes."
	var asked []dawport.Capability
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		asked = append(asked, c)
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: sentence}}
	})
	got, err = adapter.Role(dawport.CapTakes).(dawport.TakeSplitter).SplitTake(t.Context(), hideItem, hideTake, 15.5)
	if err != nil || !reflect.DeepEqual(got, dawport.Refused(sentence)) || len(asked) == 0 || asked[0] != dawport.CapTakes {
		t.Errorf("SplitTake with takes refused = %+v, %v (asked %v); want Refused(%q) after asking takes", got, err, asked, sentence)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused split wrote %d commands", n)
	}
}

const rollTrack = "{00000001-0000-4000-8000-000000000001}"

func puncherAnswering(t *testing.T, answer func(command []string) [][]string) dawport.Puncher {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	return adapter.Role(dawport.CapPunch).(dawport.Puncher)
}

// A roll is a change with no undo point of its own (ADR 0860 point 1): the points for the recorded media are REAPER's.
func TestRollKeepsTheEarlierAudioAndAddsNoUndoPointOfItsOwn(t *testing.T) {
	punch := puncherAnswering(t, func(command []string) [][]string {
		return [][]string{{"ROLLED", command[1], rollTrack, "62.250000", "0"}}
	})
	got, err := punch.Roll(t.Context(), rollTrack, 62.25)
	want := dawport.OK("Rolled again from 62.2 seconds. The earlier audio is kept as a take.", true).WithUndoSteps(0)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("Roll = %+v, %v; want %+v", got, err, want)
	}
	if got.UndoSteps != 0 || !got.Changed || !got.OK {
		t.Fatalf("Roll = %+v, want ok, changed and no undo step", got)
	}
}

func TestRollRefusals(t *testing.T) {
	setting := `Roll keeps the earlier audio as a take only when REAPER's option "New recording that overlaps existing media items" is set to "Splits existing items and creates new takes". It is set to "Trims existing items behind new recording (tape mode)". Change it in REAPER's Options menu; this app never changes it.`
	for _, tc := range []struct {
		name   string
		answer []string
		want   dawport.Result
	}{
		{"not ours", []string{"RECORD_NOT_OURS"}, dawport.Refused("REAPER is not recording anything this app started on that track, so there is nothing to roll.")},
		{"stale", []string{"TRACK_STALE", rollTrack}, dawport.RefusedStale("That track is no longer in the REAPER project. Read the project again.")},
		{"setting", []string{"ERROR", setting}, dawport.Refused(setting)},
		{"time", []string{"ERROR", "The roll time is not a usable number of seconds."}, dawport.Refused("The roll time is not a usable number of seconds.")},
	} {
		punch := puncherAnswering(t, func(command []string) [][]string {
			return [][]string{append([]string{tc.answer[0], command[1]}, tc.answer[1:]...)}
		})
		got, err := punch.Roll(t.Context(), rollTrack, 40)
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: Roll = %+v, %v; want %+v", tc.name, got, err, tc.want)
		}
	}
}

// A roll that stopped the recording but did not record again changed something: not ok, changed, and never a refusal.
func TestRollThatStoppedButDidNotRecordAgainSaysTheRecordingEnded(t *testing.T) {
	punch := puncherAnswering(t, func(command []string) [][]string {
		return [][]string{{"ERROR", command[1], "REAPER did not start recording again after the roll. The earlier audio is kept."}}
	})
	got, err := punch.Roll(t.Context(), rollTrack, 40)
	want := dawport.Result{Changed: true, Message: messageRollStopped}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("Roll = %+v, %v; want %+v", got, err, want)
	}
}

func TestRollIsGatedByTheResolverAndSendsNothingWhenRefused(t *testing.T) {
	sentence := "Experimental REAPER actions are off. Turn them on in Settings to roll."
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: sentence}}
	})
	got, err := adapter.Role(dawport.CapPunch).(dawport.Puncher).Roll(t.Context(), rollTrack, 40)
	if err != nil || !reflect.DeepEqual(got, dawport.Refused(sentence)) {
		t.Errorf("Roll with punch refused = %+v, %v", got, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused roll wrote %d commands", n)
	}
}

// REAPER keeps the earlier audio as a take, a cut moves the audio to the Cuts track, a chain on a range is take FX that come
// off again, and a stack makes later reads takes and moves their items to the Cuts track, so punch, cut_range, fx_range and
// stack_takes are native and not destructive, with REAPER up or down.
func TestPunchCutRangeFXRangeAndStackTakesAreNativeAndNotDestructive(t *testing.T) {
	adapter, _ := newAdapter(t, nil)
	native := map[dawport.Capability]bool{dawport.CapPunch: true, dawport.CapCutRange: true, dawport.CapFXRange: true, dawport.CapStackTakes: true}
	for name, d := range map[string]dawport.Describer{"adapter": adapter, "declaration": Declaration().(dawport.Describer)} {
		for c := range native {
			if got := d.Depth(c); got != (dawport.Depth{Mode: dawport.ModeNative}) {
				t.Errorf("%s: %s depth = %+v, want native and not destructive", name, c, got)
			}
		}
		for _, spec := range dawport.Capabilities() {
			if !native[spec.Capability] && d.Depth(spec.Capability) != (dawport.Depth{}) {
				t.Errorf("%s: %s declares a depth %+v", name, spec.Capability, d.Depth(spec.Capability))
			}
		}
	}
}

const cutItem = "{00000002-0000-4000-8000-000000000002}"

func rangeCutterAnswering(t *testing.T, answer func(command []string) [][]string) dawport.RangeCutter {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	return adapter.Role(dawport.CapCutRange).(dawport.RangeCutter)
}

func cutRequest(words int, mode dawport.CutMode) dawport.DeleteRangeRequest {
	return dawport.DeleteRangeRequest{
		RangeRequest: dawport.RangeRequest{ChapterID: "ch-1", ItemGUID: cutItem, Start: 14, End: 16, Words: words},
		Mode:         mode,
		FadeMs:       10,
	}
}

// A cut is one undo step (ADR 0860 point 5), and the command gets the request's item, range, mode and fade.
func TestDeleteRangeCutsTheWordsInOneUndoStep(t *testing.T) {
	var sent []string
	cut := rangeCutterAnswering(t, func(command []string) [][]string {
		sent = command
		return [][]string{{"RANGE_CUT", command[1], cutItem, "{00000009-0000-4000-8000-000000000009}", "1"}}
	})
	for words, message := range map[int]string{1: "Deleted 1 word and their audio in REAPER.", 3: "Deleted 3 words and their audio in REAPER.", 0: "Deleted the words and their audio in REAPER."} {
		got, err := cut.DeleteRange(t.Context(), cutRequest(words, dawport.CutGap))
		want := dawport.OK(message, true).WithUndoSteps(1)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("DeleteRange = %+v, %v; want %+v", got, err, want)
		}
	}
	if want := []string{"delete_range", cutItem, "14.000000", "16.000000", "gap", "10"}; !reflect.DeepEqual(append([]string{sent[0]}, sent[2:]...), want) {
		t.Errorf("command = %v, want %v after the run", sent, want)
	}
}

func TestDeleteRangeRefusals(t *testing.T) {
	overlap := "Another item on the track overlaps the range to cut, so nothing was cut."
	for _, tc := range []struct {
		name   string
		answer []string
		want   dawport.Result
	}{
		{"stale", []string{"ITEM_STALE", cutItem, "item"}, dawport.RefusedStale("That passage's item is no longer in the REAPER project. Read the project again.")},
		{"recording", []string{"ERROR", "REAPER is recording. Stop recording first."}, dawport.Refused("REAPER is recording. Stop recording first.")},
		{"outside", []string{"ERROR", "The range to cut is not inside that item."}, dawport.Refused("The range to cut is not inside that item.")},
		{"overlap", []string{"ERROR", overlap}, dawport.Refused(overlap)},
		{"bad range", []string{"ERROR", "The range to cut is not a usable pair of times."}, dawport.Refused("The range to cut is not a usable pair of times.")},
	} {
		cut := rangeCutterAnswering(t, func(command []string) [][]string {
			return [][]string{append([]string{tc.answer[0], command[1]}, tc.answer[1:]...)}
		})
		got, err := cut.DeleteRange(t.Context(), cutRequest(2, dawport.CutClose))
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: DeleteRange = %+v, %v; want %+v", tc.name, got, err, tc.want)
		}
	}
}

func TestDeleteRangeRefusesABadRequestWithoutSendingIt(t *testing.T) {
	adapter, dir := newAdapter(t, func(dawport.Capability) error { return nil })
	cut := adapter.Role(dawport.CapCutRange).(dawport.RangeCutter)
	bad := cutRequest(2, dawport.CutClose)
	bad.End = bad.Start
	got, err := cut.DeleteRange(t.Context(), bad)
	if err != nil || !reflect.DeepEqual(got, dawport.Refused("The range to cut is not a usable pair of times.")) {
		t.Errorf("DeleteRange with an empty range = %+v, %v", got, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused cut wrote %d commands", n)
	}
}

func TestDeleteRangeIsGatedByTheResolverAndSendsNothingWhenRefused(t *testing.T) {
	sentence := "Experimental REAPER actions are off. Turn them on in Settings to cut words and audio."
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: sentence}}
	})
	got, err := adapter.Role(dawport.CapCutRange).(dawport.RangeCutter).DeleteRange(t.Context(), cutRequest(2, dawport.CutClose))
	if err != nil || !reflect.DeepEqual(got, dawport.Refused(sentence)) {
		t.Errorf("DeleteRange with cut_range refused = %+v, %v", got, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused cut wrote %d commands", n)
	}
}

const (
	fxRangePiece = "{00000009-0000-4000-8000-000000000009}"
	fxRangeChain = "Voice/Radio.RfxChain"
)

func rangeFXApplierAnswering(t *testing.T, answer func(command []string) [][]string) dawport.RangeFXApplier {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, answer)
	return adapter.Role(dawport.CapFXRange).(dawport.RangeFXApplier)
}

func fxRangeRequest(words int) dawport.FXRangeRequest {
	return dawport.FXRangeRequest{
		RangeRequest: dawport.RangeRequest{ChapterID: "ch-1", ItemGUID: cutItem, Start: 14, End: 16, Words: words},
		ChainID:      fxRangeChain,
		ChainName:    fxRangeChain,
		FadeMs:       10,
	}
}

// A chain on a range is one undo step (ADR 0860 point 5), and the command gets the request's item, range, chain and fade.
func TestApplyFXToRangePutsTheChainOnInOneUndoStep(t *testing.T) {
	var sent []string
	fx := rangeFXApplierAnswering(t, func(command []string) [][]string {
		sent = command
		return [][]string{{"RANGE_FX_APPLIED", command[1], fxRangePiece, "{0000000A-0000-4000-8000-00000000000A}", fxRangeChain, "1"}}
	})
	for words, message := range map[int]string{
		1: "Added Voice/Radio.RfxChain to 1 word in REAPER.",
		3: "Added Voice/Radio.RfxChain to 3 words in REAPER.",
		0: "Added Voice/Radio.RfxChain to the words in REAPER.",
	} {
		got, err := fx.ApplyFXToRange(t.Context(), fxRangeRequest(words))
		want := dawport.OK(message, true).WithUndoSteps(1)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("ApplyFXToRange = %+v, %v; want %+v", got, err, want)
		}
	}
	if want := []string{"apply_fx_range", cutItem, "14.000000", "16.000000", fxRangeChain, "10"}; !reflect.DeepEqual(append([]string{sent[0]}, sent[2:]...), want) {
		t.Errorf("command = %v, want %v after the run", sent, want)
	}
}

func TestRemoveFXFromRangeJoinsThePieceBackInOneUndoStepOrChangesNothing(t *testing.T) {
	var sent []string
	undo := "1"
	fx := rangeFXApplierAnswering(t, func(command []string) [][]string {
		sent = command
		return [][]string{{"RANGE_FX_REMOVED", command[1], cutItem, fxRangeChain, undo}}
	})
	got, err := fx.RemoveFXFromRange(t.Context(), fxRangePiece, fxRangeChain)
	if want := dawport.OK("Voice/Radio.RfxChain taken off in REAPER.", true); err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("RemoveFXFromRange = %+v, %v; want %+v", got, err, want)
	}
	if want := []string{"remove_fx_range", fxRangePiece, fxRangeChain}; !reflect.DeepEqual(append([]string{sent[0]}, sent[2:]...), want) {
		t.Errorf("command = %v, want %v after the run", sent, want)
	}
	undo = "0"
	got, err = fx.RemoveFXFromRange(t.Context(), fxRangePiece, fxRangeChain)
	if want := dawport.OK("Voice/Radio.RfxChain is not on that piece in REAPER, so nothing changed.", false); err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("RemoveFXFromRange with nothing to take off = %+v, %v; want %+v", got, err, want)
	}
}

func TestFXRangeRefusals(t *testing.T) {
	failed := "REAPER did not load the FX chain. The item was split: press Undo in REAPER to rejoin it."
	for _, tc := range []struct {
		name   string
		answer []string
		want   dawport.Result
	}{
		{"stale", []string{"ITEM_STALE", cutItem, "item"}, dawport.RefusedStale("That passage's item is no longer in the REAPER project. Read the project again.")},
		{"recording", []string{"ERROR", "REAPER is recording. Stop recording first."}, dawport.Refused("REAPER is recording. Stop recording first.")},
		{"not listed", []string{"ERROR", "That FX chain is not in the FXChains folder REAPER lists."}, dawport.Refused("That FX chain is not in the FXChains folder REAPER lists.")},
		{"outside", []string{"ERROR", "The range for the chain is not inside that item."}, dawport.Refused("The range for the chain is not inside that item.")},
		{"failed", []string{"ERROR", failed}, dawport.Refused(failed)},
	} {
		fx := rangeFXApplierAnswering(t, func(command []string) [][]string {
			return [][]string{append([]string{tc.answer[0], command[1]}, tc.answer[1:]...)}
		})
		if got, err := fx.ApplyFXToRange(t.Context(), fxRangeRequest(2)); err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: ApplyFXToRange = %+v, %v; want %+v", tc.name, got, err, tc.want)
		}
		if got, err := fx.RemoveFXFromRange(t.Context(), fxRangePiece, fxRangeChain); err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: RemoveFXFromRange = %+v, %v; want %+v", tc.name, got, err, tc.want)
		}
	}
}

func TestFXRangeRefusesABadRequestWithoutSendingIt(t *testing.T) {
	adapter, dir := newAdapter(t, func(dawport.Capability) error { return nil })
	fx := adapter.Role(dawport.CapFXRange).(dawport.RangeFXApplier)
	empty := fxRangeRequest(2)
	empty.End = empty.Start
	if got, err := fx.ApplyFXToRange(t.Context(), empty); err != nil || !reflect.DeepEqual(got, dawport.Refused("The range for the chain is not a usable pair of times.")) {
		t.Errorf("ApplyFXToRange with an empty range = %+v, %v", got, err)
	}
	path := fxRangeRequest(2)
	path.ChainName = "../reaper.ini"
	notListed := dawport.Refused("That FX chain is not in the FXChains folder REAPER lists.")
	if got, err := fx.ApplyFXToRange(t.Context(), path); err != nil || !reflect.DeepEqual(got, notListed) {
		t.Errorf("ApplyFXToRange with a path = %+v, %v", got, err)
	}
	if got, err := fx.RemoveFXFromRange(t.Context(), fxRangePiece, `C:\x.RfxChain`); err != nil || !reflect.DeepEqual(got, notListed) {
		t.Errorf("RemoveFXFromRange with a path = %+v, %v", got, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused chain wrote %d commands", n)
	}
}

func TestFXRangeIsGatedByTheResolverAndSendsNothingWhenRefused(t *testing.T) {
	sentence := "Experimental REAPER actions are off. Turn them on in Settings to add an effect to words."
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: sentence}}
	})
	fx := adapter.Role(dawport.CapFXRange).(dawport.RangeFXApplier)
	if got, err := fx.ApplyFXToRange(t.Context(), fxRangeRequest(2)); err != nil || !reflect.DeepEqual(got, dawport.Refused(sentence)) {
		t.Errorf("ApplyFXToRange with fx_range refused = %+v, %v", got, err)
	}
	if got, err := fx.RemoveFXFromRange(t.Context(), fxRangePiece, fxRangeChain); err != nil || !reflect.DeepEqual(got, dawport.Refused(sentence)) {
		t.Errorf("RemoveFXFromRange with fx_range refused = %+v, %v", got, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused chain wrote %d commands", n)
	}
}

const (
	stackBase     = "{A0000001-0000-4000-8000-000000000001}"
	stackBaseTake = "{A0000002-0000-4000-8000-000000000002}"
	stackRetry    = "{A0000004-0000-4000-8000-000000000004}"
)

func takeStackerAnswering(t *testing.T, answer func(command []string, payload string) [][]string) dawport.TakeStacker {
	t.Helper()
	client, dir := newClient(t)
	adapter, err := New(client, func(dawport.Capability) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	answerCommands(t, client, dir, func(command []string) [][]string {
		payload, _ := os.ReadFile(command[2])
		return answer(command, string(payload))
	})
	return adapter.Role(dawport.CapStackTakes).(dawport.TakeStacker)
}

func stackTakesRequest(shift float64, from, to float64) dawport.StackRequest {
	return dawport.StackRequest{
		ChapterID: "ch-1",
		Shift:     shift,
		Groups:    []dawport.StackGroup{{PassageID: "p-1", ItemGUID: stackBase, Base: stackBaseTake, Moves: []dawport.StackMove{{TakeID: stackRetry, From: from, To: to, Len: 4}}}},
	}
}

// A stack and an un-stack are one undo step each (ADR 0860 point 5), and the payload carries the request's GUIDs and times.
func TestStackAndUnstackTakesAreOneUndoStepAndSendThePayload(t *testing.T) {
	var commands, payloads []string
	stacker := takeStackerAnswering(t, func(command []string, payload string) [][]string {
		commands, payloads = append(commands, command[0]), append(payloads, payload)
		tag := map[string]string{"stack_takes": "TAKES_STACKED", "unstack_takes": "TAKES_UNSTACKED"}[command[0]]
		return [][]string{{tag, command[1], "1", "1", "-6.000", "1"}}
	})
	got, err := stacker.StackTakes(t.Context(), stackTakesRequest(-6, 16, 10))
	if want := dawport.OK("Stacked 1 take in REAPER.", true).WithUndoSteps(1); err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("StackTakes = %+v, %v; want %+v", got, err, want)
	}
	got, err = stacker.UnstackTakes(t.Context(), stackTakesRequest(6, 10, 16))
	if want := dawport.OK("Moved back 1 take in REAPER.", true).WithUndoSteps(1); err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("UnstackTakes = %+v, %v; want %+v", got, err, want)
	}
	if want := []string{"stack_takes", "unstack_takes"}; !reflect.DeepEqual(commands, want) {
		t.Fatalf("commands = %v, want %v", commands, want)
	}
	want := "shift|-6.000000\ngroup|" + stackBase + "|" + stackBaseTake + "\nmove|" + stackRetry + "|16.000000|10.000000|4.000000\n"
	if payloads[0] != want {
		t.Errorf("stack payload = %q, want %q", payloads[0], want)
	}
	if !strings.Contains(payloads[1], "move|"+stackRetry+"|10.000000|16.000000|4.000000") {
		t.Errorf("unstack payload = %q", payloads[1])
	}
	if takesMessage("Stacked", 3) != "Stacked 3 takes in REAPER." {
		t.Errorf("plural = %q", takesMessage("Stacked", 3))
	}
}

func TestStackTakesRefusals(t *testing.T) {
	stale := dawport.RefusedStale("That item changed in REAPER since the app read it. Nothing was changed.")
	between := "Other audio sits between the reads, so nothing was stacked."
	for _, tc := range []struct {
		name   string
		answer []string
		want   dawport.Result
	}{
		{"stale", []string{"ITEM_STALE", stackRetry, "take"}, stale},
		{"nothing", []string{"ERROR", "Nothing to stack."}, dawport.Refused("There are no retries to move in REAPER.")},
		{"recording", []string{"ERROR", "REAPER is recording. Stop recording first."}, dawport.Refused("REAPER is recording. Stop recording first.")},
		{"unreadable", []string{"ERROR", "The stacking request is not readable, so nothing changed."}, dawport.Refused("The takes to stack are not ones REAPER can read. Nothing was changed.")},
		{"between", []string{"ERROR", between}, dawport.Refused(between)},
	} {
		stacker := takeStackerAnswering(t, func(command []string, _ string) [][]string {
			return [][]string{append([]string{tc.answer[0], command[1]}, tc.answer[1:]...)}
		})
		if got, err := stacker.StackTakes(t.Context(), stackTakesRequest(-6, 16, 10)); err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: StackTakes = %+v, %v; want %+v", tc.name, got, err, tc.want)
		}
	}
}

func TestStackTakesRefusesABadRequestWithoutSendingIt(t *testing.T) {
	adapter, dir := newAdapter(t, func(dawport.Capability) error { return nil })
	stacker := adapter.Role(dawport.CapStackTakes).(dawport.TakeStacker)
	if got, err := stacker.StackTakes(t.Context(), dawport.StackRequest{ChapterID: "ch-1"}); err != nil || !reflect.DeepEqual(got, dawport.Refused("There are no retries to move in REAPER.")) {
		t.Errorf("StackTakes with no group = %+v, %v", got, err)
	}
	bad := stackTakesRequest(-6, 16, 10)
	bad.Groups[0].ItemGUID = "item-1"
	if got, err := stacker.StackTakes(t.Context(), bad); err != nil || !reflect.DeepEqual(got, dawport.Refused("The takes to stack are not ones REAPER can read. Nothing was changed.")) {
		t.Errorf("StackTakes with an item that is not a GUID = %+v, %v", got, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused stack wrote %d commands", n)
	}
}

func TestStackTakesIsGatedByTheResolverAndSendsNothingWhenRefused(t *testing.T) {
	sentence := "Experimental REAPER actions are off. Turn them on in Settings to stack takes."
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: sentence}}
	})
	stacker := adapter.Role(dawport.CapStackTakes).(dawport.TakeStacker)
	if got, err := stacker.StackTakes(t.Context(), stackTakesRequest(-6, 16, 10)); err != nil || !reflect.DeepEqual(got, dawport.Refused(sentence)) {
		t.Errorf("StackTakes with stack_takes refused = %+v, %v", got, err)
	}
	if got, err := stacker.UnstackTakes(t.Context(), stackTakesRequest(6, 10, 16)); err != nil || !reflect.DeepEqual(got, dawport.Refused(sentence)) {
		t.Errorf("UnstackTakes with stack_takes refused = %+v, %v", got, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused stack wrote %d commands", n)
	}
}
