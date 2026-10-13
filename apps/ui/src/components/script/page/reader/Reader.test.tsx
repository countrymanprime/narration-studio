// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManuscriptChapter, ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import { Reader } from './Reader';
import { READER_POSITION_KEY } from './readerPosition';
import { chapter, cue, entry, mark, paragraph, TYPES } from './readerFixtures';

// jsdom lays nothing out, so the rows get tops by their order in the document (100 px each) and scrollTop is a stored number.
const tops = new WeakMap<Element, number>();
const scrolls = new WeakMap<Element, number>();
function layOut(): void {
  const rows = Array.from(document.querySelectorAll('[data-bound], [data-para]'));
  rows.forEach((row, i) => tops.set(row, i * 100));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    if (!tops.has(this)) layOut();
    return tops.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(function (this: Element) {
    return scrolls.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (this: Element, value: number) {
    scrolls.set(this, value);
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
const sources = { marks: [], markTypes: TYPES, words: [], entries: [], cues: [] };
const paragraphsOf = (id: string): ManuscriptParagraph[] | undefined => paras[id];

type Props = ComponentProps<typeof Reader>;
const props = (extra: Partial<Props> = {}): Props => ({ chapters, paragraphsOf, sources, ...extra });
const scroller = (): HTMLElement => screen.getByRole('region', { name: /Script reader/ });
const scrollTo = (value: number): void => {
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
    expect(document.querySelector('b')?.textContent).toBe('Chapter 1 — Down the Rabbit-Hole');
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

describe('scroll requests', () => {
  it('scrolls to a chapter and clears the request once', () => {
    const onHandled = vi.fn();
    const { rerender } = render(<Reader {...props({ pendingJump: 'c2', onHandled })} />);
    expect(scrolls.get(scroller())).toBe(292);
    expect(onHandled).toHaveBeenCalledWith('chapter');
    rerender(<Reader {...props({ pendingJump: null, onHandled })} />);
    expect(onHandled).toHaveBeenCalledTimes(1);
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

  it('is restored on the first draw', () => {
    window.localStorage.setItem(READER_POSITION_KEY, JSON.stringify({ chapterId: 'c2', offset: 50 }));
    render(<Reader {...props()} />);
    expect(scrolls.get(scroller())).toBe(350);
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
});

describe('the chapter card slot', () => {
  it('leaves the chapter heading to the card when one is given, and draws its own only without one', () => {
    const { unmount } = render(<Reader {...props({ renderChapterCard: (chapter) => <h2>{`Card ${chapter.title}`}</h2> })} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Card Chapter 1', 'Card Chapter 2', 'Card Chapter 3']);
    unmount();
    render(<Reader {...props()} />);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });
});
