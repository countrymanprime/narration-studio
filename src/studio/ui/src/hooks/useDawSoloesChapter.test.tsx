// @vitest-environment jsdom
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
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
    const { result, unmount, dawSoloRestore } = await render({
      log,
      solo: async () => {
        throw new Error('bridge down');
      },
    });
    await waitFor(() => expect(dawSoloRestore).not.toHaveBeenCalled());
    expect(result.current).toBeUndefined();
    unmount();
    await waitFor(() => expect(dawSoloRestore).toHaveBeenCalledTimes(1));
  });
});

describe('a restore that did not reach the DAW', () => {
  const hostSentence = "REAPER could not take the solo off the chapter's track, so the other chapters may stay silent. Unsolo it in REAPER.";
  const failed = { ok: false, changed: false, message: hostSentence, undoSteps: 0, refused: hostSentence };

  async function pageWith(
    answers: Array<typeof done | typeof failed>,
    solo: typeof done | { ok: false; changed: false; message: string; undoSteps: 0 } = done,
  ) {
    const real = await capsWith(true);
    const off = await capsWith(false);
    let push: (caps: DawCapabilities) => void = () => undefined;
    const dawSoloRestore = vi.fn(async () => answers.shift() ?? done);
    const dawSoloChapter = vi.fn(async () => solo);
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
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    return { dawSoloChapter, dawSoloRestore, wrapper, real, off, push: (caps: DawCapabilities) => act(() => push(caps)) };
  }

  async function toasts() {
    const told: string[] = [];
    const { overlay } = await import('../overlay/overlayService');
    const spy = vi.spyOn(overlay, 'toast').mockImplementation((text: string) => void told.push(text));
    return { told, restore: () => spy.mockRestore() };
  }

  it('retries the restore when the DAW reports it can follow again, on any page, not only the Booth', async () => {
    const page = await pageWith([failed, done]);
    const { restore } = await toasts();
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: page.wrapper });
    await waitFor(() => expect(page.dawSoloChapter).toHaveBeenCalledTimes(1));
    booth.unmount();
    await waitFor(() => expect(page.dawSoloRestore).toHaveBeenCalledTimes(1));
    // The app shell is mounted whichever page is open: the DAW goes and comes back, and the owed restore is sent again.
    renderHook(() => useRetryOwedSoloRestore(), { wrapper: page.wrapper });
    await page.push(page.off);
    await page.push(page.real);
    await waitFor(() => expect(page.dawSoloRestore).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(page.dawSoloRestore).toHaveBeenCalledTimes(2);
    restore();
  });

  it('tells the narrator once, with the host sentence', async () => {
    const page = await pageWith([failed, failed]);
    const { told, restore } = await toasts();
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: page.wrapper });
    await waitFor(() => expect(page.dawSoloChapter).toHaveBeenCalledTimes(1));
    booth.unmount();
    await waitFor(() => expect(told).toEqual([hostSentence]));
    renderHook(() => useRetryOwedSoloRestore(), { wrapper: page.wrapper });
    await waitFor(() => expect(page.dawSoloRestore).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(told).toHaveLength(1);
    restore();
  });

  it('says nothing about leaving the Booth when the DAW goes away mid-visit', async () => {
    const page = await pageWith([failed]);
    const { told, restore } = await toasts();
    renderHook(() => useDawSoloesChapter('c-1'), { wrapper: page.wrapper });
    await waitFor(() => expect(page.dawSoloChapter).toHaveBeenCalledTimes(1));
    await page.push(page.off);
    await waitFor(() => expect(told).toHaveLength(1));
    expect(told[0]).not.toMatch(/\bleft\b|leaving|leave/i);
    restore();
  });

  it('says nothing when no solo was answered as done', async () => {
    const page = await pageWith([failed], { ok: false, changed: false, message: 'no', undoSteps: 0 });
    const { told, restore } = await toasts();
    const booth = renderHook(() => useDawSoloesChapter('c-1'), { wrapper: page.wrapper });
    await waitFor(() => expect(page.dawSoloChapter).toHaveBeenCalledTimes(1));
    booth.unmount();
    await waitFor(() => expect(page.dawSoloRestore).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(told).toEqual([]);
    restore();
  });
});
