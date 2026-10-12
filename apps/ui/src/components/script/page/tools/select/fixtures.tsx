// A reader's worth of DOM for the toolbar's tests and stories: paragraph rows as `Para` draws them, and a way to select text in one.
import type { ReaderSelection } from '../../registry/contextProvider';

/** A paragraph row (`[data-para]` with its chapter) holding a `p[data-pid]`. */
export function Paragraphs({ rows }: { rows: readonly { id: string; chapterId: string; text: string }[] }) {
  return (
    <div>
      {rows.map((row) => (
        <div key={row.id} data-para={row.id} data-ch={row.chapterId}>
          <p data-pid={row.id}>{row.text}</p>
        </div>
      ))}
    </div>
  );
}

export const RECT = { left: 100, top: 100, width: 50, height: 20, right: 150, bottom: 120, x: 100, y: 100, toJSON: () => ({}) } as DOMRect;

/** Selects characters `from` to `to` of one paragraph, or across to `toId`'s, with a fixed rectangle. */
export function selectIn(id: string, from: number, to: number, toId = id): void {
  const text = (pid: string) => document.querySelector(`p[data-pid="${pid}"]`)!.firstChild as Text;
  const range = document.createRange();
  range.setStart(text(id), from);
  range.setEnd(text(toId), to);
  range.getBoundingClientRect = () => RECT;
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

export const SELECTION: ReaderSelection = { chapterId: 'chapter-1', paragraphId: 'p1', start: 0, end: 5, quote: 'Alice' };

/** A selection of one word, as the toolbar draws it, and one that crosses paragraphs. */
export const TOOL_SELECTION = { ...SELECTION, rect: { ...RECT, left: 160, top: 90 } as DOMRect };
export const ACROSS = { multi: true as const, rect: { ...RECT, left: 160, top: 90 } as DOMRect };
