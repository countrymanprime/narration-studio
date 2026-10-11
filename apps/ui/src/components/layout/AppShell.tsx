import { useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faArrowRight,
  faBars,
  faBookOpen,
  faClockRotateLeft,
  faCircleDot,
  faFileLines,
  faFolder,
  faGaugeHigh,
  faGear,
  faHouse,
  faMicrophone,
  faMagnifyingGlass,
  faMinus,
  faMoon,
  faPlus,
  faRotateLeft,
  faSun,
  faWaveSquare,
} from '@fortawesome/free-solid-svg-icons';
import { ContextMenuHost } from './ContextMenuHost';
import type { ContextMenuItem } from '../primitives/ContextMenu';
import { NavButton } from '../primitives/NavButton';
import { NavDrawer } from '../primitives/NavDrawer';
import { IconButton } from '../primitives/IconButton';
import { Button } from '../primitives/Button';
import { KeyChord } from '../primitives/KeyCap';
import { TooltipTarget } from '../primitives/Tooltip';
import type { DawKind } from '../../api/contracts/daw';
import { dawCapabilityGate } from '../../dawAvailability';
import { DemoBanner } from './DemoBanner';
import { EngineChip, type EngineState } from './EngineChip';
import { TimerChip, type RunningTimer } from './TimerChip';
import type { NavCounts } from './useNavCounts';

// requiresManuscript/requiresDaw name what each nav item is gated on: no item needs a linked DAW project file since Proof replaced Proofing (its compare
// run gates itself inside the chapter view). The requiresDaw field stays for the next item that needs one.
// The Production stage's page: the Production home at `/`, which replaced Home.
// Not gated: with no manuscript it is where the import is.
const PRODUCTION = { name: 'Production', path: '/', icon: faHouse, requiresManuscript: false, requiresDaw: false };
const SCRIPT = { name: 'Script', path: '/script', icon: faFileLines, requiresManuscript: true, requiresDaw: false };
const STORY_BIBLE = { name: 'Story Bible', path: '/story-bible', icon: faBookOpen, requiresManuscript: true, requiresDaw: false };
// The Record stage's one page: it replaced the Teleprompter page. Its
// icon is a record dot, as the stage-nav mocks draw it (audit SH12).
const BOOTH = { name: 'Booth', path: '/booth', icon: faCircleDot, requiresManuscript: true, requiresDaw: false };
// Proof: the book's notes at /proof and a chapter's view at /proof/:chapterId,
// replacing Review and Proofing. Not gated: take-review notes need no manuscript, the page says itself when there is nothing to
// proof yet, and the compare run inside a chapter view gates itself on the DAW (CapabilityGate).
const PROOF = { name: 'Proof', path: '/proof', icon: faWaveSquare, requiresManuscript: false, requiresDaw: false };
// Measuring rendered chapter files. Not gated: it reads files the narrator
// picks, so it needs neither a manuscript nor a REAPER project.
// Pickups: the proofer's pickup list, replacing the Tracks page's
// Pickups dialog. Not gated: its import, export and jumps talk to REAPER and each says itself when REAPER is not there.
const PICKUPS = { name: 'Pickups', path: '/pickups', icon: faRotateLeft, requiresManuscript: false, requiresDaw: false };
const MASTER_QC = { name: 'Master & QC', path: '/master', icon: faGaugeHigh, requiresManuscript: false, requiresDaw: false };

// Grouped by production stage (ADR 0407): Production, Prep, Record, Review,
// Finish, with Settings pinned at the foot (below, not a group). A page is renamed only in the change that ships its
// replacement. The Production page is the home at `/` (`/production` redirects there).
type NavItem = typeof PRODUCTION;
const NAV_COUNT_KEYS: Record<string, keyof NavCounts> = { 'Story Bible': 'storyBible', Proof: 'proof', Pickups: 'pickups' };
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Production', items: [PRODUCTION] },
  { label: 'Prep', items: [SCRIPT, STORY_BIBLE] },
  { label: 'Record', items: [BOOTH] },
  { label: 'Review', items: [PROOF, PICKUPS] },
  { label: 'Finish', items: [MASTER_QC] },
];
/** The pages "Go to <page>" can open: the rail's items and Settings, minus the ones a project with no manuscript cannot show. */
export function shellPages(hasManuscript: boolean): { id: string; label: string }[] {
  return [...NAV_GROUPS.flatMap((group) => group.items), { name: 'Settings', path: '/settings', requiresManuscript: false }]
    .filter((item) => hasManuscript || !item.requiresManuscript)
    .map((item) => ({ id: item.path, label: item.name }));
}
const isActivePath = (pathname: string, path: string) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`));

export function AppShell({
  pathname,
  navigate,
  projectName,
  hasManuscript,
  dawFileLinked,
  dawReachable = false,
  dawProjectMatches = false,
  onOpenEnginePanel,
  linkingDawFile = false,
  engine = 'daw',
  daw,
  timer = null,
  navCounts = {},
  history,
  zoom,
  onOpenJump,
  onOpenHistory,
  undo,
  theme,
  contextMenu,
  children,
}: {
  pathname: string;
  navigate: (path: string) => void;
  projectName: string;
  hasManuscript: boolean;
  dawFileLinked: boolean;
  /** Whether a live REAPER heartbeat has been seen recently (ADR 0092); false also covers "unknown". */
  dawReachable?: boolean;
  /** Whether that heartbeat's open project is the linked file; only meaningful when dawReachable is true. */
  dawProjectMatches?: boolean;
  /** Opens the engine panel from the header's engine chip. */
  onOpenEnginePanel: () => void;
  /** True while the shared DAW-link binding is running for any of its three call sites (ADR 0075's ref guard). */
  linkingDawFile?: boolean;
  /** Which engine the header's chip shows; UI-only until native recording picks 'builtin'. */
  engine?: EngineState;
  /** Which DAW backs the session, from the DAW capabilities; the header's chip names it. */
  daw?: DawKind;
  /** The production stage timer while it runs; null hides the chip. */
  timer?: RunningTimer | null;
  /** The rail's count badges, from useNavCounts: a missing or zero count draws none. */
  navCounts?: NavCounts;
  /** Page-level Back/Forward: already guarded and gated by App.tsx. */
  history: { canGoBack: boolean; canGoForward: boolean; back: () => void; forward: () => void };
  /** The header's zoom group: `useZoom`'s own state and actions. */
  zoom: { percent: number; canZoomOut: boolean; canZoomIn: boolean; zoomIn: () => void; zoomOut: () => void; reset: () => void; announcement: string };
  /** Opens the jump menu: the header's "Jump to or run…" button (Ctrl+K opens it from anywhere). */
  onOpenJump: () => void;
  /** Opens the undo history panel from the header's History button. */
  onOpenHistory: () => void;
  /** The header's Undo: `disabledReason` is set while the journal has nothing to undo. */
  undo: { disabledReason?: string; run: () => void };
  /** The foot's Theme item (the mock's rail): absent draws none. */
  theme?: { dark: boolean; toggle: () => void };
  /** The menu on empty space in `<main>`, then the items every menu ends with (ADR 0780 decision 5). */
  contextMenu?: { fallback: (target: Element) => ContextMenuItem[]; tail: ContextMenuItem[] };
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const go = (next: string) => {
    setDrawerOpen(false);
    navigate(next);
  };
  const settingsActive = isActivePath(pathname, '/settings');
  // A requiresDaw item needs a linked file only: the one that also read the DAW port's `review` capability was Proofing, whose
  // compare run now gates itself in the Proof chapter view (CapabilityGate).
  const gateFor = (item: NavItem) =>
    dawCapabilityGate(
      { manuscript: item.requiresManuscript && !hasManuscript, dawFile: item.requiresDaw && !dawFileLinked },
      { level: 'supported', available: true },
    );
  const isDisabled = (item: NavItem) => gateFor(item).disabled;
  const requiredReason = (item: NavItem) => gateFor(item).reason;
  const backTooltip = history.canGoBack ? 'Back (Alt+Left)' : 'Back (Alt+Left): no earlier page in this project';
  const forwardTooltip = history.canGoForward ? 'Forward (Alt+Right)' : 'Forward (Alt+Right): no later page yet';
  // The header's zoom group: the readout is always shown and is itself the reset button, disabled
  // only at exactly 100%.
  const zoomOutTooltip = 'Zoom out (Ctrl+-)';
  const zoomInTooltip = 'Zoom in (Ctrl+=)';
  const zoomResetTooltip = 'Reset zoom to 100% (Ctrl+0)';
  const zoomAtDefault = zoom.percent === 100;
  // The wide rail's group heading: a visible `section-label`, referenced by the group's `aria-labelledby` so a
  // screen reader hears the stage name once, not twice. Shared by the sidebar and the drawer, which render the same markup.
  const groupHeadingId = (label: string) => `nav-group-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const navigation = (
    <>
      {/* The brand block: 62 px and its rule; the 30 px mark at 16 px in, radius 6; the name Barlow
          Condensed 700 at 13 px over a 10 px muted tagline, 10 px after the mark. */}
      <div className="flex h-[3.9375rem] flex-none items-center gap-[0.625rem] border-b border-[var(--border)] px-4">
        <span className="flex size-[1.875rem] flex-none items-center justify-center rounded-[var(--radius-button)] bg-[var(--accent)] text-[0.875rem] text-[var(--accent-contrast)]">
          <FontAwesomeIcon icon={faMicrophone} fixedWidth />
        </span>
        <span className="brand-name pb-[0.125rem] font-['Barlow_Condensed',sans-serif] leading-none uppercase">
          <b className="block text-[0.8125rem] font-bold tracking-[0.11em]">Narration</b>
          <span className="mt-[0.4375rem] block text-[0.625rem] font-semibold tracking-[0.1em] text-[var(--text-muted)]">Studio</span>
        </span>
      </div>
      <nav className="flex-1 px-2 pt-[0.5625rem] pb-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} role="group" aria-labelledby={groupHeadingId(group.label)} className="flex flex-col gap-[0.1875rem]">
            {/* Every group is headed (ADR 0407): 10 px capitals at x 19, 29 px deep with the gap above the group's first
                item, so a heading sits 32 px between two items as the benchmark mock spaces it. The mock draws no heading over its first group,
                but that group also holds a Schedule item the app has no page for (ADR 0407); the drawn heading takes most of
                that item's place, so every later item sits within 8 px of where the benchmark mocks draw it (ADR 0636). */}
            <div
              id={groupHeadingId(group.label)}
              className="section-label px-[0.625rem] pt-[0.6875rem] pb-[0.375rem] text-[0.625rem] leading-[0.75rem] tracking-[0.1em]"
            >
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavButton
                key={item.name}
                active={isActivePath(pathname, item.path)}
                icon={item.icon}
                onClick={() => go(item.path)}
                disabled={isDisabled(item)}
                disabledReason={requiredReason(item)}
                count={NAV_COUNT_KEYS[item.name] ? navCounts[NAV_COUNT_KEYS[item.name]] : undefined}
              >
                {item.name}
              </NavButton>
            ))}
          </div>
        ))}
      </nav>
      {/* The foot: its rule, then Settings 10 px from it, 4 px further in than the items above. */}
      <div className="flex flex-none flex-col gap-[0.1875rem] border-t border-[var(--border)] px-3 py-[0.625rem]">
        {theme && (
          <NavButton active={false} icon={theme.dark ? faSun : faMoon} onClick={theme.toggle}>
            {theme.dark ? 'Light theme' : 'Dark theme'}
          </NavButton>
        )}
        <NavButton active={settingsActive} icon={faGear} onClick={() => go('/settings')}>
          Settings
        </NavButton>
      </div>
    </>
  );
  // The Booth fills the whole window: no rail, no header, no drawer. Exit booth (or Escape) is the way
  // out, and the page keeps its own `<main>` so the landmark stays.
  if (isActivePath(pathname, '/booth')) {
    return (
      <div className="h-full overflow-hidden bg-[var(--bg)]">
        <main tabIndex={-1} className="size-full overflow-hidden focus:outline-none">
          {children}
        </main>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg)]">
      <DemoBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* One rail at md and up (the mock's `.rail`): 216 px from 1360 CSS px, 64 px of icons below it (ADR 0761). Below 1360 the panel inside
            is taken out of the flow, so it opens over the page on hover or keyboard focus without moving anything; the labels stay in the
            markup, hidden by size, so every item keeps its name. */}
        <aside className="relative hidden w-16 flex-none min-[1360px]:w-54 md:block" aria-label="Primary navigation">
          <div className="absolute inset-y-0 left-0 flex w-16 flex-col overflow-x-hidden overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] transition-[width,box-shadow] duration-150 max-[1359px]:z-30 max-[1359px]:hover:w-59 max-[1359px]:hover:shadow-[var(--shadow-lg)] max-[1359px]:has-[:focus-visible]:w-59 max-[1359px]:has-[:focus-visible]:shadow-[var(--shadow-lg)] min-[1360px]:static min-[1360px]:w-54 max-[1359px]:[&_.brand-name]:invisible max-[1359px]:hover:[&_.brand-name]:visible max-[1359px]:has-[:focus-visible]:[&_.brand-name]:visible max-[1359px]:[&_.section-label]:text-transparent max-[1359px]:hover:[&_.section-label]:text-[var(--text-muted)] max-[1359px]:has-[:focus-visible]:[&_.section-label]:text-[var(--text-muted)] max-[1359px]:[&_button]:text-[0px] max-[1359px]:hover:[&_button]:text-[0.8125rem] max-[1359px]:has-[:focus-visible]:[&_button]:text-[0.8125rem] max-[1359px]:[&_button>span]:invisible max-[1359px]:hover:[&_button>span]:visible max-[1359px]:has-[:focus-visible]:[&_button>span]:visible">
            {navigation}
          </div>
        </aside>
        <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          {navigation}
        </NavDrawer>
        {/* tabIndex -1: a dialog that closes with nothing to give focus back to (its opener is gone) sends focus into <main> (its first control, or <main> itself), not to <body>. */}
        <main tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-hidden focus:outline-none">
          <header className="flex h-13 flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 text-sm md:px-5">
            <IconButton label="Open navigation" onClick={() => setDrawerOpen(true)} className="hidden max-md:inline-flex">
              <FontAwesomeIcon icon={faBars} />
            </IconButton>
            {/* Page history: walks the app's own page moves only, through App.tsx's guards. */}
            <div className="flex flex-none items-center gap-1" role="group" aria-label="Page history">
              <TooltipTarget text={backTooltip}>
                <IconButton label="Back" disabledReason={history.canGoBack ? undefined : backTooltip} onClick={history.back}>
                  <FontAwesomeIcon icon={faArrowLeft} />
                </IconButton>
              </TooltipTarget>
              <TooltipTarget text={forwardTooltip}>
                <IconButton label="Forward" disabledReason={history.canGoForward ? undefined : forwardTooltip} onClick={history.forward}>
                  <FontAwesomeIcon icon={faArrowRight} />
                </IconButton>
              </TooltipTarget>
            </div>
            {/* Left-aligned after the history buttons, as the mocks draw it; it takes the free width and truncates first. */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* Below `md` the two history buttons leave less room: the label and
                  folder icon drop first, and the project name is left to truncate on its own. */}
              <span className="section-label max-md:hidden">Project</span>
              <FontAwesomeIcon icon={faFolder} style={{ color: 'var(--non-text)' }} className="max-md:hidden" />
              <span className="truncate font-medium">{projectName}</span>
            </div>
            {/* The mock's top bar: the jump menu opens from here, and the journal's Undo and History sit beside it. */}
            <TooltipTarget text="Jump to a page or chapter, or run a command (Ctrl+K)">
              <Button
                variant="secondary"
                onClick={onOpenJump}
                aria-label="Jump to or run…"
                aria-keyshortcuts="Control+K"
                className="h-8 flex-none gap-2 px-2.5 py-0 font-normal tracking-normal normal-case max-md:size-8 max-md:px-0"
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} />
                <span className="max-md:hidden">Jump to or run…</span>
                <span className="max-lg:hidden">
                  <KeyChord keys={['Ctrl', 'K']} />
                </span>
              </Button>
            </TooltipTarget>
            <div className="flex flex-none items-center gap-1" role="group" aria-label="Undo history">
              <TooltipTarget text={undo.disabledReason ?? 'Undo the last change'}>
                <IconButton label="Undo" disabledReason={undo.disabledReason} onClick={undo.run}>
                  <FontAwesomeIcon icon={faRotateLeft} />
                </IconButton>
              </TooltipTarget>
              <TooltipTarget text="History: every change you can undo (Ctrl+Shift+H)">
                <IconButton label="History" aria-keyshortcuts="Control+Shift+H" onClick={onOpenHistory}>
                  <FontAwesomeIcon icon={faClockRotateLeft} />
                </IconButton>
              </TooltipTarget>
            </div>
            {timer && <TimerChip timer={timer} />}
            {/* The zoom group (ADR 0407): after a running timer chip, before the engine chip. */}
            <div className="flex flex-none items-center gap-1" role="group" aria-label="Zoom">
              <TooltipTarget text={zoomOutTooltip}>
                <IconButton label="Zoom out" disabledReason={zoom.canZoomOut ? undefined : zoomOutTooltip} onClick={zoom.zoomOut}>
                  <FontAwesomeIcon icon={faMinus} />
                </IconButton>
              </TooltipTarget>
              <TooltipTarget text={zoomResetTooltip}>
                <Button
                  variant="secondary"
                  aria-label={`Reset zoom to 100% (now ${zoom.percent}%)`}
                  aria-disabled={zoomAtDefault || undefined}
                  onClick={zoomAtDefault ? (event) => event.preventDefault() : zoom.reset}
                  className="h-8 min-w-14 justify-center px-2 py-0 font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.8rem] font-normal tracking-normal normal-case aria-disabled:pointer-events-none aria-disabled:opacity-40"
                >
                  {zoom.percent}%
                </Button>
              </TooltipTarget>
              <TooltipTarget text={zoomInTooltip}>
                <IconButton label="Zoom in" disabledReason={zoom.canZoomIn ? undefined : zoomInTooltip} onClick={zoom.zoomIn}>
                  <FontAwesomeIcon icon={faPlus} />
                </IconButton>
              </TooltipTarget>
              {/* A level change is announced once, politely, debounced by useZoom - not on every wheel notch (Solution Detail). */}
              <div aria-live="polite" className="sr-only">
                {zoom.announcement}
              </div>
            </div>
            <EngineChip
              daw={daw}
              engine={engine}
              dawFileLinked={dawFileLinked}
              dawReachable={dawReachable}
              dawProjectMatches={dawProjectMatches}
              onOpenEnginePanel={onOpenEnginePanel}
              linkingDawFile={linkingDawFile}
            />
          </header>
          <ContextMenuHost
            className={`scroll-chrome-hidden relative flex-1 overflow-y-auto ${isActivePath(pathname, '/script') ? 'p-0' : 'p-4 md:p-6'}`}
            fallback={contextMenu?.fallback}
            tail={contextMenu?.tail}
          >
            {children}
          </ContextMenuHost>
        </main>
      </div>
    </div>
  );
}
