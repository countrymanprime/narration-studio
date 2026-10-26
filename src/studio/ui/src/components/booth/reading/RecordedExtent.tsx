import { useLayoutEffect, useRef, useState } from 'react';
import type { UnitPosition } from './readingPosition';

/**
 * How far the chapter is recorded, beside the Booth's text: a rail down the left of the column from the first line to the line of the last
 * recorded word (`recordedThrough`), in the colour of a done stage. It is drawn outside the text and takes no room, so the text never moves
 * for it; the top bar says the same in words. Mount it inside the text column, which is `relative` and moves with the text; it measures the
 * words and measures again when the column is resized (text size, window).
 */
export function RecordedExtent({ to }: { to: UnitPosition | null }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const column = layer?.parentElement;
    if (!layer || !column || !to) {
      setSpan(null);
      return;
    }
    const measure = (): void => {
      const base = layer.getBoundingClientRect().top;
      const first = column.querySelector<HTMLElement>('[data-unit] [data-word]');
      const last = column.querySelector<HTMLElement>(`[data-unit="${to.cur}"] [data-word="${to.wcur}"]`);
      if (!first || !last) return setSpan(null);
      const top = Math.round(first.getBoundingClientRect().top - base);
      const bottom = Math.round(last.getBoundingClientRect().bottom - base);
      setSpan((current) => (current && current.top === top && current.height === bottom - top ? current : { top, height: Math.max(0, bottom - top) }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [to]);

  return (
    <div ref={layerRef} data-recorded-extent="" className="pointer-events-none absolute top-0 right-full mr-3 h-0 w-[3px]">
      {to && span ? (
        <div
          data-recorded-rail=""
          aria-hidden="true"
          className="absolute inset-x-0 rounded-full bg-[var(--ok)] opacity-70"
          style={{ top: span.top, height: span.height }}
        />
      ) : null}
    </div>
  );
}
