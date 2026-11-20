// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createMockApi } from './mockApi';
import { COALESCED_READS, KEPT_DROPPING_EVENTS, KEPT_MAX_AGE_MS, KEPT_READS, KEPT_REVALIDATE_MS, KEPT_WRITERS, withCoalescedReads } from './withCoalescedReads';
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
    saveSettings: method('saveSettings'),
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

describe('withCoalescedReads: kept reads (#3658)', () => {
  /** An api whose settings answer at once with a counter, so a repeat reads a different value than the first. */
  function counting() {
    const handlers: ((event: unknown) => void)[] = [];
    let reads = 0;
    const api = {
      settingsForScope: vi.fn(async (_scope: string) => ({ n: [{ value: String(++reads) }] })),
      saveSettings: vi.fn(async () => ({})),
      subscribeJobEnded: vi.fn((handler: (event: unknown) => void) => {
        handlers.push(handler);
        return () => undefined;
      }),
      subscribeRecorderLevel: vi.fn((handler: (event: unknown) => void) => {
        handlers.push(handler);
        return () => undefined;
      }),
      subscribeProjectAttach: vi.fn((handler: (event: unknown) => void) => {
        handlers.push(handler);
        return () => undefined;
      }),
      subscribeProjectState: vi.fn((handler: (event: unknown) => void) => {
        handlers.push(handler);
        return () => undefined;
      }),
    } as unknown as NarrationApi;
    return { api, handlers, reads: () => reads };
  }
  const value = async (answer: Promise<unknown>) => ((await answer) as { n: { value: string }[] }).n[0]!.value;

  it('answers a settings read the page already has from what the first read answered, with no second host call', async () => {
    const { api, reads } = counting();
    const wrapped = withCoalescedReads(api);
    expect(await value(wrapped.settingsForScope('global'))).toBe('1');
    expect(await value(wrapped.settingsForScope('global'))).toBe('1');
    expect(await value(wrapped.settingsForScope('global'))).toBe('1');
    expect(reads()).toBe(1);
  });

  it('keeps each scope on its own', async () => {
    const { api, reads } = counting();
    const wrapped = withCoalescedReads(api);
    await wrapped.settingsForScope('global');
    await wrapped.settingsForScope('project');
    await wrapped.settingsForScope('global');
    expect(reads()).toBe(2);
  });

  it('reads again after saveSettings, so a page never sees a value older than its own save', async () => {
    const { api, reads } = counting();
    const wrapped = withCoalescedReads(api);
    await wrapped.settingsForScope('global');
    await wrapped.saveSettings('tool', 'global', { a: 'b' });
    expect(await value(wrapped.settingsForScope('global'))).toBe('2');
    expect(reads()).toBe(2);
  });

  it('does not keep an answer read while a save was running', async () => {
    const { api, reads } = counting();
    let finish: () => void = () => undefined;
    (api as unknown as { saveSettings: unknown }).saveSettings = vi.fn(() => new Promise((resolve) => (finish = () => resolve({}))));
    const wrapped = withCoalescedReads(api);
    const saving = wrapped.saveSettings('tool', 'global', {});
    await wrapped.settingsForScope('global');
    finish();
    await saving;
    await wrapped.settingsForScope('global');
    expect(reads()).toBe(2);
  });

  it('reads again after a project or job event, but not after a recorder event', async () => {
    const { api, handlers, reads } = counting();
    const wrapped = withCoalescedReads(api);
    wrapped.subscribeJobEnded(() => undefined);
    wrapped.subscribeRecorderLevel(() => undefined);
    await wrapped.settingsForScope('global');
    handlers[1]!({});
    await wrapped.settingsForScope('global');
    expect(reads()).toBe(1);
    handlers[0]!({});
    await wrapped.settingsForScope('global');
    expect(reads()).toBe(2);
  });

  it.each(['subscribeProjectAttach', 'subscribeProjectState', 'subscribeJobEnded'] as const)(
    "reads again after %s fires: a project switch never serves the last project's settings",
    async (event) => {
      const { api, handlers, reads } = counting();
      const wrapped = withCoalescedReads(api);
      const before = handlers.length;
      (wrapped[event] as (handler: () => void) => unknown)(() => undefined);
      await wrapped.settingsForScope('global');
      handlers[before]!({});
      await wrapped.settingsForScope('global');
      expect(reads()).toBe(2);
    },
  );

  it('reads again after the window becomes visible again', async () => {
    const { api, reads } = counting();
    const wrapped = withCoalescedReads(api);
    await wrapped.settingsForScope('global');
    document.dispatchEvent(new Event('visibilitychange'));
    await wrapped.settingsForScope('global');
    expect(reads()).toBe(2);
  });

  it('reads again after the window is focused', async () => {
    const { api, reads } = counting();
    const wrapped = withCoalescedReads(api);
    await wrapped.settingsForScope('global');
    window.dispatchEvent(new Event('focus'));
    await wrapped.settingsForScope('global');
    expect(reads()).toBe(2);
  });

  it('serves a kept answer past the revalidate age and reads again in the background for the next reader', async () => {
    vi.useFakeTimers();
    try {
      const { api, reads } = counting();
      const wrapped = withCoalescedReads(api);
      await wrapped.settingsForScope('global');
      vi.setSystemTime(Date.now() + KEPT_REVALIDATE_MS + 1);
      expect(await value(wrapped.settingsForScope('global'))).toBe('1');
      await vi.advanceTimersByTimeAsync(0);
      expect(reads()).toBe(2);
      expect(await value(wrapped.settingsForScope('global'))).toBe('2');
      expect(reads()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps what was kept when the background re-read fails', async () => {
    vi.useFakeTimers();
    try {
      const { api, reads } = counting();
      const wrapped = withCoalescedReads(api);
      await wrapped.settingsForScope('global');
      const read = api.settingsForScope as unknown as { mockRejectedValueOnce: (error: Error) => void };
      read.mockRejectedValueOnce(new Error('offline'));
      vi.setSystemTime(Date.now() + KEPT_REVALIDATE_MS + 1);
      expect(await value(wrapped.settingsForScope('global'))).toBe('1');
      await vi.advanceTimersByTimeAsync(0);
      // The kept answer is still served; being past the revalidate age it asks the host again, which now answers.
      expect(await value(wrapped.settingsForScope('global'))).toBe('1');
      await vi.advanceTimersByTimeAsync(0);
      expect(reads()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks the host once the kept answer is past its maximum age', async () => {
    vi.useFakeTimers();
    try {
      const { api, reads } = counting();
      const wrapped = withCoalescedReads(api);
      await wrapped.settingsForScope('global');
      vi.setSystemTime(Date.now() + KEPT_MAX_AGE_MS + 1);
      expect(await value(wrapped.settingsForScope('global'))).toBe('2');
      expect(reads()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a failed read out, and gives each reader its own copy of a kept answer', async () => {
    const { api, reads } = counting();
    const failing = vi
      .fn()
      .mockRejectedValueOnce(new Error('no'))
      .mockImplementation(async () => ({ n: [{ value: String(reads()) }] }));
    (api as unknown as { settingsForScope: unknown }).settingsForScope = failing;
    const wrapped = withCoalescedReads(api);
    await expect(wrapped.settingsForScope('global')).rejects.toThrow('no');
    const first = (await wrapped.settingsForScope('global')) as unknown as { n: { value: string }[] };
    first.n[0]!.value = 'edited';
    const second = (await wrapped.settingsForScope('global')) as unknown as { n: { value: string }[] };
    expect(second.n[0]!.value).toBe('0');
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('does not let a settings read that never answers capture every later settings read', () => {
    const { api, calls } = gated();
    const wrapped = withCoalescedReads(api);
    void wrapped.settingsForScope('global');
    void wrapped.manuscriptSetChapterStatus('c1', 'finalized'); // any other call moves the epoch
    void wrapped.settingsForScope('global');
    expect(calls).toEqual(['settingsForScope', 'manuscriptSetChapterStatus', 'settingsForScope']);
  });

  it.each(['switchProject', 'createProject'] as const)('drops the kept answer when %s answers, with no event delivered', async (writer) => {
    const { api, reads } = counting();
    (api as unknown as Record<string, unknown>)[writer] = vi.fn(async () => ({}));
    const wrapped = withCoalescedReads(api);
    await wrapped.settingsForScope('project');
    await (wrapped as unknown as Record<string, () => Promise<unknown>>)[writer]!();
    expect(await value(wrapped.settingsForScope('project'))).toBe('2');
    expect(reads()).toBe(2);
  });

  it('serves the kept answer while its background re-read has not answered, and to every reader', async () => {
    vi.useFakeTimers();
    try {
      const { api } = counting();
      const wrapped = withCoalescedReads(api);
      await wrapped.settingsForScope('global');
      (api.settingsForScope as unknown as { mockImplementation: (impl: () => Promise<unknown>) => void }).mockImplementation(
        () => new Promise(() => undefined),
      );
      vi.setSystemTime(Date.now() + KEPT_REVALIDATE_MS + 1);
      expect(await value(wrapped.settingsForScope('global'))).toBe('1');
      expect(await value(wrapped.settingsForScope('global'))).toBe('1');
      expect(await value(wrapped.settingsForScope('global'))).toBe('1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects no reader when the background re-read fails or throws, and serves the kept answer', async () => {
    vi.useFakeTimers();
    try {
      const { api } = counting();
      const wrapped = withCoalescedReads(api);
      await wrapped.settingsForScope('global');
      const failing = api.settingsForScope as unknown as ReturnType<typeof vi.fn>;
      failing.mockClear();
      failing.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => {
        throw new Error('sync');
      });
      vi.setSystemTime(Date.now() + KEPT_REVALIDATE_MS + 1);
      const first = Promise.all([wrapped.settingsForScope('global'), wrapped.settingsForScope('global')]);
      await expect(first).resolves.toHaveLength(2);
      await vi.advanceTimersByTimeAsync(0);
      await expect(wrapped.settingsForScope('global')).resolves.toBeTruthy();
      expect(failing).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a clock set back as an expired answer, not one that never ages', async () => {
    vi.useFakeTimers();
    try {
      const { api, reads } = counting();
      const wrapped = withCoalescedReads(api);
      await wrapped.settingsForScope('global');
      vi.setSystemTime(Date.now() - 3_600_000);
      await wrapped.settingsForScope('global');
      expect(reads()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not keep an answer that cannot be copied, so no reader shares the first caller's object", async () => {
    const answer = { n: [{ value: '1' }], run: () => undefined };
    const api = { settingsForScope: vi.fn(async () => answer), subscribeJobEnded: vi.fn(() => () => undefined) } as unknown as NarrationApi;
    const wrapped = withCoalescedReads(api);
    await wrapped.settingsForScope('global');
    await wrapped.settingsForScope('global');
    expect(api.settingsForScope).toHaveBeenCalledTimes(2);
  });

  it('pins what is kept and what drops it: a new entry is a deliberate edit', () => {
    expect([...KEPT_READS]).toEqual(['settingsForScope']);
    expect([...KEPT_WRITERS]).toEqual(['saveSettings', 'switchProject', 'createProject']);
    expect([...KEPT_DROPPING_EVENTS]).toEqual(['subscribeProjectAttach', 'subscribeProjectState', 'subscribeJobEnded']);
    for (const name of KEPT_READS) expect(COALESCED_READS.has(name)).toBe(true);
  });
});
