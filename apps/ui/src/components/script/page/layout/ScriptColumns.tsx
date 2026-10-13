// The Script page's three columns (the mock's `.script` grid in `pages/script/ScriptPage.tsx` and `styles/app.css`): the chapter list
// (240 px), the reader, and the rail (380 px). At 1280 px and below the rail is a drawer over the text; below 1180 px the chapter list
// is one too. A drawer slides in from its side with a scrim behind it, both drawn inside the columns (never fixed to the window) and on
// the panel layers, which sit under the navigation rail (`--z-panel`, styles.css): the rail stays clickable, and a press anywhere
// outside the drawer closes it. A closed drawer is hidden from the keyboard and screen readers. The widths are the mock's (`src/layoutBreakpoints.ts`), so this supersedes ADR 0393's
// 1280/1440 where they differ (the Script PRD's DQ-1).

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { ScriptViewState } from '../data/scriptView';
import { useDrawerFocus } from './useDrawerFocus';

export type Drawer = ScriptViewState['drawer'];

const DRAWER = 'z-[var(--z-panel)] transition-[transform,visibility] duration-200 motion-reduce:transition-none';
const CHAPTER_DRAWER = `max-[1179px]:absolute max-[1179px]:top-2 max-[1179px]:bottom-2 max-[1179px]:left-2 max-[1179px]:w-[min(360px,calc(100%-24px))] max-[1179px]:shadow-[var(--shadow-lg)] ${DRAWER}`;
const RAIL_DRAWER = `max-[1280px]:absolute max-[1280px]:top-2 max-[1280px]:bottom-2 max-[1280px]:right-2 max-[1280px]:w-[min(380px,calc(100%-24px))] max-[1280px]:shadow-[var(--shadow-lg)] ${DRAWER}`;
const CHAPTER_CLOSED = 'max-[1179px]:invisible max-[1179px]:-translate-x-[calc(100%+16px)]';
const RAIL_CLOSED = 'max-[1280px]:invisible max-[1280px]:translate-x-[calc(100%+16px)]';
/** The scrim shows only while the open drawer is a drawer at this width. */
const SCRIM_FOR: Record<'ch' | 'rail', string> = { ch: 'min-[1180px]:hidden', rail: 'min-[1281px]:hidden' };

export function ScriptColumns({
  drawer,
  onClose,
  chapters,
  reader,
  rail,
}: {
  drawer: Drawer;
  onClose: () => void;
  chapters: ReactNode;
  reader: ReactNode;
  rail: ReactNode;
}) {
  const chapterPanel = useRef<HTMLDivElement>(null);
  const railPanel = useRef<HTMLDivElement>(null);
  useDrawerFocus(drawer, chapterPanel, railPanel);
  // A press outside the open drawer closes it: the scrim, the navigation rail, the header. Left alone: the panel itself, a menu or popover
  // drawn from inside it (a portal), and the button that toggles it (it is `aria-expanded` while the drawer is open and toggles on its own click).
  useEffect(() => {
    if (!drawer) return;
    const panel = drawer === 'ch' ? chapterPanel : railPanel;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || panel.current?.contains(target)) return;
      if (target.closest('[aria-expanded="true"], [data-base-ui-portal], [role="dialog"], [role="menu"]')) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [drawer, onClose]);
  // The router leaves Escape to a focused button or tab (`input/targets.ts`), so the open drawer takes it here; a popover or menu
  // drawn from inside it (a portal, outside the panel) closes itself instead.
  const escape = (panel: RefObject<HTMLDivElement | null>, which: 'ch' | 'rail') => (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || drawer !== which || event.defaultPrevented) return;
    if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) return;
    event.preventDefault();
    onClose();
  };
  return (
    <div
      data-script-columns=""
      data-drawer={drawer ?? undefined}
      className="relative grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4 min-[1180px]:grid-cols-[240px_minmax(0,1fr)] min-[1281px]:grid-cols-[240px_minmax(0,1fr)_380px]"
    >
      {drawer && (
        // The scrim is a pointer target only: Escape and the drawer's own close button are the keyboard's way out.
        <div
          data-scrim=""
          aria-hidden="true"
          className={`absolute inset-0 z-[var(--z-panel-scrim)] bg-[rgba(10,8,5,0.35)] ${SCRIM_FOR[drawer]}`}
          onClick={onClose}
        />
      )}
      <div
        ref={chapterPanel}
        data-panel="chapters"
        onKeyDown={escape(chapterPanel, 'ch')}
        className={`flex min-h-0 flex-col ${CHAPTER_DRAWER} ${drawer === 'ch' ? '' : CHAPTER_CLOSED}`}
      >
        {chapters}
      </div>
      <div className="min-h-0 min-w-0">{reader}</div>
      <div
        ref={railPanel}
        data-panel="rail"
        onKeyDown={escape(railPanel, 'rail')}
        className={`flex min-h-0 flex-col ${RAIL_DRAWER} ${drawer === 'rail' ? '' : RAIL_CLOSED}`}
      >
        {rail}
      </div>
    </div>
  );
}
