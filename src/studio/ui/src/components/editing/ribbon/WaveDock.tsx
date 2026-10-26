import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContextMenuItem } from '../../primitives/ContextMenu';
import type { ChapterDoc } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import type { ItemClocks } from './docClock';
import { peakScale } from './peaksWindow';
import { activePid, lineWindow, windowLayout } from './ribbonLayout';
import { fineClock, wordAtTime, wordsCovered, type Span } from './rangeMath';
import { RibbonView } from './Ribbon';
import { pickEntries, useRibbonPeaks } from './useRibbonPeaks';

/** Where the chapter's audio ends on the document clock: past the last line's last word by the runway. */
export function docEnd(doc: ChapterDoc): number {
  let end = 0;
  for (const p of doc.paras) end = Math.max(end, lineWindow(doc, p.p.id)?.t1 ?? 0);
  return end;
}

/** The line a time falls in, or the nearest one before it. */
const lineAt = (doc: ChapterDoc, t: number): string | null => {
  let found: string | null = null;
  for (const p of doc.paras) if (p.start != null && p.start <= t) found = p.p.id;
  return found;
};

export interface WaveDockProps {
  chapterId: string;
  /** Where each item's source seconds sit on the document clock (`itemClocks`); the peaks are in source seconds. */
  clocks: ItemClocks;
  /** The active line's active take, named above the waveform; null for a line heard in the recording. */
  take: string | null;
  /** Plays from a time on the document clock (to an end, when given) through the page's playback. */
  playFrom?: (from: number, to?: number) => void;
  /** Why the chapter has no times to draw against, when it has none. */
  reason?: string;
}

/**
 * The Editing page's one waveform, docked above the transport and always in view (#2251, item 29): the chapter's audio on the document clock,
 * opening on the active line and following it. Left button or one finger draws a range; the right button held, the wheel, two fingers, the
 * end arrows and the arrow keys scroll it, and while it is scrolled by hand the script marks and shows the lines on screen. A right click
 * without a move opens its menu.
 */
export function WaveDock({ chapterId, clocks, take, playFrom, reason }: WaveDockProps) {
  const { doc, state, dispatch, selected } = useEditingPage();
  const peaks = useRibbonPeaks(chapterId);
  const end = useMemo(() => docEnd(doc), [doc]);
  const pid = activePid(doc, state) ?? doc.paras.find((p) => lineWindow(doc, p.p.id))?.p.id ?? null;
  const line = useMemo(() => (pid ? lineWindow(doc, pid) : null), [doc, pid]);
  // The range is only what the narrator drew: selecting a word does not draw one.
  const range = state.span ?? null;
  // While a drawn range is up the view stays where the narrator put it: the cursor follows the range's last word, and following its line would
  // move the waveform under a drag.
  const focus = useMemo(() => (line && !range ? { start: line.t0, len: line.t1 - line.t0 } : null), [line, range]);
  const layout = useMemo(() => windowLayout(doc, 0, end, selected, state.playT, pid ?? ''), [doc, end, selected, state.playT, pid]);
  const describe = useCallback((a: number, b: number) => windowLayout(doc, a, b, selected, state.playT).description, [doc, selected, state.playT]);
  const words = doc.items;
  // While a drag runs the page follows only when the words it covers change, so the script is not redrawn at every pixel.
  const lastKeys = useRef('');
  const onRange = useCallback(
    (span: Span, phase: 'drag' | 'commit') => {
      const { keys } = wordsCovered(words, span);
      const anchor = keys[0] ?? null;
      const head = keys[keys.length - 1] ?? null;
      const id = `${anchor}|${head}`;
      if (phase === 'drag') {
        if (id === lastKeys.current) return;
        lastKeys.current = id;
      } else lastKeys.current = '';
      dispatch({ type: 'selectSpan', span, anchor, head });
    },
    [words, dispatch],
  );
  // A tap puts the cursor on the word it lands on, and on no word lets the range go.
  const onTap = useCallback(
    (t: number) => {
      const word = wordAtTime(words, t);
      dispatch(word ? { type: 'place', key: word.key } : { type: 'dropRange' });
    },
    [words, dispatch],
  );
  const choose = useMemo(() => ({ words, range, onRange, onTap }), [words, range, onRange, onTap]);
  // When the page lets a scrolled view go (the cursor moved), the waveform shows the cursor's line again.
  const [refocus, setRefocus] = useState(0);
  const held = useRef(false);
  useEffect(() => {
    if (state.view) held.current = true;
    else if (held.current) {
      held.current = false;
      setRefocus((n) => n + 1);
    }
  }, [state.view]);
  const onScroll = useCallback((v: { start: number; len: number }) => dispatch({ type: 'view', t0: v.start, t1: v.start + v.len }), [dispatch]);

  const menu = useCallback(
    (at: number | null): ContextMenuItem[] => {
      const t = at ?? state.playT ?? line?.t0 ?? 0;
      const word = wordAtTime(words, t);
      const linePid = lineAt(doc, t);
      const para = linePid ? doc.paras.find((p) => p.p.id === linePid) : undefined;
      const lineWords = para?.items.filter((i) => i.t0 != null && i.kind === 'w') ?? [];
      return [
        {
          key: 'play-here',
          label: `Play from ${fineClock(t)}`,
          ...(playFrom ? {} : { unavailable: 'Nothing can play this chapter here.' }),
          onSelect: () => playFrom?.(t),
        },
        ...(range
          ? [
              {
                key: 'play-range',
                label: 'Play the range',
                ...(playFrom ? {} : { unavailable: 'Nothing can play this chapter here.' }),
                onSelect: () => playFrom?.(range.start, range.end),
              },
              { key: 'clear-range', label: 'Clear the range', onSelect: () => dispatch({ type: 'dropRange' }) },
            ]
          : []),
        {
          key: 'cursor-here',
          label: word ? `Put the cursor on “${word.text}”` : 'Put the cursor here',
          ...(word ? {} : { unavailable: 'No word is heard here.' }),
          onSelect: () => word && dispatch({ type: 'place', key: word.key }),
        },
        {
          key: 'select-line',
          label: 'Select this line',
          ...(lineWords.length ? {} : { unavailable: 'This line has no heard words.' }),
          onSelect: () => lineWords.length && dispatch({ type: 'select', anchor: lineWords[0].key, head: lineWords[lineWords.length - 1].key }),
        },
      ];
    },
    [doc, words, range, line, state.playT, playFrom, dispatch],
  );

  const entry = pickEntries(peaks, clocks, 0, end);
  return (
    <section aria-label="Waveform of the chapter" className="flex-none border-t border-[var(--border)] bg-[var(--surface-2)]" id="wavedock">
      <RibbonView
        layout={layout}
        head={{ take }}
        choose={choose}
        focus={focus}
        onScroll={onScroll}
        refocus={refocus}
        scale={peakScale(peaks)}
        describe={describe}
        menu={menu}
        loading={peaks.status === 'loading' && doc.aligned}
        {...('peaks' in entry
          ? { peaks: entry.peaks }
          : { reason: doc.aligned ? entry.reason : (reason ?? 'The chapter is not transcribed yet, so its words have no times.') })}
      />
    </section>
  );
}
