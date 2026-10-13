import { StatusBadge } from '../../primitives/StatusBadge';
import { IconButton } from '../../primitives/IconButton';
import { isLow, summarize } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import { clock } from './clock';
import { useSelectionActions } from './selectionActions';
import type { ScriptPlayback } from './useScriptPlayback';

/**
 * The bar at the foot of the script: transport, what is selected, and what the selection can do. The actions are whatever the other slices
 * registered (`registerSelectionAction`); with none registered the right-hand side is empty. `end` is the chapter's length in seconds.
 */
export function SelectionBar({ playback, end, narrow = false }: { playback: ScriptPlayback; end: number; narrow?: boolean }) {
  const { doc, state, selected } = useEditingPage();
  const actions = useSelectionActions('bar');
  const keys = state.sel ? selected : [];
  const summary = summarize(doc, keys, [], (s) => s);
  const has = summary.items.length > 0;
  const allCut = has && summary.items.every((i) => i.cut);
  const cursorItem = state.cursor ? doc.items[doc.index.get(state.cursor) ?? -1] : undefined;
  const at = state.playT ?? (has ? summary.start : (cursorItem?.t0 ?? 0));
  const low = summary.audible.filter(isLow).length;
  const count = summary.items.length;
  const playLabel = playback.playing ? 'Pause' : has ? 'Play the selection' : 'Play from here';

  return (
    <div
      role="toolbar"
      aria-label="Playback and selection"
      className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-[var(--line)] bg-[var(--surface)] px-3.5 py-2"
    >
      <div className="flex items-center gap-1.5">
        <IconButton action="previousWord" onClick={() => playback.skip(-1)} />
        <IconButton action={playback.playing ? 'pause' : 'play'} label={playLabel} variant="primary" onClick={playback.toggle} />
        <IconButton action="nextWord" onClick={() => playback.skip(1)} />
        <span className="ml-1.5 font-['IBM_Plex_Mono',ui-monospace,monospace] text-[15px] font-medium whitespace-nowrap">
          {clock(at)}
          <span className="text-[var(--text-muted)]"> / {clock(end)}</span>
        </span>
      </div>
      <div aria-live="polite" className="flex min-w-0 flex-[1_1_200px] flex-wrap items-center gap-2.5">
        {has ? (
          <>
            <b>
              {count} {count === 1 ? 'word' : 'words'}
            </b>
            {summary.audible.length > 0 ? (
              <span className="min-w-0 truncate font-['IBM_Plex_Mono',ui-monospace,monospace] text-[var(--text-muted)]">
                {clock(summary.start)} to {clock(summary.end)} · {summary.len.toFixed(1)} s
              </span>
            ) : null}
            {allCut ? (
              <StatusBadge tone="neutral" label="Cut" />
            ) : summary.allExtra ? (
              <StatusBadge tone="danger" label="Not in the script" />
            ) : (
              <StatusBadge tone="info" label="In the script" />
            )}
            {low > 0 ? <StatusBadge tone="warning" label={`${low} low confidence`} /> : null}
          </>
        ) : (
          <span className="text-[var(--text-muted)]">Click a word to place the cursor, drag or Shift+arrows to select</span>
        )}
      </div>
      <div className="flex flex-none items-center gap-2">
        {actions.map((a) => (
          <span key={a.id} className="contents">
            {a.render({ doc, keys, summary, allCut, place: 'bar', narrow })}
          </span>
        ))}
      </div>
    </div>
  );
}
