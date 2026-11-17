// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import type { DawCapabilities, DawPlace, DawTransport } from '../api/contracts/daw';
import type { ScopedSettingField } from '../api/contracts/system';
import { createMockApi } from '../api/mockApi';
import type { NarrationApi } from '../types';
import { useDawPullBack } from './useDawPullBack';

afterEach(cleanup);

const moved = { ok: true, changed: true, message: '', undoSteps: 0 };
const on = (chapterId: string, cursor = 12.5): DawPlace => ({ ok: true, message: '', chapterId, selected: 1, cursor });

async function capsWith(followAvailable: boolean): Promise<DawCapabilities> {
  const caps = await createMockApi().dawCapabilities();
  const entry = caps.capabilities.follow_position;
  return { ...caps, capabilities: { ...caps.capabilities, follow_position: { ...entry, available: followAvailable } } };
}

const setting = (value: string): Record<string, ScopedSettingField[]> => ({
  Booth: [{ key: 'follow_chapter_in_daw', label: 'x', kind: 'bool', choices: [], value, isSet: true, effectiveValue: value, effectiveSource: 'repo default' }],
});

type Options = {
  place?: () => Promise<DawPlace>;
  goTo?: () => Promise<typeof moved>;
  available?: boolean;
  setting?: string;
  chapterId?: string | undefined;
};

async function renderPullBack(options: Options = {}) {
  const dawPlace = vi.fn(options.place ?? (async () => on('c-2')));
  const dawGoToChapter = vi.fn(options.goTo ?? (async () => moved));
  const caps = await capsWith(options.available ?? true);
  let pushTransport: (transport: DawTransport) => void = () => undefined;
  const overrides: Partial<NarrationApi> = {
    dawPlace,
    dawGoToChapter,
    settingsForScope: async () => setting(options.setting ?? 'true'),
    dawCapabilities: async () => caps,
    subscribeDawCapabilities: () => () => undefined,
    subscribeDawTransport: (onTransport: (transport: DawTransport) => void) => {
      pushTransport = onTransport;
      return () => undefined;
    },
  };
  const api = createMockApi(overrides);
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  const hook = renderHook(({ id }: { id: string | undefined }) => useDawPullBack(id), {
    initialProps: { id: 'chapterId' in options ? options.chapterId : 'c-1' },
    wrapper,
  });
  // The setting and the capabilities are read after the first render; the listener is on once both are known.
  await act(async () => {});
  await act(async () => {});
  return { dawPlace, dawGoToChapter, pushTransport: (t: Partial<DawTransport>) => pushTransport(t as DawTransport), ...hook };
}

const focus = () => act(async () => void window.dispatchEvent(new Event('focus')));

describe('useDawPullBack', () => {
  it('puts the selection back on the chapter when the narrator selected something else, leaving the cursor where it is', async () => {
    const { dawPlace, dawGoToChapter } = await renderPullBack({ place: async () => on('c-2', 41.25) });
    await focus();
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledExactlyOnceWith('c-1', 'at', 41.25));
    expect(dawPlace).toHaveBeenCalledTimes(1);
  });

  it('moves nothing when the DAW is already on the chapter (the narrator moved only the cursor)', async () => {
    const { dawPlace, dawGoToChapter } = await renderPullBack({ place: async () => on('c-1', 99) });
    await focus();
    await waitFor(() => expect(dawPlace).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('pulls back a selection that names no chapter (several tracks, none)', async () => {
    const { dawGoToChapter } = await renderPullBack({ place: async () => on('') });
    await focus();
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(1));
  });

  it('pulls back once for each focus, never on a timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      const { dawGoToChapter } = await renderPullBack();
      await act(async () => void (await vi.advanceTimersByTimeAsync(120_000)));
      expect(dawGoToChapter).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('two quick focus events are not queued: one check, and one more after it when the second came while it ran', async () => {
    let release: (place: DawPlace) => void = () => undefined;
    const place = vi.fn(() => new Promise<DawPlace>((resolve) => (release = resolve)));
    const { dawGoToChapter } = await renderPullBack({ place });
    await focus();
    await focus();
    await focus();
    expect(place).toHaveBeenCalledTimes(1);
    await act(async () => release(on('c-1')));
    await waitFor(() => expect(place).toHaveBeenCalledTimes(2));
    await act(async () => release(on('c-1')));
    await act(async () => {});
    expect(place).toHaveBeenCalledTimes(2);
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('sends nothing for a chapter the narrator left while the read was out (the chapter change moved the DAW)', async () => {
    let release: (place: DawPlace) => void = () => undefined;
    const { dawGoToChapter, rerender } = await renderPullBack({ place: () => new Promise<DawPlace>((resolve) => (release = resolve)) });
    await focus();
    rerender({ id: 'c-2' });
    await act(async () => release(on('c-3')));
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('sends nothing, and does not throw, when the page goes while the read is out', async () => {
    let release: (place: DawPlace) => void = () => undefined;
    const { dawGoToChapter, unmount } = await renderPullBack({ place: () => new Promise<DawPlace>((resolve) => (release = resolve)) });
    await focus();
    unmount();
    await act(async () => release(on('c-3')));
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('listens to nothing once the page is gone', async () => {
    const { dawPlace, unmount } = await renderPullBack();
    unmount();
    await focus();
    expect(dawPlace).not.toHaveBeenCalled();
  });

  it('moves nothing while the DAW records, and pulls back again once the take has stopped', async () => {
    const { dawPlace, dawGoToChapter, pushTransport } = await renderPullBack();
    act(() => pushTransport({ playing: false, recording: true }));
    await focus();
    expect(dawPlace).not.toHaveBeenCalled();
    act(() => pushTransport({ playing: false, recording: false }));
    await focus();
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['the setting is off', { setting: 'false' }],
    ['the DAW cannot follow (closed or still connecting)', { available: false }],
    ['no chapter is in view', { chapterId: undefined }],
    ['the chapter is empty', { chapterId: '' }],
  ])('asks and moves nothing when %s', async (_name, options) => {
    const { dawPlace, dawGoToChapter } = await renderPullBack(options);
    await focus();
    await act(async () => {});
    expect(dawPlace).not.toHaveBeenCalled();
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('follows a DAW that connects after the page opened', async () => {
    const dawPlace = vi.fn(async () => on('c-2'));
    const dawGoToChapter = vi.fn(async () => moved);
    const real = await capsWith(true);
    const off = await capsWith(false);
    let push: (caps: DawCapabilities) => void = () => undefined;
    const api = createMockApi({
      dawPlace,
      dawGoToChapter,
      settingsForScope: async () => setting('true'),
      dawCapabilities: async () => off,
      subscribeDawCapabilities: (onUpdate: (caps: DawCapabilities) => void) => {
        push = onUpdate;
        return () => undefined;
      },
    });
    renderHook(() => useDawPullBack('c-1'), { wrapper: ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider> });
    await act(async () => {});
    await focus();
    expect(dawPlace).not.toHaveBeenCalled();
    act(() => push(real));
    await focus();
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledTimes(1));
  });

  it('says nothing when the DAW does not answer, refuses, or the chapter has no linked track', async () => {
    const refused = await renderPullBack({ place: async () => ({ ok: false, message: 'REAPER did not answer', chapterId: '', selected: 0, cursor: 0 }) });
    await focus();
    await act(async () => {});
    expect(refused.dawGoToChapter).not.toHaveBeenCalled();
    cleanup();
    const unlinked = await renderPullBack({ goTo: async () => ({ ...moved, ok: false, changed: false, message: 'no track' }) });
    await focus();
    await waitFor(() => expect(unlinked.dawGoToChapter).toHaveBeenCalledTimes(1));
    cleanup();
    const failing = await renderPullBack({
      goTo: async () => {
        throw new Error('bridge down');
      },
    });
    await focus();
    await waitFor(() => expect(failing.dawGoToChapter).toHaveBeenCalledTimes(1));
    await focus();
    await waitFor(() => expect(failing.dawGoToChapter).toHaveBeenCalledTimes(2));
  });

  it.each([
    ['not a number', Number.NaN],
    ['below zero', -1],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('sends nothing when the cursor read is %s (the selection is restored only with the cursor left alone)', async (_name, cursor) => {
    const { dawPlace, dawGoToChapter } = await renderPullBack({ place: async () => on('c-2', cursor) });
    await focus();
    await waitFor(() => expect(dawPlace).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('a read that never settles does not stop the next focus after the chapter changes', async () => {
    const first = vi.fn(() => new Promise<DawPlace>(() => undefined));
    const second = vi.fn(async () => on('c-9', 3));
    const calls = [first, second];
    const place = vi.fn(() => (calls.shift() ?? second)());
    const { dawGoToChapter, rerender } = await renderPullBack({ place });
    await focus();
    await focus();
    expect(place).toHaveBeenCalledTimes(1);
    rerender({ id: 'c-2' });
    await focus();
    await waitFor(() => expect(dawGoToChapter).toHaveBeenCalledExactlyOnceWith('c-2', 'at', 3));
  });

  it('a read that settles after the chapter changed moves nothing', async () => {
    let release: (place: DawPlace) => void = () => undefined;
    const { dawGoToChapter, rerender } = await renderPullBack({ place: () => new Promise<DawPlace>((resolve) => (release = resolve)) });
    await focus();
    rerender({ id: 'c-2' });
    await act(async () => release(on('c-9', 1)));
    await act(async () => {});
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });
});
