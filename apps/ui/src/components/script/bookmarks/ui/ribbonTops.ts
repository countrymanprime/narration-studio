import type { Bookmark } from '../../../../api/contracts/bookmarks';

/** The height a ribbon takes in the gutter; two ribbons never sit closer than this. */
export const RIBBON_HEIGHT = 26;

/** The vertical position, in the paragraph's own pixels, of the line a character offset is on. */
export type MeasureLine = (paragraph: HTMLElement, offset: number) => number;

/** Measures with a `Range` over the paragraph's text nodes: the top of the character at `offset` against the paragraph's top, divided by the zoom. */
export const measureLineTop =
  (zoom = 1): MeasureLine =>
  (paragraph, offset) => {
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let left = offset;
    let last: Text | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      last = text;
      if (left <= text.length) {
        const at = Math.min(left, Math.max(0, text.length - 1));
        const range = document.createRange();
        range.setStart(text, at);
        range.setEnd(text, Math.min(text.length, at + 1));
        const rect = range.getClientRects?.()[0];
        return rect ? (rect.top - paragraph.getBoundingClientRect().top) / zoom : 0;
      }
      left -= text.length;
    }
    return last ? (paragraph.getBoundingClientRect().height - 8) / zoom : 0;
  };

/**
 * One top per bookmark (in the order given), level with the line its offset is on. Ribbons on one line stack downward by the larger
 * of the line height and a ribbon's height, so none overlaps another. Pure over `measure`, so the reader's DOM is only touched there.
 */
export function ribbonTops(paragraph: HTMLElement, bookmarks: readonly Bookmark[], lineHeight: number, measure: MeasureLine = measureLineTop()): number[] {
  const step = Math.max(lineHeight, RIBBON_HEIGHT);
  const order = bookmarks.map((_, i) => i).sort((a, b) => bookmarks[a].offset - bookmarks[b].offset || a - b);
  const tops: number[] = new Array<number>(bookmarks.length).fill(0);
  let floor = -Infinity;
  for (const i of order) {
    const top = Math.max(Math.round(measure(paragraph, bookmarks[i].offset)), floor);
    tops[i] = top;
    floor = top + step;
  }
  return tops;
}
