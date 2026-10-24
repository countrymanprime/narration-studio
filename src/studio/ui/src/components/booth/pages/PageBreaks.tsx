import { useLayoutEffect, useRef, useState } from 'react';
import type { PageBreak } from './pageBreaks';

/** The word under `[data-unit]` and `[data-word]` is the Booth text's own markup (`BoothText`). */
const wordSelector = (cur: number, wcur: number): string => `[data-unit="${cur}"] [data-word="${wcur}"]`;

/**
 * The chapter's page breaks over the Booth's text: a dashed hairline across the column above the line that holds each break's first word.
 * It is drawn over the text and takes no room, so the text never moves for it; the "Page N" labels are in the ribbon margin
 * (`BookmarkRibbons`). Mount it inside the text column, which is `relative` and moves with the text; it measures the break words and
 * measures again when the column is resized (text size, window).
 */
export function PageBreaks({ breaks }: { breaks: readonly PageBreak[] }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<Record<number, number>>({});
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const column = layer?.parentElement;
    if (!layer || !column) return;
    const measure = (): void => {
      const base = layer.getBoundingClientRect().top;
      const next: Record<number, number> = {};
      for (const { page, cur, wcur } of breaks) {
        const word = column.querySelector<HTMLElement>(wordSelector(cur, wcur));
        if (word) next[page] = Math.round(word.getBoundingClientRect().top - base);
      }
      setTops((current) => {
        const same = Object.keys(next).length === Object.keys(current).length && Object.entries(next).every(([page, top]) => current[Number(page)] === top);
        return same ? current : next;
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [breaks]);

  if (breaks.length === 0) return null;
  return (
    <div ref={layerRef} data-page-breaks="" className="pointer-events-none absolute inset-x-0 top-0 h-0">
      {breaks.map((pageBreak) => {
        const top = tops[pageBreak.page];
        if (top === undefined) return null;
        return (
          // The line sits in the leading above the break word's line, so it crosses no letters.
          <div
            key={pageBreak.page}
            data-page-line={pageBreak.page}
            aria-hidden="true"
            className="absolute inset-x-0 h-0 translate-y-[-0.12em] border-t border-dashed border-[var(--text-muted)] opacity-50"
            style={{ top }}
          />
        );
      })}
    </div>
  );
}
