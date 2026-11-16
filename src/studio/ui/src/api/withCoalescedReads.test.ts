// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createMockApi } from './mockApi';
import { COALESCED_READS, withCoalescedReads } from './withCoalescedReads';
import type { NarrationApi } from '../types';

/** An api whose methods answer when the test says so, counting the calls that reach it. */
function gated() {
  const calls: string[] = [];
  const waiting: { resolve: (value: unknown) => void; reject: (reason: unknown) => void }[] = [];
  const method = (name: string) =>
    vi.fn((..._args: unknown[]) => {
      calls.push(name);
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    });
  const api = {
    manuscriptChapters: method('manuscriptChapters'),
    settingsForScope: method('settingsForScope'),
    manuscriptSetChapterStatus: method('manuscriptSetChapterStatus'),
    subscribeJobEnded: vi.fn(() => () => undefined),
  } as unknown as NarrationApi;
  return { api, calls, waiting };
}

describe('withCoalescedReads', () => {
  it('answers identical reads made while one is in flight with one host call', async () => {
    const { api, calls, waiting } = gated();
    const wrapped = withCoalescedReads(api);
    const answers = [wrapped.manuscriptChapters(), wrapped.manuscriptChapters(), wrapped.manuscriptChapters()];
    expect(calls).toEqual(['manuscriptChapters']);
    waiting[0]!.resolve([{ id: 'c1' }]);
    expect(await Promise.all(answers)).toEqual([[{ id: 'c1' }], [{ id: 'c1' }], [{ id: 'c1' }]]);
  });

  it('keeps nothing once the call answers: the next read goes to the host again', async () => {
    const { api, calls, waiting } = gated();
    const wrapped = withCoalescedReads(api);
    const first = wrapped.manuscriptChapters();
    waiting[0]!.resolve([]);
    await first;
    const second = wrapped.manuscriptChapters();
    expect(calls).toEqual(['manuscriptChapters', 'manuscriptChapters']);
    waiting[1]!.resolve([]);
    await second;
  });

  it('does not share reads with different arguments', () => {
    const { api, calls } = gated();
    const wrapped = withCoalescedReads(api);
    void wrapped.settingsForScope('project');
    void wrapped.settingsForScope('global');
    void wrapped.settingsForScope('project');
    expect(calls).toEqual(['settingsForScope', 'settingsForScope']);
  });

  it('sends a read asked after a write to the host, even with an identical read still in flight', async () => {
    const { api, calls, waiting } = gated();
    const wrapped = withCoalescedReads(api);
    const before = wrapped.manuscriptChapters();
    const write = wrapped.manuscriptSetChapterStatus('c1', 'finalized');
    const after = wrapped.manuscriptChapters();
    expect(calls).toEqual(['manuscriptChapters', 'manuscriptSetChapterStatus', 'manuscriptChapters']);
    waiting.forEach((call) => call.resolve([]));
    await Promise.all([before, write, after]);
  });

  it('sends a read asked after a write answered to the host, even with an identical read that began while the write ran still in flight', async () => {
    const { api, calls, waiting } = gated();
    const wrapped = withCoalescedReads(api);
    const write = wrapped.manuscriptSetChapterStatus('c1', 'finalized'); // waiting[0]
    const poll = wrapped.manuscriptChapters(); // began while the write ran: waiting[1]
    waiting[0]!.resolve(undefined);
    await write;
    const after = wrapped.manuscriptChapters();
    expect(calls).toEqual(['manuscriptSetChapterStatus', 'manuscriptChapters', 'manuscriptChapters']);
    waiting[1]!.resolve([]);
    waiting[2]!.resolve([]);
    await Promise.all([poll, after]);
  });

  it('sends a read asked after the window is focused again to the host', () => {
    const { api, calls } = gated();
    const wrapped = withCoalescedReads(api);
    void wrapped.manuscriptChapters();
    window.dispatchEvent(new Event('focus'));
    void wrapped.manuscriptChapters();
    expect(calls).toEqual(['manuscriptChapters', 'manuscriptChapters']);
  });

  it('sends a read asked after the window is shown again to the host', () => {
    const { api, calls } = gated();
    const wrapped = withCoalescedReads(api);
    void wrapped.manuscriptChapters();
    document.dispatchEvent(new Event('visibilitychange'));
    void wrapped.manuscriptChapters();
    expect(calls).toEqual(['manuscriptChapters', 'manuscriptChapters']);
  });

  it('holds when a write answers with a promise of another class (Wails answers with its own)', async () => {
    class Custom<T> extends Promise<T> {}
    const calls: string[] = [];
    let answerWrite: (value: unknown) => void = () => undefined;
    const api = {
      manuscriptChapters: vi.fn(() => {
        calls.push('read');
        return calls.length === 1 ? new Promise(() => undefined) : Promise.resolve([]); // the poll that began mid-write never answers in this test
      }),
      manuscriptSetChapterStatus: vi.fn(() => new Custom((resolve) => (answerWrite = resolve))),
    } as unknown as NarrationApi;
    const wrapped = withCoalescedReads(api);
    const write = wrapped.manuscriptSetChapterStatus('c1', 'finalized');
    void wrapped.manuscriptChapters(); // began while the write ran
    answerWrite(undefined);
    await write.then(() => wrapped.manuscriptChapters());
    expect(calls).toEqual(['read', 'read']);
  });

  it('pins the list of coalesced reads: a new entry is a deliberate edit', () => {
    expect([...COALESCED_READS].sort()).toEqual(
      [
        'bookmarksList',
        'chapterSyncState',
        'dawCapabilities',
        'dawChoice',
        'findingsSummary',
        'manuscriptChapters',
        'measureState',
        'pickupsList',
        'productionOverview',
        'productionPlan',
        'readAloudReaperState',
        'recorderState',
        'settingsForScope',
        'workspaceAlignment',
      ].sort(),
    );
  });

  it('lets the first caller edit its answer in place without changing what a joiner receives', async () => {
    const { api, waiting } = gated();
    const wrapped = withCoalescedReads(api);
    const first = (wrapped.manuscriptChapters() as unknown as Promise<{ n: number }[]>).then((list) => {
      list.splice(0, 1);
      list.push({ n: 99 });
      return list;
    });
    const second = wrapped.manuscriptChapters() as unknown as Promise<{ n: number }[]>;
    waiting[0]!.resolve([{ n: 1 }, { n: 2 }]);
    await first;
    expect(await second).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('gives the host the same wrapper for the same handler, so it can still de-duplicate by identity', () => {
    const { api } = gated();
    const seen: unknown[] = [];
    (api as unknown as { subscribeJobEnded: (handler: unknown) => () => void }).subscribeJobEnded = (handler) => {
      seen.push(handler);
      return () => undefined;
    };
    const wrapped = withCoalescedReads(api);
    const handler = () => undefined;
    wrapped.subscribeJobEnded(handler);
    wrapped.subscribeJobEnded(handler);
    expect(seen[0]).toBe(seen[1]);
  });

  it('gives each caller its own copy, so one that edits its list does not change another', async () => {
    const { api, waiting } = gated();
    const wrapped = withCoalescedReads(api);
    const first = wrapped.manuscriptChapters();
    const second = wrapped.manuscriptChapters();
    waiting[0]!.resolve([{ id: 'c1' }]);
    const [a, b] = await Promise.all([first, second]);
    (a as { id: string }[])[0]!.id = 'changed';
    expect((b as { id: string }[])[0]!.id).toBe('c1');
  });

  it('rejects every caller that joined a failed call, then asks the host again', async () => {
    const { api, calls, waiting } = gated();
    const wrapped = withCoalescedReads(api);
    const first = wrapped.manuscriptChapters();
    const second = wrapped.manuscriptChapters();
    waiting[0]!.reject(new Error('host down'));
    await expect(first).rejects.toThrow('host down');
    await expect(second).rejects.toThrow('host down');
    void wrapped.manuscriptChapters();
    expect(calls).toEqual(['manuscriptChapters', 'manuscriptChapters']);
  });

  it('hands out the same function for a method every time', () => {
    const { api } = gated();
    const wrapped = withCoalescedReads(api);
    expect(wrapped.manuscriptChapters).toBe(wrapped.manuscriptChapters);
    expect(wrapped.subscribeJobEnded).toBe(wrapped.subscribeJobEnded);
  });

  it('sends a read asked from an event handler to the host, even with an identical read that began before the event still in flight', () => {
    const { api, calls } = gated();
    let fire: () => void = () => undefined;
    (api as unknown as { subscribeJobEnded: (handler: () => void) => () => void }).subscribeJobEnded = (handler) => {
      fire = handler;
      return () => undefined;
    };
    const wrapped = withCoalescedReads(api);
    let rereads = 0;
    wrapped.subscribeJobEnded(() => {
      rereads += 1;
      void wrapped.manuscriptChapters();
    });
    void wrapped.manuscriptChapters(); // a poll, begun before the event
    fire(); // the host says something changed
    expect(rereads).toBe(1);
    expect(calls).toEqual(['manuscriptChapters', 'manuscriptChapters']);
  });

  it('answers a joiner of an answer that cannot be copied with the answer, not an error', async () => {
    const { api, waiting } = gated();
    const wrapped = withCoalescedReads(api);
    const first = wrapped.manuscriptChapters();
    const second = wrapped.manuscriptChapters();
    const answer = { f() {} };
    waiting[0]!.resolve(answer);
    expect(await Promise.all([first, second])).toEqual([answer, answer]);
  });

  it.each([
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['a BigInt', 1n],
    ['a Map', new Map([[1, 2]])],
    [
      'a cycle',
      (() => {
        const loop: Record<string, unknown> = {};
        loop.self = loop;
        return loop;
      })(),
    ],
  ])('never shares a read whose argument is %s', (_name, argument) => {
    const { api, calls } = gated();
    const wrapped = withCoalescedReads(api);
    const read = wrapped.settingsForScope as (...args: unknown[]) => unknown;
    expect(() => {
      void read(argument);
      void read(argument);
    }).not.toThrow();
    expect(calls).toEqual(['settingsForScope', 'settingsForScope']);
  });

  it('lists only methods the api has, and none that changes anything', () => {
    const api = createMockApi();
    for (const name of COALESCED_READS) expect(typeof (api as unknown as Record<string, unknown>)[name], name).toBe('function');
    expect(
      [...COALESCED_READS].filter((name) => /^(set|save|delete|remove|create|add|start|stop|cancel|clear|apply|commit|import|write|reset)[A-Z]/.test(name)),
    ).toEqual([]);
  });
});
