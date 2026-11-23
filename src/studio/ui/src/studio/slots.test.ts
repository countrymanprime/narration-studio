import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceChapterListWritten } from '../api/chapterListWrites';
import { createHostEvents, createKeyedSlots, createSlots, MANUSCRIPT_CHANGED } from './slots';

afterEach(() => vi.restoreAllMocks());

describe('slots-registry-has-chapters', () => {
  it('reads chapters through the port, is stale on job:ended and reloads on focus', async () => {
    const manuscriptChapterList = vi.fn().mockResolvedValue({ project: 'A', chapters: [] });
    const { chapters } = createSlots({ manuscriptChapterList }, { bookmarksList: vi.fn() });
    expect(chapters.events).toEqual(['job:ended', 'chapters:written', 'daw:record-ended', 'chapter-sync']);
    expect(chapters.refreshOnFocus).toBe(true);
    await chapters.read();
    expect(manuscriptChapterList).toHaveBeenCalledOnce();
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
    const { bookmarks } = createSlots({ manuscriptChapterList: vi.fn() }, { bookmarksList });
    expect(bookmarks.refreshOnFocus).toBe(true);
    expect('events' in bookmarks).toBe(false);
    await bookmarks.load();
    expect(bookmarksList).toHaveBeenCalledOnce();
    expect(bookmarks.schema['~standard'].validate([])).toMatchObject({ value: [] });
  });
});

describe('the chapter list is stale on what changes its recorded fields (#3658)', () => {
  it('maps chapters:written, daw:record-ended and chapter-sync to their subscriptions and returns each unsubscribe', () => {
    const stops = { record: vi.fn(), sync: vi.fn() };
    const handlers: Record<string, (event: unknown) => void> = {};
    const api = {
      subscribeJobEnded: vi.fn(() => () => undefined),
      subscribeRecordEnded: vi.fn((cb: () => void) => {
        handlers.record = cb;
        return stops.record;
      }),
      subscribeChapterSync: vi.fn((cb: (state: unknown) => void) => {
        handlers.sync = cb;
        return stops.sync;
      }),
    };
    const subscribe = createHostEvents(api as never);
    const heard = vi.fn();
    const offRecord = subscribe('daw:record-ended', heard);
    const offSync = subscribe('chapter-sync', heard);
    handlers.record!({});
    handlers.sync!({});
    expect(heard).toHaveBeenCalledTimes(2);
    offRecord();
    offSync();
    expect(stops.record).toHaveBeenCalledOnce();
    expect(stops.sync).toHaveBeenCalledOnce();
  });

  it('hears a settled chapter-list write through chapters:written, and stops hearing after the unsubscribe', () => {
    const subscribe = createHostEvents({ subscribeJobEnded: vi.fn(), subscribeChapterSync: vi.fn() } as never);
    const heard = vi.fn();
    const off = subscribe('chapters:written', heard);
    announceChapterListWritten();
    expect(heard).toHaveBeenCalledOnce();
    off();
    announceChapterListWritten();
    expect(heard).toHaveBeenCalledOnce();
  });

  it('a DAW port without a record-ended subscription gives a no-op', () => {
    const subscribe = createHostEvents({ subscribeJobEnded: vi.fn(), subscribeChapterSync: vi.fn() } as never);
    expect(() => subscribe('daw:record-ended', vi.fn())()).not.toThrow();
  });
});

describe('the chapter text cache is stale on what replaces the manuscript (#3658)', () => {
  it('lists the job end and the manuscript topic', () => {
    const { chapterText } = createKeyedSlots({ manuscriptParagraphs: vi.fn() });
    expect(chapterText.events).toContain('job:ended');
    expect(chapterText.topics).toContain(MANUSCRIPT_CHANGED);
  });
});
