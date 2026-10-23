import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostEvents, createSlots } from './slots';

afterEach(() => vi.restoreAllMocks());

describe('slots-registry-has-chapters', () => {
  it('reads chapters through the port, is stale on job:ended and reloads on focus', async () => {
    const manuscriptChapters = vi.fn().mockResolvedValue([]);
    const { chapters } = createSlots({ manuscriptChapters }, { bookmarksList: vi.fn() });
    expect(chapters.events).toEqual(['job:ended']);
    expect(chapters.refreshOnFocus).toBe(true);
    await chapters.load();
    expect(manuscriptChapters).toHaveBeenCalledOnce();
    expect(chapters.schema['~standard'].validate(null)).toMatchObject({ value: [] });
  });
});

describe('host-events-adapter', () => {
  it('maps job:ended to subscribeJobEnded and returns its unsubscribe', () => {
    const stop = vi.fn();
    let deliver: (event: unknown) => void = () => undefined;
    const subscribeJobEnded = vi.fn((cb: (event: unknown) => void) => {
      deliver = cb;
      return stop;
    });
    const handler = vi.fn();
    const off = createHostEvents({ subscribeJobEnded } as never)('job:ended', handler);
    deliver({ kind: 'import' });
    expect(handler).toHaveBeenCalledOnce();
    off();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('returns a no-op for an unknown event and logs once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const subscribe = createHostEvents({ subscribeJobEnded: vi.fn() } as never);
    expect(subscribe('nope', () => undefined)()).toBeUndefined();
    subscribe('nope', () => undefined);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('slots-registry-has-bookmarks', () => {
  it('reads the bookmark list through the port and reloads on focus, not on a host event', async () => {
    const bookmarksList = vi.fn().mockResolvedValue([]);
    const { bookmarks } = createSlots({ manuscriptChapters: vi.fn() }, { bookmarksList });
    expect(bookmarks.refreshOnFocus).toBe(true);
    expect('events' in bookmarks).toBe(false);
    await bookmarks.load();
    expect(bookmarksList).toHaveBeenCalledOnce();
    expect(bookmarks.schema['~standard'].validate([])).toMatchObject({ value: [] });
  });
});
