import { afterEach, describe, expect, it, vi } from 'vitest';
import { openingChapter, readLastReadWithinCap, type OpeningChapterInput } from './openingChapter';

const CHAPTERS = [
  { id: 'credits-opening', title: 'Opening credits', isCredits: true },
  { id: 'c1', title: 'Chapter One' },
  { id: 'c2', title: 'Chapter Two' },
  { id: 'c3', title: 'Chapter Three' },
];
const kept = (chapterId: string) => ({ chapterId, paragraphId: 'p1', word: 0 });
const session = (phase: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error', chapter: string | null) => ({ phase, chapter });

/** Nothing asked, running, kept, answered or read: the first chapter with text. */
const NOTHING: OpeningChapterInput = { asked: null, host: undefined, kept: null, chapters: CHAPTERS, lastRead: undefined, daw: 'none' };
const open = (over: Partial<OpeningChapterInput>) => openingChapter({ ...NOTHING, ...over });

describe('the one order for the chapter a page opens on (#4087)', () => {
  it('the address wins over everything, even a chapter the book does not list', () => {
    expect(open({ asked: 'elsewhere', host: session('running', 'c2'), kept: kept('c3'), daw: { chapterId: 'c1' }, lastRead: 'c2' })).toEqual({
      chapterId: 'elsewhere',
      by: 'address',
    });
  });

  it.each([
    ['starting', true],
    ['running', true],
    ['stopping', true],
    ['idle', false],
    ['stopped', false],
    ['error', false],
  ] as const)('a session in phase %s on c2 wins over a kept place, the DAW and the last read: %s', (phase, wins) => {
    const result = open({ host: session(phase, 'c2'), kept: kept('c3'), daw: { chapterId: 'c1' }, lastRead: 'c1' });
    expect(result).toEqual(wins ? { chapterId: 'c2', by: 'running' } : { chapterId: 'c3', by: 'kept' });
  });

  it('a running session on a chapter the book does not list is not a running session', () => {
    expect(open({ host: session('running', 'gone'), kept: kept('c3') })).toEqual({ chapterId: 'c3', by: 'kept' });
  });

  it('a kept place wins over the DAW and the last read, and the DAW is not asked', () => {
    expect(open({ kept: kept('c3'), daw: 'unasked', lastRead: 'c1' })).toEqual({ chapterId: 'c3', by: 'kept' });
  });

  it('a kept place whose chapter is gone is nothing kept', () => {
    expect(open({ kept: kept('gone'), daw: { chapterId: 'c2' } })).toEqual({ chapterId: 'c2', by: 'daw' });
  });

  it('with nothing before the DAW, an unasked DAW is asked', () => {
    expect(open({ daw: 'unasked', lastRead: 'c2' })).toBe('ask-daw');
  });

  it('the DAW chapter wins over the last read', () => {
    expect(open({ daw: { chapterId: 'c3' }, lastRead: 'c1' })).toEqual({ chapterId: 'c3', by: 'daw' });
  });

  it.each([
    ['a chapter the book does not have', { chapterId: 'nowhere' }],
    ['no chapter named', 'none'],
  ] as const)('%s from the DAW falls to the last read', (_name, daw) => {
    expect(open({ daw, lastRead: 'Chapter Two' })).toEqual({ chapterId: 'c2', by: 'fallback' });
  });

  it.each([
    ['not set', undefined],
    ['not in the list', 'Chapter Nine'],
    ['empty', ''],
  ])('a last read that is %s falls to the first chapter with text, not the opening credits', (_name, lastRead) => {
    expect(open({ lastRead })).toEqual({ chapterId: 'c1', by: 'fallback' });
  });

  it('a book with only credits opens on its first chapter', () => {
    expect(open({ chapters: [CHAPTERS[0]!] })).toEqual({ chapterId: 'credits-opening', by: 'fallback' });
  });

  it.each([
    ['not read yet', undefined],
    ['empty', []],
  ])('chapters %s: nothing to open, and the DAW is not asked', (_name, chapters) => {
    expect(openingChapter({ ...NOTHING, chapters, daw: 'unasked', kept: kept('c2') })).toEqual({ chapterId: '', by: 'unread' });
  });
});

describe('the last-read read is bounded by the DAW answer cap (#4087)', () => {
  afterEach(() => vi.useRealTimers());

  it('answers the chapter the read names', async () => {
    const read = readLastReadWithinCap({ readerState: async () => ({ activeChapter: 'c2' }) });
    await expect(read.result).resolves.toBe('c2');
  });

  it('answers nothing when the read fails', async () => {
    const read = readLastReadWithinCap({ readerState: async () => Promise.reject(new Error('no')) });
    await expect(read.result).resolves.toBeUndefined();
  });

  it('answers nothing at 3.5 s for a read that never answers, and not before', async () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    void readLastReadWithinCap({ readerState: () => new Promise<never>(() => {}) }).result.then(settled);
    await vi.advanceTimersByTimeAsync(3499);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toHaveBeenCalledWith(undefined);
  });

  it('cancel clears the timer', () => {
    vi.useFakeTimers();
    const read = readLastReadWithinCap({ readerState: () => new Promise<never>(() => {}) });
    expect(vi.getTimerCount()).toBe(1);
    read.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });
});
