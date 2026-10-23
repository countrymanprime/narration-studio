import type { ReaderSelection } from '../../registry/contextProvider';

// What the reader has selected, as the toolbar needs it. A selection inside one paragraph is a place (`ReaderSelection`) with the
// rectangle to draw the toolbar under; one across paragraphs is only its rectangle, because a mark belongs to one paragraph.
// A paragraph is the `p[data-pid]` of the reader and its row (`[data-para]`) carries the chapter in `data-ch`.

export type ToolSelection = ({ multi?: false } & ReaderSelection & { rect: DOMRect }) | { multi: true; rect: DOMRect };

const elementOf = (node: Node): Element | null => (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element));
const paragraphOf = (node: Node): HTMLElement | null => elementOf(node)?.closest<HTMLElement>('p[data-pid]') ?? null;

/** The text selected in the reader, trimmed of the blanks at its ends. Null for a caret, for text outside the reader's paragraphs and for blanks only. */
export function getSelection(doc: Document = document): ToolSelection | null {
  const selection = doc.defaultView?.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const first = paragraphOf(range.startContainer);
  const last = paragraphOf(range.endContainer);
  if (!first || !last) return null;
  const rect = range.getBoundingClientRect();
  if (first !== last) return { multi: true, rect };

  const before = doc.createRange();
  before.selectNodeContents(first);
  before.setEnd(range.startContainer, range.startOffset);
  const raw = range.toString();
  const lead = raw.length - raw.trimStart().length;
  const start = before.toString().length + lead;
  const end = start + raw.trim().length;
  if (end <= start) return null;
  const chapterId = first.closest<HTMLElement>('[data-para]')?.dataset.ch;
  if (!chapterId) return null;
  return { chapterId, paragraphId: first.dataset.pid as string, start, end, quote: (first.textContent ?? '').slice(start, end), rect };
}
