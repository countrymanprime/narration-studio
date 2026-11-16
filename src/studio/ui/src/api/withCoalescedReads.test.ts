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

  it('hands out the same function for a method every time, and leaves subscriptions alone', () => {
    const { api } = gated();
    const wrapped = withCoalescedReads(api);
    expect(wrapped.manuscriptChapters).toBe(wrapped.manuscriptChapters);
    expect(wrapped.subscribeJobEnded).toBe(api.subscribeJobEnded);
  });

  it('lists only methods the api has, and none that changes anything', () => {
    const api = createMockApi();
    for (const name of COALESCED_READS) expect(typeof (api as unknown as Record<string, unknown>)[name], name).toBe('function');
    expect(
      [...COALESCED_READS].filter((name) => /^(set|save|delete|remove|create|add|start|stop|cancel|clear|apply|commit|import|write|reset)[A-Z]/.test(name)),
    ).toEqual([]);
  });
});
