// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from './mockApi';
import { flushTrace, setTraceSink, trace, traceHostEvent, traceId, FLUSH_MS } from './tracing';
import { withTracing } from './withTracing';

type Batch = { events: { event: string; fields: Record<string, unknown> }[] };

let sent: Batch[];
beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  setTraceSink(async (batch) => {
    sent.push(JSON.parse(batch) as Batch);
  });
});
afterEach(() => {
  setTraceSink(undefined);
  vi.useRealTimers();
});

describe('traceId', () => {
  it('writes a binding name in the registry alphabet', () => {
    expect(traceId('SystemOpenLogFolder')).toBe('system_open_log_folder');
    expect(traceId('teleprompter:event')).toBe('teleprompter:event');
    expect(traceId('Bücher & Café')).toMatch(/^[a-z0-9_.:-]{1,64}$/);
    expect(traceId('')).toBe('unknown');
    expect(traceId('x'.repeat(100))).toHaveLength(64);
  });
});

describe('the batcher', () => {
  it('keeps a batch the host refused and sends it at the next window', async () => {
    let fail = true;
    const got: Batch[] = [];
    setTraceSink(async (batch) => {
      if (fail) throw new Error('host away');
      got.push(JSON.parse(batch) as Batch);
    });
    trace('ui.nav', { page: 'script' });
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    expect(got).toHaveLength(0);
    fail = false;
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    expect(got).toHaveLength(1);
    expect(got[0].events[0].event).toBe('ui.nav');
  });

  it('sends queued events together after the window, and counts live events once', async () => {
    trace('ui.nav', { page: 'script' });
    trace('ui.nav', { page: 'booth' });
    traceHostEvent('recorder:level');
    traceHostEvent('recorder:level');
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    expect(sent).toHaveLength(1);
    expect(sent[0].events.map((event) => event.event)).toEqual(['ui.nav', 'ui.nav', 'ui.host_event']);
    expect(sent[0].events[2].fields).toEqual({ name: 'recorder:level', count: 2 });
  });

  it('splits a long queue into batches the host accepts', async () => {
    for (let i = 0; i < 250; i += 1) trace('ui.nav', { page: 'a' });
    await flushTrace();
    expect(sent.map((batch) => batch.events.length)).toEqual([100, 100, 50]);
  });

  it('keeps the newest events when a flood arrives and never throws when the host refuses', async () => {
    setTraceSink(async () => {
      throw new Error('host gone');
    });
    for (let i = 0; i < 2000; i += 1) trace('ui.nav', { page: 'a' });
    await expect(flushTrace()).resolves.toBeUndefined();
  });

  it('does nothing while tracing is off', async () => {
    setTraceSink(undefined);
    trace('ui.nav', { page: 'a' });
    traceHostEvent('x');
    await flushTrace();
    expect(sent).toHaveLength(0);
  });
});

describe('withTracing', () => {
  it('records the name, duration and outcome of a call and never its arguments or answer', async () => {
    const api = withTracing(createMockApi({ systemLookup: async () => ({ word: 'SECRET-CANARY' }) as never }));
    await api.systemLookup('SECRET-CANARY');
    await flushTrace();
    const calls = sent.flatMap((batch) => batch.events).filter((event) => event.event === 'ui.binding');
    expect(calls).toHaveLength(1);
    expect(calls[0].fields).toMatchObject({ name: 'system_lookup', outcome: 'ok' });
    expect(JSON.stringify(sent)).not.toContain('CANARY');
  });

  it('records a rejection as an error with a class and rethrows it untouched', async () => {
    const failure = new Error('C:/Users/zelda/Book.docx is broken');
    const api = withTracing(
      createMockApi({
        systemLookup: async () => {
          throw failure;
        },
      }),
    );
    await expect(api.systemLookup('a')).rejects.toBe(failure);
    await flushTrace();
    const call = sent.flatMap((batch) => batch.events).find((event) => event.event === 'ui.binding');
    expect(call?.fields).toMatchObject({ outcome: 'error', err: 'other' });
    expect(JSON.stringify(sent)).not.toContain('zelda');
  });

  it('leaves subscriptions and the trace call itself untraced, and traces every other method', () => {
    const raw = createMockApi();
    const traced = withTracing(raw);
    const untraced: string[] = [];
    for (const key of Object.keys(raw) as (keyof typeof raw)[]) {
      if (typeof raw[key] !== 'function') continue;
      if (traced[key] === raw[key]) untraced.push(String(key));
    }
    // A method that is neither a subscription nor the trace call must be traced: a new binding needs no code, and none may slip out.
    expect(untraced.filter((name) => !name.startsWith('subscribe') && name !== 'systemTraceBatch')).toEqual([]);
    expect(untraced).toContain('systemTraceBatch');
  });
});
