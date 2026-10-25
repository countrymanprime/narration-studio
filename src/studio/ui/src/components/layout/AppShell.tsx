import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faCircleHalfStroke, faFileLines, faGear, faHouse, faMoon, faWaveSquare } from '@fortawesome/free-solid-svg-icons';
import { iconFor } from '../../icons.catalog';
import { ContextMenuHost } from './ContextMenuHost';
import type { ContextMenuItem } from '../primitives/ContextMenu';
import { NavButton } from '../primitives/NavButton';
import { NavDrawer } from '../primitives/NavDrawer';
import { IconButton } from '../primitives/IconButton';
import { KeyChord } from '../primitives/KeyCap';
import { PageFooterProvider } from '../primitives/KeyHints';
import { TooltipTarget } from '../primitives/Tooltip';
import type { AudacityLink, DawKind } from '../../api/contracts/daw';
import { navAvailability, type NavFacts } from '../../navigation/navAvailability';
import { Brand } from './Brand';
import { ExtensionBanner } from '../../appExtension';
import { EngineChip, type EngineState } from './EngineChip';
import { HeaderChip } from '../primitives/HeaderChip';
import type { NavCounts } from './useNavCounts';
import { brand } from '../../brand.gen';

// The rail's items. What each one needs is not here: `navAvailability` is the one table the rail, the drawer and the jump menu read.
const PRODUCTION = { name: 'Production', path: '/', icon: faHouse };
// The Schedule (the Studio Next mock's rail): the due date, how the book pays and the milestones.
const SCHEDULE = { name: 'Schedule', path: '/schedule', icon: iconFor('calendar') };
const SCRIPT = { name: 'Script', path: '/script', icon: faFileLines };
const STORY_BIBLE = { name: 'Story Bible', path: '/story-bible', icon: iconFor('book') };
// The Record stage's one page: it replaced the Teleprompter page. Its icon is the microphone, as the Studio Next mock's rail draws it.
const BOOTH = { name: 'Booth', path: '/booth', icon: iconFor('microphone') };
// Editing (the Studio Next mock's Editing page): the chapter's script as the editor, at /editing and /editing/:chapterId.
const EDITING = { name: 'Editing', path: '/editing', icon: iconFor('scissors') };
// Proof: the book's notes at /proof and a chapter's view at /proof/:chapterId, replacing Review and Proofing.
const PROOF = { name: 'Proof', path: '/proof', icon: faWaveSquare };
// Pickups: the proofer's pickup list, replacing the Tracks page's Pickups dialog.
const PICKUPS = { name: 'Pickups', path: '/pickups', icon: iconFor('pickups') };
const MASTER_QC = { name: 'Master & QC', path: '/master', icon: iconFor('gauge') };
// Delivery (the Studio Next mock's rail): the profile card, the package build and what is left before it.
const DELIVERY = { name: 'Delivery', path: '/delivery', icon: iconFor('delivery') };

// Grouped by production stage: Production, Prep, Record, Edit (the Studio Next mock's own group for Editing), Review,
// Finish, with Settings pinned at the foot (below, not a group). A page is renamed only in the change that ships its
// replacement. The Production page is the home at `/` (`/production` redirects there).
type NavItem = typeof PRODUCTION;
const NAV_COUNT_KEYS: Record<string, keyof NavCounts> = { Proof: 'proof', Pickups: 'pickups', 'Master & QC': 'master' };
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Production', items: [PRODUCTION, SCHEDULE] },
  { label: 'Prep', items: [SCRIPT, STORY_BIBLE] },
  { label: 'Record', items: [BOOTH] },
  { label: 'Edit', items: [EDITING] },
  { label: 'Review', items: [PROOF, PICKUPS] },
  { label: 'Finish', items: [MASTER_QC, DELIVERY] },
];
/** The pages "Go to <page>" lists: the rail's items and Settings. One the project cannot use yet is listed off, with the reason. */
export function shellPages(facts: NavFacts): { id: string; label: string; disabledReason?: string }[] {
  return [...NAV_GROUPS.flatMap((group) => group.items), { name: 'Settings', path: '/settings' }].map((item) => ({
    id: item.path,
    label: item.name,
    disabledReason: navAvailability(item.path, facts).reason,
  }));
}
export const isActivePath = (pathname: string, path: string) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`));
const APP_NAME = `${brand.name}`;
const ALL_PAGES: { name: string; path: string }[] = [...NAV_GROUPS.flatMap((group) => group.items), { name: 'Settings', path: '/settings' }];
/** The rail's name for the page `pathname` is on (`/editing/chapter-2` is Editing), or undefined for a path no rail item owns. */
const pageNameFor = (pathname: string) => ALL_PAGES.find((page) => isActivePath(pathname, page.path))?.name;
// The skip link: hidden until it takes focus, then drawn over the top of the window. It is the first tab stop on every page.
const SKIP_LINK_CLASS =
  'sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-popover)] focus:rounded-[var(--radius-button)] focus:bg-[var(--surface)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--text)] focus:shadow-[var(--shadow-lg)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]';

// A dialog that closes (the jump menu after a pick) gives focus back to the control that opened it a moment after the page changed, which
// would undo the move into <main>. So focus <main> a tick later, and with a dialog still on screen after the last one leaves, unless focus
// already sits in the page. Gives up waiting after a second so a dialog the new page opens itself is left alone. Returns the cleanup.
function focusMainOnceDialogsClose(main: HTMLElement | null): (() => void) | undefined {
  if (!main) return undefined;
  const focusMain = () => {
    if (!main.contains(document.activeElement)) main.focus({ preventScroll: true });
  };
  let timer = 0;
  if (!document.querySelector('[role="dialog"]')) {
    timer = window.setTimeout(focusMain, 0);
    return () => window.clearTimeout(timer);
  }
  const watch = new MutationObserver(() => {
    if (document.querySelector('[role="dialog"]')) return;
    stop();
    // After Base UI has put focus back on the opener.
    timer = window.setTimeout(focusMain, 0);
  });
  const give = window.setTimeout(() => stop(), 1000);
  function stop() {
    watch.disconnect();
    window.clearTimeout(give);
  }
  watch.observe(document.body, { childList: true, subtree: true });
  return () => {
    stop();
    window.clearTimeout(timer);
  };
}

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
  audacity,
  navCounts = {},
  zoom,
  onOpenJump,
  onOpenZoomMenu,
  onSwitchProject,
  theme,
  contextMenu,
  children,
}: {
  pathname: string;
  navigate: (path: string) => void;
  projectName: string;
  hasManuscript: boolean;
  dawFileLinked: boolean;
  /** Whether a live REAPER heartbeat has been seen recently; false also covers "unknown". */
  dawReachable?: boolean;
  /** Whether that heartbeat's open project is the linked file; only meaningful when dawReachable is true. */
  dawProjectMatches?: boolean;
  /** Opens the engine panel from the header's engine chip. */
  onOpenEnginePanel: () => void;
  /** True while the shared DAW-link binding is running for any of its three call sites (docs/architecture/interaction-feedback.md#the-standard's ref guard). */
  linkingDawFile?: boolean;
  /** Which engine the header's chip shows; UI-only until native recording picks 'builtin'. */
  engine?: EngineState;
  /** Which DAW backs the session, from the DAW capabilities; the header's chip names it. */
  daw?: DawKind;
  /** Audacity's link state; the chip words an Audacity project from it instead of REAPER's file and heartbeat. */
  audacity?: AudacityLink;
  /** The rail's count badges, from useNavCounts: a missing or zero count draws none. */
  navCounts?: NavCounts;
  /** The zoom level: the header draws a chip only while `percent` is not 100, and `announcement` is the debounced live-region text `useZoom` builds. */
  zoom: { percent: number; announcement: string };
  /** Opens the jump menu: the header's "Jump to or run…" button (Ctrl+K opens it from anywhere). */
  onOpenJump: () => void;
  /** Opens the jump menu at its Zoom commands: the zoom chip. */
  onOpenZoomMenu: () => void;
  /** Opens the project picker: the project name in the header. */
  onSwitchProject: () => void;
  /** The foot's Theme item (the mock's rail): absent draws none. */
  theme?: { dark: boolean; toggle: () => void };
  /** The menu on empty space in `<main>`, then the items every menu ends with (docs/architecture/studio-shell-and-registries.md#command-providers-and-go-to). */
  contextMenu?: { fallback: (target: Element) => ContextMenuItem[]; tail: ContextMenuItem[] };
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  const go = (next: string) => {
    viaDrawer.current = drawerOpen;
    setDrawerOpen(false);
    navigate(next);
  };
  const settingsActive = isActivePath(pathname, '/settings');
  const mainRef = useRef<HTMLElement>(null);
  const pageName = pageNameFor(pathname);
  const [pageAnnouncement, setPageAnnouncement] = useState('');
  const lastPage = useRef(pageName);
  const viaDrawer = useRef(false);
  // The title names the page. A move to another page (not a chapter within one, and not the first load) is announced politely and
  // takes focus into <main>, so it does not stay on the control of the page left (the rail item after the jump menu or Back).
  useEffect(() => {
    document.title = pageName ? `${pageName} · ${APP_NAME}` : APP_NAME;
  }, [pageName]);
  useEffect(() => {
    if (lastPage.current === pageName) return;
    lastPage.current = pageName;
    if (!pageName) return;
    setPageAnnouncement(pageName);
    // The drawer sends focus back to its menu button, as it always has; the title and the announcement carry the change.
    if (viaDrawer.current) {
      viaDrawer.current = false;
      return;
    }
    return focusMainOnceDialogsClose(mainRef.current);
  }, [pageName]);
  const skipLink = (
    <a
      href="#main-content"
      className={SKIP_LINK_CLASS}
      onClick={(event) => {
        event.preventDefault();
        mainRef.current?.focus();
      }}
    >
      Skip to content
    </a>
  );
  const pageStatus = (
    <div role="status" aria-label="Page" className="sr-only">
      {pageAnnouncement}
    </div>
  );
  const gateFor = (item: NavItem) => navAvailability(item.path, { hasManuscript, dawFileLinked });
  const isDisabled = (item: NavItem) => gateFor(item).disabled;
  const requiredReason = (item: NavItem) => gateFor(item).reason;
  // The wide rail's group heading: a visible `section-label`, referenced by the group's `aria-labelledby` so a
  // screen reader hears the stage name once, not twice. Shared by the sidebar and the drawer, which render the same markup.
  const groupHeadingId = (label: string) => `nav-group-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const navigation = (
    <>
      {/* The brand block as the Studio Next mock's `.brand` draws it: 50 px (4 px above and 10 px below its content), no rule, 12 px below the rail's top; `Brand` is the mark and name.
          The mark starts 18 px in, where the group names and the nav icons' boxes start (alignment audit XSL-8, R3SL-1); in the icon rail it is
          centred over the icons instead (16 px), and stays there when the rail opens. */}
      <div className="mt-3 flex h-[3.125rem] flex-none items-center gap-[0.625rem] pt-1 pr-4 pb-2.5 pl-[1.125rem] min-[860px]:max-[1360px]:pl-4">
        <Brand />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-0.5 pb-2">
        {NAV_GROUPS.map((group, index) => (
          <div
            key={group.label}
            role="group"
            aria-label={index === 0 ? group.label : undefined}
            aria-labelledby={index === 0 ? undefined : groupHeadingId(group.label)}
            className="flex flex-col gap-0.5"
          >
            {/* Every group but the first is headed, as the mock's `.grp`: 12 px capitals tracked .16em, the row 36 px with the text 4 px
                above its bottom, so the group's first item follows at once. Production and Schedule sit straight under the brand block. */}
            {index > 0 && (
              <div
                id={groupHeadingId(group.label)}
                className="section-label relative flex h-9 items-end px-[0.625rem] pb-1 text-[0.75rem] leading-none tracking-[0.16em]"
              >
                {group.label}
              </div>
            )}
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
      {/* The foot: Theme and Settings on the rail's own inset, 12 px above its bottom edge, with no rule above them (the mock draws none). */}
      <div className="rail-foot flex flex-none flex-col gap-0.5 px-2 pt-2 pb-3">
        {theme && (
          // Light theme is a half-filled circle: the mock's sun (solid or outline) has short rays that read as a second gear over Settings
          // at 20 px in dark (alignment audit XSL-21, R3PR1-12, R3PR2-27, R3MS-8).
          <NavButton active={false} icon={theme.dark ? faCircleHalfStroke : faMoon} onClick={theme.toggle}>
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
  // out, and the page keeps its own `<main>` so the landmark stays. With no manuscript the page is the empty state and has no Exit, so it keeps the rail.
  if (isActivePath(pathname, '/booth') && hasManuscript) {
    return (
      <div className="h-full overflow-hidden bg-[var(--bg)]">
        {skipLink}
        {pageStatus}
        <main id="main-content" ref={mainRef} tabIndex={-1} className="size-full overflow-hidden focus:outline-none">
          {children}
        </main>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg)]">
      {skipLink}
      {pageStatus}
      <ExtensionBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* One rail from 860 px (the mock's `.rail`; below it the mock's tab bar is the hamburger and drawer here): 216 px from 1360 CSS px, 64 px of icons below it. Below 1360 the panel inside
            is taken out of the flow, so it opens over the page on hover or keyboard focus without moving anything; the labels stay in the
            markup, hidden by size, so every item keeps its name. The icons keep their centred inset when it opens, so the group names take
            the same inset and start where the icons do (XSL-8). */}
        <aside className="relative z-[var(--z-nav)] hidden w-16 flex-none min-[860px]:flex min-[1360px]:w-54" aria-label="Primary navigation">
          <div className="icon-rail flex w-16 flex-col overflow-x-hidden overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] max-[1360px]:hover:w-59 max-[1360px]:hover:shadow-[var(--shadow-lg)] max-[1360px]:has-[:focus-visible]:w-59 max-[1360px]:has-[:focus-visible]:shadow-[var(--shadow-lg)] min-[860px]:max-[1360px]:absolute min-[860px]:max-[1360px]:inset-y-0 min-[860px]:max-[1360px]:left-0 min-[1360px]:static min-[1360px]:w-54 motion-ok:transition-[width,box-shadow] motion-ok:duration-(--motion-fast) max-[1360px]:[&_.brand-name]:invisible max-[1360px]:hover:[&_.brand-name]:visible max-[1360px]:has-[:focus-visible]:[&_.brand-name]:visible max-[1360px]:[&_.section-label]:pl-[0.78125rem] max-[1360px]:[&_.section-label]:text-transparent max-[1360px]:hover:[&_.section-label]:text-[var(--text-muted)] max-[1360px]:has-[:focus-visible]:[&_.section-label]:text-[var(--text-muted)] max-[1360px]:[&_button]:pl-[0.78125rem] max-[1360px]:[&_button]:text-[0px] max-[1360px]:hover:[&_button]:text-[0.9375rem] max-[1360px]:has-[:focus-visible]:[&_button]:text-[0.9375rem]">
            {navigation}
          </div>
        </aside>
        <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          {navigation}
        </NavDrawer>
        {/* tabIndex -1: a dialog that closes with nothing to give focus back to (its opener is gone) sends focus into <main> (its first control, or <main> itself), not to <body>. */}
        <main id="main-content" ref={mainRef} tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-hidden focus:outline-none">
          <header className="flex h-13 flex-none items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-[var(--page-gutter)] text-sm max-md:gap-2">
            <IconButton label="Open navigation" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} className="min-[860px]:hidden">
              <FontAwesomeIcon icon={faBars} />
            </IconButton>
            {/* The Studio Next mock's top bar and nothing else: the crumb, the project name (a button), the jump menu, a zoom chip off 100% and the engine chip.
                Back, Forward, Undo, History and the zoom steps live in the jump menu, on their keys. */}
            <span className="section-label max-md:hidden">Project</span>
            <TooltipTarget text="Switch project">
              {/* native-control-ok: the project name is a text-shaped button (the mock's `.proj`); Button's padded uppercase chrome would turn the name into an action label. */}
              <button
                type="button"
                onClick={onSwitchProject}
                // The name starts with the text the button draws: axe fails a name that does not.
                aria-label={`${projectName}, switch project`}
                className="min-w-0 cursor-pointer truncate rounded-[var(--radius-button)] px-1.5 py-1 text-left font-medium hover:bg-[var(--surface-2)]"
              >
                {projectName}
              </button>
            </TooltipTarget>
            <div className="flex-1" />
            {/* The zoom chip, only while zoom is not 100%: it opens the jump menu at the zoom commands (the mock's `zoomchip`). Left of the jump button
                (#2251 item 25), on the spacer's side, so it appearing or going moves nothing else in the bar. */}
            {zoom.percent !== 100 && (
              <TooltipTarget text="Zoom (change it in the jump menu)">
                <HeaderChip onClick={onOpenZoomMenu} aria-label={`Zoom ${zoom.percent}%: change in the jump menu`}>
                  <span className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.8125rem] font-medium tracking-normal">{zoom.percent}%</span>
                </HeaderChip>
              </TooltipTarget>
            )}
            <TooltipTarget text="Jump to a page or chapter, or run a command (Ctrl+K)">
              <button
                type="button"
                onClick={onOpenJump}
                // The name says the key the chord draws: axe fails a name that leaves out text the button draws.
                aria-label="Jump to or run…, Ctrl K"
                aria-keyshortcuts="Control+K"
                className="flex h-8 min-w-0 flex-none cursor-pointer items-center gap-2 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[length:var(--font-size-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] max-lg:size-8 max-lg:justify-center max-lg:px-0"
              >
                <FontAwesomeIcon icon={iconFor('jumpTo')} />
                <span className="max-lg:hidden">Jump to or run…</span>
                <span className="max-xl:hidden">
                  <KeyChord keys={['Ctrl', 'K']} />
                </span>
              </button>
            </TooltipTarget>
            {/* A level change is announced once, politely, debounced by useZoom, not on every wheel notch. It stays mounted at 100% so the return to 100% is heard too. */}
            <div aria-live="polite" className="sr-only">
              {zoom.announcement}
            </div>
            <EngineChip
              daw={daw}
              audacity={audacity}
              engine={engine}
              dawFileLinked={dawFileLinked}
              dawReachable={dawReachable}
              dawProjectMatches={dawProjectMatches}
              onOpenEnginePanel={onOpenEnginePanel}
              linkingDawFile={linkingDawFile}
            />
          </header>
          <PageFooterProvider value={footer}>
            <ContextMenuHost
              className="scroll-chrome-hidden relative flex-1 overflow-y-auto p-[var(--page-gutter)]"
              fallback={contextMenu?.fallback}
              tail={contextMenu?.tail}
            >
              {children}
            </ContextMenuHost>
          </PageFooterProvider>
          {/* The page footer (#2251 item 35): the page's key reminders (`KeyHints`), full width under the scrolling content like the header
              above it. A `<footer>` (not a div), so the overlay guard still finds the scroll area as the last div child of <main>
              (`tests/visual/helpers/overlayGuard.ts`); inside <main> it is a generic element, not a second `contentinfo` landmark. Empty, it takes no height. */}
          <footer ref={setFooter} data-page-footer className="flex-none" />
        </main>
      </div>
    </div>
  );
}
