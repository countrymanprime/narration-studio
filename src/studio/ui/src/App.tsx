import { logUi } from './api/uiLog';
import { appExtension } from './appExtension';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Bootstrap } from './types';
import { useApi } from './api/ApiContext';
import { AppShell, isActivePath, shellPages } from './components/layout/AppShell';
import { openJumpMenu } from './components/layout/JumpMenu';
import { HISTORY_TITLE, openHistoryPanel } from './components/layout/HistoryPanel';
import { useGoToCommands } from './components/layout/useGoToCommands';
import { useShellCommands } from './components/layout/useShellCommands';
import { useJournalEntries } from './components/layout/useJournalEntries';
import { OverlayProvider, useOverlay } from './overlay/OverlayProvider';
import { dawShortName, StudioProvider, useJournal, useStoreHandle, useStudio } from './studio/StudioProvider';
import { UnsavedDraftsProvider, useUnsavedDrafts, withinSaveLimit, SaveTimeout, type AskOptions } from './studio/drafts/unsavedDrafts';
import { discardVerdict, draftQuestion, saveVerdict, SETTINGS_HELD } from './studio/drafts/draftSentence';
import { useUndoToastLifetime } from './studio/useUndoToastLifetime';
import type { Journal } from './studio/journal/createJournal';
import { MANUSCRIPT_CHANGED } from './studio/slots';
import type { ContextMenuItem } from './components/primitives/ContextMenu';
import type { ManuscriptChapter } from './api/contracts/manuscript';
import { useDawKind } from './useDawKind';
import { useTheme } from './theme/ThemeContext';
import { useUserKeymap } from './input/useUserKeymap';
import { useNavCounts } from './components/layout/useNavCounts';
import { StartupScreen, type StartupState } from './components/layout/StartupScreen';
import type { ToastTone } from './components/primitives/Toast';
import { useProjectPicker } from './hooks/useProjectPicker';
import { useToasts } from './hooks/useToasts';
import { ProjectTrackProviders } from './components/chapterTracks/ChapterTrackState';
import { attachRefusalClaimed } from './components/connection/attachRefusal';
import { useChapterSync } from './hooks/useChapterSync';
import { BackgroundChecks } from './components/recordingcheck/background/BackgroundChecks';
import { useDawSession } from './daw/useDawSession';
import { usePendingAction } from './hooks/usePendingAction';
import { ChapterSyncConsentDialog } from './components/engine/ChapterSyncConsentDialog';
import type { ChapterSyncPreview } from './api/contracts/chapterSync';
import { useAppHistory } from './hooks/useAppHistory';
import { useSettingsOrigin } from './hooks/useSettingsOrigin';
import { useZoom } from './hooks/useZoom';
import { notificationForJobEnd, shouldNotifyForJobEnd, shouldQueueJobEndAnnouncement, toastForJobEnd, type JobEndFollow } from './jobEnded';
import { useBoothRecording } from './components/booth/useBoothRecording';
import { ConfirmDialog } from './components/primitives/ConfirmDialog';
import { ShortcutSheet } from './components/help/ShortcutSheet';
import { ScriptPage } from './components/script/page/ScriptPage';
import { creditsKindOfId } from './components/credits/creditsEntries';
import { NeedManuscript } from './components/layout/NeedManuscript';
import { NeedManuscriptImport } from './components/layout/NeedManuscriptImport';
import { registerCommandProvider } from './input/commandProviders';
import { ProjectPicker } from './components/project/ProjectPicker';
import { Guide } from './components/storybible/Guide';
import { SettingsPage } from './components/settings/page/SettingsPage';
import { NoProjectSettings } from './components/settings/page/NoProjectSettings';
import { categoryAnchorKey } from './components/settings/page/anchors';
import { CATEGORIES } from './components/settings/registry/categories';
import { BoothNextPage } from './components/booth/page/BoothNextPage';
import { type BoothTarget } from './components/booth/page/boothQuery';
import { addressPagePath, addressPath, type AddressPage } from './navigation/address';
import { scriptPath } from './navigation/scriptPath';
import { AddressGate } from './components/layout/AddressGate';
import { NotFoundPage } from './components/layout/NotFoundPage';
import { CompanionPage } from './components/booth/companion/CompanionPage';
import { EnginePanel } from './components/engine/EnginePanel';
import { EnginePanelProvider } from './components/engine/EnginePanelContext';
import { VoiceLayoutContext } from './components/engine/voiceLayout';
import { DawFileLinkedContext } from './components/connection/dawFileLinked';
import { LinkDawFileContext, linkOutcome, type LinkOutcome } from './components/connection/linkDawFile';
import { useAudacityLink } from './components/engine/useAudacityLink';
import { RetiredTracksRoute } from './components/engine/RetiredTracksRoute';
import { ProofChapterPage } from './components/proof/ProofChapterPage';
import { ProofPage } from './components/proof/ProofPage';
import { EditingPage } from './components/editing/EditingPage';
import type { DrawerTab } from './components/editing/drawer/drawerTabs';
import { PickupsPage } from './components/pickups/PickupsPage';
import { RedirectKeepingLocation } from './components/layout/RedirectKeepingLocation';
import { leavesCompareRun } from './components/proof/leavesCompareRun';
import { MasterPage } from './components/masterqc/page/MasterPage';
import { DeliveryPage } from './components/delivery/page/DeliveryPage';
import { parseMasterHash } from './components/master/masterLink';
import { ProductionPage } from './components/production/ProductionPage';
import { SchedulePage } from './components/schedule/SchedulePage';
import { TooltipProvider } from './components/primitives/Tooltip';
import { ErrorBoundary } from './components/primitives/ErrorBoundary';
import { trace, traceId } from './api/tracing';
import { DESKTOP_HOST_API_VERSION } from './hostApi';
import { isWireError } from './api/wire/WireError';
import { apiErrorMessage, describeApiError } from './api/errorMessage';
import { useCommand } from './input/useCommand';
import { useSaveShortcut } from './components/editing/page/useSaveInDaw';
import { useRecordingEngine } from './components/booth/useRecorder';

// The kept Settings categories another page can open Settings at, by URL anchor (`#cleanup` is Master's Silence cleanup link).
// `#teleprompter` is kept as an alias of `#booth` so links from before the Booth replaced the Teleprompter page still land;
// the category's key stays its settings tool's name.
const SETTINGS_ANCHORS: Record<string, string> = {
  '#recording': 'Recording',
  '#credits': 'Credits',
  '#delivery': 'Delivery',
  '#cleanup': 'Cleanup',
  '#booth': 'Teleprompter',
  '#teleprompter': 'Teleprompter',
  ...Object.fromEntries(CATEGORIES.map((category) => [`#category-${category.id}`, categoryAnchorKey(category.id)])),
};

/** Why a command that needs an open project is off while the picker is all there is. */
const NO_PROJECT_REASON = 'Open a project first';
const NO_CHAPTERS: ManuscriptChapter[] = [];

/** The least time between two re-reads of the DAW's facts that a window focus may cause. */
const DAW_FACTS_FOCUS_MS = 2_000;

const LIVE_UPDATES_DEGRADED = 'Some live updates from the desktop host could not be read, so what you see may be out of date. Reopen the page to refresh it.';

// `nav.back`/`nav.forward`'s dialog check: only the shortcut sheet wraps its content in
// `<CommandScope kind="dialog">` (ShortcutSheet.tsx), so for every other dialog the `dialog` scope never goes active and
// the router's own scope resolution would let Back/Forward fire over an open dialog. Kept as a direct check until
// dialogs claim the scope generically.
const isModalOpen = () => Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));

// A build on a static host (the public site, src/web) cannot rewrite `/proof` to index.html and may open from any sub-path or a sandboxed frame:
// its extension (appExtension.ts) asks for routes by the address hash. The popGuard below reads the pathname, so it reads the hash route there.
const hashRouting = (): boolean => appExtension().hashRouting === true;
const routePath = (): string => (hashRouting() ? window.location.hash.replace(/^#/, '').split(/[?#]/)[0] : window.location.pathname);

// A `popstate` the app did not start (the keyboard's or the system's Back, history.back()) that would leave a page holding something is stopped before
// the router sees it: once the route changed, the page would unmount and its edits be gone (dirty Settings), or its take left recording with no Stop
// (the Booth's leave guard, #3325), before any prompt. History is put back where it was and the same prompt the nav asks is shown. Two things hold a
// page: unsaved edits (dirty Settings, an editor's draft: "Unsaved settings", "Unsaved changes") and a page's leave guard ("Stop recording?"). The listener is added when this module loads, ahead of the
// router's own, which React Router adds when it mounts: listeners of one event run in the order they were added.
const popGuard = {
  /** Whether the page shown holds unsaved edits now: dirty Settings, or a draft an editor registered (`useUnsavedDraft`). */
  dirty: () => false,
  /** The route the router is showing (`routePath()` as of its last move): a pop that lands on the same route leaves nothing behind. */
  route: '',
  idx: 0,
  swallow: false,
  isOwnPop: (): boolean => false,
  ask: null as ((direction: 1 | -1) => void) | null,
  /** True while a page's leave guard asks before leaving. */
  leaveHeld: (): boolean => false,
  /** Asks the leave guard's question for a move of `direction`, and goes on only on Yes; does nothing while another question is already open. */
  askLeave: null as ((direction: 1 | -1) => void) | null,
};
/**
 * A field that saves when it loses focus (a Settings row, a due date, a limit) keeps what was typed as a draft until then, and a page that goes away under the
 * caret never sends the blur (#3400). An exit therefore takes the focus off a text field first, which commits it the way Tab would.
 */
const settleFocusedField = (): boolean => {
  const field = document.activeElement;
  // A box inside a dialog (the jump menu the exit was typed in) holds no page text, and blurring it would lose the focus the dialog gives back.
  if (!(field instanceof HTMLElement) || !field.matches('input, textarea, select') || field.closest('[role="dialog"], [role="alertdialog"]')) return false;
  settledField = field;
  field.blur();
  return true;
};
/** The field the last exit took the focus from, so Cancel can give it back with the caret. */
let settledField: HTMLElement | undefined;
/** How long a blur's commit takes to reach the shell's dirty flags (a state update, then the effects that report it) before the exit is decided. */
const SETTLE_MS = 40;
/** A key press on the way to stay inside this window of the question opening is the echo of the press that asked, not an answer. */
const ECHO_MS = 300;
/** "Not saved: <why>." when the error says why in words, else "Not saved." (a rejection with nothing, an object or an empty message has no reason to show). */
const notSaved = (error: unknown): string => {
  const why = isWireError(error) || error instanceof Error ? apiErrorMessage(error).trim() : typeof error === 'string' ? error.trim() : '';
  return why ? `Not saved: ${why}.` : 'Not saved.';
};
const historyIdx = () => (window.history.state as { idx?: number } | null)?.idx ?? 0;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event) => {
    if (popGuard.swallow) {
      popGuard.swallow = false;
      event.stopImmediatePropagation();
      return;
    }
    const next = historyIdx();
    // A dialog open (the shortcut sheet, a question, a form) is not left by a browser Back that holds nothing: the page stays and so does its text.
    const modalHolds = !popGuard.isOwnPop() && isModalOpen() && routePath() !== popGuard.route;
    const settled = !modalHolds && popGuard.askLeave !== null && settleFocusedField();
    const settingsHolds = !settled && popGuard.dirty() && routePath() !== popGuard.route;
    // A field just taken off the focus may be about to report an edit: the exit is decided again once it has (the same Back, asked of the shell).
    const leaveHolds = !settingsHolds && routePath() !== popGuard.route && (settled || modalHolds || popGuard.leaveHeld());
    const ask = settingsHolds
      ? popGuard.ask
      : modalHolds
        ? () => {}
        : settled
          ? (direction: 1 | -1) => void setTimeout(() => popGuard.askLeave?.(direction), SETTLE_MS)
          : popGuard.askLeave;
    if (!ask || popGuard.isOwnPop() || !(settingsHolds || leaveHolds)) {
      popGuard.idx = next;
      return;
    }
    event.stopImmediatePropagation();
    const delta = next - popGuard.idx;
    popGuard.swallow = true;
    window.history.go(-delta);
    ask(delta < 0 ? -1 : 1);
  });
}

export function App({ journal }: { journal?: Journal } = {}) {
  // Every build serves from the site root (base: '/', vite.config.ts), so this is a no-op basename; the Pages demo of src/web serves under
  // /<repository>/demo/, and without a matching basename react-router compares its routes ('/', '/proof', ...) against the full pathname and
  // matches nothing, so every page renders blank apart from the app shell. A hash-routed build has no basename.
  const Router = hashRouting() ? HashRouter : BrowserRouter;
  return (
    <Router {...(hashRouting() ? {} : { basename: import.meta.env.BASE_URL })}>
      {/* The journal and the overlay host are mounted once, here: a page asks the overlay for a confirm, a dialog or a toast by calling the service. */}
      <StudioProvider journal={journal}>
        {/* Positioned, so the host's visually hidden announcer lays out against the app and not the document. */}
        <div className="relative h-full">
          {/* The registry sits above the overlay host, which draws after its children: a dialog's own links (Check recordings) reach the guarded move too. */}
          <UnsavedDraftsProvider>
            <OverlayProvider>
              <AppRoutes />
            </OverlayProvider>
          </UnsavedDraftsProvider>
        </div>
      </StudioProvider>
    </Router>
  );
}

// A pending guarded move, either a path (the nav, a "go to" link) or a Back/Forward delta; the two guards below
// (unsaved Settings, leaving a Proof chapter view with a run) apply to both the same way (`guardedNavigate` and
// `attemptDelta` in `App`).
type PendingMove =
  | { kind: 'path'; path: string; state?: unknown; after?: () => void }
  | { kind: 'delta'; direction: 1 | -1 }
  | { kind: 'picker' }
  // A change inside the page that would drop a draft (another Settings category, another entry, Close on an editor): `run` is the change.
  | { kind: 'action'; run: () => void };

function AppRoutes() {
  const api = useApi();
  const dawSession = useDawSession();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    logUi('ui.nav', location.pathname);
    // Only the first path segment (the page): a deeper one can carry a chapter or a name.
    trace('ui.nav', { page: traceId(location.pathname.split('/')[1] || 'production') });
  }, [location.pathname]);
  const history = useAppHistory();
  const settingsOrigin = useSettingsOrigin();
  const zoom = useZoom(api);
  const journal = useJournal();
  const overlay = useOverlay();
  const dawKind = useDawKind();
  // Audacity's link state (null-safe: `chosen` is false for a project that records elsewhere); the header chip reads it for an Audacity project.
  const audacityLink = useAudacityLink();
  const theme = useTheme();
  const toggleTheme = () => theme.setPreference(theme.resolved === 'dark' ? 'light' : 'dark');
  const keymap = useUserKeymap();
  const journalRows = useJournalEntries(journal);
  useUndoToastLifetime(journal, overlay, location.pathname);
  // The latest guarded back/forward, read by the one document-level listener below (mounted once) instead
  // of resubscribing it on every render.
  const guardedBackRef = useRef<() => void>(() => {});
  const attemptDeltaRef = useRef<(direction: 1 | -1, fromPop?: boolean) => void>(() => {});
  const guardedForwardRef = useRef<() => void>(() => {});
  const prevPathnameRef = useRef(location.pathname);
  // The page the last move left. `unexpectedPop` is set one render after the location changes, by which time
  // `prevPathnameRef` already holds the new page.
  const leftPathnameRef = useRef(location.pathname);
  // The compare run's phase, read by the pop-recovery effect below without resubscribing it on every transcript event.
  const transcriptPhaseRef = useRef<string>('idle');
  const [data, setData] = useState<Bootstrap>();
  // When the bootstrap was last read, for the engine panel's "Last checked" beside the DAW facts it carries.
  const [dataReadAt, setDataReadAt] = useState<number | null>(null);
  const hasManuscript = Boolean(data?.manuscript);
  // One queue for the whole app: messages stack instead of replacing each other, an identical one that is showing starts its time again, and
  // an error stays until it is dismissed. `notify` and `dismiss` keep their identity, so a page effect that lists them never re-runs.
  const { notify: setNotice } = useToasts(overlay);
  // Chapter sync's consent: read here, once, so "Sync chapters to
  // tracks?" shows from every link path (the engine panel, an import, an attach) wherever the narrator happens to be.
  const chapterSync = useChapterSync(api);
  const [syncPreview, setSyncPreview] = useState<ChapterSyncPreview>();
  const [syncBusy, setSyncBusy] = useState(false);
  useEffect(() => {
    if (!chapterSync?.ask) {
      setSyncPreview(undefined);
      return;
    }
    let active = true;
    void api
      .chapterSyncPreview()
      .then((preview) => {
        if (active) setSyncPreview(preview);
      })
      .catch((error) => setNotice(describeApiError(error), 'error'));
    return () => {
      active = false;
    };
  }, [api, chapterSync?.ask, setNotice]);
  const [startup, setStartup] = useState<StartupState>('connecting');
  const [startupError, setStartupError] = useState('');
  const [startupDetails, setStartupDetails] = useState<string>();
  const [diagnosticId, setDiagnosticId] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const drafts = useUnsavedDrafts();
  // The answer being waited for: Cancel (or a new question) moves the token on, so a Save & continue that finishes after it does not leave.
  const moveToken = useRef(0);
  const settingsSaving = useRef<Promise<boolean> | null>(null);
  const [resolving, setResolving] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove>();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // The engine panel: one panel for the app, opened from the header's
  // engine chip and from every pointer to the retired Tracks page.
  // The engine chip's state: the project's recording engine, REAPER by default.
  const engine = useRecordingEngine();
  const [enginePanelOpen, setEnginePanelOpen] = useState(false);
  const openEnginePanel = useCallback(() => setEnginePanelOpen(true), []);
  // A link inside the panel ("Open workspace" in Chapter links) moves to another page: the panel closes behind it. The one move
  // that keeps it open is the retired /tracks route's own redirect to Proof, which opened it (RetiredTracksRoute).
  const enginePanelPathRef = useRef(location.pathname);
  useEffect(() => {
    const previous = enginePanelPathRef.current;
    enginePanelPathRef.current = location.pathname;
    if (previous !== location.pathname && previous !== '/tracks') setEnginePanelOpen(false);
  }, [location.pathname]);
  const settingsActions = useRef<{ save: () => Promise<boolean>; discard: () => Promise<void> } | undefined>(undefined);
  const hasBootstrap = data !== undefined;
  // Settings drawn without a project (issue 3024). Once it is open in its own frame it stays in that frame until the narrator leaves `/settings`,
  // even if a project attaches meanwhile (a REAPER launch): swapping to the shell would remount the page and drop an unsaved edit and the open
  // category without asking. Back then goes to the shell.
  const noProject = data !== undefined && !data.projectFolder;
  const settingsFrameKept = useRef(false);
  const settingsFrame = location.pathname === '/settings' && (noProject || settingsFrameKept.current);
  // Back to the picker puts focus on its Settings button, where the narrator came from; the picker's own effect runs first, then this clears it.
  const cameFromSettings = useRef(false);
  useEffect(() => {
    settingsFrameKept.current = settingsFrame;
    if (settingsFrame) cameFromSettings.current = true;
    else cameFromSettings.current = false;
  }, [settingsFrame]);

  // Importing changes data that is deliberately held at the application
  // boundary (the active manuscript affects several pages).  Refresh this
  // payload in place instead of reloading the browser, which could interrupt
  // the completion dialog before its activity log is visible.
  // The project picker over the shell: the header's project name and the jump menu's "Switch project…" open it. It closes when a project is
  // chosen (the project folder changes) or on its own Back button.
  const [projectPickerOpen, setProjectPickerOpen] = useProjectPicker(data?.projectFolder);
  const refreshBootstrap = useCallback(async () => {
    try {
      const next = await api.bootstrap();
      setDiagnosticId(next.diagnosticId);
      setData(next);
      setDataReadAt(Date.now());
    } catch (error) {
      // Every caller runs this from an event or a `void`, so a failure has nowhere to go but the narrator.
      setNotice(describeApiError(error), 'error');
    }
  }, [api, setNotice]);

  // The DAW's reachability and its open project are a live heartbeat, but bootstrap is a snapshot taken at startup: the navigation's pill,
  // Settings' DAW Integration and the engine panel read it, so it is read again whenever the DAW starts or stops answering and when the
  // window is focused again. One picture of the DAW for every panel, never one panel saying "reachable" while another says "not reachable".
  const bootstrapRef = useRef(data);
  bootstrapRef.current = data;
  useEffect(() => {
    let lastRead = 0;
    const again = () => {
      lastRead = Date.now();
      void refreshBootstrap();
    };
    // The app's DAW session is the one reader of the capability report; this follows its reports, each one once.
    let seen = dawSession.getState().caps;
    let checks = dawSession.getState().checkVersion;
    const unsubscribe = dawSession.subscribe(() => {
      // A Check again anywhere reads the host's facts too, whatever the report says.
      if (dawSession.getState().checkVersion !== checks) {
        checks = dawSession.getState().checkVersion;
        again();
      }
      const caps = dawSession.getState().caps;
      if (!caps || caps === seen) return;
      seen = caps;
      const held = bootstrapRef.current;
      if (held && caps.daw === 'REAPER' && caps.reachable !== held.dawReachable) again();
    });
    // An Audacity project's three facts are the Audacity link's (the host's Bootstrap), so they are read again when the link changes them.
    const unsubscribeAudacity = api.subscribeAudacityLink((link) => {
      const held = bootstrapRef.current;
      if (!held || !link.chosen) return;
      if (
        link.linked !== held.dawFileLinked ||
        (link.state === 'answering') !== held.dawReachable ||
        (link.openProject === 'linked') !== held.dawProjectMatches
      )
        again();
    });
    const onFocus = () => {
      if (bootstrapRef.current && Date.now() - lastRead > DAW_FACTS_FOCUS_MS) again();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      unsubscribe();
      unsubscribeAudacity();
      window.removeEventListener('focus', onFocus);
    };
  }, [api, dawSession, refreshBootstrap]);

  // The one shared "link a REAPER project file" action behind the engine panel and Settings' DAW
  // category. Cancelling the dialog does nothing. Any .rpp links, in the project folder or elsewhere (the host's note says
  // where a file outside the folder is); only a file that is not an .rpp or is gone is refused, with its message. One
  // `usePendingAction` ref guards all three call sites at once, since the host's file dialog is native
  // and modal - a second press from any of them while it is open is refused, not just the button that shows it.
  const dawLink = usePendingAction();
  // The Booth's "Link the open project" asks through the same action (`LinkDawFileContext`), so it shares this guard and reads the same outcome.
  const linkDawFileOutcome = useCallback(
    async (): Promise<LinkOutcome> =>
      (await dawLink.run('link-daw', async () => {
        const outcome = await linkOutcome(() => api.linkDawFile());
        if (outcome.kind === 'linked') await refreshBootstrap();
        return outcome;
      })) ?? { kind: 'busy' },
    [api, dawLink, refreshBootstrap],
  );
  const linkDawFile = useCallback(async () => {
    const outcome = await linkDawFileOutcome();
    if (outcome.kind === 'refused') setNotice(outcome.message, 'error');
    else if (outcome.kind === 'failed') setNotice(describeApiError(outcome.error), 'error');
    else if (outcome.kind === 'linked') setNotice(outcome.note ? `REAPER project linked. ${outcome.note}` : 'REAPER project linked.');
  }, [linkDawFileOutcome, setNotice]);

  // Startup verifies the host and then loads its bootstrap payload.
  useEffect(() => {
    let active = true;
    let loaded = false;
    let failed = false;
    const load = async () => {
      try {
        const ready = await api.ready();
        if (ready.apiVersion !== DESKTOP_HOST_API_VERSION) throw new Error(`Desktop host API version ${ready.apiVersion} is incompatible with this UI.`);
        if (active) setDiagnosticId(ready.diagnosticId);
        const next = await api.bootstrap();
        if (active) {
          loaded = true;
          setDiagnosticId(next.diagnosticId);
          setData(next);
          setDataReadAt(Date.now());
        }
      } catch (error) {
        // A payload that did not match its schema says so in plain words and keeps the technical text for "Copy details"
        // the client has already written it to the host log, so it is not reported a second time.
        const wire = isWireError(error);
        const message = apiErrorMessage(error);
        if (!wire) void api.reportClientDiagnostic('bootstrap_failed', message).catch(() => {});
        failed = true;
        if (active) {
          setStartup('error');
          setStartupError(message);
          setStartupDetails(wire ? error.details() : undefined);
        }
      }
    };
    const clientError = (event: ErrorEvent) => void api.reportClientDiagnostic('window_error', event.message).catch(() => {});
    const rejection = (event: PromiseRejectionEvent) => void api.reportClientDiagnostic('unhandled_rejection', String(event.reason)).catch(() => {});
    window.addEventListener('error', clientError);
    window.addEventListener('unhandledrejection', rejection);
    void load();
    const timeout = window.setTimeout(() => {
      if (active && !loaded && !failed) {
        setStartup('timeout');
        setStartupError('The desktop host did not respond within 10 seconds.');
      }
    }, 10_000);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.removeEventListener('error', clientError);
      window.removeEventListener('unhandledrejection', rejection);
    };
  }, [retryKey, api]);

  // Transcript state arrives through one native Wails event subscription.
  useEffect(() => {
    if (!hasBootstrap) return;
    return api.subscribeTranscript((transcript) => setData((current) => (current ? { ...current, transcript } : current)));
  }, [api, hasBootstrap]);

  // The host tells the narrator what it did on their behalf, such as keeping a file it could not read.
  useEffect(() => {
    if (!hasBootstrap) return;
    return api.subscribeNotices(setNotice);
  }, [api, hasBootstrap, setNotice]);

  // A host job that ends is announced from here, so leaving the page that started it loses nothing. The same
  // event decides whether it is also worth an OS notification (only while the window is unfocused): document.hasFocus() is read fresh for each job,
  // here, because it is the webview's to know, not the host's.
  // No sound or toast interrupts a take: a toast that would fire while the
  // booth is recording queues here instead - `queuedAnnouncements` - and is shown once `boothRecording` clears
  // (below). The OS notification above is untouched; it only ever fires while the window is unfocused anyway.
  const navCounts = useNavCounts(location.pathname, hasManuscript);
  const boothRecording = useBoothRecording(location.pathname === '/booth');
  const boothRecordingRef = useRef(boothRecording);
  boothRecordingRef.current = boothRecording;
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  const queuedAnnouncements = useRef<{ text: string; tone: ToastTone; follow?: JobEndFollow; durationMs?: number }[]>([]);
  // A job-end toast may carry one button that takes the narrator to what the job made (the scan's new suggestions).
  const announce = useCallback(
    ({ text, tone, follow, durationMs }: { text: string; tone: ToastTone; follow?: JobEndFollow; durationMs?: number }) =>
      setNotice(text, tone, follow && { label: follow.label, onAction: () => guardedNavigateRef.current(follow.to, follow.state) }, undefined, durationMs),
    [setNotice],
  );
  useEffect(() => {
    if (!hasBootstrap) return;
    return api.subscribeJobEnded((event) => {
      const announcement = toastForJobEnd(event, pathnameRef.current);
      if (announcement) {
        if (shouldQueueJobEndAnnouncement(announcement, boothRecordingRef.current)) queuedAnnouncements.current.push(announcement);
        else announce(announcement);
      }
      if (shouldNotifyForJobEnd(event, document.hasFocus())) {
        const { title, body } = notificationForJobEnd(event);
        void api.systemNotify(event.kind, title, body);
      }
    });
  }, [api, hasBootstrap, setNotice, announce]);
  useEffect(() => {
    if (boothRecording || queuedAnnouncements.current.length === 0) return;
    const queued = queuedAnnouncements.current;
    queuedAnnouncements.current = [];
    for (const announcement of queued) announce(announcement);
  }, [boothRecording, announce]);

  // A check the app makes on its own found a release newer than this build: the narrator is told once, and Settings > About
  // and updates says the rest. Nothing is downloaded until they ask.
  useEffect(() => {
    if (!hasBootstrap) return;
    return api.subscribeUpdate((status) => {
      if (status.available) setNotice(`Version ${status.available.version} is available. See Settings, About & updates.`);
    });
  }, [api, hasBootstrap, setNotice]);

  // Live events that do not match their schema are dropped and counted; after a run of them the page on screen may be
  // out of date, and the narrator is told once instead of being left with a page that silently stopped updating.
  useEffect(() => {
    if (!hasBootstrap) return;
    return api.subscribeLiveUpdateHealth(() => setNotice(LIVE_UPDATES_DEGRADED));
  }, [api, hasBootstrap, setNotice]);

  // Wails forwards a second REAPER launch to the existing native window. The
  // host replaces project-scoped services only after proving it is idle, then
  // this one subscription refreshes the shared application bootstrap.
  useEffect(() => {
    if (!hasBootstrap) return;
    return api.subscribeProjectAttach((state) => {
      // Entries from the project that was open before this switch stay behind the new floor: they
      // would open this project's pages with the previous project's data, so Back stops here.
      if (state.attached) {
        // What an Undo toast offered was about the project that was open; its journal entries are cleared, and the ones without an entry go here.
        overlay.dismissUndo();
        history.resetFloor();
        void refreshBootstrap();
      } else if (state.reason && !attachRefusalClaimed()) {
        // A dialog that writes the reason in its own alert (the Booth's connect dialog) claims it, so it is not toasted over the page as well.
        setNotice(state.reason, 'error');
      }
    });
  }, [api, hasBootstrap, history, overlay, refreshBootstrap, setNotice]);

  useEffect(() => {
    if (!hasBootstrap) return;
    const cssName: Record<string, string> = {
      color_character: '--character',
      color_location: '--place',
      color_organization: '--org',
      color_lore: '--lore',
      color_item: '--item',
      color_event: '--event',
      color_needs_review: '--review',
      color_note: '--note',
    };
    void api
      .settingsForScope('project')
      .then((settings) =>
        [...(settings.ManuscriptGuide || []), ...(settings.Manuscript || [])].forEach((field) => {
          const variable = cssName[field.key];
          if (variable && field.effectiveValue) document.documentElement.style.setProperty(variable, `#${field.effectiveValue.replace('#', '')}`);
        }),
      )
      .catch(() => {});
  }, [api, hasBootstrap]);

  // The mouse's back and forward buttons: `mousedown` also calls `preventDefault` to stop WebView2 acting on the press
  // itself (unverified on Windows), `mouseup` is where the app actually moves, like a browser's own button-4/5
  // handling. Nothing fires while a modal dialog or drawer is open (the page is inert behind it).
  useEffect(() => {
    const onMouseButton = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      if (event.type !== 'mouseup' || isModalOpen()) return;
      if (event.button === 3) guardedBackRef.current();
      else guardedForwardRef.current();
    };
    document.addEventListener('mousedown', onMouseButton);
    document.addEventListener('mouseup', onMouseButton);
    return () => {
      document.removeEventListener('mousedown', onMouseButton);
      document.removeEventListener('mouseup', onMouseButton);
    };
  }, []);

  // Alt+Left/Right, the keyboard's Browser Back/Forward keys and Cmd+[ / Cmd+] on macOS are `nav.back` and
  // `nav.forward`, `global` commands in the registry. The registry applies the target guard and resolves
  // scopes on its own; `isModalOpen()` above covers the open dialog (see its comment).
  useCommand('nav.back', () => {
    if (!isModalOpen()) guardedBackRef.current();
  });
  useCommand('nav.forward', () => {
    if (!isModalOpen()) guardedForwardRef.current();
  });
  // Zoom: Ctrl+=/-/0 (and the numpad equivalents) run the same steps as the jump menu's zoom commands, and do nothing while a modal is open, like Back/Forward.
  useCommand('zoom.in', () => {
    if (!isModalOpen()) void zoom.zoomIn();
  });
  useCommand('zoom.out', () => {
    if (!isModalOpen()) void zoom.zoomOut();
  });
  useCommand('zoom.reset', () => {
    if (!isModalOpen()) void zoom.reset();
  });
  // The "?" shortcut sheet: a `global` command mounted here, alongside
  // Back/Forward, since both are always-available app-level commands rather than a feature's own.
  useCommand('help.shortcuts', () => setShortcutsOpen(true));
  const saveProject = useSaveShortcut();

  // The jump menu, the history panel and "Go to <page>" / "Go to <chapter>". The chapters are the store's `chapters` slot:
  // loaded when a manuscript arrives or the project changes, stale on `job:ended`, and a failed read keeps the last list ("a failure never
  // replaces a cached value"), where the local state emptied it.
  const studio = useStoreHandle();
  const projectFolder = data?.projectFolder;
  useEffect(() => {
    if (hasManuscript) void studio.load('chapters').catch(() => {});
  }, [studio, hasManuscript, projectFolder]);
  const slotChapters = useStudio((state) => state.slots.chapters);
  const chapters = hasManuscript && !noProject ? (slotChapters ?? NO_CHAPTERS) : NO_CHAPTERS;
  const guardedNavigateRef = useRef<(next: string, state?: unknown, after?: () => void) => void>(() => {});
  // Opening the project picker draws it in place of the shell, which takes the page down: it is an exit like any other, so a page's leave guard asks
  // first (the Booth while a take records or a start is out). Set below, where the guard's answer is read.
  const guardedPickerRef = useRef<() => void>(() => {});
  const openProjectPicker = () => guardedPickerRef.current();
  // A jump-menu move closes the project picker drawn over the project. When the address changes, the path effect below closes it once the move
  // has landed (closing first mounts the old page again, and the Booth rewrites its own address, undoing the move). When it stays the same (a
  // chapter is only a `#` change, and "Go to" the page under the picker changes nothing), nothing else would close it, so it closes here.
  const jumpTo = (path: string) => {
    if (path.split(/[?#]/)[0] === location.pathname) setProjectPickerOpen(false);
    guardedNavigateRef.current(path);
  };
  // Ctrl+, opens Settings from any page; the page then offers Back to the page the narrator left.
  const openSettings = () => {
    settingsOrigin.markLink();
    jumpTo(addressPagePath('settings'));
  };
  useCommand('nav.settings', () => {
    if (isModalOpen()) return;
    openSettings();
  });
  const goToScriptRef = useRef<(chapter: string) => void>(() => {});
  useGoToCommands({
    // With no project only Settings works: every other page, every chapter and "Switch project…" would lead nowhere the picker is not already.
    pages: shellPages({ hasManuscript, dawFileLinked: data?.dawFileLinked ?? false }).filter((page) => !noProject || page.id === '/settings'),
    chapters,
    go: (target) => {
      if (target.kind === 'page') jumpTo(target.id);
      else {
        if (location.pathname === '/script') setProjectPickerOpen(false);
        goToScriptRef.current(target.id);
      }
    },
  });
  // "Switch project…" has no key, so it is a provided command, not a catalogue row: it opens the same picker as the header's project name.
  useEffect(
    () =>
      registerCommandProvider(() =>
        noProject || projectPickerOpen
          ? []
          : [{ id: 'project.switch', group: 'Go to', label: 'Switch project…', hint: 'Open the project picker', run: () => guardedPickerRef.current() }],
      ),
    [noProject, projectPickerOpen],
  );
  // A move to another page (a "Go to" row, Ctrl+,) while the picker covers the project would land out of sight, so it closes the picker.
  useEffect(() => setProjectPickerOpen(false), [location.pathname, setProjectPickerOpen]);
  const dawName = () => (dawKind ? dawShortName(dawKind) : 'the DAW');
  const openHistory = () => void openHistoryPanel(overlay, journal, dawName);
  const undoLast = async () => {
    const [newest] = await journal.entries();
    const result = await journal.undoLast();
    overlay.toast(result.ok ? `Undid ${newest?.label ?? 'the last change'}` : result.refusal.reason);
  };
  // What the jump menu's catalogue rows run: the same actions as the keys and the header's buttons. A page's own command stays its own.
  const shellCommands = useRef<Record<string, () => void>>({});
  shellCommands.current = {
    'nav.back': () => guardedBackRef.current(),
    'nav.forward': () => guardedForwardRef.current(),
    'nav.settings': openSettings,
    'zoom.in': () => void zoom.zoomIn(),
    'zoom.out': () => void zoom.zoomOut(),
    'zoom.reset': () => void zoom.reset(),
    'help.shortcuts': () => setShortcutsOpen(true),
    'project.save': saveProject,
    'history.open': openHistory,
    'undo.last': () => void undoLast(),
    'companion.open': () => jumpTo('/companion'),
  };
  // The catalogue commands the shell runs that can be off now, with the sentence the jump menu shows beside them (the header's buttons used to carry these).
  const shellDisabledReasons = (): Record<string, string> => {
    const off: Record<string, string> = {};
    if (noProject) off['companion.open'] = NO_PROJECT_REASON;
    if (!history.canGoBack) off['nav.back'] = 'No earlier page in this project';
    if (!history.canGoForward) off['nav.forward'] = 'No later page yet';
    if (!journalRows || journalRows.length === 0) off['undo.last'] = 'Nothing to undo';
    if (!zoom.canZoomIn) off['zoom.in'] = 'Already at the largest size';
    if (!zoom.canZoomOut) off['zoom.out'] = 'Already at the smallest size';
    if (zoom.percent === 100) off['zoom.reset'] = 'Already 100%';
    return off;
  };
  const openJump = (initialTerm?: string, initialGroup?: string, scope?: 'page') =>
    void openJumpMenu({
      keymap,
      runCommand: (id) => shellCommands.current[id]?.(),
      initialTerm,
      initialGroup,
      scope,
      disabledReasons: shellDisabledReasons,
      service: overlay,
    });
  useCommand('jump.open', () => {
    if (!isModalOpen()) openJump();
  });
  // Ctrl+F: the same menu searching only what the page offers (its items and its text); a page that offers nothing opens the whole menu.
  useCommand('jump.page', () => {
    if (!isModalOpen()) openJump(undefined, undefined, 'page');
  });
  useCommand('history.open', () => {
    if (!isModalOpen()) openHistory();
  });
  useCommand('companion.open', () => {
    if (!isModalOpen()) guardedNavigateRef.current('/companion');
  });
  // The History panel says Ctrl Z "undoes the newest change", so it is the one layer Ctrl+Z reaches through; any other dialog keeps it out.
  const onlyHistoryOpen = () => {
    const { dialogs } = overlay.getSnapshot();
    return dialogs.length > 0 && dialogs.every((entry) => entry.kind === 'slideOver' && entry.spec.kind === 'slideOver' && entry.spec.title === HISTORY_TITLE);
  };
  useCommand('undo.last', () => {
    if (!isModalOpen() || onlyHistoryOpen()) void undoLast();
  });
  // The jump menu's own commands: Settings categories, Import and Replace manuscript, the theme, fixed zoom steps and a labelled Undo.
  useShellCommands({
    hasManuscript,
    // No `isModalOpen()` guard: these run from a jump-menu row, and the menu is still in the document while its row runs (#2792).
    hasProject: !noProject,
    openSettings: (categoryId) => {
      settingsOrigin.markLink();
      jumpTo(categoryId ? `${addressPagePath('settings')}#category-${categoryId}` : addressPagePath('settings'));
    },
    importManuscript: () => jumpTo('/'),
    darkTheme: theme.resolved === 'dark',
    toggleTheme,
    zoomPercent: zoom.percent,
    setZoom: (factor) => void zoom.setLevel(factor),
    undoLabel: journalRows?.[0]?.label,
    undo: () => void undoLast(),
  });
  // The menu on empty space in <main> (the mock's page menu, `app/context.ts`): Go to with the current page checked, the jump menu, Search this page, and View.
  const contextTail = [
    { key: 'jump', label: 'Jump menu…', shortcut: ['Ctrl', 'K'], onSelect: () => openJump() },
    { key: 'search', label: 'Search this page', shortcut: ['Ctrl', 'F'], onSelect: () => openJump(undefined, undefined, 'page') },
  ] satisfies ContextMenuItem[];
  const contextMenu = {
    fallback: (): ContextMenuItem[] => [
      {
        key: 'go-to',
        label: 'Go to',
        onSelect: () => undefined,
        submenu: shellPages({ hasManuscript, dawFileLinked: data?.dawFileLinked ?? false }).map((page) => ({
          key: `go-${page.id}`,
          label: page.label,
          checked: isActivePath(location.pathname, page.id),
          unavailable: page.disabledReason,
          onSelect: () => guardedNavigateRef.current(page.id),
        })),
      },
      ...contextTail,
      {
        key: 'view',
        label: 'View',
        onSelect: () => undefined,
        submenu: [
          {
            key: 'zoom-in',
            label: 'Zoom in',
            shortcut: ['Ctrl', '='],
            unavailable: zoom.canZoomIn ? undefined : 'Already at the largest size',
            onSelect: () => void zoom.zoomIn(),
          },
          {
            key: 'zoom-out',
            label: 'Zoom out',
            shortcut: ['Ctrl', '-'],
            unavailable: zoom.canZoomOut ? undefined : 'Already at the smallest size',
            onSelect: () => void zoom.zoomOut(),
          },
          {
            key: 'zoom-reset',
            label: 'Reset zoom',
            shortcut: ['Ctrl', '0'],
            unavailable: zoom.percent === 100 ? 'Already 100%' : undefined,
            onSelect: () => void zoom.reset(),
          },
          { key: 'theme', label: theme.resolved === 'dark' ? 'Use the light theme' : 'Use the dark theme', onSelect: toggleTheme },
        ],
      },
    ],
    tail: contextTail,
  };

  // What the page shown holds that leaving would drop: Settings' edited fields (only on Settings, whose flag outlives the page), or any editor's draft.
  const settingsHeld = location.pathname === '/settings' && settingsDirty;
  // Read when asked, not from the last render: a box that saves on blur reports its edit a moment after the focus left it, and a click that follows at once
  // must still find it (#3404).
  const pageHolds = () => settingsHeld || drafts.heldNow().length > 0;
  popGuard.dirty = pageHolds;
  popGuard.isOwnPop = history.isOwnPop;
  useEffect(() => {
    popGuard.ask = (direction) => setPendingMove({ kind: 'delta', direction });
    popGuard.leaveHeld = () => journal.checkLeave('') !== 'allow';
    popGuard.askLeave = (direction) => attemptDeltaRef.current(direction, true);
    popGuard.idx = historyIdx();
    return () => {
      popGuard.ask = null;
      popGuard.askLeave = null;
      popGuard.leaveHeld = () => false;
      popGuard.dirty = () => false;
    };
  }, [journal]);
  // The registry's two hooks into the shell: a change inside a page that would drop a draft asks first, and a link that leaves the page takes the guarded move.
  const askRef = useRef<(run: () => void, options?: AskOptions) => void>(() => {});
  askRef.current = (run, options) => {
    // A change made from the box being typed in (the Settings search) leaves the focus where it is: blurring it would stop the typing.
    if (options?.settle !== false && settleFocusedField()) {
      setTimeout(() => askRef.current(run, options), SETTLE_MS);
      return;
    }
    if (pageHolds()) setPendingMove({ kind: 'action', run });
    else run();
  };
  // A navigation drawer that was open closes a moment later and hands the focus back to its opener, outside the question, so the focus is put back inside it a
  // few times over the first moments, on Keep editing when that is the way to stay and on Cancel otherwise (#3404, and #3446 B2 for every variant).
  const questionOpen = pendingMove !== undefined;
  // What was held went away while the question was open (an editor closed itself): there is nothing left to ask about or to lose, so the move goes on.
  const nothingLeftToAsk = pendingMove !== undefined && !resolving && !settingsHeld && drafts.heldNow().length === 0;
  useEffect(() => {
    if (!nothingLeftToAsk || !pendingMove) return;
    resolvePendingMove(pendingMove);
    setPendingMove(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the move is read when the question has just emptied.
  }, [nothingLeftToAsk]);
  useEffect(() => {
    if (!questionOpen) return;
    const focusKeep = () => {
      const question = document.querySelector('[role="alertdialog"]');
      if (!question || question.contains(document.activeElement)) return;
      question.querySelector<HTMLElement>('[data-stay-button]')?.focus();
    };
    const timers = [0, 60, 250, 600].map((ms) => setTimeout(focusKeep, ms));
    // Fixed timers are not enough on a slow machine: whenever the focus lands outside the question while it is open (the drawer's close handing it back to its
    // opener, a late focus move), it is put back at once, so Enter or Space cannot reopen the drawer over the question (#3446 D3).
    const rescue = (event: FocusEvent) => {
      const question = document.querySelector('[role="alertdialog"]');
      const target = event.target;
      if (
        !question ||
        !(target instanceof Node) ||
        question.contains(target) ||
        (target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]'))
      )
        return;
      focusKeep();
    };
    document.addEventListener('focusin', rescue);
    // A click on the backdrop drops the focus to <body>, which fires no focusin: after any pointer press, put it back inside the question (#3459 L1).
    const afterPointer = () => void setTimeout(focusKeep, 0);
    document.addEventListener('pointerup', afterPointer, true);
    // The way to stay has the focus when the question opens, so a second Enter or Space from the press that asked would answer it at once and the narrator would
    // never see it. A key press on that button in the first 300 ms is an echo, not an answer (#3446 E7). A click is not touched: a mouse click is a decision.
    const openedAt = Date.now();
    const echo = (event: KeyboardEvent) => {
      if ((event.key !== 'Enter' && event.key !== ' ') || Date.now() - openedAt >= ECHO_MS) return;
      if (event.target instanceof Element && event.target.closest('[data-stay-button]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    for (const type of ['keydown', 'keyup'] as const) document.addEventListener(type, echo, true);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener('focusin', rescue);
      document.removeEventListener('pointerup', afterPointer, true);
      for (const type of ['keydown', 'keyup'] as const) document.removeEventListener(type, echo, true);
    };
  }, [questionOpen]);
  const { setShell } = drafts;
  useEffect(() => {
    setShell({ ask: (run, options) => askRef.current(run, options), go: (to, state, after) => guardedNavigateRef.current(to, state, after) });
    return () => setShell(null);
  }, [setShell]);
  useEffect(() => {
    popGuard.idx = historyIdx();
    popGuard.route = routePath();
  }, [location.key]);

  // Recovery for a `popstate` the app did not start (a mouse-button gesture WebView2 acts on
  // despite `preventDefault`, if that happens). The move already took effect; if it left
  // Settings dirty, push Settings back and ask, so the change is not lost silently. Leaving a Proof chapter view with
  // a run still resets the run either way.
  useEffect(() => {
    if (history.unexpectedPop) {
      const leftPathname = leftPathnameRef.current;
      history.clearUnexpectedPop();
      if (leftPathname === '/settings' && settingsDirty) {
        const landedAt = location.pathname + location.hash;
        navigate('/settings');
        setPendingMove({ kind: 'path', path: landedAt });
      } else if (leavesCompareRun(leftPathname, location.pathname, transcriptPhaseRef.current)) {
        void api.transcriptReset().catch(() => {});
      }
    }
    if (prevPathnameRef.current !== location.pathname) leftPathnameRef.current = prevPathnameRef.current;
    prevPathnameRef.current = location.pathname;
  }, [location.pathname, location.hash, history, settingsDirty, api, navigate]);

  if (!data)
    return (
      <StartupScreen
        state={startup}
        error={startupError}
        details={startupDetails}
        diagnosticId={diagnosticId}
        retry={() => {
          setStartup('connecting');
          setStartupError('');
          setStartupDetails(undefined);
          setRetryKey((value) => value + 1);
        }}
      />
    );

  transcriptPhaseRef.current = data.transcript.phase;

  // Deep links are expressed as a URL anchor on the fixed page path, not as
  // path params - "#p123" points at paragraph 123 (its globally unique
  // index, assigned when the manuscript is imported), "#c<chapter-id>" at a
  // chapter with no specific line, and "#<entityId>" at a Story Bible entry.
  // See components/script/page/ScriptPage.tsx and Guide.tsx for where these are consumed. The pages that call it still name the prop
  // `goToManuscript` (it opens the manuscript's text on the Script page).
  const goToScript = (chapter: string, paragraph?: number) => guardedNavigate(scriptPath(chapter, paragraph));
  const goToStoryBible = (entityId: string) => guardedNavigate(addressPath({ page: 'story-bible', entity: entityId }));
  // The Editing page at a chapter: from Proof's takes at a spot, the Production board's recording check and Proof's chapter view. findingId is the
  // deep link's ?finding=, so the page opens with the flagged word that finding names selected (Navigation and deep links); passageId is
  // ?passage=, which opens that passage's takes under its line.
  const goToEditing = (chapterId: string, findingId?: string, passageId?: string) =>
    guardedNavigate(addressPath({ page: 'editing', chapter: chapterId, finding: findingId, passage: passageId }));
  // A Manuscript card's "Record in Booth": the Booth on that chapter or credits.
  const goToBooth = (target: BoothTarget) => guardedNavigate(addressPath({ page: 'booth', target }));
  // A hand-off address that cannot be acted on says so with a way out (`AddressGate`). The chapter list it checks a named chapter
  // against is the store's slot, re-read once before an address is called stale; with no manuscript, or before the first read, the page decides.
  const gateChapters = hasManuscript ? (slotChapters ?? null) : null;
  const reloadChapters = () => studio.load('chapters');
  const gated = (page: AddressPage, element: ReactElement, chapterParam?: string) => (
    <AddressGate page={page} chapterParam={chapterParam} chapters={gateChapters} reloadChapters={reloadChapters}>
      {element}
    </AddressGate>
  );

  // A page may stop a move and ask first (the Booth does while a take is recording): the journal's leave guard answers, the overlay asks,
  // and only Yes goes on to the move's own guards below. A guard that answers 'allow', or none, leaves navigation as it was.
  // The page's own question when it has one (the Booth's stops the take and keeps the narrator in the Booth when the DAW refuses), else the plain confirm.
  const answerLeave = (verdict: Exclude<ReturnType<typeof journal.checkLeave>, 'allow'>) => (verdict.decide ? verdict.decide() : overlay.confirm(verdict.ask));
  // `after` is the caller's side effect of the move (closing the panel the link was in): it runs only when the move goes ahead, never when the question is cancelled.
  const guardedMove = (next: string, state?: unknown, after?: () => void) => {
    // A box that saves on blur reports its edit a moment after it loses the focus: the exit is decided then, with the flags it set.
    if (settleFocusedField()) {
      setTimeout(() => guardedNavigateRef.current(next, state, after), SETTLE_MS);
      return;
    }
    const nextPath = next.split(/[?#]/)[0] || '/';
    const verdict = nextPath === location.pathname ? 'allow' : journal.checkLeave(nextPath);
    if (verdict === 'allow') {
      moveTo(next, state, after);
      return;
    }
    void answerLeave(verdict).then((confirmed) => {
      if (confirmed) moveTo(next, state, after);
    });
  };
  // The one-argument form is what pages receive as a prop, so a caller that passes it on as a callback never hands it a second argument as state.
  const guardedNavigate = (next: string) => guardedMove(next);
  // Settings > Recording & DAW, from the engine panel's gear and the Built-in chips: the panel closes behind it.
  const openRecordingSettings = () => {
    setEnginePanelOpen(false);
    guardedNavigate(addressPath({ page: 'settings', anchor: 'recording' }));
  };
  guardedNavigateRef.current = guardedMove;
  guardedPickerRef.current = () => {
    if (settleFocusedField()) {
      setTimeout(() => guardedPickerRef.current(), SETTLE_MS);
      return;
    }
    const verdict = journal.checkLeave('');
    if (verdict === 'allow') {
      openPickerPastSettings();
      return;
    }
    void answerLeave(verdict).then((confirmed) => {
      if (confirmed) openPickerPastSettings();
    });
  };
  // The picker takes Settings down like a move to another page, so unsaved edits are asked about first (the same "Unsaved settings" question).
  const openPickerPastSettings = () => {
    if (pageHolds()) setPendingMove({ kind: 'picker' });
    else setProjectPickerOpen(true);
  };
  goToScriptRef.current = (chapter) => goToScript(chapter);

  const moveTo = (next: string, state?: unknown, after?: () => void) => {
    const nextPath = next.split(/[?#]/)[0] || '/';
    // A link to another Settings category is a change of the hash alone, and it replaces the panel that holds the edit.
    const switchesSettingsCategory =
      nextPath === location.pathname && nextPath === '/settings' && next.includes('#') && `#${next.split('#')[1]}` !== location.hash;
    if ((nextPath !== location.pathname || switchesSettingsCategory) && pageHolds()) {
      setPendingMove({ kind: 'path', path: next, state, after });
      return;
    }
    if (leavesCompareRun(location.pathname, nextPath.split('?')[0], data.transcript.phase)) void api.transcriptReset().catch(() => {});
    navigate(next, state === undefined ? undefined : { state });
    after?.();
  };

  // Back and Forward run the same two guards as the nav: dirty Settings asks first, leaving
  // a Proof chapter view with a run resets the run. Each moves exactly one page, and does nothing where `useAppHistory` already
  // says there is nowhere to go (the buttons are disabled there too; this covers the shortcuts and mouse
  // buttons, which have no disabled state to rely on).
  const attemptDelta = (direction: 1 | -1, fromPop = false) => {
    if (settleFocusedField()) {
      setTimeout(() => attemptDeltaRef.current(direction, fromPop), SETTLE_MS);
      return;
    }
    // The page's leave guard is asked first, as for the nav (the Booth while a take records). Its guard does not read the destination.
    const verdict = journal.checkLeave('');
    if (verdict !== 'allow') {
      // A browser Back pressed while a question or any dialog is open (the shortcut sheet, Record options) neither stacks another nor moves, as for Alt+Left.
      if (fromPop && isModalOpen()) return;
      void answerLeave(verdict).then((confirmed) => {
        if (confirmed) moveByDelta(direction);
      });
      return;
    }
    moveByDelta(direction);
  };
  const moveByDelta = (direction: 1 | -1) => {
    if (pageHolds()) {
      setPendingMove({ kind: 'delta', direction });
      return;
    }
    if (leavesCompareRun(location.pathname, undefined, data.transcript.phase)) void api.transcriptReset().catch(() => {});
    if (direction === -1) history.back();
    else history.forward();
  };
  const guardedBack = () => {
    if (history.canGoBack) attemptDelta(-1);
  };
  const guardedForward = () => {
    if (history.canGoForward) attemptDelta(1);
  };
  attemptDeltaRef.current = attemptDelta;
  guardedBackRef.current = guardedBack;
  guardedForwardRef.current = guardedForward;

  // A standalone launch (Start Menu shortcut, taskbar pin) has no
  // REAPER-supplied project, so Bootstrap() returns a populated payload with
  // an empty projectFolder rather than null. subscribeProjectAttach (above)
  // already refreshes `data` once ProjectPicker's switch/create succeeds, so
  // no callback needs to be threaded through here.
  // A project made from the picker opens on Script, as the mock's New project does; the Script page offers the import when it has no manuscript.
  // Settings is reachable before a project is open (issue 3024): the picker's Settings button, Ctrl+, and the jump menu's Settings rows all go to
  // /settings, and with no project that route draws the Settings page in the picker's frame instead of the shell. Its Back returns to the picker.
  const settingsWithoutProject = settingsFrame;
  const settingsPageProps = {
    data,
    notify: setNotice,
    onDirtyChange: setSettingsDirty,
    registerActions: (actions: { save: () => Promise<boolean>; discard: () => Promise<void> }) => {
      settingsActions.current = actions;
    },
    onProjectDataCleared: async () => {
      await refreshBootstrap();
      guardedNavigate('/');
    },
    onLinkDawFile: () => void linkDawFile(),
    go: guardedNavigate,
    refreshBootstrap,
    initialCategory: SETTINGS_ANCHORS[location.hash],
  };
  // Leaving with an edit not yet saved asks first, wherever it is held: Settings (drawn in the shell, or in the frame for no project) or an editor's draft.
  // The title says "settings" only on the Settings page, so the question never says it for an entry or a note.
  const onSettings = location.pathname === '/settings';
  // Settings' own fields are a form and may be many, so with edits in them the question keeps Settings' older sentence (the fallback in `body` below). A draft
  // held instead (a credits template, a pasted key) is named, on Settings as anywhere else, so the narrator can tell what they are about to lose (#3400 D4).
  // With a draft that cannot be saved held, Save & continue would save nothing (all or nothing), so the question is Discard-only and names Settings' fields too.
  const looseHeld = drafts.heldNow().some((draft) => !draft.saveable);
  const question =
    pendingMove && (!settingsHeld || looseHeld)
      ? draftQuestion([...(settingsHeld ? [SETTINGS_HELD] : []), ...drafts.heldNow()], pendingMove.kind !== 'action')
      : undefined;
  // Save is offered unless something held cannot be saved; Settings' fields alone always save.
  const canSave = question?.canSave ?? true;
  // Settings' own save has no shared request of its own: a second Save & continue after the limit would send it again while the first never answered.
  const saveSettingsOnce = (): Promise<boolean> => {
    if (!settingsSaving.current) {
      settingsSaving.current = (settingsActions.current?.save() ?? Promise.resolve(true)).finally(() => {
        settingsSaving.current = null;
      });
    }
    return settingsSaving.current;
  };
  const discardMove = (move: PendingMove) => {
    const token = moveToken.current;
    setResolving(true);
    void (async () => {
      try {
        if (settingsHeld) await withinSaveLimit(settingsActions.current?.discard() ?? Promise.resolve());
        const { failed } = drafts.discard();
        if (token !== moveToken.current) return;
        // A draft that could not be dropped keeps the narrator where they are, and the message says what went and what is still here.
        const verdict = discardVerdict({ failed });
        if (!verdict.proceed) {
          setSettingsDirty(false);
          overlay.toast(verdict.message!, { tone: 'error' });
          return cancelPendingMove();
        }
        setSettingsDirty(false);
        resolvePendingMove(move);
        setPendingMove(undefined);
      } catch {
        if (token === moveToken.current) overlay.toast('Not discarded. What you typed is still here.', { tone: 'error' });
      } finally {
        if (token === moveToken.current) setResolving(false);
      }
    })();
  };
  const unsavedSettings = pendingMove && (
    <ConfirmDialog
      title={onSettings ? 'Unsaved settings' : 'Unsaved changes'}
      body={question?.body ?? `Save or discard changes before ${pendingMove.kind === 'action' ? 'going on' : 'leaving Settings'}?`}
      confirmLabel={canSave ? 'Save & continue' : 'Discard & continue'}
      confirmVariant={canSave ? 'primary' : 'danger'}
      // The way to stay is Cancel, or Keep editing when nothing can be saved.
      cancelLabel={canSave ? 'Cancel' : 'Keep editing'}
      // The way to stay (Cancel, or Keep editing) always takes the focus first: Enter never discards or saves by default.
      focusCancel
      pending={resolving}
      {...(canSave ? { danger: () => discardMove(pendingMove), dangerLabel: 'Discard & continue' } : { danger: undefined, dangerLabel: undefined })}
      confirm={() => {
        // Nothing here can be saved: the only way on is to discard.
        if (!canSave) return discardMove(pendingMove);
        const token = moveToken.current;
        setResolving(true);
        void (async () => {
          try {
            // Settings' fields first, then the drafts; the first that does not save keeps the narrator where they are (each says why in its own words).
            // The question offers no Save while a draft that cannot be saved is held (all or nothing), so Settings' fields are only saved here when nothing blocks.
            const settingsSaved = !settingsHeld || (await withinSaveLimit(saveSettingsOnce()));
            const outcome = settingsSaved ? await drafts.save() : undefined;
            // Cancel, or another question, came while this was saving: the move is no longer the one that was asked for.
            if (token !== moveToken.current) return;
            // Save & continue never drops text (#3400): `saveVerdict` says whether to go on, and otherwise which draft could not be saved.
            const verdict = saveVerdict(outcome);
            if (!verdict.proceed) {
              if (verdict.message) overlay.toast(`${verdict.message} What you typed is still here.`, { tone: 'error' });
              return cancelPendingMove();
            }
            setSettingsDirty(false);
            resolvePendingMove(pendingMove);
            setPendingMove(undefined);
          } catch (error) {
            // A save that threw, or never answered within its limit: the text is where it was typed, and the question can be answered again.
            // The text is where it was typed either way. A save that is only slow may still land, so that is not called a failure.
            if (token === moveToken.current)
              overlay.toast(
                error instanceof SaveTimeout ? 'Saving is taking too long. What you typed is still here.' : `${notSaved(error)} What you typed is still here.`,
                {
                  tone: 'error',
                },
              );
          } finally {
            if (token === moveToken.current) setResolving(false);
          }
        })();
      }}
      cancel={cancelPendingMove}
    />
  );

  // Drawn on every screen the app can be on, the picker and the no-project Settings included: "Show keyboard shortcuts" is a jump-menu row there too.
  const shortcutSheet = shortcutsOpen && (
    <ShortcutSheet
      onClose={() => setShortcutsOpen(false)}
      onShowAll={() => {
        setShortcutsOpen(false);
        guardedNavigate('/settings');
      }}
    />
  );
  if (settingsWithoutProject)
    return (
      <div className="relative h-full">
        <NoProjectSettings>
          {/* The Back always has somewhere to go: the picker, which is what `/` draws with no project. */}
          <SettingsPage {...settingsPageProps} cameFrom={settingsOrigin.origin ?? '/'} />
        </NoProjectSettings>
        {unsavedSettings}
        {shortcutSheet}
      </div>
    );
  if (!data.projectFolder || projectPickerOpen)
    return (
      <>
        <ProjectPicker
          notify={setNotice}
          onCreated={() => navigate('/script')}
          onBack={data.projectFolder ? () => setProjectPickerOpen(false) : undefined}
          currentName={data.projectFolder ? data.projectName : undefined}
          onOpenSettings={data.projectFolder ? undefined : openSettings}
          focusSettings={cameFromSettings.current}
        />
        {shortcutSheet}
      </>
    );

  return (
    <div className="relative h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <DawFileLinkedContext.Provider value={data.dawFileLinked}>
        <LinkDawFileContext.Provider value={linkDawFileOutcome}>
          <EnginePanelProvider value={openEnginePanel} openRecordingSettings={openRecordingSettings}>
            <ProjectTrackProviders projectFolder={data.projectFolder} enabled={dawKind !== 'Audacity' && data.dawFileLinked} notify={setNotice}>
              {/* Audacity has no folder tracks: a Voice folders project there is flat for every sentence and picker, as in the Engine panel (#3271). */}
              <VoiceLayoutContext.Provider value={dawKind === 'Audacity' ? 'flat' : null}>
                <TooltipProvider>
                  <AppShell
                    pathname={location.pathname}
                    navigate={guardedNavigate}
                    projectName={data.projectName}
                    hasManuscript={Boolean(data.manuscript)}
                    dawFileLinked={data.dawFileLinked}
                    dawReachable={data.dawReachable}
                    dawProjectMatches={data.dawProjectMatches}
                    linkingDawFile={dawLink.isBusy}
                    engine={engine}
                    daw={dawKind}
                    audacity={audacityLink.link}
                    navCounts={navCounts}
                    onOpenJump={() => openJump()}
                    onOpenZoomMenu={() => openJump(undefined, 'Zoom')}
                    onSwitchProject={openProjectPicker}
                    theme={{ dark: theme.resolved === 'dark', toggle: toggleTheme }}
                    contextMenu={contextMenu}
                    zoom={{ percent: zoom.percent, announcement: zoom.announcement }}
                  >
                    <ErrorBoundary key={location.pathname.split('/')[1] || 'production'} onError={() => trace('ui.error', { source: 'boundary' })}>
                      <Routes>
                        <Route
                          path="/"
                          element={
                            <ProductionPage
                              data={data}
                              go={guardedNavigate}
                              notify={setNotice}
                              goToScript={goToScript}
                              goToBooth={(chapterId) => {
                                const credits = chapterId ? creditsKindOfId(chapterId) : undefined;
                                if (credits) goToBooth({ credits });
                                else if (chapterId) goToBooth({ chapter: chapterId });
                                else guardedNavigate('/booth');
                              }}
                              refreshBootstrap={refreshBootstrap}
                              onManuscriptChanged={() => studio.publish(MANUSCRIPT_CHANGED)}
                            />
                          }
                        />
                        {/* The Schedule (the research mock's Schedule page): with no manuscript it says to import one first. */}
                        <Route
                          path="/schedule"
                          element={<SchedulePage journal={journal} hasManuscript={hasManuscript} onImport={() => guardedNavigate('/')} />}
                        />
                        <Route
                          path="/script"
                          element={
                            data.manuscript ? (
                              gated(
                                'script',
                                <ScriptPage notify={setNotice} focusStoryBibleEntity={goToStoryBible} goToEditing={goToEditing} goToBooth={goToBooth} />,
                              )
                            ) : (
                              <NeedManuscriptImport title="Script" data={data} go={guardedNavigate} notify={setNotice} refreshBootstrap={refreshBootstrap} />
                            )
                          }
                        />
                        <Route path="/manuscript" element={<RedirectKeepingLocation to="/script" />} />
                        <Route
                          path="/story-bible"
                          element={gated(
                            'story-bible',
                            <Guide
                              notify={setNotice}
                              goToManuscript={goToScript}
                              hasManuscript={Boolean(data.manuscript)}
                              needManuscript={
                                <NeedManuscriptImport
                                  title="Story Bible"
                                  data={data}
                                  go={guardedNavigate}
                                  notify={setNotice}
                                  refreshBootstrap={refreshBootstrap}
                                />
                              }
                            />,
                          )}
                        />
                        {/* Retired by the engine panel: lands on Proof, where a chapter
                  is heard, with the panel open over it, since the Tracks page's REAPER tools live there. */}
                        <Route path="/tracks" element={<RetiredTracksRoute />} />
                        <Route
                          path="/proof/:chapterId"
                          element={
                            data.manuscript ? (
                              <ProofChapterPage
                                notify={setNotice}
                                transcript={data.transcript}
                                dawFileLinked={data.dawFileLinked}
                                goToManuscript={goToScript}
                                goToEditing={goToEditing}
                                refreshKey={`${data.manuscript.id}:${data.manuscript.importedAt}`}
                              />
                            ) : (
                              <NeedManuscript title="Proof" onImport={() => guardedNavigate('/')} />
                            )
                          }
                        />
                        {/* Editing (the research mock's Editing page): the chapter's script is the editor. `/editing` opens the first chapter;
                  with no manuscript the page asks for one. */}
                        <Route
                          path="/editing"
                          element={gated('editing', <EditingRoute hasManuscript={Boolean(data.manuscript)} onImport={() => guardedNavigate('/')} />)}
                        />
                        <Route
                          path="/editing/:chapterId"
                          element={
                            <EditingGate gated={gated}>
                              <EditingRoute hasManuscript={Boolean(data.manuscript)} onImport={() => guardedNavigate('/')} />
                            </EditingGate>
                          }
                        />
                        <Route
                          path="/booth"
                          element={gated(
                            'booth',
                            <BoothNextPage
                              hasManuscript={Boolean(data.manuscript)}
                              // The Booth asks its own leave question (`useBoothLeaveGuard`) before it calls this, so it does not ask again after "Leave anyway".
                              navigate={(next) => moveTo(next)}
                              onImport={() => guardedNavigate('/')}
                              projectFolder={data.projectFolder}
                            />,
                          )}
                        />
                        <Route
                          path="/companion"
                          element={
                            data.manuscript ? (
                              <CompanionPage onFixCredits={() => guardedNavigate(addressPath({ page: 'settings', anchor: 'credits' }))} />
                            ) : (
                              <Navigate to="/" replace />
                            )
                          }
                        />
                        <Route path="/teleprompter" element={<RedirectKeepingLocation to="/booth" />} />
                        <Route
                          path="/proof"
                          element={gated(
                            'proof',
                            <ProofPage
                              hasManuscript={Boolean(data.manuscript)}
                              projectFolder={data.projectFolder}
                              goTo={guardedNavigate}
                              goToScript={(chapterId) => goToScript(chapterId)}
                              goToBooth={(chapterId) => goToBooth({ chapter: chapterId })}
                              goToEditing={goToEditing}
                              transcript={data.transcript}
                              notify={setNotice}
                              dawFileLinked={data.dawFileLinked}
                            />,
                          )}
                        />
                        {/* Pickups replaces the Tracks page's Pickups dialog, which had no route. */}
                        <Route
                          path="/pickups"
                          element={
                            <PickupsPage hasManuscript={Boolean(data.manuscript)} goTo={guardedNavigate} goToScript={(chapterId) => goToScript(chapterId)} />
                          }
                        />
                        {/* Retired by Proof: old links land, query and hash kept. */}
                        <Route path="/review" element={<RedirectKeepingLocation to="/proof" />} />
                        <Route path="/proofing" element={<RedirectKeepingLocation to="/proof" />} />
                        {/* A chapter's old Tracks address lands on Editing at that chapter, ?t= and ?finding= kept. */}
                        <Route
                          path="/tracks/chapter/:chapterId"
                          element={<RedirectKeepingLocation to={({ chapterId = '' }) => `/editing/${encodeURIComponent(chapterId)}`} />}
                        />
                        {/* The Production page moved to `/`. */}
                        <Route path="/production" element={<RedirectKeepingLocation to="/" />} />
                        {/* Master & QC and Delivery are two pages; without a manuscript Delivery asks for one itself. */}
                        <Route
                          path="/master"
                          element={gated(
                            'master',
                            <MasterPage
                              hasManuscript={Boolean(data.manuscript)}
                              projectFolder={data.projectFolder}
                              onImport={() => guardedNavigate('/')}
                              onOpenDelivery={() => guardedNavigate('/delivery')}
                              openSettings={() => guardedNavigate(addressPath({ page: 'settings', anchor: 'cleanup' }))}
                              focusFile={parseMasterHash(location.hash)?.file}
                            />,
                          )}
                        />
                        {/* An older finding link (`/delivery#file=…`, masterLink.ts) still lands on Master & QC, anchor kept. */}
                        <Route
                          path="/delivery"
                          element={
                            parseMasterHash(location.hash) ? (
                              <RedirectKeepingLocation to="/master" />
                            ) : (
                              <DeliveryPage
                                hasManuscript={Boolean(data.manuscript)}
                                onOpenInMaster={(chapterId) => guardedNavigate(addressPath({ page: 'master', file: chapterId }))}
                                onOpenMaster={() => guardedNavigate(addressPagePath('master'))}
                                onImport={() => guardedNavigate('/')}
                              />
                            )
                          }
                        />
                        <Route path="/settings" element={<SettingsPage {...settingsPageProps} cameFrom={settingsOrigin.origin} />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Routes>
                    </ErrorBoundary>
                    <EnginePanel
                      open={enginePanelOpen}
                      onClose={() => setEnginePanelOpen(false)}
                      notify={setNotice}
                      onOpenRecordingSettings={openRecordingSettings}
                      link={{
                        dawFileLinked: data.dawFileLinked,
                        dawReachable: data.dawReachable,
                        dawProjectMatches: data.dawProjectMatches,
                        checkedAt: dataReadAt,
                        onCheckAgain: () => void dawSession.checkConnection(),
                        onLinkDawFile: () => void linkDawFile(),
                        linkingDawFile: dawLink.isBusy,
                      }}
                    />
                    <BackgroundChecks chapterSync={chapterSync} folded={location.pathname === '/booth'} />
                    {chapterSync?.ask && (
                      <ChapterSyncConsentDialog
                        projectFile={chapterSync.projectFile}
                        daw={audacityLink.link?.chosen ? { daw: 'Audacity', linkedFile: audacityLink.link.linkedFile } : { daw: 'REAPER' }}
                        preview={syncPreview}
                        busy={syncBusy}
                        onSync={() => {
                          setSyncBusy(true);
                          void api
                            .chapterSyncSetEnabled(true)
                            .catch((error) => setNotice(describeApiError(error), 'error'))
                            .finally(() => setSyncBusy(false));
                        }}
                        onNotNow={() => void api.chapterSyncSetEnabled(false).catch((error) => setNotice(describeApiError(error), 'error'))}
                      />
                    )}
                  </AppShell>
                </TooltipProvider>
              </VoiceLayoutContext.Provider>
            </ProjectTrackProviders>
          </EnginePanelProvider>
        </LinkDawFileContext.Provider>
      </DawFileLinkedContext.Provider>
      {unsavedSettings}
      {shortcutSheet}
    </div>
  );

  function cancelPendingMove() {
    moveToken.current += 1;
    setResolving(false);
    setPendingMove(undefined);
    // The caret goes back to the box the exit took it from: its text is still there.
    const field = settledField;
    settledField = undefined;
    if (field?.isConnected) setTimeout(() => field.focus(), 0);
  }

  function resolvePendingMove(move: PendingMove) {
    settledField = undefined;
    if (move.kind === 'picker') setProjectPickerOpen(true);
    else if (move.kind === 'action') move.run();
    else if (move.kind === 'path') {
      navigate(move.path, move.state === undefined ? undefined : { state: move.state });
      move.after?.();
    } else if (move.direction === -1) history.back();
    else history.forward();
  }
}

/**
 * The Editing page's route: the chapter from the address, and `?finding=`, `?t=`, `?passage=` and `?drawer=` from its query (the deep links
 * other pages open it with). Stepping to another chapter replaces the address, so Back leaves Editing rather than walking its chapters.
 */
const DRAWER_TABS: readonly string[] = ['cleanup', 'effects', 'backups', 'timeline'] satisfies DrawerTab[];

/** The Editing route's chapter, read from the address for the gate that checks it. */
function EditingGate({
  gated,
  children,
}: {
  gated: (page: AddressPage, element: ReactElement, chapterParam?: string) => ReactElement;
  children: ReactElement;
}) {
  const { chapterId } = useParams<{ chapterId: string }>();
  return gated('editing', children, chapterId);
}

function EditingRoute({ hasManuscript, onImport }: { hasManuscript: boolean; onImport: () => void }) {
  const { chapterId } = useParams<{ chapterId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const t = params.get('t');
  const seconds = t === null ? undefined : Number(t);
  const drawer = params.get('drawer');
  return (
    <EditingPage
      hasManuscript={hasManuscript}
      chapterId={chapterId}
      findingId={params.get('finding') ?? undefined}
      passageId={params.get('passage') ?? undefined}
      drawer={DRAWER_TABS.includes(drawer as DrawerTab) ? (drawer as DrawerTab) : undefined}
      t={seconds !== undefined && Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined}
      onChapter={(id) => navigate(`/editing/${encodeURIComponent(id)}`, { replace: true })}
      onImport={onImport}
      onOpenStoryBible={(entityId) => navigate(addressPath({ page: 'story-bible', entity: entityId }))}
    />
  );
}
