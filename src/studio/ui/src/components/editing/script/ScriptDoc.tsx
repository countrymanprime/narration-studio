import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { Button } from '../../primitives/Button';
import { StatusBadge } from '../../primitives/StatusBadge';
import { flagged, type ChapterDoc } from '../model';
import { useEditingPage } from './EditingPageState';
import { MovedSampleMarks } from '../voicesample/SampleMark';
import { Paragraph } from './Paragraph';
import { playable, playingKey } from './playing';
import { useAnnounceCursor } from './useAnnounceCursor';

/** How far the pointer must travel from the press before it is a drag selection and not a click. */
const DRAG_SLOP_PX = 4;

const keyAt = (t: EventTarget | null): string | null => (t instanceof Element ? (t.closest<HTMLElement>('[data-k]')?.dataset.k ?? null) : null);

export const NO_TEXT = 'This chapter has no text yet.';

/** True for a flagged word that is not part of a run of extra words: clicking it opens its card. */
const opensCard = (doc: ChapterDoc, key: string): boolean => {
  const it = doc.items[doc.index.get(key) ?? -1];
  return !!it && it.st !== 'extra' && flagged(doc).some((f) => f.key === key);
};

export interface ScriptDocProps {
  /** Why nothing was transcribed, shown beside the "Not transcribed yet" pill. */
  reason?: string | null;
  /** The page says above why there is nothing heard (no audio to edit), so the "Not transcribed yet" strip is not drawn. */
  explained?: boolean;
  /** Runs the recording check for the chapter; the strip offers it beside the pill. Absent: no way to run one from here. */
  onCheckRecording?: () => void;
  /** Called after each paragraph that rendered, so a test can count the paragraphs a change drew. Keep its identity stable: it is a prop of every memoised paragraph. */
  onParagraphRender?: (pid: string) => void;
}

/** The script, one row for each paragraph, with what was heard marked on its words. Reads and writes the page state through `useEditingPage`. */
export function ScriptDoc({ reason, explained = false, onCheckRecording, onParagraphRender }: ScriptDocProps) {
  const { doc, state, dispatch, selected } = useEditingPage();
  // The word a press began on and where, until the button is up. The press becomes a drag only once the pointer has moved DRAG_SLOP_PX.
  const drag = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null);
  const words = useMemo(() => playable(doc), [doc]);
  const nowKey = playingKey(words, state.playT);
  const nowPid = nowKey ? doc.items[doc.index.get(nowKey) ?? -1]?.pid : undefined;
  const headKey = state.sel?.head ?? state.cursor;
  const activePid = nowPid ?? (headKey ? doc.items[doc.index.get(headKey) ?? -1]?.pid : undefined);
  const selSet = useMemo(() => new Set(state.sel ? selected : []), [selected, state.sel]);
  const touched = useMemo(() => new Set(Array.from(selSet, (k) => doc.items[doc.index.get(k) ?? -1]?.pid)), [selSet, doc]);
  const cursorPid = state.cursor ? doc.items[doc.index.get(state.cursor) ?? -1]?.pid : undefined;
  const flagPid = state.flag ? (state.flag.startsWith('dup:') ? state.flag.slice(4) : doc.items[doc.index.get(state.flag) ?? -1]?.pid) : undefined;
  // The lines on screen in the bottom waveform while it is scrolled by hand: marked, and the first of them brought into view.
  const view = state.view;
  const viewed = useMemo(() => {
    if (!view) return null;
    const out = new Set<string>();
    for (const dp of doc.paras) if (dp.start != null && dp.end != null && dp.end >= view.t0 && dp.start <= view.t1) out.add(dp.p.id);
    return out;
  }, [doc, view]);
  const box = useRef<HTMLDivElement>(null);
  const firstViewed = viewed ? doc.paras.find((dp) => viewed.has(dp.p.id))?.p.id : undefined;
  useEffect(() => {
    if (!firstViewed) return;
    const row = box.current?.querySelector<HTMLElement>(`[data-pid="${CSS.escape(firstViewed)}"]`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [firstViewed]);
  useAnnounceCursor();

  useEffect(() => {
    const up = (): void => {
      drag.current = null;
    };
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, []);

  if (!doc.paras.length) {
    return (
      <div className="px-4 py-10">
        <h3 className="text-lg font-semibold">{NO_TEXT}</h3>
      </div>
    );
  }

  const onDown = (e: MouseEvent<HTMLDivElement>): void => {
    const key = e.button === 0 ? keyAt(e.target) : null;
    if (!key) return;
    if (e.detail >= 2) {
      dispatch({ type: 'select', anchor: key, head: key });
      drag.current = null;
    } else if (e.shiftKey) dispatch({ type: 'extend', key });
    else {
      drag.current = { key, x: e.clientX, y: e.clientY, moved: false };
      dispatch({ type: 'place', key });
      if (opensCard(doc, key)) dispatch({ type: 'openFlag', key });
    }
  };
  const onOver = (e: MouseEvent<HTMLDivElement>): void => {
    const press = drag.current;
    if (!press || e.buttons !== 1) return;
    // A click wobbles: a slow page can deliver that wobble over the next word before the button-up, and it must stay a click.
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_SLOP_PX) return;
    press.moved = true;
    const key = keyAt(e.target);
    if (key && key !== headKey) dispatch({ type: 'select', anchor: press.key, head: key });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {doc.aligned || explained ? null : (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2" id="notaligned">
          <StatusBadge tone="neutral" label="Not transcribed yet" />
          {reason ? <span className="text-sm text-[var(--text-muted)]">{reason}</span> : null}
          {onCheckRecording ? (
            <Button variant="secondary" size="sm" onClick={onCheckRecording}>
              Check recording
            </Button>
          ) : null}
        </div>
      )}
      <div
        className="@container/script relative min-h-0 flex-1 overflow-auto py-[18px] pr-7 pl-0 text-[24px] leading-[1.5] outline-none select-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-inset"
        tabIndex={0}
        role="textbox"
        aria-readonly="true"
        aria-multiline="true"
        aria-label="Script with what was heard"
        aria-activedescendant={state.cursor && doc.index.has(state.cursor) ? `w-${state.cursor}` : undefined}
        data-script
        ref={box}
        onMouseDown={onDown}
        onMouseOver={onOver}
      >
        <MovedSampleMarks />
        {doc.paras.map((dp) => {
          const pid = dp.p.id;
          return (
            <Paragraph
              key={pid}
              dp={dp}
              sel={touched.has(pid) ? selSet : null}
              cursor={cursorPid === pid ? state.cursor : null}
              nowKey={nowPid === pid ? nowKey : null}
              flag={flagPid === pid ? state.flag : null}
              active={pid === activePid}
              inView={!!viewed?.has(pid)}
              gutter={doc.aligned}
              onRender={onParagraphRender}
            />
          );
        })}
      </div>
    </div>
  );
}
