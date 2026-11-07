package trace

// The registry of events the host writes. Every event the app can record is declared here, with the fields it may carry
// and the values an enum may take; an Emit that strays from its definition loses the field and counts a drop. Add an
// event by adding a line, not by formatting a message (docs/prds/activity-trace.prd.md).

var (
	// AppStart is the first record of a launch.
	AppStart = Define("app", "start", LevelInfo,
		IDField("version"), EnumField("os", "windows", "linux", "darwin"), EnumField("arch", "amd64", "arm64", "386"),
		BoolField("dev"), IntField("host_api"))
	// AppStop is the last record of a clean shutdown.
	AppStop = Define("app", "stop", LevelInfo, DurField("uptime"))

	// DawClient says whether the REAPER file bridge was opened for the project and, when it was not, why.
	DawClient = Define("daw", "client", LevelInfo,
		IDField("kind"), BoolField("configured"),
		EnumField("reason", "ok", "no_session_dir", "other_daw", "bridge_new_failed"), PathField("session"))
	// DawReachableChanged is every flip of "the DAW answers", and the first look: how old the last heartbeat was and the
	// age it was judged against.
	DawReachableChanged = Define("daw", "reachable_changed", LevelInfo,
		IDField("kind"), BoolField("reachable"), BoolField("heard"), IntField("age_ms"), IntField("timeout_ms"))
	// DawCapsChanged summarizes the capability report whenever it changes.
	DawCapsChanged = Define("daw", "caps_changed", LevelInfo,
		IDField("kind"), BoolField("reachable"), IntField("available"), IntField("unavailable"))
	// DawCapUnavailable is one capability the report calls unavailable, and its reason code, written with each change.
	DawCapUnavailable = Define("daw", "cap_unavailable", LevelInfo, IDField("capability"), IDField("reason"))
	// DawLinkFacts is what Bootstrap told the page about the DAW project, and why it is not a match when it is not.
	DawLinkFacts = Define("daw", "link_facts", LevelInfo,
		BoolField("linked"), BoolField("reachable"), BoolField("matches"),
		EnumField("reason", "ok", "no_link", "stale", "no_project", "unsaved", "path_differs", "no_heartbeat"),
		BoolField("heard"), IntField("age_ms"))
	// DawDispatchError is the bridge's event reader failing, or recovering ("none"), written when its class changes.
	DawDispatchError = Define("daw", "dispatch_error", LevelWarn, ErrField("err"))
	// DawEventRejected is an event from the REAPER script that the app could not read.
	DawEventRejected = Define("daw", "event_rejected", LevelWarn, EnumField("kind", "reaper_event_invalid"))
)

var (
	// AppPanic is a panic the host caught and survived, and where it was caught.
	AppPanic = Define("app", "panic", LevelError,
		EnumField("where", "measure_job", "multi_package_job", "export_job", "install_job", "diagnostics_job", "package_job"))
	// TraceSwitched is the narrator turning the disk trace on or off.
	TraceSwitched = Define("app", "trace_switched", LevelInfo, BoolField("enabled"))

	// SidecarStart is a sidecar process launched: its program kind (the executable's name, never its arguments) and how.
	SidecarStart = Define("sidecar", "start", LevelInfo,
		IDField("kind"), EnumField("mode", "run", "start", "stream"))
	// SidecarExit is a sidecar process that ended: milliseconds to its first output (-1 when it wrote none), its total
	// time and its exit code.
	SidecarExit = Define("sidecar", "exit", LevelInfo,
		IDField("kind"), EnumField("mode", "run", "start", "stream"),
		IntField("first_output_ms"), DurField("total"), IntField("exit_code"))
	// SidecarStartFailed is a sidecar that could not be launched.
	SidecarStartFailed = Define("sidecar", "start_failed", LevelWarn,
		IDField("kind"), EnumField("mode", "run", "start", "stream"), ErrField("err"))
)

// The events the page writes, through SystemTraceBatch (from.go). They are the only events a page may name: the host drops any
// other, and a page's field is checked against the same definition as a host's. A page's binding name is its snake_case spelling.
var (
	// UINav is the page the narrator moved to.
	UINav = Define("ui", "nav", LevelInfo, IDField("page"))
	// UIBinding is one host call from the page: which, how long and how it ended.
	UIBinding = Define("ui", "binding", LevelInfo, IDField("name"), DurField("dur"), EnumField("outcome", "ok", "error"), ErrField("err"))
	// UIHostEvent is a live event from the host as the page received it, counted over one window, not one record per delivery.
	UIHostEvent = Define("ui", "host_event", LevelInfo, IDField("name"), IntField("count"))
	// UIOverlay is a dialog, popover, menu, drawer or toast opening or closing.
	UIOverlay = Define("ui", "overlay", LevelInfo,
		EnumField("kind", "dialog", "popover", "menu", "drawer", "toast"), EnumField("action", "open", "close"), IDField("id"))
	// UIError is a failure the page caught: where, and nothing of its message.
	UIError = Define("ui", "error", LevelError, EnumField("source", "boundary", "window_error", "unhandled_rejection"))
)
