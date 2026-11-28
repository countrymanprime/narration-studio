// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManuscriptChapter, ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import { overlay } from '../../../../overlay/overlayService';
import { Reader } from './Reader';
import { projectStorageKey } from '../../../../projectFolder';
import { chapter, cue, entry, GUIDE_TYPES, mark, paragraph, TYPES } from './readerFixtures';

// jsdom lays nothing out, so the rows get tops by their order in the document (100 px each) and scrollTop is a stored number.
const tops = new WeakMap<Element, number>();
const scrolls = new WeakMap<Element, number>();
/** The furthest the fake browser scrolls: a scroll past it is clamped, as a real one is. */
let maxScroll = Infinity;
function layOut(): void {
  const rows = Array.from(document.querySelectorAll('[data-bound], [data-para]'));
  rows.forEach((row, i) => tops.set(row, i * 100));
}

beforeEach(() => {
  vi.useFakeTimers();
  maxScroll = Infinity;
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    if (!tops.has(this)) layOut();
    return tops.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) {
    return scrolls.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) {
    scrolls.set(this, Math.min(value, maxScroll));
  });
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Range.prototype, 'getClientRects');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const chapters = [chapter('c1', 0), chapter('c2', 1), chapter('c3', 2)];
const paras: Record<string, ManuscriptParagraph[]> = {
  c1: [paragraph('p1', 'c1', 'The first line of the first chapter.', 0), paragraph('p2', 'c1', 'A second line, with a harbour in it.', 1)],
  c2: [paragraph('p3', 'c2', 'Mina said, "Come along," and left.', 0), paragraph('p4', 'c2', 'A line in the second chapter.', 1)],
  c3: [paragraph('p5', 'c3', 'The last chapter has one line.', 0)],
};
const sources = { marks: [], markTypes: TYPES, words: [], entries: [], cues: [], types: GUIDE_TYPES };
const paragraphsOf = (id: string): ManuscriptParagraph[] | undefined => paras[id];

type Props = ComponentProps<typeof Reader>;
const FOLDER_A = 'C:/Books/A';
const FOLDER_B = 'C:/Books/B';
const READER_POSITION_KEY = projectStorageKey('script.reader.position', FOLDER_A);
const props = (extra: Partial<Props> = {}): Props => ({ chapters, paragraphsOf, sources, projectFolder: FOLDER_A, ...extra });
const scroller = (): HTMLElement => screen.getByRole('region', { name: /Script reader/ });
/** The narrator scrolls: the wheel is the input that releases the reader's first-draw hold, then the position moves. */
const scrollTo = (value: number, input: boolean = true): void => {
  if (input) fireEvent.wheel(scroller());
  scrolls.set(scroller(), value);
  fireEvent.scroll(scroller());
};

describe('continuous scroll with the spy', () => {
  it('draws every chapter in one scroll', () => {
    render(<Reader {...props()} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(document.querySelectorAll('[data-para]')).toHaveLength(5);
  });

  it('names the chapter in view and the paragraph in the sticky header as the reader scrolls', () => {
    render(<Reader {...props()} />);
    expect(screen.getByText('¶ 1 of 2')).toBeTruthy();
    scrollTo(330);
    expect(document.querySelector('b')?.textContent).toBe('Chapter 2');
    expect(screen.getByText('¶ 1 of 2')).toBeTruthy();
    scrollTo(420);
    expect(screen.getByText('¶ 2 of 2')).toBeTruthy();
    scrollTo(700);
    expect(document.querySelector('b')?.textContent).toBe('Chapter 3');
    expect(screen.getByText('¶ 1 of 1')).toBeTruthy();
  });

  it('names the paragraph in the sticky header once the text arrives after the first draw, with no scroll', () => {
    const late: Record<string, ManuscriptParagraph[] | undefined> = {};
    const { rerender } = render(<Reader {...props({ paragraphsOf: (id) => late[id] })} />);
    expect(screen.queryByText(/^¶/)).toBeNull();
    Object.assign(late, paras);
    rerender(<Reader {...props({ paragraphsOf: (id) => late[id] })} />);
    expect(screen.getByText('¶ 1 of 2')).toBeTruthy();
  });

  it('names the chapter in full in the sticky header, title and subtitle', () => {
    const named = [{ ...chapters[0]!, subtitle: 'Down the Rabbit-Hole' }, ...chapters.slice(1)];
    render(<Reader {...props({ chapters: named })} />);
    expect(document.querySelector('b')?.textContent).toBe('Chapter 1: Down the Rabbit-Hole');
  });

  // #3380: the title is clipped (two lines under 640 px, one above), so it carries itself as a title.
  it('gives the clipped sticky title its whole text as a title', () => {
    const named = [{ ...chapters[0]!, subtitle: 'Down the Rabbit-Hole' }, ...chapters.slice(1)];
    render(<Reader {...props({ chapters: named })} />);
    expect(document.querySelector('b')?.getAttribute('title')).toBe('Chapter 1: Down the Rabbit-Hole');
  });

  it('says the chapter and the paragraph through the live region when a request jumps to a chapter, so no earlier line stays as the last thing said', () => {
    const said: string[] = [];
    vi.spyOn(overlay, 'announce').mockImplementation((text) => void said.push(text));
    const named = [chapters[0]!, { ...chapters[1]!, subtitle: 'The Pool of Tears' }, chapters[2]!];
    const { rerender } = render(<Reader {...props({ chapters: named })} />);
    expect(said).toEqual([]);
    rerender(<Reader {...props({ chapters: named, pendingJump: 'c2' })} />);
    expect(said).toEqual(['Chapter 2, The Pool of Tears, ¶ 1 of 2']);
    rerender(<Reader {...props({ chapters: named, pendingJump: null })} />);
    expect(said).toHaveLength(1);
  });

  it('moves focus to the chapter heading it jumped to, so the next Tab and a screen reader start there (#2902)', () => {
    vi.spyOn(overlay, 'announce').mockImplementation(() => undefined);
    const { rerender } = render(<Reader {...props()} />);
    rerender(<Reader {...props({ pendingJump: 'c2' })} />);
    const heading = document.querySelector<HTMLElement>('[data-ch="c2"] h2');
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading);
    rerender(<Reader {...props({ pendingJump: null })} />);
    expect(document.activeElement).toBe(heading);
  });

  it('leaves focus in the chapter list when the jump came from it, so Down still steps to the next chapter (#2902)', () => {
    vi.spyOn(overlay, 'announce').mockImplementation(() => undefined);
    render(
      <ul aria-label="Chapters">
        <li>
          <button>Chapter 2</button>
        </li>
      </ul>,
    );
    const item = screen.getByRole('button', { name: 'Chapter 2' });
    const { rerender } = render(<Reader {...props()} />);
    item.focus();
    rerender(<Reader {...props({ pendingJump: 'c2' })} />);
    expect(document.activeElement).toBe(item);
  });

  it('tells its owner which chapter is in view, once per change', () => {
    const onChapterInView = vi.fn();
    render(<Reader {...props({ onChapterInView })} />);
    scrollTo(330);
    scrollTo(340);
    expect(onChapterInView.mock.calls.map(([id]) => id)).toEqual(['c1', 'c2']);
  });

  it('does not draw the paragraphs again when the spy changes', () => {
    const renderGutter = vi.fn(() => null);
    render(<Reader {...props({ renderGutter })} />);
    const before = renderGutter.mock.calls.length;
    expect(before).toBe(5);
    scrollTo(330);
    scrollTo(700);
    expect(renderGutter).toHaveBeenCalledTimes(before);
  });
});

describe('the spy at the bottom', () => {
  it('names the last section when the reader is scrolled to the end and its heading is in view', () => {
    render(<Reader {...props()} />);
    const root = scroller();
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 400 });
    scrollTo(600);
    expect(document.querySelector('b')?.textContent).toBe('Chapter 3');
    // Chapter 2's heading is the last one at or above the top at 350, yet the end of the book shows chapter 3's.
    scrollTo(350);
    expect(document.querySelector('b')?.textContent).toBe('Chapter 2');
  });
});

describe('the sticky header', () => {
  // The mock's `.rd-sticky` title is `font: 600 20px var(--f-display)`: Barlow Condensed.
  it('names the chapter in Barlow Condensed at 20 px', () => {
    render(<Reader {...props()} />);
    const title = document.querySelector('b') as HTMLElement;
    expect(title.className).toContain('Barlow_Condensed');
    expect(title.className).toContain('text-xl');
  });

  // The mock draws the Find bar (`<FindBar>` in Reader.tsx) between the sticky header and the text, not above the header.
  it('draws what it is given for under the header between the header and the scroller', () => {
    render(<Reader {...props({ underHeader: <div role="search">Find</div> })} />);
    const search = screen.getByRole('search');
    const header = (document.querySelector('b') as HTMLElement).closest('div.border-b') as HTMLElement;
    expect(header.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search.compareDocumentPosition(scroller()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('scroll requests', () => {
  it('scrolls to a chapter and clears the request once', () => {
    const onHandled = vi.fn();
    const { rerender } = render(<Reader {...props({ pendingJump: 'c2', onHandled })} />);
    expect(scrolls.get(scroller())).toBe(292);
    expect(onHandled).toHaveBeenCalledWith('chapter');
    rerender(<Reader {...props({ pendingJump: null, onHandled })} />);
    expect(onHandled).toHaveBeenCalledTimes(1);
  });

  it('keeps a jumped-to chapter at the top when text above it arrives after the jump', () => {
    const late: Record<string, ManuscriptParagraph[] | undefined> = {};
    const onHandled = vi.fn();
    const { rerender } = render(<Reader {...props({ paragraphsOf: (id) => late[id], pendingJump: 'c3', onHandled })} />);
    const bound = document.querySelector('[data-bound][data-ch="c3"]') as HTMLElement;
    expect(scrolls.get(scroller())).toBe(bound.offsetTop - 8);
    // The text of the chapters above arrives and pushes the chapter down.
    Object.assign(late, paras);
    tops.set(bound, 8000);
    rerender(<Reader {...props({ paragraphsOf: (id) => late[id], pendingJump: null, onHandled })} />);
    expect(scrolls.get(scroller())).toBe(8000 - 8);
  });

  it("the reader's own focus on a jumped-to heading keeps the jump held against a section drawn above", () => {
    const { rerender } = render(<Reader {...props({ pendingJump: 'c3' })} />);
    expect(document.activeElement?.tagName).toBe('H2');
    expect(document.activeElement?.closest('[data-ch="c3"]')).not.toBeNull();
    const relaid = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      const rows = Array.from(document.querySelectorAll('[data-bound], [data-para]'));
      return rows.indexOf(this) * 100;
    });
    rerender(<Reader {...props({ before: <div data-bound="" data-ch="credits:opening" /> })} />);
    const bound = document.querySelector('[data-bound][data-ch="c3"]') as HTMLElement;
    expect(scrolls.get(scroller())).toBe(bound.offsetTop - 8);
    relaid.mockRestore();
  });

  it('lets go of a jumped-to chapter once the narrator scrolls by hand', () => {
    const late: Record<string, ManuscriptParagraph[] | undefined> = {};
    const { rerender } = render(<Reader {...props({ paragraphsOf: (id) => late[id], pendingJump: 'c3' })} />);
    const bound = document.querySelector('[data-bound][data-ch="c3"]') as HTMLElement;
    fireEvent.wheel(scroller());
    scrollTo(123);
    Object.assign(late, paras);
    tops.set(bound, 8000);
    rerender(<Reader {...props({ paragraphsOf: (id) => late[id], pendingJump: null })} />);
    expect(scrolls.get(scroller())).toBe(123);
  });

  it('scrolls to a paragraph a little below the top', () => {
    const onHandled = vi.fn();
    render(<Reader {...props({ pendingPid: 'p5', onHandled })} />);
    expect(scrolls.get(scroller())).toBe(700 - 100);
    expect(onHandled).toHaveBeenCalledWith('paragraph');
  });

  it('lands a bookmark on its own line, a little below the heading', () => {
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [{ top: 40 }] });
    const onHandled = vi.fn();
    render(<Reader {...props({ pendingBm: { paragraphId: 'p4', offset: 5 }, onHandled })} />);
    expect(scrolls.get(scroller())).toBe(500 + 40 - 120);
    expect(onHandled).toHaveBeenCalledWith('bookmark');
  });

  it('clears a request whose target is not in the manuscript', () => {
    const onHandled = vi.fn();
    render(<Reader {...props({ pendingJump: 'gone', pendingPid: 'gone', pendingBm: { paragraphId: 'gone', offset: 0 }, onHandled })} />);
    expect(onHandled.mock.calls.map(([kind]) => kind).sort()).toEqual(['bookmark', 'chapter', 'paragraph']);
  });
});

describe('the remembered position', () => {
  it('is saved on scroll, after a pause, as the chapter and how far into it', () => {
    render(<Reader {...props()} />);
    scrollTo(350);
    expect(window.localStorage.getItem(READER_POSITION_KEY)).toBeNull();
    act(() => void vi.advanceTimersByTime(250));
    expect(JSON.parse(window.localStorage.getItem(READER_POSITION_KEY) ?? 'null')).toEqual({ chapterId: 'c2', offset: 50 });
  });

  // The narrator who left within the pause after a scroll (End, then another page or a reload) came back to the place before it (#3821).
  it('is saved at once when the reader goes away before the pause is over', () => {
    const { unmount } = render(<Reader {...props()} />);
    scrollTo(350);
    expect(window.localStorage.getItem(READER_POSITION_KEY)).toBeNull();
    unmount();
    expect(JSON.parse(window.localStorage.getItem(READER_POSITION_KEY) ?? 'null')).toEqual({ chapterId: 'c2', offset: 50 });
  });

  it('is saved at once when the window goes away before the pause is over, and not again when nothing is pending', () => {
    render(<Reader {...props()} />);
    scrollTo(350);
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(window.localStorage.getItem(READER_POSITION_KEY) ?? 'null')).toEqual({ chapterId: 'c2', offset: 50 });
    window.localStorage.clear();
    window.dispatchEvent(new Event('pagehide'));
    act(() => void vi.advanceTimersByTime(250));
    expect(window.localStorage.getItem(READER_POSITION_KEY)).toBeNull();
  });

  it('is restored on the first draw', () => {
    window.localStorage.setItem(READER_POSITION_KEY, JSON.stringify({ chapterId: 'c2', offset: 50 }));
    render(<Reader {...props()} />);
    expect(scrolls.get(scroller())).toBe(350);
  });

  // #3821: the place was saved under the credits' id, which is no chapter, so the reader opened on chapter 1.
  it.each([
    ['opening', { before: <div data-bound="" data-ch="credits:opening" /> }, 'credits:opening', 0],
    ['closing', { after: <div data-bound="" data-ch="credits:closing" /> }, 'credits:closing', 800],
  ])('opens where the narrator was when that place is the %s credits', (_kind, slot, chapterId, top) => {
    window.localStorage.setItem(READER_POSITION_KEY, JSON.stringify({ chapterId, offset: 30 }));
    render(<Reader {...props(slot)} />);
    expect(scrolls.get(scroller())).toBe(top + 30);
  });

  it('opens at the first chapter when the remembered section is not in this book', () => {
    window.localStorage.setItem(READER_POSITION_KEY, JSON.stringify({ chapterId: 'credits:"closing', offset: 30 }));
    render(<Reader {...props({ before: <div data-bound="" data-ch="credits:opening" /> })} />);
    expect(scrolls.get(scroller())).toBe(92);
  });

  // #4091: the place is the project's own; another project's, or the key an earlier build kept with no folder, is never applied.
  it('keeps each project its own place: A, then B, then A restores each and B never opens at A', () => {
    const a = render(<Reader {...props()} />);
    scrollTo(350);
    a.unmount();
    const b = render(<Reader {...props({ projectFolder: FOLDER_B })} />);
    expect(scrolls.get(scroller())).toBeUndefined();
    scrollTo(650);
    b.unmount();
    render(<Reader {...props()} />);
    expect(scrolls.get(scroller())).toBe(350);
    cleanup();
    render(<Reader {...props({ projectFolder: FOLDER_B })} />);
    expect(scrolls.get(scroller())).toBe(650);
  });

  it('writes only under the folder it was opened for, one folder spelled two ways being one place', () => {
    const { unmount } = render(<Reader {...props({ projectFolder: 'c:\\books\\a\\' })} />);
    scrollTo(350);
    unmount();
    expect(JSON.parse(window.localStorage.getItem(READER_POSITION_KEY) ?? 'null')).toEqual({ chapterId: 'c2', offset: 50 });
    expect(window.localStorage.getItem(projectStorageKey('script.reader.position', FOLDER_B))).toBeNull();
  });

  it('ignores the key an earlier build kept with no folder in it', () => {
    window.localStorage.setItem('narration.script.reader.position', JSON.stringify({ chapterId: 'c2', offset: 50 }));
    render(<Reader {...props()} />);
    expect(scrolls.get(scroller())).toBeUndefined();
  });

  it("opens at the start when the remembered chapter is not in this project's book", () => {
    window.localStorage.setItem(READER_POSITION_KEY, JSON.stringify({ chapterId: 'other-book-ch', offset: 50 }));
    render(<Reader {...props()} />);
    expect(scrolls.get(scroller())).toBeUndefined();
  });

  // The restore sets the scroll, and the browser answers with a scroll event: that is not the narrator moving, so it saves nothing (#4091).
  it("does not save a place for the first-draw restore; only the narrator's scroll does", () => {
    window.localStorage.setItem(READER_POSITION_KEY, JSON.stringify({ chapterId: 'c2', offset: 50 }));
    const before = window.localStorage.getItem(READER_POSITION_KEY);
    const { unmount } = render(<Reader {...props()} />);
    expect(scrolls.get(scroller())).toBe(350);
    fireEvent.scroll(scroller());
    act(() => void vi.advanceTimersByTime(250));
    unmount();
    expect(window.localStorage.getItem(READER_POSITION_KEY)).toBe(before);
    cleanup();
    render(<Reader {...props()} />);
    scrollTo(450);
    act(() => void vi.advanceTimersByTime(250));
    expect(JSON.parse(window.localStorage.getItem(READER_POSITION_KEY) ?? 'null')).toEqual({ chapterId: 'c2', offset: 150 });
  });

  it('a restore the browser clamps at the end saves no place', () => {
    maxScroll = 300;
    const stored = JSON.stringify({ chapterId: 'c3', offset: 500 });
    window.localStorage.setItem(READER_POSITION_KEY, stored);
    const { unmount } = render(<Reader {...props()} />);
    expect(scrolls.get(scroller())).toBe(300);
    fireEvent.scroll(scroller());
    act(() => void vi.advanceTimersByTime(250));
    unmount();
    expect(window.localStorage.getItem(READER_POSITION_KEY)).toBe(stored);
  });

  it('a restore whose scroll comes back fractional (a scaled display) saves no place', () => {
    const stored = JSON.stringify({ chapterId: 'c2', offset: 50 });
    window.localStorage.setItem(READER_POSITION_KEY, stored);
    const { unmount } = render(<Reader {...props()} />);
    scrolls.set(scroller(), 350.6);
    fireEvent.scroll(scroller());
    act(() => void vi.advanceTimersByTime(250));
    unmount();
    expect(window.localStorage.getItem(READER_POSITION_KEY)).toBe(stored);
  });

  // A small window wraps the header, the reader loses height, the content shrinks and the browser clamps the held end place itself, after the restore ran.
  it('a scroll the browser makes after the restore (the content shrinks under a held end place) saves no place', () => {
    maxScroll = 5000;
    const stored = JSON.stringify({ chapterId: 'c3', offset: 500 });
    window.localStorage.setItem(READER_POSITION_KEY, stored);
    const { unmount } = render(<Reader {...props()} />);
    maxScroll = 560;
    scrolls.set(scroller(), 560); // the browser's own clamp, no wheel, pointer, key or touch
    fireEvent.scroll(scroller());
    scrolls.set(scroller(), 559);
    fireEvent.scroll(scroller());
    act(() => void vi.advanceTimersByTime(250));
    expect(vi.getTimerCount()).toBe(0);
    unmount();
    expect(window.localStorage.getItem(READER_POSITION_KEY)).toBe(stored);
  });

  it.each([
    ['the wheel', (el: HTMLElement) => fireEvent.wheel(el)],
    ['a pointer press (a scrollbar drag or track click)', (el: HTMLElement) => fireEvent.pointerDown(el)],
    ['a touch', (el: HTMLElement) => fireEvent.touchStart(el)],
    ['a key', (el: HTMLElement) => fireEvent.keyDown(el, { key: 'ArrowDown' })],
  ])('a one-pixel scroll right after %s is the narrator moving and is saved', (_name, input) => {
    window.localStorage.setItem(READER_POSITION_KEY, JSON.stringify({ chapterId: 'c2', offset: 50 }));
    render(<Reader {...props()} />);
    input(scroller());
    scrollTo(351, false);
    act(() => void vi.advanceTimersByTime(250));
    expect(JSON.parse(window.localStorage.getItem(READER_POSITION_KEY) ?? 'null')).toEqual({ chapterId: 'c2', offset: 51 });
  });

  it('opening a project with nothing stored writes nothing until the narrator scrolls', () => {
    const { unmount } = render(<Reader {...props({ projectFolder: FOLDER_B })} />);
    fireEvent.scroll(scroller());
    act(() => void vi.advanceTimersByTime(250));
    unmount();
    expect(window.localStorage.getItem(projectStorageKey('script.reader.position', FOLDER_B))).toBeNull();
  });

  it('keeps no place when no project is open', () => {
    const { unmount } = render(<Reader {...props({ projectFolder: '' })} />);
    scrollTo(350);
    unmount();
    expect(window.localStorage.length).toBe(0);
  });

  it('opens at the given chapter when nothing is remembered', () => {
    render(<Reader {...props({ initialChapterId: 'c3' })} />);
    expect(scrolls.get(scroller())).toBe(592);
  });

  it('stays at that chapter when a section is drawn above it after the first draw, until the narrator scrolls', () => {
    const above = <div data-bound="" data-ch="credits:opening" />;
    const { rerender } = render(<Reader {...props({ initialChapterId: 'c3' })} />);
    expect(scrolls.get(scroller())).toBe(592);
    // A row drawn above moves every row down; the fake layout is read again on the next render's measure.
    const relaid = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      const rows = Array.from(document.querySelectorAll('[data-bound], [data-para]'));
      return rows.indexOf(this) * 100;
    });
    rerender(<Reader {...props({ initialChapterId: 'c3', before: above })} />);
    expect(scrolls.get(scroller())).toBe(692);
    fireEvent.wheel(scroller());
    rerender(
      <Reader
        {...props({
          initialChapterId: 'c3',
          before: (
            <>
              {above}
              <div data-bound="" data-ch="x" />
            </>
          ),
        })}
      />,
    );
    expect(scrolls.get(scroller())).toBe(692);
    relaid.mockRestore();
  });

  it('renders when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    render(<Reader {...props()} />);
    scrollTo(330);
    expect(() => act(() => void vi.advanceTimersByTime(250))).not.toThrow();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });
});

describe('clicks', () => {
  const layered = {
    marks: [mark('m1', 'p4', { start: 2, end: 6 }, 'note')],
    markTypes: TYPES,
    words: [],
    entries: [entry('e1', 'Mina', 'Character')],
    types: GUIDE_TYPES,
    cues: [cue('q1', 'p3', 'c2', { start: 11, end: 24 }, 'e1', 'correction')],
  };

  it('calls the prop for a mark and for a name', () => {
    const onShowAnnotation = vi.fn();
    const onShowEntry = vi.fn();
    const { container } = render(<Reader {...props({ sources: layered, onShowAnnotation, onShowEntry })} />);
    fireEvent.click(container.querySelector('[data-a="m1"]')!);
    expect(onShowAnnotation).toHaveBeenCalledWith('m1');
    fireEvent.click(container.querySelector('[data-ent="e1"]')!);
    expect(onShowEntry).toHaveBeenCalledWith('e1');
  });

  it('does nothing while text is selected', () => {
    const onShowAnnotation = vi.fn();
    const { container } = render(<Reader {...props({ sources: layered, onShowAnnotation })} />);
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false } as Selection);
    fireEvent.click(container.querySelector('[data-a="m1"]')!);
    expect(onShowAnnotation).not.toHaveBeenCalled();
  });

  it('clears the bookmark stepping origin on a click in the text but not on a ribbon', () => {
    const onTextClick = vi.fn();
    const renderGutter = () => <button data-bm="b1">ribbon</button>;
    render(<Reader {...props({ onTextClick, renderGutter })} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'ribbon' })[0]);
    expect(onTextClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('A line in the second chapter.'));
    expect(onTextClick).toHaveBeenCalledTimes(1);
  });

  it('leaves a click on a speaker chip to the picker', () => {
    const onPickSpeaker = vi.fn();
    const onTextClick = vi.fn();
    const { container } = render(<Reader {...props({ sources: layered, onPickSpeaker, onTextClick })} />);
    fireEvent.click(container.querySelector('[data-chip="q1"]')!);
    expect(onPickSpeaker).toHaveBeenCalledWith('q1', expect.anything());
  });
});

describe('the bookmark gutter slot', () => {
  it('gives each paragraph its slot and flashes the one jumped to', () => {
    const renderGutter = (p: ManuscriptParagraph) => <i data-slot={p.id} />;
    const { container } = render(<Reader {...props({ renderGutter, flashParagraphId: 'p4' })} />);
    expect(container.querySelectorAll('[data-slot]')).toHaveLength(5);
    expect(container.querySelector('[data-para="p4"]')?.classList.contains('flash')).toBe(true);
    expect(container.querySelector('[data-para="p3"]')?.classList.contains('flash')).toBe(false);
  });
});

describe('the keyboard', () => {
  it('names the scroll region and sends Left and Right to the prep helper for the chapter in view', () => {
    const onStepPrep = vi.fn();
    render(<Reader {...props({ onStepPrep })} />);
    expect(scroller().tabIndex).toBe(0);
    scrollTo(330);
    fireEvent.keyDown(scroller(), { key: 'ArrowRight' });
    fireEvent.keyDown(scroller(), { key: 'ArrowLeft' });
    fireEvent.keyDown(scroller(), { key: 'ArrowDown' });
    expect(onStepPrep.mock.calls).toEqual([
      ['c2', 1],
      ['c2', -1],
    ]);
  });
});

describe('Find', () => {
  it('draws the matches and marks the current one', () => {
    const find = {
      matches: [
        { paragraphId: 'p2', start: 22, end: 29 },
        { paragraphId: 'p4', start: 2, end: 6 },
      ],
      current: 1,
    };
    const { container } = render(<Reader {...props({ find })} />);
    expect(container.querySelectorAll('mark')).toHaveLength(2);
    expect(container.querySelector('.a-find-cur')?.textContent).toBe('line');
  });

  it('choosing the match that is already current scrolls it into view again', () => {
    // The current match sits 600 px below the reader's top; the reader brings it to a third of its height (0 here).
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const top = this.classList.contains('a-find-cur') ? 600 - (scrolls.get(scroller()) ?? 0) : 0;
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
    const matches = [{ paragraphId: 'p4', start: 2, end: 6 }];
    const { rerender } = render(<Reader {...props({ find: { matches, current: 0, request: 1 } })} />);
    expect(scrolls.get(scroller())).toBe(600);
    scrollTo(0);
    // The same match, not chosen again: the narrator's scroll stands.
    rerender(<Reader {...props({ find: { matches, current: 0, request: 1 } })} />);
    expect(scrolls.get(scroller())).toBe(0);
    // Chosen again from the menu: back into view.
    rerender(<Reader {...props({ find: { matches, current: 0, request: 2 } })} />);
    expect(scrolls.get(scroller())).toBe(600);
  });
});

// #4091: after the first-draw restore the reader holds its place and saves nothing until the narrator moves it. Each way the narrator moves it lets go of the hold.
describe('letting go of the first-draw hold', () => {
  const stored = JSON.stringify({ chapterId: 'c2', offset: 50 });
  const restoredFor = (extra: Partial<Props> = {}) => {
    window.localStorage.setItem(READER_POSITION_KEY, stored);
    return render(<Reader {...props(extra)} />);
  };
  const layoutShift = (rerender: (ui: React.ReactElement) => void, extra: Partial<Props> = {}) => {
    // Text above the remembered chapter arrives and pushes it down: a held place follows it, a released one stays where the narrator is.
    tops.set(document.querySelector('[data-bound][data-ch="c2"]') as HTMLElement, 1300);
    rerender(<Reader {...props(extra)} />);
  };

  it('a scroll after focus moves into the reader with no key saves the place', () => {
    const { container } = restoredFor();
    fireEvent.focusIn(container.querySelector('[data-para]') as HTMLElement);
    scrollTo(900, false);
    act(() => void vi.advanceTimersByTime(250));
    expect(JSON.parse(window.localStorage.getItem(READER_POSITION_KEY) ?? 'null')).not.toEqual({ chapterId: 'c2', offset: 50 });
  });

  it('focus moving into the reader releases the held place, so a late layout shift does not snap it back', () => {
    const { container, rerender } = restoredFor();
    expect(scrolls.get(scroller())).toBe(350);
    fireEvent.focusIn(container.querySelector('[data-para]') as HTMLElement);
    scrollTo(900, false);
    layoutShift(rerender);
    expect(scrolls.get(scroller())).toBe(900);
  });

  it('without that focus the held place follows the layout shift, and nothing is saved', () => {
    const { rerender } = restoredFor();
    layoutShift(rerender);
    expect(scrolls.get(scroller())).toBe(1350);
    act(() => void vi.advanceTimersByTime(250));
    expect(window.localStorage.getItem(READER_POSITION_KEY)).toBe(stored);
  });

  it('a request to scroll to a paragraph lets go: no snap back, and the later scroll is saved', () => {
    const { rerender } = restoredFor();
    rerender(<Reader {...props({ pendingPid: 'p5' })} />);
    const at = scrolls.get(scroller());
    expect(at).not.toBe(350);
    layoutShift(rerender, { pendingPid: null });
    expect(scrolls.get(scroller())).toBe(at);
    scrollTo(at! + 40, false);
    act(() => void vi.advanceTimersByTime(250));
    expect(window.localStorage.getItem(READER_POSITION_KEY)).not.toBe(stored);
  });

  it('a request to scroll to a bookmark lets go the same way', () => {
    const { rerender } = restoredFor();
    rerender(<Reader {...props({ pendingBm: { paragraphId: 'p5', offset: 0 } })} />);
    const at = scrolls.get(scroller());
    expect(at).not.toBe(350);
    layoutShift(rerender, { pendingBm: null });
    expect(scrolls.get(scroller())).toBe(at);
    scrollTo(at! + 40, false);
    act(() => void vi.advanceTimersByTime(250));
    expect(window.localStorage.getItem(READER_POSITION_KEY)).not.toBe(stored);
  });

  it('choosing a Find match lets go the same way', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const top = this.classList.contains('a-find-cur') ? 600 - (scrolls.get(scroller()) ?? 0) : 0;
      return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
    const matches = [{ paragraphId: 'p4', start: 2, end: 6 }];
    const { rerender } = restoredFor();
    rerender(<Reader {...props({ find: { matches, current: 0, request: 1 } })} />);
    const at = scrolls.get(scroller());
    expect(at).not.toBe(350);
    layoutShift(rerender, { find: { matches, current: 0, request: 1 } });
    expect(scrolls.get(scroller())).toBe(at);
    scrollTo(at! + 40, false);
    act(() => void vi.advanceTimersByTime(250));
    expect(window.localStorage.getItem(READER_POSITION_KEY)).not.toBe(stored);
  });
});

describe('Home and End', () => {
  const many: ManuscriptChapter[] = Array.from({ length: 60 }, (_, i) => chapter(`k${i}`, i));
  const card = (c: ManuscriptChapter, near: boolean) => (near ? <h2 data-card={c.id}>{c.title}</h2> : <h2 data-pending-card="">{c.title}</h2>);
  const long = (extra: Partial<Props> = {}) => (
    <Reader
      chapters={many}
      paragraphsOf={() => []}
      sources={sources}
      renderChapterCard={card}
      after={<div data-bound="" data-ch="credits:closing" />}
      {...extra}
    />
  );
  let height = 0;
  const sized = (): HTMLElement => {
    const root = scroller();
    Object.defineProperty(root, 'scrollHeight', { configurable: true, get: () => height });
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 400 });
    return root;
  };

  // #3822: the browser's End aims at the end as it was at the key press; the far chapters drawn on the way made the book longer.
  it('End goes to the end of the book and stays there while the chapters drawn there make the book longer', () => {
    const { rerender } = render(long());
    const root = sized();
    height = 6500;
    expect(fireEvent.keyDown(root, { key: 'End' })).toBe(false);
    expect(scrolls.get(root)).toBe(6100);
    // The scroll draws the last chapters, whose real height is more than the estimate.
    fireEvent.scroll(root);
    expect(document.querySelector('[data-bound][data-ch="k59"] [data-card]')).not.toBeNull();
    height = 9000;
    rerender(long());
    expect(scrolls.get(root)).toBe(8600);
    // The narrator's own scroll lets go of the end.
    fireEvent.wheel(root);
    scrollTo(8000);
    height = 9500;
    rerender(long());
    expect(scrolls.get(root)).toBe(8000);
  });

  // The header gains a line under the closing credits and the reader loses that height, with no draw of the reader.
  it('stays at the end when a size changes without a draw', () => {
    const resized: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resized.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    render(long());
    const root = sized();
    height = 6500;
    fireEvent.keyDown(root, { key: 'End' });
    height = 6512;
    resized.forEach((callback) => callback([], {} as ResizeObserver));
    expect(scrolls.get(root)).toBe(6112);
    vi.unstubAllGlobals();
  });

  // Shift with End or Home extends a selection of the reader's text, and Alt with Home is the browser's: the reader takes neither.
  it('leaves End and Home with Shift, Alt or Meta to the browser', () => {
    render(long());
    const root = sized();
    height = 6500;
    fireEvent.wheel(root); // the narrator's own scroll lets go of the place the reader opened on
    scrollTo(1000);
    for (const key of ['End', 'Home']) {
      for (const modifier of [{ shiftKey: true }, { altKey: true }, { metaKey: true }]) {
        expect(fireEvent.keyDown(root, { key, ...modifier })).toBe(true);
        expect(scrolls.get(root)).toBe(1000);
      }
    }
    // Ctrl with End is the same move as End.
    expect(fireEvent.keyDown(root, { key: 'End', ctrlKey: true })).toBe(false);
    expect(scrolls.get(root)).toBe(6100);
  });

  it('Home goes to the top of the book', () => {
    render(long({ initialChapterId: 'k30' }));
    const root = sized();
    expect(scrolls.get(root)).toBeGreaterThan(0);
    expect(fireEvent.keyDown(root, { key: 'Home' })).toBe(false);
    expect(scrolls.get(root)).toBe(0);
  });

  it('leaves Home and End to a text box inside the reader, and to a control that handled the key', () => {
    render(
      long({
        before: (
          <>
            <input aria-label="Label" />
            <button onKeyDown={(event) => event.preventDefault()}>Menu</button>
          </>
        ),
      }),
    );
    const root = sized();
    height = 6500;
    const before = scrolls.get(root);
    expect(fireEvent.keyDown(screen.getByLabelText('Label'), { key: 'End' })).toBe(true);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Menu' }), { key: 'End' });
    expect(scrolls.get(root)).toBe(before);
  });
});

describe('a long book', () => {
  const CHAPTERS = 300;
  const PER_CHAPTER = 34;
  const many: ManuscriptChapter[] = Array.from({ length: CHAPTERS }, (_, i) => chapter(`k${i}`, i));
  const bodies = new Map<string, ManuscriptParagraph[]>(
    many.map((c, i) => [c.id, Array.from({ length: PER_CHAPTER }, (_, j) => paragraph(`k${i}-${j}`, c.id, `Line ${j} of chapter ${i}.`, j))]),
  );

  it('draws the first screen quickly and does not draw rows again on scroll', () => {
    const renderGutter = vi.fn(() => null);
    const started = performance.now();
    render(<Reader chapters={many} paragraphsOf={(id) => bodies.get(id)} sources={sources} renderGutter={renderGutter} />);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(many.length * PER_CHAPTER).toBeGreaterThan(10_000);
    const drawn = renderGutter.mock.calls.length;
    expect(drawn).toBeLessThanOrEqual(3 * PER_CHAPTER);
    expect(document.querySelectorAll('[data-pending-chapter]').length).toBeGreaterThan(290);
    scrollTo(500);
    scrollTo(900);
    expect(renderGutter.mock.calls.length).toBeLessThanOrEqual(drawn + 2 * PER_CHAPTER);
  });

  // A card is the page's (a prep control, a Record button, the facts): one for each of 300 chapters was most of the Script page's load (#3766).
  it("draws the cards of the chapters near the reader only, and a far chapter's when the reader goes to it", () => {
    const renderChapterCard = (c: ManuscriptChapter, near: boolean) =>
      near ? <h2 data-card={c.id}>{`Card ${c.title}`}</h2> : <h2 data-pending-card="">{c.title}</h2>;
    const view = (extra: Partial<ComponentProps<typeof Reader>> = {}) => (
      <Reader chapters={many} paragraphsOf={(id) => bodies.get(id)} sources={sources} renderChapterCard={renderChapterCard} {...extra} />
    );
    const { rerender } = render(view());
    expect(document.querySelectorAll('[data-card]').length).toBeLessThanOrEqual(5);
    // Every chapter keeps its section and its heading, so the header, a jump and a screen reader still find it.
    expect(document.querySelectorAll('[data-bound]')).toHaveLength(CHAPTERS);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(CHAPTERS);
    expect(document.querySelector('[data-bound][data-ch="k200"] [data-pending-card]')).not.toBeNull();
    expect(document.querySelector('[data-bound][data-ch="k0"] [data-pending-card]')).toBeNull();

    rerender(view({ pendingJump: 'k200' }));
    expect(document.querySelector('[data-bound][data-ch="k200"] [data-card]')).not.toBeNull();
    expect(document.querySelector('[data-bound][data-ch="k200"] [data-pending-card]')).toBeNull();
    expect(document.querySelectorAll('[data-card]').length).toBeLessThanOrEqual(10);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(CHAPTERS);
  });

  // The closing credits are no chapter, so under them nothing asked for the last chapter: its end, in view above them, was a blank block.
  it('draws the chapter that ends above the closing credits when they are at the top of the reader', () => {
    const renderChapterCard = (c: ManuscriptChapter, near: boolean) => (near ? <h2 data-card={c.id}>{c.title}</h2> : <h2 data-pending-card="">{c.title}</h2>);
    const closing = <div data-bound="" data-ch="credits:closing" />;
    render(<Reader chapters={many} paragraphsOf={() => []} sources={sources} renderChapterCard={renderChapterCard} after={closing} />);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(400);
    scrollTo((document.querySelector('[data-bound][data-ch="credits:closing"]') as HTMLElement).offsetTop - 8);
    expect(document.querySelector(`[data-bound][data-ch="k${CHAPTERS - 1}"] [data-card]`)).not.toBeNull();
  });

  // Short chapters, or a tall window: more chapters start inside the reader than two either side of the top one (#3766, the breaker's
  // 90 one-line chapters at 1440x1400, where chapters 4 and 5 were in view as a heading alone and, before that, with no text).
  it('draws the card and text of every chapter that starts inside the reader, however many fit', () => {
    const short = many.slice(0, 40);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(1000);
    const renderChapterCard = (c: ManuscriptChapter, near: boolean) => (near ? <h2 data-card={c.id}>{c.title}</h2> : <h2 data-pending-card="">{c.title}</h2>);
    // Each section is 100 px of the laid-out page here (no paragraphs), so ten start inside a 1000 px reader.
    render(<Reader chapters={short} paragraphsOf={() => []} sources={sources} renderChapterCard={renderChapterCard} />);
    scrollTo(0);
    const cards = () => Array.from(document.querySelectorAll<HTMLElement>('[data-card]')).map((card) => card.dataset.card);
    expect(cards()).toEqual(short.slice(0, 13).map((c) => c.id));
    expect(document.querySelectorAll('[data-pending-chapter]')).toHaveLength(40 - 13);
    scrollTo(1500);
    expect(cards()).toContain('k25');
    expect(cards()).not.toContain('k30');
  });
});

describe('the chapter card slot', () => {
  // Three cards with no text under them fit one screen, so the fourth chapter started inside the reader and was drawn and read on every load.
  it('holds the estimated height of a drawn chapter until its text is read', () => {
    const { rerender } = render(<Reader {...props({ paragraphsOf: () => undefined })} />);
    expect(document.querySelectorAll('[data-pending-chapter]')).toHaveLength(3);
    rerender(<Reader {...props()} />);
    expect(document.querySelectorAll('[data-pending-chapter]')).toHaveLength(0);
  });

  it('leaves the chapter heading to the card when one is given, and draws its own only without one', () => {
    const { unmount } = render(<Reader {...props({ renderChapterCard: (chapter) => <h2>{`Card ${chapter.title}`}</h2> })} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Card Chapter 1', 'Card Chapter 2', 'Card Chapter 3']);
    unmount();
    render(<Reader {...props()} />);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });
});
