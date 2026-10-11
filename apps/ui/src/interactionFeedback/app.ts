// The interaction feedback rows for the app call sites (see interactionFeedback.catalog.ts for what a row says).
import { type FeedbackRow, row, startup, subscription } from './row';

// prettier-ignore
export const appFeedback: Record<string, FeedbackRow> = {
  // App.tsx
  'src/App.tsx::bootstrap#1': row('event', 'file-io', 'na', 'na', 'ui', 'toast', 'na', 'ok', 'refreshBootstrap catches its own failure and says so (phase 6); every caller runs it from an event or a `void`.'),
  'src/App.tsx::ready#1': startup('Startup: the startup screen shows the error and Retry.'),
  'src/App.tsx::bootstrap#2': startup('Startup: the startup screen shows the error and Retry.'),
  'src/App.tsx::reportClientDiagnostic#1': row('effect', 'file-io', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'A diagnostic must never throw or show a second error while one is already being reported.'),
  'src/App.tsx::reportClientDiagnostic#2': row('event', 'file-io', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'A diagnostic must never throw or show a second error while one is already being reported.'),
  'src/App.tsx::reportClientDiagnostic#3': row('event', 'file-io', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'A diagnostic must never throw or show a second error while one is already being reported.'),
  'src/App.tsx::subscribeTranscript#1': subscription('The transcript state event.'),
  'src/App.tsx::subscribeJobEnded#1': subscription('A host job that ends becomes a toast for the jobs that can finish elsewhere (ADR 0076).'),
  'src/App.tsx::systemNotify#1': row('event', 'os-dialog', 'na', 'na', 'na', 'silent', 'na', 'exempt', 'An OS notification is a courtesy, not load-bearing: the host already swallows a failed or unavailable sender (N1-N4), and the app-level toast from the same job:ended event is the record of what happened.'),
  'src/App.tsx::subscribeNotices#1': subscription('Host notices (a file kept aside) become toasts.'),
  'src/App.tsx::subscribeUpdate#1': subscription('The update check finding a newer release becomes one toast.'),
  'src/App.tsx::subscribeLiveUpdateHealth#1': subscription('Degraded live updates become one toast.'),
  'src/App.tsx::subscribeProjectAttach#1': subscription('A project attach refreshes the bootstrap or shows why it was refused.'),
  'src/studio/slots.ts::manuscriptChapters#1': row('effect', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'The jump menu\'s "Go to <chapter>" list, the store\'s chapters slot, loaded from App when a manuscript arrives: a failed read leaves the chapter rows out while every page still shows, and the pages that need the chapters report the real error.'),
  'src/studio/slots.ts::subscribeJobEnded#1': subscription('A job that ends marks the store\'s chapters slot stale, so the jump menu\'s chapter list reloads after an import or a re-split.'),
  'src/studio/StudioProvider.tsx::subscribeProjectAttach#1': subscription('A project attach resets the store and clears the journal, so no slot shows the previous project\'s data.'),
  // ports/measurements.ts: no screen reads the port yet; the screen that does owns the failure path of its own read.
  'src/ports/editLog.ts::editingAcceptedList#1': row('effect', 'file-io', 'na', 'na', 'ui', 'unhandled', 'na', 'owned', 'The accepted words of the editing records port; a rejection reaches the caller, and the first screen to use the port shows it.', '#1119'),
  'src/ports/editLog.ts::editingAccept#1': row('effect', 'file-io', 'na', 'na', 'ui', 'unhandled', 'na', 'owned', 'Keeping words as read, in the editing records port; a rejection reaches the caller, and the first screen to use the port shows it.', '#1119'),
  'src/ports/editLog.ts::editingUnaccept#1': row('effect', 'file-io', 'na', 'na', 'ui', 'unhandled', 'na', 'owned', 'Taking words back from the kept list, in the editing records port; a rejection reaches the caller, and the first screen to use the port shows it.', '#1119'),
  'src/ports/measurements.ts::productionOverview#1': row('effect', 'file-io', 'na', 'na', 'ui', 'unhandled', 'na', 'owned', 'The chapter-length reading of the measurements port; a rejection reaches the caller, and the first screen to read the port shows it.', '#1119'),
  'src/ports/measurements.ts::recorderState#1': row('effect', 'file-io', 'na', 'na', 'ui', 'unhandled', 'na', 'owned', 'The take-log reading of the measurements port; a rejection reaches the caller, and the first screen to read the port shows it.', '#1119'),
  'src/ports/takes.ts::workspaceTakeEvidence#1': row('effect', 'file-io', 'na', 'na', 'ui', 'unhandled', 'na', 'owned', 'The take evidence reading of the takes port; a rejection reaches the caller, and the first screen to read the port shows it.', '#1119'),
  // components/layout/useNavCounts.ts
  'src/components/layout/useNavCounts.ts::guidePronunciationQueries#1': row('effect', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'The rail\'s Story Bible badge: cosmetic, read on every page move; a failed read draws no badge (never a made-up number) and the Story Bible page reports the real error.'),
  'src/components/layout/useNavCounts.ts::findingsSummary#1': row('effect', 'file-io', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'The rail\'s Proof badge: cosmetic, read on every page move; a failed read draws no badge and the Proof page reports the real error.'),
  'src/components/layout/useNavCounts.ts::pickupsState#1': row('effect', 'instant', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'The rail\'s Pickups badge: only what REAPER last reported (it never asks REAPER to count); a failed read draws no badge.'),
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
    'The one shared binding behind the pill, Tracks and Settings\' DAW category: a single usePendingAction ref guards all three call sites, not just the one whose button visibly disables. A folder mismatch is its own toast, not an unhandled rejection; the linked file persists in the project manifest, so it survives navigation.',
  ),

  // useCapability.ts: one capability's live entry from the DAW port's capability report, for any
  // caller wrapping a control in CapabilityGate.
  'src/useCapability.ts::dawCapabilities#1': row('mount', 'file-io', 'na', 'na', 'event', 'silent', 'na', 'exempt', 'Seeds the entry useCapability exposes before the very next daw_capabilities_changed event takes over; a failed seed just leaves the capability unsupported/unavailable a moment longer, the same as an unknown capability.'),
  'src/useCapability.ts::subscribeDawCapabilities#1': subscription("The DAW port's capability report: every caller of useCapability for the same or a different capability reads this one subscription."),

  // useDawKind.ts: the session's DAW kind, for FindingDetail's take-management gating.
  'src/useDawKind.ts::dawCapabilities#1': row('mount', 'file-io', 'na', 'na', 'event', 'silent', 'na', 'exempt', "Seeds the kind useDawKind exposes before the very next daw_capabilities_changed event takes over; a failed seed just leaves the kind unknown a moment longer, the same as before the first answer."),
  'src/useDawKind.ts::subscribeDawCapabilities#1': subscription("The DAW port's capability report, the same event useCapability reads: a second subscription, since useDawKind wants the whole payload's daw field rather than one capability's entry."),

  // useZoom.ts: the header's zoom group. The readout is the only feedback surface
  // every call here is instant (the binding sets/reads a number on the window, no file or network,
  // docs/architecture/threat-model.md row 3) and a failure just leaves the readout at the level it already showed.
  'src/hooks/useZoom.ts::windowZoom#1': row('mount', 'instant', 'na', 'na', 'ui', 'silent', 'na', 'exempt', "Seeds the readout at the window's real level before the first paint settles; a failed read leaves it at the 100% default until the next resize re-reads it."),
  'src/hooks/useZoom.ts::windowSetZoom#1': row('click', 'instant', 'inline', 'none', 'ui', 'silent', 'yes', 'exempt', 'Zoom out, Zoom in, reset, and Ctrl+=/-/0: the readout itself is the acknowledgment and the completion. A failed set leaves the previous level shown, visibly unchanged, and survives navigation like the level itself.'),
  'src/hooks/useZoom.ts::windowZoom#2': row('effect', 'instant', 'na', 'na', 'ui', 'silent', 'na', 'exempt', "The resize-triggered re-read for an external Ctrl+wheel/pinch change (ADR 0201 item 3, no zoom-changed event on Windows); a failed read just leaves the readout at its last known level until the next resize."),
  // the settled level is also persisted to disk, debounced by
  // the same settle as the announcement, so it survives a quit; the readout has already shown the new level, so there
  // is nothing more to acknowledge here.
  'src/hooks/useZoom.ts::windowSaveZoom#1': row('timer', 'file-io', 'na', 'na', 'na', 'silent', 'na', 'exempt', "The debounced persist of the settled level; a failed write just leaves the next launch opening at the last level that did save, with no error surfaced for a header control that already did what the narrator asked."),

  // useDawRecording.ts: the DAW port's live transport state, read only
  // by LiveCommandRouter to silence `noisy` commands while REAPER records. Not narrator-facing on its own -
  // the router's own status region, not a toast, is how a failed press is explained - so this is a background feed,
  // exempt like every other subscribe-based hook.
  'src/input/useDawRecording.ts::subscribeDawTransport#1': subscription('The DAW port\'s live transport state (daw_transport_changed): every gesture the router resolves reads this one subscription\'s current value.'),

  // Studio bookmarks (ADR 0771, ADR 0820): the commands return the host's sentence as a refusal; no screen calls them yet.
  'src/studio/slots.ts::bookmarksList#1': row('effect', 'file-io', 'na', 'na', 'ui', 'na', 'na', 'exempt', 'The bookmarks slot load, on focus and after each command; the store records a failed load and the change that was made stands.'),
};
