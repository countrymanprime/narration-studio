import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { capturePointer, releasePointer } from './pointerCapture';
import type { RibbonView } from './useRibbonView';

/** A pointer that moves less than this many pixels while the right button is held was a click: it opens the menu instead of scrolling. */
export const SCROLL_SLOP_PX = 4;
/** How long after a right-drag ends its own `contextmenu` (Windows sends it on the button-up) is still swallowed. */
const AFTER_DRAG_MS = 500;

type Grab = { pointers: Map<number, number>; x0: number; start: number; moved: boolean; menuPending: boolean };

export interface ScrollGestures {
  /** True while a right-drag or a two-finger drag holds the waveform: the range's own pointer handlers stand down. */
  active: (e: PointerEvent) => boolean;
  onPointerDown: (e: PointerEvent) => boolean;
  onPointerMove: (e: PointerEvent) => boolean;
  onPointerUp: (e: PointerEvent) => boolean;
  /** Swallows the browser's and the shell's menu after a right-drag; lets a plain right click, a long touch and the menu key through. */
  onContextMenu: (e: MouseEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  /** Where the menu was opened, seconds from the waveform's start, or null when it came from the keyboard. */
  menuAt: () => number | null;
}

/**
 * How the waveform scrolls by hand, beside the range the left button draws: the right button held and moved drags the audio along (a right
 * click without a move opens the waveform's menu), two fingers on a touch screen drag it the same way (one finger draws a range), and the
 * keys scroll it when it has focus. Every scroll goes through `view`, which tells the page where it went so the script follows.
 */
export function useScrollGestures({
  surface,
  view,
  touches,
  onTwoFingers,
}: {
  surface: HTMLElement | null;
  view: RibbonView;
  /** The touch pointers on the waveform now, shared with the range's handlers. */
  touches: Map<number, number>;
  /** A second finger landed while the first was drawing a range: the range lets that draw go. */
  onTwoFingers: () => void;
}): ScrollGestures {
  const grab = useRef<Grab | null>(null);
  const swallowUntil = useRef(0);
  const reposting = useRef(false);
  const fromKeys = useRef(false);
  const at = useRef<number | null>(null);
  const latest = useRef(view);
  latest.current = view;

  const width = (): number => surface?.getBoundingClientRect().width || 1;
  const timeAt = (clientX: number): number => {
    const rect = surface?.getBoundingClientRect();
    const v = latest.current.view;
    return v.start + (rect && rect.width ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0.5) * v.len;
  };
  const centreX = (pointers: Map<number, number>): number => [...pointers.values()].reduce((s, x) => s + x, 0) / Math.max(1, pointers.size);
  const begin = (e: PointerEvent, pointers: Map<number, number>, menuPending = false): void => {
    grab.current = { pointers, x0: centreX(pointers), start: latest.current.view.start, moved: false, menuPending };
    capturePointer(e.currentTarget, e.pointerId);
  };

  return {
    active: (e) => !!grab.current && grab.current.pointers.has(e.pointerId),
    onPointerDown: (e) => {
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, e.clientX);
        if (touches.size !== 2) return false;
        onTwoFingers();
        begin(e, new Map(touches));
        return true;
      }
      if (e.button !== 2) return false;
      begin(e, new Map([[e.pointerId, e.clientX]]));
      return true;
    },
    onPointerMove: (e) => {
      const g = grab.current;
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, e.clientX);
      if (!g || !g.pointers.has(e.pointerId)) return false;
      g.pointers.set(e.pointerId, e.clientX);
      const dx = centreX(g.pointers) - g.x0;
      if (!g.moved && Math.abs(dx) < SCROLL_SLOP_PX) return true;
      g.moved = true;
      // Dragging the audio: moving the pointer right brings the earlier audio in from the left.
      latest.current.scrollTo(g.start - (dx / width()) * latest.current.view.len);
      return true;
    },
    onPointerUp: (e) => {
      if (e.pointerType === 'touch') touches.delete(e.pointerId);
      const g = grab.current;
      if (!g || !g.pointers.has(e.pointerId)) return false;
      grab.current = null;
      releasePointer(e.currentTarget, e.pointerId);
      if (g.moved) {
        swallowUntil.current = e.timeStamp + AFTER_DRAG_MS;
        return true;
      }
      // A right click with no move, where the menu event came with the button-down (Linux, macOS) and was held back: open it now, here.
      if (g.menuPending && surface && e.pointerType !== 'touch') {
        reposting.current = true;
        try {
          surface.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: e.clientX, clientY: e.clientY }));
        } finally {
          reposting.current = false;
        }
      }
      return true;
    },
    onContextMenu: (e) => {
      if (reposting.current) {
        at.current = timeAt(e.clientX);
        return;
      }
      const g = grab.current;
      if ((g && !g.moved && e.button === 2 && g.pointers.size === 1) || (g && g.moved) || e.timeStamp < swallowUntil.current) {
        // The menu waits for the button-up (opened then if the pointer did not move), and a drag never opens one.
        e.preventDefault();
        e.stopPropagation();
        if (g && !g.moved) g.menuPending = true;
        return;
      }
      // From the keyboard the shell sends the event again from the focused element; the menu is then about the view, not a point.
      if (e.button === 0) {
        fromKeys.current = true;
        at.current = null;
      } else if (fromKeys.current) fromKeys.current = false;
      else at.current = timeAt(e.clientX);
    },
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      const v = latest.current;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => v.nudge(-1, e.shiftKey),
        ArrowRight: () => v.nudge(1, e.shiftKey),
        PageUp: () => v.nudge(-1, true),
        PageDown: () => v.nudge(1, true),
        Home: () => v.scrollTo(0),
        End: () => v.scrollTo(v.total),
        '+': () => v.zoom(-1),
        '=': () => v.zoom(-1),
        '-': () => v.zoom(1),
        _: () => v.zoom(1),
      };
      const run = keys[e.key];
      if (!run || e.ctrlKey || e.metaKey || e.altKey) return;
      // The page's own arrows step the word cursor; on the waveform they scroll it.
      e.preventDefault();
      e.stopPropagation();
      run();
    },
    menuAt: () => at.current,
  };
}
