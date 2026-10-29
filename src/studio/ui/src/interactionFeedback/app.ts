// The interaction feedback rows for the app call sites (see interactionFeedback.catalog.ts for what a row says).
import { type FeedbackRow, row, startup, subscription } from './row';

// prettier-ignore
export const appFeedback: Record<string, FeedbackRow> = {
  // daw/dawSession.ts: the app's one DAW session
  'src/daw/dawSession.ts::dawCapabilities#1': row('mount', 'file-io', 'none', 'none', 'ui', 'inline', 'no', 'ok', 'The one read of the DAW capability report, at app start, on focus, while the DAW has not answered and on Check again; a failed read is kept as capsReadFailed/capsError and every screen that shows the DAW says it cannot tell.'),
  'src/daw/dawSession.ts::dawCapabilities#2': row('event', 'file-io', 'none', 'none', 'ui', 'inline', 'no', 'ok', 'A fresh read a caller gates an action on (the DAW client port); a failure rejects to that caller and is also kept in the session.'),
  'src/daw/dawSession.ts::dawMeters#1': row('mount', 'instant', 'na', 'na', 'ui', 'inline', 'na', 'ok', 'Reads the DAW\'s own meters four times a second while any screen holds a lease (the Booth footer does while it shows), one read at a time; a refusal or failure is the meters\' off state in the DAW\'s own sentence, and an answer older than two seconds says it cannot tell and when the levels were last heard.'),
  'src/daw/dawSession.ts::workspaceProjectFx#1': row('mount', 'file-io', 'none', 'none', 'ui', 'inline', 'no', 'ok', 'The FX on the DAW\'s tracks, read at app start, when the DAW starts or stops answering, on focus and on Check again; a failed read keeps its sentence and no stale list.'),
  'src/daw/dawSession.ts::subscribeDawCapabilities#1': subscription('The DAW port\'s capability report: the session\'s one subscription, which every screen that shows the DAW (the banner, gates, Settings, the Booth) reads, without a reload.'),
  'src/daw/dawSession.ts::subscribeDawTransport#1': subscription('The DAW port\'s live transport state (daw_transport_changed): the session\'s one subscription, read by the Booth\'s no-sound rule, the companion\'s playhead badge, the resume prompt and the command router.'),
  'src/daw/dawSession.ts::dawCapabilities#3': row('event', 'file-io', 'none', 'none', 'ui', 'inline', 'no', 'ok', 'A fresh read a caller gates an action on (the DAW client port); a failure rejects to that caller and is also kept in the session.'),
  'src/daw/dawSession.ts::dawMeters#2': row('mount', 'instant', 'na', 'na', 'ui', 'inline', 'na', 'ok', 'The meters\' read loop (see dawMeters#1): the same call, one at a time.'),
  'src/daw/dawSession.ts::subscribeDawCapabilities#2': subscription('The session\'s start attaches the one capability subscription (see #1).'),
  'src/daw/dawSession.ts::subscribeDawTransport#2': subscription('The session\'s start attaches the one transport subscription (see #1).'),
  'src/daw/dawSession.ts::workspaceProjectFx#2': row('mount', 'file-io', 'none', 'none', 'ui', 'inline', 'no', 'ok', 'The session\'s FX read (see workspaceProjectFx#1).'),
  // App.tsx
  'src/App.tsx::bootstrap#1': row('event', 'file-io', 'na', 'na', 'ui', 'toast', 'na', 'ok', 'refreshBootstrap catches its own failure and says so; every caller runs it from an event or a `void`.'),
  'src/App.tsx::ready#1': startup('Startup: the startup screen shows the error and Retry.'),
  'src/App.tsx::bootstrap#2': startup('Startup: the startup screen shows the error and Retry.'),
  'src/App.tsx::reportClientDiagnostic#1': row('effect', 'file-io', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'A diagnostic must never throw or show a second error while one is already being reported.'),
  'src/App.tsx::reportClientDiagnostic#2': row('event', 'file-io', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'A diagnostic must never throw or show a second error while one is already being reported.'),
  'src/App.tsx::reportClientDiagnostic#3': row('event', 'file-io', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'A diagnostic must never throw or show a second error while one is already being reported.'),
  'src/App.tsx::subscribeTranscript#1': subscription('The transcript state event.'),
  'src/App.tsx::subscribeJobEnded#1': subscription('A host job that ends becomes a toast for the jobs that can finish elsewhere.'),
  'src/App.tsx::systemNotify#1': row('event', 'os-dialog', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'An OS notification is a courtesy, not load-bearing: the host already swallows a failed or unavailable sender (N1-N4), and the app-level toast from the same job:ended event is the record of what happened.'),
  'src/App.tsx::subscribeNotices#1': subscription('Host notices (a file kept aside) become toasts.'),
  'src/App.tsx::subscribeUpdate#1': subscription('The update check finding a newer release becomes one toast.'),
  'src/App.tsx::subscribeLiveUpdateHealth#1': subscription('Degraded live updates become one toast.'),
  'src/App.tsx::subscribeAudacityLink#1': subscription('An Audacity project\'s three facts (linked, reachable, open project matches) are the Audacity link\'s, so a change in the link re-reads the DAW facts bootstrap holds and the navigation chip, Settings and the Booth tell one story.'),
  'src/App.tsx::subscribeProjectAttach#1': subscription('A project attach refreshes the bootstrap or shows why it was refused.'),
  'src/studio/slots.ts::manuscriptChapters#1': row('effect', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'The jump menu\'s "Go to <chapter>" list, the store\'s chapters slot, loaded from App when a manuscript arrives: a failed read leaves the chapter rows out while every page still shows, and the pages that need the chapters report the real error.'),
  'src/studio/slots.ts::subscribeJobEnded#1': subscription('A job that ends marks the store\'s chapters slot stale, so the jump menu\'s chapter list reloads after an import or a re-split.'),
  'src/studio/StudioProvider.tsx::subscribeProjectAttach#1': subscription('A project attach resets the store and clears the journal, so no slot shows the previous project\'s data.'),
  // ports/measurements.ts: no screen reads the port yet; the screen that does owns the failure path of its own read.
  'src/ports/measurements.ts::productionOverview#1': row('effect', 'file-io', 'na', 'na', 'ui', 'unhandled', 'na', 'owned', 'The chapter-length reading of the measurements port; a rejection reaches the caller, and the first screen to read the port shows it.', '#1119'),
  'src/ports/measurements.ts::teleprompterRoomTone#1': row('effect', 'file-io', 'na', 'na', 'ui', 'inline', 'na', 'ok', 'The room tone the host kept for the microphone; the Booth footer reads it on open, on focus and every five seconds, and a rejected read shows "Room tone unavailable" in the footer chip until a read succeeds.'),
  'src/ports/measurements.ts::recorderState#1': row('effect', 'file-io', 'na', 'na', 'ui', 'unhandled', 'na', 'owned', 'The take-log reading of the measurements port; a rejection reaches the caller, and the first screen to read the port shows it.', '#1119'),
  'src/ports/takes.ts::workspaceTakeEvidence#1': row('effect', 'file-io', 'na', 'na', 'ui', 'unhandled', 'na', 'owned', 'The take evidence reading of the takes port; a rejection reaches the caller, and the first screen to read the port shows it.', '#1119'),
  // components/layout/useNavCounts.ts
  'src/components/layout/useNavCounts.ts::findingsSummary#1': row('effect', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'The rail\'s Proof badge: cosmetic, read on every page move; a failed read draws no badge and the Proof page reports the real error.'),
  'src/components/layout/useNavCounts.ts::pickupsList#1': row('effect', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'The rail\'s Pickups badge: the open lines of the Pickups page\'s list; a failed read draws no badge.'),
  'src/components/layout/useNavCounts.ts::pickupsList#2': row('effect', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'The rail\'s Proof badge adds the open pickups no note stands for, as the Proof page does; a failed read leaves the notes count alone.'),
  'src/components/layout/useNavCounts.ts::measureState#1': row('effect', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'The rail\'s Master & QC badge: the chapters whose measured file fails a check, read on every page move beside the chapters; a failed read draws no badge and the Master & QC page reports the real error.'),
  'src/components/layout/useNavCounts.ts::manuscriptChapters#1': row('effect', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'Pairs each measured file with its chapter for the Master & QC badge; a failed read draws no badge.'),
  'src/components/layout/useNavCounts.ts::subscribePickups#1': subscription('The pickups state event, so the rail\'s Pickups badge follows a count, import or resolve run.'),
  'src/input/useUserKeymap.ts::settingsForScope#1': row('mount', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'Reads the narrator\'s key remaps for the shortcut sheet and the router; unreadable, the catalogue defaults stay and Settings reports the real error.'),
  'src/App.tsx::settingsForScope#1': row('mount', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'Cosmetic: the narrator\'s entity colours; the built-in colours stay if the settings cannot be read, and Settings reports the real error.'),
  'src/App.tsx::chapterSyncPreview#1': row('effect', 'file-io', 'na', 'na', 'ui', 'toast', 'na', 'ok', 'Fills the consent dialog once chapterSyncState().ask is true; a failed read is a toast and the dialog keeps its "reading the saved project" placeholder.'),
  'src/App.tsx::chapterSyncSetEnabled#1': row('click', 'file-io', 'pending', 'pending', 'ui', 'toast', 'na', 'ok', 'Sync N chapters on the consent dialog: the button is busy until the first sync runs and the dialog closes on its own once ask flips false (the same chaptersync:state event Home\'s toast and Tracks\' panel read).'),
  'src/App.tsx::chapterSyncSetEnabled#2': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Not now on the consent dialog: a one-way write with nothing to wait for; the dialog closes once the event says consent is off, and a failure is a toast that leaves it open to try again.'),
  // Two more transcriptReset call sites in this file (Back/Forward's
  // own guard, and the popstate-recovery effect for a browser/mouse gesture that bypassed it), renumbering this one from #1.
  'src/App.tsx::transcriptReset#1': row(
    'effect',
    'instant',
    'na',
    'na',
    'na',
    'silent',
    'na',
    'exempt',
    "Best effort recovery for a popstate the app did not start (Risk 3): if it left a Proof chapter view with a compare run, the run is reset the same way a guarded move would; a reset that fails leaves the finished results in place, which is harmless.",
  ),
  'src/App.tsx::transcriptReset#2': row('click', 'instant', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'Best effort when leaving a Proof chapter view with a compare run through the nav: a reset that fails leaves the finished results in place, which is harmless.'),
  'src/App.tsx::transcriptReset#3': row('click', 'instant', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'Best effort when leaving a Proof chapter view with a compare run through guarded Back/Forward (a button, Alt+Left/Right, or a mouse button): same as the nav.'),
  'src/App.tsx::linkDawFile#1': row(
    'click',
    'os-dialog',
    'pending',
    'pending',
    'ui',
    'toast',
    'yes',
    'ok',
    'The one shared binding behind the pill, Tracks and Settings\' DAW category: a single usePendingAction ref guards all three call sites, not just the one whose button visibly disables. A refused file (not an .rpp, or gone) is its own toast, not an unhandled rejection, and a file in another folder links with a note saying where it is; the linked file persists in the project manifest, so it survives navigation.',
  ),

  // useCapability.ts: one capability's live entry from the DAW port's capability report, for any
  // caller wrapping a control in CapabilityGate.

  // useDawKind.ts: the session's DAW kind, for the take-management gating.

  // useZoom.ts: the zoom behind the header's zoom chip. The chip (off 100%) is the only feedback surface
  // every call here is instant (the binding sets/reads a number on the window, no file or network,
  // docs/architecture/threat-model.md row 3) and a failure just leaves the chip at the level it already showed.
  'src/hooks/useZoom.ts::windowZoom#1': row('mount', 'instant', 'na', 'na', 'ui', 'silent', 'na', 'exempt', "Seeds the zoom chip at the window's real level before the first paint settles; a failed read leaves it at the 100% default until the next resize re-reads it."),
  'src/hooks/useZoom.ts::windowSetZoom#1': row('click', 'instant', 'inline', 'none', 'ui', 'silent', 'yes', 'exempt', 'The jump menu zoom commands and Ctrl+=/-/0: the page resizing and the zoom chip (drawn off 100%) are the acknowledgment and the completion. A failed set leaves the previous level shown, visibly unchanged, and survives navigation like the level itself.'),
  'src/hooks/useZoom.ts::windowZoom#2': row('effect', 'instant', 'na', 'na', 'ui', 'silent', 'na', 'exempt', "The resize-triggered re-read for an external Ctrl+wheel/pinch change (docs/guides/using-the-app/navigation.md#zoom, no zoom-changed event on Windows); a failed read just leaves the zoom chip at its last known level until the next resize."),
  // the settled level is also persisted to disk, debounced by
  // the same settle as the announcement, so it survives a quit; the zoom chip has already shown the new level, so there
  // is nothing more to acknowledge here.
  'src/hooks/useZoom.ts::windowSaveZoom#1': row('timer', 'file-io', 'na', 'na', 'na', 'silent', 'na', 'exempt', "The debounced persist of the settled level; a failed write just leaves the next launch opening at the last level that did save, with no error surfaced for a header control that already did what the narrator asked."),

  // useDawRecording.ts: the DAW port's live transport state, read only
  // by LiveCommandRouter to silence `noisy` commands while REAPER records. Not narrator-facing on its own -
  // the router's own status region, not a toast, is how a failed press is explained - so this is a background feed,
  // exempt like every other subscribe-based hook.

  // Studio bookmarks: the commands return the host's sentence as a refusal; no screen calls them yet.
  'src/studio/slots.ts::bookmarksList#1': row('effect', 'file-io', 'na', 'na', 'ui', 'na', 'na', 'exempt', 'The bookmarks slot load, on focus and after each command; the store records a failed load and the change that was made stands.'),
};
