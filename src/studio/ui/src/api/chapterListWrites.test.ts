import { describe, expect, it, vi } from 'vitest';
import type { NarrationApi } from '../types';
import { createMockApi } from './mockApi';
import { withCoalescedReads } from './withCoalescedReads';
import { CHAPTER_LIST_WRITERS, onChapterListWritten, withChapterListWrites } from './chapterListWrites';

function apiOf(methods: Record<string, unknown>): NarrationApi {
  return methods as unknown as NarrationApi;
}

describe('withChapterListWrites (#3658)', () => {
  it('announces each writer once it settles, answered or refused, and not before', async () => {
    let finish: (answer: unknown) => void = () => undefined;
    const api = withChapterListWrites(
      apiOf({
        chapterTrackSet: vi.fn(() => new Promise((resolve) => (finish = resolve))),
        chapterTrackUnlink: vi.fn(() => Promise.reject(new Error('refused'))),
      }),
    );
    const heard = vi.fn();
    const off = onChapterListWritten(heard);
    const set = api.chapterTrackSet('c1', '{T}');
    expect(heard).not.toHaveBeenCalled();
    finish({});
    await set;
    expect(heard).toHaveBeenCalledTimes(1);
    await expect(api.chapterTrackUnlink('c1')).rejects.toThrow('refused');
    expect(heard).toHaveBeenCalledTimes(2);
    off();
  });

  it('announces a writer that throws at once or answers without a promise, and passes the throw on', () => {
    const api = withChapterListWrites(
      apiOf({
        dawChoose: vi.fn(() => {
          throw new Error('sync');
        }),
        tracksSelect: vi.fn(() => 'plain'),
      }),
    );
    const heard = vi.fn();
    const off = onChapterListWritten(heard);
    expect(() => api.dawChoose('REAPER')).toThrow('sync');
    expect(api.tracksSelect('x')).toBe('plain');
    expect(heard).toHaveBeenCalledTimes(2);
    off();
  });

  it('says nothing for a read or any other call, and hands out the same function for a method every time', async () => {
    const api = withChapterListWrites(apiOf({ manuscriptChapters: vi.fn(async () => []), chapterTrackSet: vi.fn(async () => ({})) }));
    const heard = vi.fn();
    const off = onChapterListWritten(heard);
    await api.manuscriptChapters();
    expect(heard).not.toHaveBeenCalled();
    expect(api.chapterTrackSet).toBe(api.chapterTrackSet);
    off();
  });

  it('every writer it names is a call the api has', () => {
    const api = createMockApi() as unknown as Record<string, unknown>;
    for (const name of CHAPTER_LIST_WRITERS) expect(typeof api[name], name).toBe('function');
  });

  it('pins the writers: a new one is a deliberate edit', () => {
    expect([...CHAPTER_LIST_WRITERS].sort()).toEqual(
      [
        'chapterFoldersRepair',
        'chapterSyncSetEnabled',
        'chapterSyncUndo',
        'chapterTrackCreate',
        'chapterTrackSet',
        'chapterTrackUnlink',
        'clearProjectData',
        'dawChoose',
        'dawLinkFound',
        'dawSaveProject',
        'linkDawFile',
        'setCreditsStatus',
        'teleprompterStop',
        'tracksSelect',
        'voiceTracksSetCharacters',
        'voiceTracksSetLayout',
        'voiceTracksSetNarrator',
      ].sort(),
    );
  });
});

describe("wrapped in main.tsx's order (#3658)", () => {
  it('the list read an announcement triggers does not join a read that began while the writer ran', async () => {
    const reads: ((answer: unknown) => void)[] = [];
    let finish: () => void = () => undefined;
    const host = apiOf({
      manuscriptChapters: vi.fn(() => new Promise((resolve) => reads.push(resolve))),
      chapterTrackSet: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
      subscribeJobEnded: vi.fn(() => () => undefined),
    });
    // The order main.tsx builds: the announcement outside the coalescer.
    const api = withChapterListWrites(withCoalescedReads(host));
    const off = onChapterListWritten(() => void api.manuscriptChapters());
    const writing = api.chapterTrackSet('c1', '{T}');
    void api.manuscriptChapters(); // a read that began while the writer ran: it may answer the list from before the commit
    finish();
    await writing;
    expect(host.manuscriptChapters).toHaveBeenCalledTimes(2);
    off();
  });
});
