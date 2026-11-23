// @vitest-environment jsdom
import { cleanup, render as renderTree, renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import type { DawCapabilities } from '../api/contracts/daw';
import type { ScopedSettingField } from '../api/contracts/system';
import { createMockApi } from '../api/mockApi';
import type { NarrationApi } from '../types';
import { resetSoloDebtForTest, useDawSoloesChapter, useRetryOwedSoloRestore } from './useDawSoloesChapter';

afterEach(() => {
  cleanup();
  resetSoloDebtForTest();
});

const done = { ok: true, changed: true, message: '', undoSteps: 0 };

async function capsWith(followAvailable: boolean): Promise<DawCapabilities> {
  const caps = await createMockApi().dawCapabilities();
  const entry = caps.capabilities.follow_position;
  return { ...caps, capabilities: { ...caps.capabilities, follow_position: { ...entry, available: followAvailable } } };
}

const setting = (value: string): Record<string, ScopedSettingField[]> => ({
  Booth: [{ key: 'follow_chapter_in_daw', label: 'x', kind: 'bool', choices: [], value, isSet: true, effectiveValue: value, effectiveSource: 'repo default' }],
});

async function render(options: { available?: boolean; setting?: string; chapterId?: string; log?: string[]; solo?: NarrationApi['dawSoloChapter'] }) {
  const log = options.log ?? [];
  const dawSoloChapter = vi.fn(options.solo ?? (async (id: string) => (log.push(`solo ${id}`), done)));
  const dawSoloRestore = vi.fn(async () => (log.push('restore'), done));
  const caps = await capsWith(options.available ?? true);
  const api = createMockApi({
    dawSoloChapter,
    dawSoloRestore,
    settingsForScope: async () => setting(options.setting ?? 'true'),
    dawCapabilities: async () => caps,
    subscribeDawCapabilities: () => () => undefined,
  });
  const hook = renderHook(({ id }: { id: string | undefined }) => useDawSoloesChapter(id), {
    initialProps: { id: options.chapterId ?? 'c-1' },
    wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>,
  });
  return { dawSoloChapter, dawSoloRestore, log, ...hook };
}

describe('useDawSoloesChapter', () => {
  it('soloes the chapter once the setting and the DAW say so, and puts it back when the page is left', async () => {
    const { dawSoloChapter, dawSoloRestore, unmount } = await render({});
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledExactlyOnceWith('c-1'));
    expect(dawSoloRestore).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
  });

  it('asks for the next chapter when the same page is given another one (the Booth remounts, so this is the hook only)', async () => {
    const { dawSoloChapter, dawSoloRestore, rerender } = await render({});
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    rerender({ id: 'c-2' });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenLastCalledWith('c-2'));
    expect(dawSoloRestore).not.toHaveBeenCalled();
  });

  it('puts the chapter back when the page stays open but has no chapter in view any more', async () => {
    const { dawSoloChapter, dawSoloRestore, rerender } = await render({});
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    rerender({ id: '' });
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
    rerender({ id: 'c-2' });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenLastCalledWith('c-2'));
  });

  it('keeps the calls in the order the page made them, so a chapter entered just after one was left stays soloed', async () => {
    const log: string[] = [];
    let release: () => void = () => undefined;
    const first = new Promise<void>((resolve) => (release = resolve));
    const { unmount, dawSoloChapter } = await render({
      log,
      solo: async (id: string) => {
        log.push(`solo ${id}`);
        if (log.length === 1) await first;
        return done;
      },
    });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    unmount();
    const second = await render({ log, chapterId: 'c-2' });
    await act(async () => {});
    expect(log).toEqual(['solo c-1']);
    release();
    await waitFor(() => expect(second.dawSoloChapter).toHaveBeenCalledTimes(1));
    expect(log).toEqual(['solo c-1', 'restore', 'solo c-2']);
  });

  it('puts it back when the switch turns off or the DAW cannot follow any more', async () => {
    const real = await capsWith(true);
    const off = await capsWith(false);
    let push: (caps: DawCapabilities) => void = () => undefined;
    const dawSoloChapter = vi.fn(async () => done);
    const dawSoloRestore = vi.fn(async () => done);
    const api = createMockApi({
      dawSoloChapter,
      dawSoloRestore,
      settingsForScope: async () => setting('true'),
      dawCapabilities: async () => real,
      subscribeDawCapabilities: (onUpdate: (caps: DawCapabilities) => void) => {
        push = onUpdate;
        return () => undefined;
      },
    });
    renderHook(() => useDawSoloesChapter('c-1'), { wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider> });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    act(() => push(off));
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['the setting is off', { setting: 'false' }],
    ['the DAW cannot follow', { available: false }],
    ['no chapter is in view', { chapterId: '' }],
  ])('solos nothing and restores nothing when %s', async (_name, options) => {
    const { dawSoloChapter, dawSoloRestore, unmount } = await render(options);
    await act(async () => {});
    await act(async () => {});
    unmount();
    await act(async () => {});
    expect(dawSoloChapter).not.toHaveBeenCalled();
    expect(dawSoloRestore).not.toHaveBeenCalled();
  });

  it('says nothing when the DAW refuses or a call fails, and still puts it back', async () => {
    const log: string[] = [];
    const { result, unmount, dawSoloRestore, dawSoloChapter } = await render({
      log,
      solo: async () => {
        throw new Error('bridge down');
      },
    });
    await waitFor(() => expect(dawSoloChapter).toHaveBeenCalledTimes(1));
    expect(dawSoloRestore).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
    unmount();
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
  });
});

describe('a restore that did not reach the DAW', () => {
  const hostSentence = "REAPER could not unsolo the chapter's track, so others may stay silent. Unsolo it in REAPER.";
  const failed = { ok: false, changed: false, message: hostSentence, undoSteps: 0, refused: hostSentence };

  /** A DAW with a state: the chapter it holds soloed. `restoreAnswers` scripts the next restores ('fail', 'throw', or ok when empty). */
  async function daw(setSwitch = 'true', strict = true) {
    const real = await capsWith(true);
    const off = await capsWith(false);
    const listeners = new Set<(caps: DawCapabilities) => void>();
    const push = (caps: DawCapabilities) => listeners.forEach((listener) => listener(caps));
    const state = { soloed: '', restores: 0, script: [] as Array<'fail' | 'throw'>, solo: 'ok' as 'ok' | 'refuse' };
    const dawSoloChapter = vi.fn(async (id: string) => {
      if (state.solo === 'refuse') return { ok: false, changed: false, message: 'no', undoSteps: 0 };
      state.soloed = id;
      return done;
    });
    const dawSoloRestore = vi.fn(async () => {
      state.restores += 1;
      const next = state.script.shift();
      if (next === 'throw') throw new Error('bridge down');
      if (next === 'fail') return failed;
      state.soloed = '';
      return done;
    });
    const api = createMockApi({
      dawSoloChapter,
      dawSoloRestore,
      settingsForScope: async () => setting(setSwitch),
      dawCapabilities: async () => real,
      subscribeDawCapabilities: (onUpdate: (caps: DawCapabilities) => void) => {
        listeners.add(onUpdate);
        return () => void listeners.delete(onUpdate);
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      strict ? (
        <StrictMode>
          <ApiProvider api={api}>{children}</ApiProvider>
        </StrictMode>
      ) : (
        <ApiProvider api={api}>{children}</ApiProvider>
      );
    return { state, dawSoloChapter, dawSoloRestore, wrapper, real, off, push: (caps: DawCapabilities) => act(() => push(caps)) };
  }

  async function toasts() {
    const told: string[] = [];
    const dismissed: string[] = [];
    const { overlay } = await import('../overlay/overlayService');
    const spy = vi.spyOn(overlay, 'toast').mockImplementation((text: string) => void told.push(text));
    const gone = vi.spyOn(overlay, 'dismissTopic').mockImplementation((topic: string) => void dismissed.push(topic));
    return {
      told,
      dismissed,
      restore: () => {
        spy.mockRestore();
        gone.mockRestore();
      },
    };
  }

  /** The app shell with the Booth inside it: React runs the child's effects before the shell's. */
  function Booth({ chapter }: { chapter: string }) {
    useDawSoloesChapter(chapter);
    return null;
  }
  function Shell({ chapter }: { chapter: string }) {
    useRetryOwedSoloRestore('/booth');
    return <Booth chapter={chapter} />;
  }

  it('a DAW that goes and comes back while the Booth is on a chapter ends with the chapter soloed', async () => {
    const d = await daw();
    const { restore } = await toasts();
    d.state.script.push('fail');
    renderTree(<Shell chapter="c-1" />, { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    await d.push(d.off);
    await waitFor(() => expect(d.state.restores).toBeGreaterThan(0));
    await d.push(d.real);
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    await act(async () => {});
    expect(d.state.soloed).toBe('c-1');
    restore();
  });

  it('a Booth that holds its solo is not taken off by the retry, even when its solo is refused after the DAW comes back', async () => {
    const d = await daw();
    const { restore } = await toasts();
    d.state.script.push('fail');
    renderTree(<Shell chapter="c-1" />, { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    await d.push(d.off);
    await waitFor(() => expect(d.state.restores).toBe(1));
    d.state.solo = 'refuse';
    await d.push(d.real);
    await act(async () => {});
    expect(d.state.restores).toBe(1);
    expect(d.state.soloed).toBe('c-1');
    restore();
  });

  /** The shell with the Booth that can leave while the narrator stays on the page. */
  function Tree({ booth }: { booth: boolean }) {
    useRetryOwedSoloRestore('/script');
    return booth ? <Booth chapter="c-1" /> : null;
  }

  it('an owed restore is sent again while the narrator stays on one page: when the window gets focus again', async () => {
    const d = await daw('true', false);
    const { told, restore } = await toasts();
    const tree = renderTree(<Tree booth />, { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    await act(async () => {});
    d.state.script.push('fail');
    const before = d.state.restores;
    tree.rerender(<Tree booth={false} />);
    await waitFor(() => expect(d.state.restores).toBe(before + 1));
    expect(d.state.soloed).toBe('c-1');
    await waitFor(() => expect(told).toHaveLength(1));
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(d.state.soloed).toBe(''));
    restore();
  });

  it('a slow failing restore leaves no false toast over a chapter the Booth soloed again', async () => {
    const d = await daw('true', false);
    const { told, dismissed, restore } = await toasts();
    let gate: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (gate = resolve));
    renderTree(<Shell chapter="c-1" />, { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    await act(async () => {});
    d.dawSoloRestore.mockImplementationOnce(async () => {
      d.state.restores += 1;
      await held;
      return failed;
    });
    await d.push(d.off);
    await d.push(d.real);
    gate();
    await waitFor(() => expect(told).toHaveLength(1));
    await act(async () => {});
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(dismissed).toEqual(['daw-solo-left']));
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    restore();
  });

  it('a retry with a Booth that holds its solo and nothing told clears the debt quietly', async () => {
    const d = await daw('true', false);
    const { told, dismissed, restore } = await toasts();
    renderTree(<Tree booth />, { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    await act(async () => {});
    d.dawSoloRestore.mockImplementationOnce(async () => {
      d.state.restores += 1;
      return { ...failed, refused: '' };
    });
    await d.push(d.off);
    await waitFor(() => expect(d.state.restores).toBe(1));
    await act(async () => {});
    await d.push(d.real);
    await act(async () => {});
    expect(told).toEqual([]);
    expect(dismissed).toEqual([]);
    expect(d.state.restores).toBe(1);
    restore();
  });

  it('a retry whose Booth solo was refused takes the owed solo off and asks for the Booth solo again, on every try', async () => {
    const d = await daw('true', false);
    const { restore } = await toasts();
    d.state.solo = 'refuse';
    d.state.script.push('fail');
    renderTree(<Tree booth />, { wrapper: d.wrapper });
    await waitFor(() => expect(d.dawSoloChapter).toHaveBeenCalled());
    d.state.soloed = 'old';
    await act(async () => {});
    await d.push(d.off);
    await waitFor(() => expect(d.state.restores).toBe(1));
    await act(async () => {});
    await d.push(d.real);
    await waitFor(() => expect(d.state.restores).toBe(2));
    await waitFor(() => expect(d.state.soloed).toBe(''));
    d.state.solo = 'ok';
    d.state.script.push('fail');
    await d.push(d.off);
    await d.push(d.real);
    await act(async () => {});
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    restore();
  });

  it('a retry that finds a Booth whose own solo was refused takes the owed solo off and sets the Booth solo when it is answered now', async () => {
    const d = await daw('true', false);
    const { told, restore } = await toasts();
    d.state.solo = 'refuse';
    const tree = renderTree(<Shell chapter="c-1" />, { wrapper: d.wrapper });
    await waitFor(() => expect(d.dawSoloChapter).toHaveBeenCalledTimes(1));
    await act(async () => {});
    d.state.script.push('fail');
    tree.rerender(<Shell chapter="" />);
    await waitFor(() => expect(told).toHaveLength(1));
    tree.rerender(<Shell chapter="c-1" />);
    await waitFor(() => expect(d.dawSoloChapter).toHaveBeenCalledTimes(2));
    await act(async () => {});
    d.state.solo = 'ok';
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    restore();
  });

  it('a solo answered for an earlier chapter does not let a retry skip the restore for the next one whose solo was refused', async () => {
    const d = await daw('true', false);
    const { told, restore } = await toasts();
    const tree = renderTree(<Shell chapter="c-1" />, { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    await act(async () => {});
    d.state.script.push('fail');
    tree.rerender(<Shell chapter="" />);
    await waitFor(() => expect(told).toHaveLength(1));
    d.state.solo = 'refuse';
    tree.rerender(<Shell chapter="c-2" />);
    await waitFor(() => expect(d.dawSoloChapter).toHaveBeenCalledTimes(2));
    await act(async () => {});
    act(() => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(d.state.soloed).toBe(''));
    restore();
  });

  it('tells the narrator once when the restore cannot reach the host at all', async () => {
    const d = await daw();
    const { told, restore } = await toasts();
    d.state.script.push('throw');
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    booth.unmount();
    await waitFor(() => expect(told).toHaveLength(1));
    expect(told[0]).toContain('may stay silent');
    expect(told[0]).toContain('REAPER');
    restore();
  });

  it('retries the restore from the shell on any page, and the Booth that left stays taken off', async () => {
    const d = await daw();
    const { restore } = await toasts();
    d.state.script.push('fail');
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    booth.unmount();
    await waitFor(() => expect(d.state.restores).toBe(1));
    expect(d.state.soloed).toBe('c-1');
    renderHook(() => useRetryOwedSoloRestore('/editing'), { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe(''));
    restore();
  });

  it('an owed restore is sent again without the DAW going away: on the next report and the next page change', async () => {
    const d = await daw();
    const { restore } = await toasts();
    d.state.script.push('fail', 'fail');
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    booth.unmount();
    await waitFor(() => expect(d.state.restores).toBe(1));
    const shell = renderHook(({ page }: { page: string }) => useRetryOwedSoloRestore(page), { wrapper: d.wrapper, initialProps: { page: '/editing' } });
    await waitFor(() => expect(d.state.restores).toBe(2));
    shell.rerender({ page: '/proof' });
    await waitFor(() => expect(d.state.soloed).toBe(''));
    restore();
  });

  it('the owed restore is retried whatever the switch said when the app started', async () => {
    const first = await daw();
    const { restore } = await toasts();
    first.state.script.push('fail');
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: first.wrapper });
    await waitFor(() => expect(first.state.soloed).toBe('c-1'));
    booth.unmount();
    await waitFor(() => expect(first.state.restores).toBe(1));
    const switchedOff = await daw('false');
    renderHook(() => useRetryOwedSoloRestore('/'), { wrapper: switchedOff.wrapper });
    await waitFor(() => expect(switchedOff.dawSoloRestore).toHaveBeenCalledTimes(1));
    restore();
  });

  it('tells the narrator once, takes the toast away when the restore goes through, and a refusal after a throw is not told a second time', async () => {
    const d = await daw();
    const { told, dismissed, restore } = await toasts();
    d.state.script.push('throw', 'fail');
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    booth.unmount();
    await waitFor(() => expect(told).toHaveLength(1));
    const shell = renderHook(({ page }: { page: string }) => useRetryOwedSoloRestore(page), { wrapper: d.wrapper, initialProps: { page: '/editing' } });
    await waitFor(() => expect(d.state.restores).toBe(2));
    shell.rerender({ page: '/proof' });
    await waitFor(() => expect(d.state.soloed).toBe(''));
    expect(told).toHaveLength(1);
    expect(dismissed).toEqual(['daw-solo-left']);
    restore();
  });

  it('tells a refusal even when no solo was answered as done: the host alone decides what may be soloed', async () => {
    const d = await daw();
    d.state.solo = 'refuse';
    d.state.script.push('fail');
    const { told, restore } = await toasts();
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: d.wrapper });
    await waitFor(() => expect(d.dawSoloChapter).toHaveBeenCalled());
    booth.unmount();
    await waitFor(() => expect(told).toEqual([hostSentence]));
    restore();
  });

  it('says nothing about leaving the Booth when the DAW goes away mid-visit', async () => {
    const d = await daw();
    d.state.script.push('fail');
    const { told, restore } = await toasts();
    renderHook(() => useDawSoloesChapter('c-1'), { wrapper: d.wrapper });
    await waitFor(() => expect(d.state.soloed).toBe('c-1'));
    await d.push(d.off);
    await waitFor(() => expect(told).toHaveLength(1));
    expect(told[0]).not.toMatch(/\bleft\b/i);
    restore();
  });

  it('owes nothing when the call throws and no solo was answered as done', async () => {
    const d = await daw();
    d.state.solo = 'refuse';
    d.state.script.push('throw');
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: d.wrapper });
    await waitFor(() => expect(d.dawSoloChapter).toHaveBeenCalled());
    booth.unmount();
    await waitFor(() => expect(d.state.restores).toBe(1));
    renderHook(() => useRetryOwedSoloRestore('/'), { wrapper: d.wrapper });
    await act(async () => {});
    expect(d.state.restores).toBe(1);
  });
});
