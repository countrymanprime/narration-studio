import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { StatusBadge } from '../../primitives/StatusBadge';
import { flagged, type ChapterDoc } from '../model';
import { useEditingPage } from './EditingPageState';
import { announceSel } from './announce';
import { Paragraph } from './Paragraph';
import { playable, playingKey } from './playing';

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
  /** Called after each paragraph that rendered, so a test can count the paragraphs a change drew. Keep its identity stable: it is a prop of every memoised paragraph. */
  onParagraphRender?: (pid: string) => void;
}

/** The script, one row for each paragraph, with what was heard marked on its words. Reads and writes the page state through `useEditingPage`. */
export function ScriptDoc({ reason, onParagraphRender }: ScriptDocProps) {
  const { doc, state, dispatch, selected } = useEditingPage();
  const drag = useRef<string | null>(null);
  const words = useMemo(() => playable(doc), [doc]);
  const nowKey = playingKey(words, state.playT);
  const nowPid = nowKey ? doc.items[doc.index.get(nowKey) ?? -1]?.pid : undefined;
  const headKey = state.sel?.head ?? state.cursor;
  const activePid = nowPid ?? (headKey ? doc.items[doc.index.get(headKey) ?? -1]?.pid : undefined);
  const selSet = useMemo(() => new Set(state.sel ? selected : []), [selected, state.sel]);
  const touched = useMemo(() => new Set(Array.from(selSet, (k) => doc.items[doc.index.get(k) ?? -1]?.pid)), [selSet, doc]);
  const cursorPid = state.cursor ? doc.items[doc.index.get(state.cursor) ?? -1]?.pid : undefined;
  const flagPid = state.flag ? (state.flag.startsWith('dup:') ? state.flag.slice(4) : doc.items[doc.index.get(state.flag) ?? -1]?.pid) : undefined;
  const message = useMemo(() => announceSel(doc, state.sel), [doc, state.sel]);

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
      drag.current = key;
      dispatch({ type: 'place', key });
      if (opensCard(doc, key)) dispatch({ type: 'openFlag', key });
    }
  };
  const onOver = (e: MouseEvent<HTMLDivElement>): void => {
    if (!drag.current || e.buttons !== 1) return;
    const key = keyAt(e.target);
    if (key && key !== headKey) dispatch({ type: 'select', anchor: drag.current, head: key });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {doc.aligned ? null : (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2" id="notaligned">
          <StatusBadge tone="neutral" label="Not transcribed yet" />
          {reason ? <span className="text-sm text-[var(--text-muted)]">{reason}</span> : null}
        </div>
      )}
      <div
        className="relative min-h-0 flex-1 overflow-auto py-[18px] pr-7 pl-2 text-[24px] leading-[1.5] outline-none select-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        tabIndex={0}
        role="textbox"
        aria-readonly="true"
        aria-multiline="true"
        aria-label="Script with what was heard"
        aria-activedescendant={state.cursor && doc.index.has(state.cursor) ? `w-${state.cursor}` : undefined}
        data-script
        onMouseDown={onDown}
        onMouseOver={onOver}
      >
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
              onRender={onParagraphRender}
            />
          );
        })}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
    </div>
  );
}
