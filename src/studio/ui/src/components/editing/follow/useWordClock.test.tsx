// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { DawMockControl } from '../../../api/dawMock';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { ScriptDoc } from '../script/ScriptDoc';
import { marksDoc } from '../script/scriptFixtures';
import { useScriptPlayback } from '../bar/useScriptPlayback';
import { EXTRAPOLATE_MS } from './useDawTransportSync';
import { useWordClock, WORD_TIMES_READ_LIMIT_MS } from './useWordClock';
import { linear, wordTimesFor } from './wordTimesFixtures';

const doc = marksDoc();
const words = doc.items.filter((i) => i.kind === 'w' && i.t0 != null && i.t1 != null && (i.t1 as number) > (i.t0 as number));
const tokens = wordTimesFor(doc, () => null).tokenOf;
const table = (version: string, place: Parameters<typeof wordTimesFor>[1]) => wordTimesFor(doc, place, { version }).table;

let daw: DawMockControl;
let capsNow: DawCapabilities | null = DAW_SETUPS.reaper;

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}

function Harness() {
  const page = useEditingPage();
  const { clock, pending } = useWordClock('c1', doc, tokens, capsNow);
  useScriptPlayback({ playlist: [], mediaUrl: (f) => f, sync: { clock, caps: capsNow } });
  return (
    <div>
      <output data-testid="pending">{String(pending)}</output>
      <output data-testid="version">{clock?.version ?? 'none'}</output>
      <output data-testid="project">{String(clock?.projectAt(words[0].t0 as number) ?? null)}</output>
      <output data-testid="playT">{String(page.state.playT)}</output>
      <ScriptDoc />
    </div>
  );
}
const wait = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const text = (id: string): string => screen.getByTestId(id).textContent ?? '';
const lit = (): string | null => document.querySelector('[data-now]')?.getAttribute('data-k') ?? null;
const mount = async (seed?: Parameters<typeof createMockApi>[1]) => {
  const api = createMockApi({}, seed ?? { daw: {} });
  daw = window.__NARRATION_MOCK_DAW__ as DawMockControl;
  const ui = () => (
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <Harness />
      </EditingPageProvider>
    </ApiProvider>
  );
  const shown = render(ui());
  /** Renders again with whatever `capsNow` is now. */
  const again = () => shown.rerender(ui());
  return { api, ...shown, again };
};

beforeEach(() => {
  capsNow = DAW_SETUPS.reaper;
  vi.useFakeTimers();
  vi.stubGlobal('Audio', function () {
    return new FakeAudio();
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the page asks the host for where its words play', () => {
  it('has no map while the DAW cannot make a table, and a map once it can', async () => {
    await mount();
    await wait(10);
    expect(text('version')).toBe('none');
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    expect(text('version')).toBe('rec@1');
    expect(Number(text('project'))).toBeCloseTo(100 + (words[0].t0 as number), 6);
  });

  it('says it is still asking until the host has answered, then not, whether or not it made a table', async () => {
    await mount();
    expect(text('pending')).toBe('true');
    await wait(10);
    expect(text('pending')).toBe('false');
    expect(text('version')).toBe('none');
  });

  it('asks again each time the DAW is edited, and takes the newer table', async () => {
    await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    daw.setWordTimes(table('rec@2', linear(300)));
    daw.editInDaw();
    await wait(10);
    expect(text('version')).toBe('rec@2');
    expect(Number(text('project'))).toBeCloseTo(300 + (words[0].t0 as number), 6);
  });

  it('does not read the table again for an edit report that carries the count it holds (a chapter move REAPER did not count)', async () => {
    const { api } = await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const asked = vi.spyOn(api, 'workspaceWordTimes');
    daw.reportProjectCount();
    daw.reportProjectCount();
    await wait(10);
    expect(asked).not.toHaveBeenCalled();
    daw.editInDaw();
    await wait(10);
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('reads again for an edit that arrived while a read that then failed was out (#3722)', async () => {
    const { api } = await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const real = api.workspaceWordTimes.bind(api);
    let calls = 0;
    const asked = vi.spyOn(api, 'workspaceWordTimes').mockImplementation(async (id: string) => {
      calls += 1;
      if (calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        throw new Error('The host did not answer.');
      }
      return real(id);
    });
    daw.setWordTimes(table('rec@2', linear(300)));
    daw.editInDaw();
    await wait(100);
    daw.editInDaw();
    await wait(2000);
    expect(asked).toHaveBeenCalledTimes(2);
    expect(text('version')).toBe('rec@2');
    await wait(3000);
    expect(asked).toHaveBeenCalledTimes(2);
  });

  it('a run of window hides and shows makes one read in flight and one after it, and keeps the map meanwhile (#3723)', async () => {
    const { api } = await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    expect(text('version')).toBe('rec@1');
    const real = api.workspaceWordTimes.bind(api);
    const asked = vi.spyOn(api, 'workspaceWordTimes').mockImplementation(async (id: string) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return real(id);
    });
    for (let i = 0; i < 20; i++) {
      const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(i % 2 === 0 ? 'hidden' : 'visible');
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await wait(10);
      state.mockRestore();
    }
    // The window ended up visible (the last flip, i = 19): the map was never dropped on the way.
    expect(text('version')).toBe('rec@1');
    await wait(2000);
    expect(asked.mock.calls.length).toBeLessThanOrEqual(2);
    expect(text('version')).toBe('rec@1');
  });

  it('reads again for an edit that came while the opening read, which then failed, was out (#3722)', async () => {
    const { api } = await mount();
    const real = api.workspaceWordTimes.bind(api);
    let calls = 0;
    const asked = vi.spyOn(api, 'workspaceWordTimes').mockImplementation(async (id: string) => {
      calls += 1;
      if (calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        throw new Error('The host did not answer.');
      }
      return real(id);
    });
    daw.setWordTimes(table('rec@1', linear(100)));
    act(() => daw.editInDaw());
    await wait(100);
    daw.editInDaw();
    await wait(2000);
    expect(asked.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(text('version')).toBe('rec@1');
  });

  it('never has two reads in flight through a run of window flips (#3723)', async () => {
    const { api } = await mount();
    const real = api.workspaceWordTimes.bind(api);
    let out = 0;
    let most = 0;
    vi.spyOn(api, 'workspaceWordTimes').mockImplementation(async (id: string) => {
      out += 1;
      most = Math.max(most, out);
      await new Promise((resolve) => setTimeout(resolve, 300));
      out -= 1;
      return real(id);
    });
    for (let i = 0; i < 20; i++) {
      const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(i % 2 === 0 ? 'hidden' : 'visible');
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await wait(10);
      state.mockRestore();
    }
    await wait(2000);
    expect(most).toBe(1);
  });

  it('makes one read on a show after a read that ended while the window was hidden, with an edit waiting behind it', async () => {
    const { api } = await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const real = api.workspaceWordTimes.bind(api);
    const asked = vi.spyOn(api, 'workspaceWordTimes').mockImplementation(async (id: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return real(id);
    });
    daw.editInDaw();
    await wait(100);
    daw.editInDaw();
    await wait(100);
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await wait(1500);
    hidden.mockRestore();
    const before = asked.mock.calls.length;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await wait(3000);
    expect(asked.mock.calls.length - before).toBe(1);
  });

  it('gives up on a read that never settles, so a later edit is read (#3664)', async () => {
    const { api } = await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const real = api.workspaceWordTimes.bind(api);
    let calls = 0;
    vi.spyOn(api, 'workspaceWordTimes').mockImplementation((id: string) => {
      calls += 1;
      return calls === 1 ? new Promise<never>(() => undefined) : real(id);
    });
    daw.setWordTimes(table('rec@2', linear(300)));
    daw.editInDaw();
    await wait(WORD_TIMES_READ_LIMIT_MS + 1000);
    expect(text('version')).toBe('rec@1');
    daw.editInDaw();
    await wait(50);
    expect(text('version')).toBe('rec@2');
  });

  it('replaces a read that hangs once something waits behind it and the limit passes, with no further event, and makes that read once', async () => {
    const { api } = await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const real = api.workspaceWordTimes.bind(api);
    let calls = 0;
    const asked = vi.spyOn(api, 'workspaceWordTimes').mockImplementation((id: string) => {
      calls += 1;
      return calls === 1 ? new Promise<never>(() => undefined) : real(id);
    });
    daw.setWordTimes(table('rec@2', linear(300)));
    daw.editInDaw();
    await wait(1000);
    daw.editInDaw();
    await wait(WORD_TIMES_READ_LIMIT_MS + 1000);
    expect(asked).toHaveBeenCalledTimes(2);
    expect(text('version')).toBe('rec@2');
  });

  it('takes the late answer of a read given up on when nothing newer has answered, and never over a newer one', async () => {
    const { api } = await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const settle: Array<(answer: Awaited<ReturnType<typeof api.workspaceWordTimes>>) => void> = [];
    vi.spyOn(api, 'workspaceWordTimes').mockImplementation(() => new Promise((resolve) => settle.push(resolve)));
    daw.editInDaw();
    await wait(WORD_TIMES_READ_LIMIT_MS + 100);
    daw.editInDaw();
    await wait(10);
    expect(settle).toHaveLength(2);
    settle[0](table('rec@old', linear(200)));
    await wait(10);
    expect(text('version')).toBe('rec@old');
    settle[1](table('rec@new', linear(300)));
    await wait(10);
    expect(text('version')).toBe('rec@new');
  });

  it('does not take an older answer over a newer one, and a late failure of a given-up read starts no third read', async () => {
    const { api } = await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const settle: Array<{ resolve: (answer: Awaited<ReturnType<typeof api.workspaceWordTimes>>) => void; reject: (reason: Error) => void }> = [];
    const asked = vi.spyOn(api, 'workspaceWordTimes').mockImplementation(() => new Promise((resolve, reject) => settle.push({ resolve, reject })));
    daw.editInDaw();
    await wait(WORD_TIMES_READ_LIMIT_MS + 100);
    daw.editInDaw();
    await wait(10);
    settle[1].resolve(table('rec@new', linear(300)));
    await wait(10);
    expect(text('version')).toBe('rec@new');
    settle[0].resolve(table('rec@old', linear(200)));
    await wait(10);
    expect(text('version')).toBe('rec@new');
    expect(asked).toHaveBeenCalledTimes(2);

    daw.editInDaw();
    await wait(WORD_TIMES_READ_LIMIT_MS + 100);
    daw.editInDaw();
    await wait(10);
    const before = asked.mock.calls.length;
    settle[settle.length - 2].reject(new Error('late'));
    await wait(100);
    expect(asked.mock.calls.length).toBe(before);
  });

  it('a system clock set back while a read hangs does not stop the later reads', async () => {
    const { api } = await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const real = api.workspaceWordTimes.bind(api);
    let calls = 0;
    vi.spyOn(api, 'workspaceWordTimes').mockImplementation((id: string) => {
      calls += 1;
      return calls === 1 ? new Promise<never>(() => undefined) : real(id);
    });
    daw.editInDaw();
    await wait(100);
    vi.setSystemTime(Date.now() - 3_600_000);
    daw.setWordTimes(table('rec@2', linear(300)));
    await wait(WORD_TIMES_READ_LIMIT_MS + 1000);
    daw.editInDaw();
    await wait(50);
    expect(text('version')).toBe('rec@2');
  });

  it('drops the answer of a read that was out when the DAW stopped being able to make a table, and shows no map', async () => {
    const { api, again } = await mount();
    const real = api.workspaceWordTimes.bind(api);
    vi.spyOn(api, 'workspaceWordTimes').mockImplementation(async (id: string) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return real(id);
    });
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(100);
    capsNow = null;
    act(() => again());
    await wait(1000);
    expect(text('version')).toBe('none');
  });

  it('drops the map when the DAW can no longer make a table', async () => {
    await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    daw.setWordTimes(null);
    daw.editInDaw();
    await wait(10);
    expect(text('version')).toBe('none');
  });

  it('asks nothing of a DAW that is not answering', async () => {
    const { api } = await mount({ daw: { reachable: false } });
    const asked = vi.spyOn(api, 'workspaceWordTimes');
    await wait(50);
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("the lit word advances word by word between the DAW's readings", () => {
  it('carries the play head on between two readings and lights each word as its time comes', async () => {
    await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const a = words[0];
    const b = words[1];
    act(() => daw.moveInDaw({ playing: true, head: 100 + (a.t0 as number) + 0.01 }));
    await wait(5);
    expect(lit()).toBe(a.key);
    // No further reading; the page carries the head on to the next word.
    // A render happens between two carried readings, as it does in the page.
    const span = ((b.t0 as number) - (a.t0 as number) + 0.05) * 1000;
    for (let elapsed = 0; elapsed < span; elapsed += EXTRAPOLATE_MS) await wait(EXTRAPOLATE_MS);
    expect(lit()).toBe(b.key);
  });

  it('does not carry a head on for more than a moment when the DAW goes quiet', async () => {
    await mount();
    daw.setWordTimes(table('rec@1', linear(100)));
    daw.editInDaw();
    await wait(10);
    const first = words[0];
    act(() => daw.moveInDaw({ playing: true, head: 100 + (first.t0 as number) + 0.01 }));
    await wait(5);
    for (let elapsed = 0; elapsed < 2000; elapsed += EXTRAPOLATE_MS) await wait(EXTRAPOLATE_MS);
    const lastLit = lit();
    const last = words.findIndex((w) => w.key === lastLit);
    expect(last).toBeLessThanOrEqual(3);
  });
});
