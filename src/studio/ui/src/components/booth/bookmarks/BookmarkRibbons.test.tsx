// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../../../api/contracts/bookmarks';
import { TooltipProvider } from '../../primitives/Tooltip';
import { BoothText } from '../reading/BoothText';
import { boothUnits } from '../reading/boothUnits';
import { sampleParagraphs } from '../reading/fixture';
import { BookmarkRibbons } from './BookmarkRibbons';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const make = (over: Partial<Bookmark> = {}): Bookmark => ({
  id: 'b1',
  chapterId: 'c1',
  paragraphId: 'p1',
  paragraph: 0,
  offset: 22,
  label: '',
  note: '',
  createdAt: '2026-10-11T10:00:00Z',
  stale: false,
  ...over,
});

const units = boothUnits(sampleParagraphs);

/** A text column with the sentences' words in it, and the margin the ribbons are drawn in. The words are given their line by `tops`. */
function setup(bookmarks: Bookmark[], tops: Record<string, number> = {}) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const word = this.closest('[data-word]') ? this : null;
    const at = word ? (tops[`${word.closest('[data-unit]')?.getAttribute('data-unit')}:${word.dataset.word}`] ?? 0) : 0;
    return { top: at, bottom: at + 30, left: 0, right: 0, width: 0, height: 30, x: 0, y: at, toJSON: () => ({}) };
  });
  const onUpdate = vi.fn();
  const onRemove = vi.fn();
  const view = render(
    <TooltipProvider>
      <div data-column className="relative">
        {units.map((unit, index) => (
          <span key={unit.key} data-unit={index}>
            {unit.text
              .split(/\s+/)
              .filter(Boolean)
              .map((word, w) => (
                <span key={w} data-word={w}>
                  {word}{' '}
                </span>
              ))}
          </span>
        ))}
        <BookmarkRibbons chapterId="c1" bookmarks={bookmarks} paragraphs={sampleParagraphs} units={units} onUpdate={onUpdate} onRemove={onRemove} />
      </div>
    </TooltipProvider>,
  );
  return { ...view, onUpdate, onRemove };
}

const margin = () => document.querySelector<HTMLElement>('[data-bmk-margin]')!;

describe('BookmarkRibbons', () => {
  it('a-ribbon-per-bookmark-in-the-margin: one per bookmark, in the margin and not among the speaker chips, with the note in its tooltip', () => {
    setup([make(), make({ id: 'b2', paragraphId: 'p3', offset: 4, label: 'Retake', note: 'Retake this' })]);
    expect(within(margin()).getAllByRole('button', { name: /^Bookmark:/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Bookmark: Retake: Retake this' }).hasAttribute('data-bm')).toBe(true);
    expect(document.querySelectorAll('[data-speaker-chip] [data-bm]')).toHaveLength(0);
  });

  it('has no ribbon for a bookmark in another chapter, or whose line is not in the text', () => {
    setup([make({ chapterId: 'c2' }), make({ id: 'b2', paragraphId: 'elsewhere' })]);
    expect(document.querySelectorAll('[data-bm]')).toHaveLength(0);
  });

  it('puts each ribbon level with the line of its word', () => {
    // p1's unit 1 starts "Nobody" (offset 22) at word 0; p3 is unit 3 (p2 has three sentences).
    const second = units.findIndex((unit) => unit.paragraphId === 'p1' && unit.start > 0);
    const third = units.findIndex((unit) => unit.paragraphId === 'p3');
    setup([make(), make({ id: 'b2', paragraphId: 'p3', offset: 0 })], { [`${second}:0`]: 96, [`${third}:0`]: 300 });
    const top = (id: string) => (document.querySelector<HTMLElement>(`[data-bm="${id}"]`)!.closest('[style]') as HTMLElement).style.top;
    expect([top('b1'), top('b2')]).toEqual(['96px', '300px']);
  });

  it('keeps two ribbons on one line apart', () => {
    const second = units.findIndex((unit) => unit.paragraphId === 'p1' && unit.start > 0);
    setup([make(), make({ id: 'b2', offset: 29 })], { [`${second}:0`]: 96, [`${second}:1`]: 96 });
    const top = (id: string) => parseInt((document.querySelector<HTMLElement>(`[data-bm="${id}"]`)!.closest('[style]') as HTMLElement).style.top, 10);
    expect(top('b2') - top('b1')).toBeGreaterThanOrEqual(26);
  });

  it('a-stale-bookmark-is-drawn-flagged-not-moved: it shows a warning shape in the margin, on no word, and can still be reached', () => {
    setup([make({ id: 's1', stale: true, staleReason: 'offset_out_of_range', offset: 4000 })], { '1:0': 500 });
    const mark = within(margin()).getByRole('button', { name: /^Bookmark: Line changed/ });
    expect(mark.hasAttribute('data-stale')).toBe(true);
    expect(mark.hasAttribute('data-bm')).toBe(true);
    expect(mark.querySelector('[data-warning-shape]')).not.toBeNull();
    expect((mark.closest('[style]') as HTMLElement).style.top).toBe('0px');
  });

  it('draws nothing for a stale bookmark of another chapter, and nothing at all with no bookmarks', () => {
    setup([make({ stale: true, chapterId: 'c2', staleReason: 'paragraph_missing', paragraph: null })]);
    expect(document.querySelectorAll('[data-bm]')).toHaveLength(0);
    cleanup();
    setup([]);
    expect(document.querySelectorAll('[data-bm]')).toHaveLength(0);
  });

  it('finds the word of a bookmark in the Booth text’s own markup', () => {
    // Only the word "Nobody" (offset 22 of p1) is given a line; a ribbon at 123px proves the selector reached it.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const at = this.hasAttribute('data-word') && this.textContent === 'Nobody' ? 123 : 0;
      return { top: at, bottom: at + 30, left: 0, right: 0, width: 0, height: 30, x: 0, y: at, toJSON: () => ({}) };
    });
    render(
      <TooltipProvider>
        <div className="relative">
          <BoothText paragraphs={sampleParagraphs} browse={false} onBrowse={vi.fn()} onSeek={vi.fn()} speakers={[]} onSetSpeaker={vi.fn()} size={28} />
          <BookmarkRibbons chapterId="c1" bookmarks={[make()]} paragraphs={sampleParagraphs} units={units} onUpdate={vi.fn()} onRemove={vi.fn()} />
        </div>
      </TooltipProvider>,
    );
    expect((document.querySelector('[data-bm]')!.closest('[style]') as HTMLElement).style.top).toBe('123px');
  });
});
