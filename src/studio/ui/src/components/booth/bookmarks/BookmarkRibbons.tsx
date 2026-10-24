import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Bookmark } from '../../../api/contracts/bookmarks';
import { bookmarkTip, type LineText } from '../../script/bookmarks/model/selectors';
import { BookmarkEditor } from '../../script/bookmarks/ui/BookmarkEditor';
import { BookmarkRibbon } from '../../script/bookmarks/ui/BookmarkRibbon';
import { RIBBON_HEIGHT } from '../../script/bookmarks/ui/ribbonTops';
import { TooltipTarget } from '../../primitives/Tooltip';
import type { PageBreak } from '../pages/pageBreaks';
import type { BoothUnit, ReadingParagraph } from '../reading/boothUnits';
import { unitAtPosition } from '../reading/readingPosition';
import { positionOfBookmark } from './boothSpot';

export type BookmarkRibbonsProps = {
  chapterId: string;
  /** Every bookmark the host holds; the ones of other chapters are left out here. */
  bookmarks: readonly Bookmark[];
  paragraphs: readonly ReadingParagraph[];
  units: readonly BoothUnit[];
  /** The chapter's page breaks: each has a "Page N" label in this margin, stacked with the ribbons so none covers another. */
  pages?: readonly PageBreak[];
  /** The bookmark just gone to; its ribbon pulses once. */
  flashId?: string | null;
  onUpdate: (id: string, label: string, note: string) => unknown;
  onRemove: (id: string) => unknown;
};

/** The word under `[data-unit]` and `[data-word]` is the Booth text's own markup (`BoothText`). */
const wordSelector = (cur: number, wcur: number): string => `[data-unit="${cur}"] [data-word="${wcur}"]`;

/** The height a vertical "Page N" label takes in the margin. */
const PAGE_LABEL_HEIGHT = 52;

/** Tops in the order given, pushed down so none sits closer to the one above it than that one's height. */
function stacked(tops: readonly number[], heights: readonly number[], floor: number): number[] {
  const out = [...tops];
  let limit = floor;
  [...tops.keys()]
    .sort((a, b) => tops[a] - tops[b] || a - b)
    .forEach((i) => {
      out[i] = Math.max(tops[i], limit);
      limit = out[i] + heights[i];
    });
  return out;
}

/**
 * A page break's label, "Page N" in small mono, written down the margin. It carries the break's spot for the page's
 * right-click menu ("Read to here").
 */
function PageLabel({ pageBreak, top }: { pageBreak: PageBreak; top: number }) {
  return (
    <span
      data-page-break={pageBreak.page}
      data-paragraph-id={pageBreak.paragraphId}
      data-offset={pageBreak.offset}
      className="absolute left-0 flex w-4 justify-center font-mono text-[0.5625rem] leading-none tracking-wide whitespace-nowrap text-[var(--text-muted)] [writing-mode:vertical-rl]"
      style={{ top }}
    >
      Page {pageBreak.page.toLocaleString()}
    </span>
  );
}

/** The mark of a bookmark whose line changed: a warning triangle, drawn at the head of the margin because there is no word to put it on. */
function StaleMark({
  bookmark,
  top,
  tip,
  onUpdate,
  onRemove,
}: {
  bookmark: Bookmark;
  top: number;
  tip: string;
  onUpdate: BookmarkRibbonsProps['onUpdate'];
  onRemove: BookmarkRibbonsProps['onRemove'];
}) {
  return (
    <TooltipTarget text={tip} className="absolute left-0" style={{ top }}>
      <BookmarkEditor
        bookmark={bookmark}
        snippet=""
        onUpdate={onUpdate}
        onRemove={onRemove}
        trigger={
          // native-control-ok: a mark is a bare shape in a margin; Button and IconButton draw a bordered box
          <button
            type="button"
            data-bm={bookmark.id}
            data-stale=""
            data-bm-kind={bookmark.kind}
            aria-label={bookmark.kind === 'stop' ? tip : `Bookmark: ${tip}`}
            aria-haspopup="dialog"
            className="flex h-[26px] w-4 cursor-pointer items-start justify-center rounded-sm border-0 bg-transparent p-0 pt-0.5 focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
          >
            <span
              data-warning-shape=""
              aria-hidden="true"
              className="flex size-4 items-end justify-center bg-[var(--warn)] pb-px text-[0.6rem] leading-none font-bold text-[var(--warn-text)] [clip-path:polygon(50%_0,100%_100%,0_100%)]"
            >
              !
            </span>
          </button>
        }
      />
    </TooltipTarget>
  );
}

/**
 * The ribbons of the chapter's bookmarks, and the labels of its page breaks, in the right margin of the Booth's text (the Studio Next mock's `Ribbons`): one per bookmark,
 * level with the line of its word, away from the speaker chips, the label and note in the tooltip. A bookmark whose line changed (the
 * host says `stale`) is not placed on a guessed word: it is a warning shape at the head of the margin. Mount it inside the text
 * column, which is `relative` and moves with the text, so a ribbon stays beside its word as the view scrolls; it measures the column's
 * words and measures again when the column is resized (text size, window).
 */
export function BookmarkRibbons({ chapterId, bookmarks, paragraphs, units, pages = [], flashId = null, onUpdate, onRemove }: BookmarkRibbonsProps) {
  const marginRef = useRef<HTMLDivElement>(null);
  const lineText = useMemo<LineText>(() => (bookmark) => paragraphs.find((p) => p.id === bookmark.paragraphId)?.text, [paragraphs]);
  const here = useMemo(() => bookmarks.filter((b) => b.chapterId === chapterId), [bookmarks, chapterId]);
  const stale = useMemo(() => here.filter((b) => b.stale), [here]);
  // Each live bookmark's sentence and word; one whose line is not in this text has none and is not drawn.
  const placed = useMemo(
    () =>
      here.flatMap((bookmark) => {
        const position = positionOfBookmark(paragraphs, bookmark);
        const at = position && unitAtPosition(paragraphs, units, position);
        return at ? [{ bookmark, ...at }] : [];
      }),
    [here, paragraphs, units],
  );

  // What the margin holds beside the text: the live bookmarks' ribbons and the page labels, each level with its word.
  const items = useMemo(
    () => [
      ...placed.map((item) => ({ key: item.bookmark.id, cur: item.cur, wcur: item.wcur, ribbon: true })),
      ...pages.map((page) => ({ key: `page-${page.page}`, cur: page.cur, wcur: page.wcur, ribbon: false })),
    ],
    [placed, pages],
  );

  const [measured, setMeasured] = useState<Record<string, number>>({});
  // A ribbon's icon is as tall as the Booth's text is big, so it takes at least RIBBON_HEIGHT and more at a large text size.
  const [ribbonHeight, setRibbonHeight] = useState(RIBBON_HEIGHT);
  useLayoutEffect(() => {
    const margin = marginRef.current;
    const column = margin?.parentElement;
    if (!margin || !column) return;
    const measure = (): void => {
      const size = parseFloat(getComputedStyle(margin).fontSize);
      setRibbonHeight(Number.isFinite(size) ? Math.max(RIBBON_HEIGHT, Math.ceil(size * 1.1)) : RIBBON_HEIGHT);
      const base = margin.getBoundingClientRect().top;
      const next: Record<string, number> = {};
      for (const { key, cur, wcur } of items) {
        const word = column.querySelector<HTMLElement>(wordSelector(cur, wcur));
        if (word) next[key] = Math.round(word.getBoundingClientRect().top - base);
      }
      setMeasured((current) => {
        const same = Object.keys(next).length === Object.keys(current).length && Object.entries(next).every(([id, top]) => current[id] === top);
        return same ? current : next;
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [items]);

  const staleFloor = stale.length * RIBBON_HEIGHT;
  const tops = stacked(
    items.map(({ key }) => measured[key] ?? 0),
    items.map(({ ribbon }) => (ribbon ? ribbonHeight : PAGE_LABEL_HEIGHT)),
    staleFloor,
  );
  if (here.length === 0 && pages.length === 0) return null;
  return (
    <div ref={marginRef} data-bmk-margin="" className="absolute top-0 left-full ml-1 h-0 w-6">
      {stale.map((bookmark, i) => (
        <StaleMark
          key={bookmark.id}
          bookmark={bookmark}
          top={i * RIBBON_HEIGHT}
          tip={bookmarkTip(bookmark, lineText)}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
      {placed.map(({ bookmark }, i) => (
        <BookmarkRibbon
          key={bookmark.id}
          bookmark={bookmark}
          lineText={lineText}
          top={tops[i]}
          flash={bookmark.id === flashId}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
      {pages.map((pageBreak, i) => (
        <PageLabel key={pageBreak.page} pageBreak={pageBreak} top={tops[placed.length + i]} />
      ))}
    </div>
  );
}
