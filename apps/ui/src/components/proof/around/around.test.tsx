// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManuscriptParagraph } from '../../../api/contracts/manuscript';
import { paragraphsAround } from './paragraphsAround';
import { SurroundingText } from './SurroundingText';
import { useParagraphsAround } from './useParagraphsAround';

afterEach(cleanup);

const para = (id: string, index: number, text: string): ManuscriptParagraph => ({ id, chapterId: 'c1', chapter: 'One', index, text, entityIds: [] });
const CHAPTER = [para('p-1', 0, 'First line.'), para('p-2', 1, 'The White Rabbit ran by.'), para('p-3', 2, 'Oh dear!')];

describe('paragraphs-around-a-note', () => {
  it('gives the paragraph and the ones either side, in manuscript order', () => {
    expect(paragraphsAround(CHAPTER, 'p-2')).toEqual({ before: 'First line.', at: 'The White Rabbit ran by.', after: 'Oh dear!' });
  });

  it('has nothing before the first or after the last', () => {
    expect(paragraphsAround(CHAPTER, 'p-1')).toEqual({ before: undefined, at: 'First line.', after: 'The White Rabbit ran by.' });
    expect(paragraphsAround(CHAPTER, 'p-3')).toEqual({ before: 'The White Rabbit ran by.', at: 'Oh dear!', after: undefined });
  });

  it('orders by index, not by the order the host listed them', () => {
    expect(paragraphsAround([CHAPTER[2], CHAPTER[0], CHAPTER[1]], 'p-2')?.before).toBe('First line.');
  });

  it('is undefined for a paragraph the chapter no longer has, an empty chapter, or no id', () => {
    expect(paragraphsAround(CHAPTER, 'gone')).toBeUndefined();
    expect(paragraphsAround([], 'p-1')).toBeUndefined();
    expect(paragraphsAround(CHAPTER, undefined)).toBeUndefined();
  });

  it('marks the note’s own words, the nth time they occur for a repeat, and nothing when they are not there', () => {
    expect(paragraphsAround(CHAPTER, 'p-2', { text: 'White Rabbit' })?.mark).toEqual({ start: 4, end: 16 });
    const twice = [para('p-9', 0, 'Oh dear, oh dear!')];
    expect(paragraphsAround(twice, 'p-9', { text: 'dear', ordinal: 1 })?.mark).toEqual({ start: 12, end: 16 });
    expect(paragraphsAround(twice, 'p-9', { text: 'dear', ordinal: 5 })?.mark).toBeUndefined();
    expect(paragraphsAround(CHAPTER, 'p-2', { text: 'Cheshire Cat' })?.mark).toBeUndefined();
    expect(paragraphsAround(CHAPTER, 'p-2', { text: '' })?.mark).toBeUndefined();
  });
});

describe('surrounding-text-draws-the-paragraphs', () => {
  it('draws the paragraph with its words marked and the neighbours muted, under a label', () => {
    render(<SurroundingText around={{ before: 'First line.', at: 'The White Rabbit ran by.', after: 'Oh dear!', mark: { start: 4, end: 16 } }} />);
    const section = screen.getByRole('region', { name: 'In the script' });
    expect(section.querySelector('[data-around=at] mark')?.textContent).toBe('White Rabbit');
    expect(section.querySelector('[data-around=at] mark')?.getAttribute('data-highlight')).toBe('Search');
    expect(section.querySelector('[data-around=before]')?.textContent).toBe('First line.');
    expect(section.querySelector('[data-around=after]')?.textContent).toBe('Oh dear!');
  });

  it('keeps right-to-left and emoji text as written', () => {
    render(<SurroundingText around={{ at: 'שלום 👋 world', mark: { start: 0, end: 4 } }} />);
    expect(document.querySelector('[data-around=at]')?.textContent).toBe('שלום 👋 world');
    expect(document.querySelector('[data-around=at]')?.getAttribute('dir')).toBe('auto');
  });

  it('says why when the paragraph cannot be shown, and draws nothing when there is nothing to say', () => {
    const { rerender, container } = render(<SurroundingText around={undefined} reason="The script has no paragraph for this note." />);
    expect(screen.getByText('The script has no paragraph for this note.')).toBeTruthy();
    rerender(<SurroundingText around={undefined} />);
    expect(container.textContent).toBe('');
  });
});

describe('reads-a-chapter-once', () => {
  it('reads the chapter’s paragraphs once for several notes and answers each', async () => {
    const manuscriptParagraphs = vi.fn(async () => CHAPTER);
    const { result, rerender } = renderHook(({ id }) => useParagraphsAround({ manuscriptParagraphs }, 'c1', id), { initialProps: { id: 'p-2' } });
    await waitFor(() => expect(result.current.around?.at).toBe('The White Rabbit ran by.'));
    rerender({ id: 'p-3' });
    await waitFor(() => expect(result.current.around?.at).toBe('Oh dear!'));
    expect(manuscriptParagraphs).toHaveBeenCalledTimes(1);
  });

  it('gives the host’s sentence when the read fails, and a plain one for a paragraph that is gone', async () => {
    const failing = vi.fn(async () => Promise.reject(new Error('The manuscript could not be read.')));
    const { result } = renderHook(() => useParagraphsAround({ manuscriptParagraphs: failing }, 'c1', 'p-2'));
    await waitFor(() => expect(result.current.reason).toBe('The script could not be read: The manuscript could not be read.'));
    const gone = renderHook(() => useParagraphsAround({ manuscriptParagraphs: async () => CHAPTER }, 'c1', 'nope'));
    await waitFor(() => expect(gone.result.current.reason).toBe('The script no longer has this paragraph.'));
  });

  it('asks nothing for a note with no chapter or paragraph', () => {
    const manuscriptParagraphs = vi.fn(async () => CHAPTER);
    const { result } = renderHook(() => useParagraphsAround({ manuscriptParagraphs }, undefined, undefined));
    expect(manuscriptParagraphs).not.toHaveBeenCalled();
    expect(result.current).toEqual({ around: undefined, reason: undefined });
  });
});
