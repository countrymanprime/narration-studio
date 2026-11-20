// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChapterTrackMatch } from '../../api/contracts/chapterTrackMap';
import { cachedMatch, forgetMatches, prefetchMatch } from './chapterMatchCache';

const match = { chapterId: 'c1', tracks: [] } as unknown as ChapterTrackMatch;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  forgetMatches();
  vi.useRealTimers();
});

// The read ahead (#3669): what it keeps, for how long, and that a read that never answers does not block the next one.
describe('the tracks read ahead', () => {
  it('keeps the time the host answered, and does not read again while the answer is under 30 s old', async () => {
    const read = vi.fn(async () => match);
    prefetchMatch('p', 'c1', read);
    await settle();
    expect(cachedMatch('p', 'c1')?.at).toBeLessThanOrEqual(Date.now());
    prefetchMatch('p', 'c1', read);
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads again once the answer is over 30 s old', async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => match);
    prefetchMatch('p', 'c1', read);
    await vi.advanceTimersByTimeAsync(10);
    vi.advanceTimersByTime(31_000);
    prefetchMatch('p', 'c1', read);
    await vi.advanceTimersByTimeAsync(10);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('gives up on a read the host never answers, so the next read ahead can run', async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => new Promise<ChapterTrackMatch>(() => undefined));
    prefetchMatch('p', 'c1', read);
    await vi.advanceTimersByTimeAsync(9_000);
    prefetchMatch('p', 'c1', read);
    await vi.advanceTimersByTimeAsync(10);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('knows nothing without a project folder', async () => {
    prefetchMatch(null, 'c1', async () => match);
    await settle();
    expect(cachedMatch(null, 'c1')).toBeUndefined();
  });
});
