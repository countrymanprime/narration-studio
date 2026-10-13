import { useCallback, useEffect, useRef, useState } from 'react';
import { useLayoutClass } from '../../../hooks/useLayoutClass';
import { IconButton } from '../../primitives/IconButton';
import './builtinSections';
import { boothSections, type BoothSideData } from './sections';

/** A click on anything inside one of these keeps the drawer open: the toggle, and the words and notes whose click fills the panel. */
const KEEP_OPEN = '[data-booth-side-keep],[role="dialog"],[role="menu"],[role="tooltip"]';

/**
 * Whether the side panel is open. Above 1280 CSS px it is inline and starts open; at 1280 and below it is a drawer over the text and
 * starts closed, and it closes when the window shrinks into that layout so it never covers the text uninvited.
 */
export function useBoothSideOpen(): { open: boolean; setOpen: (open: boolean) => void; toggle: () => void; drawer: boolean } {
  const drawer = useLayoutClass().medium;
  const [state, setState] = useState({ drawer, open: !drawer });
  // A change of layout resets the default; adjusting during render keeps the first paint right.
  if (state.drawer !== drawer) setState({ drawer, open: !drawer });
  const setOpen = useCallback((open: boolean) => setState((current) => ({ ...current, open })), []);
  const toggle = useCallback(() => setState((current) => ({ ...current, open: !current.open })), []);
  return { open: state.open, setOpen, toggle, drawer };
}

/** The top bar's button for the panel. Mark whatever it controls with `aria-controls="booth-side"`. */
export function BoothSideToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <IconButton action="sidePanel" aria-pressed={open} aria-controls="booth-side" data-booth-side-keep="" onClick={onToggle} />;
}

/**
 * The Booth's side panel: its sections from the registry, in order. As a drawer, Esc closes it (taken in the capture phase and stopped, so the
 * page's own Esc, which exits the Booth, never sees it) and a click outside closes it. It traps no focus and never moves it.
 * Showing a reference opens it.
 */
export function BoothSidePanel({
  data,
  open,
  drawer,
  onOpenChange,
}: {
  data: BoothSideData;
  open: boolean;
  drawer: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const shown = data.reference?.entry ?? data.reference?.note;
  const [lastShown, setLastShown] = useState(shown);
  if (lastShown !== shown) {
    setLastShown(shown);
    if (shown && !open) onOpenChange(true);
  }

  useEffect(() => {
    if (!drawer || !open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || ref.current?.contains(target) || target.closest(KEEP_OPEN)) return;
      onOpenChange(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [drawer, open, onOpenChange]);

  return (
    <aside
      ref={ref}
      id="booth-side"
      aria-label="Side panel"
      hidden={!open}
      // It scrolls inside the window and its sections may hold nothing to focus, so the panel itself is the tab stop that lets a keyboard scroll it.
      tabIndex={0}
      className={`flex w-80 max-w-full flex-col gap-4 overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] p-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] ${drawer ? 'absolute inset-y-0 right-0 z-10 shadow-lg' : ''}`}
    >
      {boothSections().map(({ id, component: Section }) => (
        <Section key={id} data={data} />
      ))}
    </aside>
  );
}
