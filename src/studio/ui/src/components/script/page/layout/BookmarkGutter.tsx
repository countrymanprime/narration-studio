// What the reader draws in a paragraph's left gutter: the bookmark ribbons of SN-B62, each level with its line, and the retail sample's
// bar on the lines it spans (the old reader's marker, re-homed unchanged in meaning, D22). The reader keeps its gutter slot the same
// between renders so a paragraph is not redrawn on every change; the gutter reads what changes from this context instead.

import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { Bookmark } from '../../../../api/contracts/bookmarks';
import type { ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import type { RetailSampleRange } from '../../../manuscript/retailSampleRange';
import type { LineText } from '../../bookmarks/model/selectors';
import { BookmarkRibbon } from '../../bookmarks/ui/BookmarkRibbon';
import { measureLineTop, ribbonTops } from '../../bookmarks/ui/ribbonTops';

export type GutterState = {
  bookmarksIn: (paragraphId: string) => readonly Bookmark[];
  lineText: LineText;
  /** The bookmark just gone to, while its paragraph flashes. */
  flashId: string | null;
  sample: RetailSampleRange | undefined;
  zoom: number;
  onUpdate: (id: string, label: string, note: string) => unknown;
  onRemove: (id: string) => unknown;
};

const NONE: readonly Bookmark[] = [];
export const GutterContext = createContext<GutterState>({
  bookmarksIn: () => NONE,
  lineText: () => undefined,
  flashId: null,
  sample: undefined,
  zoom: 1,
  onUpdate: () => undefined,
  onRemove: () => undefined,
});

/** "Retail sample starts · about 0m 23s" on its first line, "Retail sample ends" on its last, nothing between. */
function sampleLabel(paragraph: ManuscriptParagraph, sample: RetailSampleRange): string {
  if (paragraph.index === sample.start) return `Retail sample starts · about ${sample.length}`;
  if (paragraph.index === sample.end) return 'Retail sample ends';
  return '';
}

export function BookmarkGutter({ paragraph }: { paragraph: ManuscriptParagraph }) {
  const { bookmarksIn, lineText, flashId, sample, zoom, onUpdate, onRemove } = useContext(GutterContext);
  const list = bookmarksIn(paragraph.id);
  const box = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<number[]>([]);
  useLayoutEffect(() => {
    const text = box.current?.closest('[data-para]')?.querySelector<HTMLElement>('p[data-pid]');
    if (!text || list.length === 0) return setTops([]);
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 24;
    setTops(ribbonTops(text, list, lineHeight, measureLineTop(zoom)));
  }, [list, zoom, paragraph.text]);
  const inSample = sample !== undefined && paragraph.index >= sample.start && paragraph.index <= sample.end;
  const label = inSample ? sampleLabel(paragraph, sample) : '';
  return (
    <div ref={box} className="relative h-full">
      {inSample && (
        <span data-retail-sample="" data-paragraph={paragraph.index} className="absolute inset-y-0 -left-1 w-[3px] rounded-full bg-[var(--accent)] opacity-60">
          {label && <span className="sr-only">{label}</span>}
        </span>
      )}
      {list.map((bookmark, i) => (
        <BookmarkRibbon
          key={bookmark.id}
          bookmark={bookmark}
          lineText={lineText}
          top={tops[i] ?? 0}
          flash={bookmark.id === flashId}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
