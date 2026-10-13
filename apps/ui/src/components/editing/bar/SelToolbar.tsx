import { useLayoutEffect, useState, type RefObject } from 'react';
import { IconButton } from '../../primitives/IconButton';
import { summarize } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import { useSelectionActions } from './selectionActions';
import type { ScriptPlayback } from './useScriptPlayback';

/**
 * The dark toolbar that floats under the last selected word: play, then whatever the other slices registered for it. It is gone while the
 * audio plays, while a card is open and with no selection. `host` is the scrolling element the words sit in.
 */
export function SelToolbar({ host, playback, hidden = false }: { host: RefObject<HTMLElement | null>; playback: ScriptPlayback; hidden?: boolean }) {
  const { doc, state, selected } = useEditingPage();
  const actions = useSelectionActions('toolbar');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const last = state.sel ? selected[selected.length - 1] : undefined;
  useLayoutEffect(() => {
    const box = host.current;
    const el = last ? box?.querySelector<HTMLElement>(`[data-k="${CSS.escape(last)}"]`) : null;
    if (!box || !el) return setPos(null);
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    setPos({ x: Math.max(8, Math.min(r.right - b.left - 200, b.width - 300)), y: r.bottom - b.top + box.scrollTop + 6 });
  }, [last, host, doc]);
  if (!pos || !state.sel || hidden || playback.playing || state.playT != null || state.flag) return null;
  const summary = summarize(doc, selected, [], (s) => s);
  const allCut = summary.items.every((i) => i.cut);
  return (
    <div
      role="toolbar"
      aria-label="Selection"
      style={{ left: pos.x, top: pos.y }}
      className="absolute z-[5] flex items-center gap-0.5 rounded-[10px] bg-[var(--text)] p-[5px] text-[var(--surface)] shadow-[var(--shadow-lg)] [&_button:not([data-danger])]:border-0 [&_button:not([data-danger])]:bg-transparent [&_button:not([data-danger])]:text-[var(--surface)] [&_button[data-danger]]:bg-[var(--danger)] [&_button[data-danger]]:text-white"
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
