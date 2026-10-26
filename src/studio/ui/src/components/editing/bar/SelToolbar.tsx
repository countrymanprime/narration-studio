import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { summarize } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import { useSelectionActions } from './selectionActions';
import type { ScriptPlayback } from './useScriptPlayback';

type Rect = { left: number; top: number; right: number; bottom: number };

/** The toolbar's gap to the words, and its size before it has been measured. */
const GAP = 6;
const FALLBACK = { width: 300, height: 46 };

/**
 * Where the toolbar goes, in the host's scrolled coordinates: above the first selected line, starting at the first selected word but never left
 * of the text column (the time gutter stays clear) nor past the host's right edge. With no room above (the selection starts at the top of what
 * shows) it goes under the last selected line instead. Under the selection it hid the next line of the words it acts on (alignment audit
 * R3ED-3, XED-23), and the voice-sample card that opens under its dot landed on it (XED-24).
 */
export function toolbarPlace(
  first: Rect,
  last: Rect,
  host: Rect & { width: number; scrollTop: number },
  textLeft: number,
  size: { width: number; height: number },
): { x: number; y: number } {
  const minX = Math.max(8, textLeft - host.left);
  const maxX = Math.max(minX, host.width - size.width - 8);
  const x = Math.min(Math.max(first.left - host.left, minX), maxX);
  const above = first.top - host.top - GAP - size.height;
  const y = above >= 0 ? above : last.bottom - host.top + GAP;
  return { x, y: y + host.scrollTop };
}

/**
 * The dark toolbar that floats over the first selected line: play, then whatever the other slices registered for it. It is gone while the
 * audio plays, while a card is open and with no selection. `host` is the scrolling element the words sit in.
 */
export function SelToolbar({ host, playback, hidden = false }: { host: RefObject<HTMLElement | null>; playback: ScriptPlayback; hidden?: boolean }) {
  const { doc, state, selected } = useEditingPage();
  const actions = useSelectionActions('toolbar');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const self = useRef<HTMLDivElement>(null);
  const first = state.sel ? selected[0] : undefined;
  const last = state.sel ? selected[selected.length - 1] : undefined;
  const shown = Boolean(pos);
  useLayoutEffect(() => {
    const box = host.current;
    const word = (key: string | undefined) => (key ? box?.querySelector<HTMLElement>(`[data-k="${CSS.escape(key)}"]`) : null);
    const a = word(first);
    const z = word(last);
    if (!box || !a || !z) return setPos(null);
    const b = box.getBoundingClientRect();
    const gutter = a.closest('[data-pid]')?.querySelector('[data-gutter]')?.getBoundingClientRect();
    const size = self.current ? { width: self.current.offsetWidth, height: self.current.offsetHeight } : FALLBACK;
    setPos(
      toolbarPlace(
        a.getBoundingClientRect(),
        z.getBoundingClientRect(),
        { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, scrollTop: box.scrollTop },
        gutter ? gutter.right : b.left,
        size,
      ),
    );
    // `shown`: once drawn, place it again with its own measured size.
  }, [first, last, host, doc, shown]);
  if (!pos || !state.sel || hidden || playback.playing || state.playT != null || state.flag) return null;
  const summary = summarize(doc, selected, [], (s) => s);
  const allCut = summary.items.every((i) => i.cut);
  return (
    <div
      ref={self}
      role="toolbar"
      aria-label="Selection"
      style={{ left: pos.x, top: pos.y }}
      className="absolute z-[5] flex items-center gap-0.5 rounded-[10px] bg-[var(--text)] p-[5px] text-[var(--surface)] shadow-[var(--shadow-lg)] [&_button:not([data-danger])]:border-0 [&_button:not([data-danger])]:bg-transparent [&_button:not([data-danger])]:text-[var(--surface)] [&_button[data-danger]]:bg-[var(--danger)] [&_button[data-danger]]:text-[var(--surface)]"
    >
      <IconButton
        action="play"
        label="Play the selection"
        disabledReason={summary.audible.length ? undefined : 'There is no audio for these words.'}
        onClick={playback.playSelection}
      />
      {actions.map((a) => (
        <span key={a.id} className="contents">
          {a.render({ doc, keys: selected, summary, allCut, place: 'toolbar' })}
        </span>
      ))}
    </div>
  );
}
