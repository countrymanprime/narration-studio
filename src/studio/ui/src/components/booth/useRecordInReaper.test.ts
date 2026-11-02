// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { useRecordInReaper } from './useRecordInReaper';
import type { NarrationApi, ReadAloudRecording, ScopedSettingField } from '../../types';

function field(key: string, effectiveValue: string): ScopedSettingField {
  return { key, label: key, kind: 'bool', choices: [], value: effectiveValue, isSet: true, effectiveValue, effectiveSource: 'project' };
}

function fakeApi(overrides: Partial<NarrationApi> = {}): NarrationApi {
  return {
    settingsForScope: vi.fn(async () => ({})),
    saveSettings: vi.fn(async () => ({}) as never),
    readAloudRecordStart: vi.fn(async () => ({ outcome: 'started', trackGuid: '{1}', position: 0 }) as ReadAloudRecording),
    readAloudRecordStop: vi.fn(async () => ({ outcome: 'stopped', restored: 0, kept: 0 }) as ReadAloudRecording),
    ...overrides,
  } as unknown as NarrationApi;
}

function wrapper(api: NarrationApi) {
  return ({ children }: { children: ReactNode }) => createElement(ApiProvider, { api, children });
}

describe('useRecordInReaper', () => {
  it('reads the project-scope setting once and reports it loaded', async () => {
    const settingsForScope = vi.fn(async () => ({ ReadAloud: [field('record_in_reaper', 'true'), field('record_confirmed', 'true')] }));
    const { result } = renderHook(() => useRecordInReaper('chapter-1', true), { wrapper: wrapper(fakeApi({ settingsForScope })) });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.enabled).toBe(true);
    expect(settingsForScope).toHaveBeenCalledWith('project');
  });

  it('defaults off and unconfirmed when the project has never set it', async () => {
    const { result } = renderHook(() => useRecordInReaper('chapter-1', true), { wrapper: wrapper(fakeApi()) });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.enabled).toBe(false);
  });

  it('beforeStart does nothing and answers true when the toggle is off', async () => {
    const readAloudRecordStart = vi.fn();
    const { result } = renderHook(() => useRecordInReaper('chapter-1', true), { wrapper: wrapper(fakeApi({ readAloudRecordStart })) });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => expect(await result.current.beforeStart()).toBe(true));
    expect(readAloudRecordStart).not.toHaveBeenCalled();
  });

  it('beforeStart does nothing and answers true when the capability is unavailable, even with the toggle on', async () => {
    const settingsForScope = vi.fn(async () => ({ ReadAloud: [field('record_in_reaper', 'true'), field('record_confirmed', 'true')] }));
    const readAloudRecordStart = vi.fn();
    const { result } = renderHook(() => useRecordInReaper('chapter-1', false), { wrapper: wrapper(fakeApi({ settingsForScope, readAloudRecordStart })) });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => expect(await result.current.beforeStart()).toBe(true));
    expect(readAloudRecordStart).not.toHaveBeenCalled();
  });

  it('beforeStart does nothing and answers true with no chapter (credits mode), even with the toggle on', async () => {
    const settingsForScope = vi.fn(async () => ({ ReadAloud: [field('record_in_reaper', 'true'), field('record_confirmed', 'true')] }));
    const readAloudRecordStart = vi.fn();
    const { result } = renderHook(() => useRecordInReaper(undefined, true), { wrapper: wrapper(fakeApi({ settingsForScope, readAloudRecordStart })) });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => expect(await result.current.beforeStart()).toBe(true));
    expect(readAloudRecordStart).not.toHaveBeenCalled();
  });

  it('beforeStart starts the recording and answers true on "started"', async () => {
    const settingsForScope = vi.fn(async () => ({ ReadAloud: [field('record_in_reaper', 'true'), field('record_confirmed', 'true')] }));
    const readAloudRecordStart = vi.fn(async () => ({ outcome: 'started', trackGuid: '{1}', position: 3 }) as ReadAloudRecording);
    const { result } = renderHook(() => useRecordInReaper('chapter-1', true), { wrapper: wrapper(fakeApi({ settingsForScope, readAloudRecordStart })) });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => expect(await result.current.beforeStart()).toBe(true));
    expect(readAloudRecordStart).toHaveBeenCalledWith('chapter-1');
    expect(result.current.recording).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('beforeStart answers false and sets error on a refusal, and never marks itself recording', async () => {
    const settingsForScope = vi.fn(async () => ({ ReadAloud: [field('record_in_reaper', 'true'), field('record_confirmed', 'true')] }));
    const readAloudRecordStart = vi.fn(
      async () => ({ outcome: 'refused', reason: 'not_armed', message: 'No track is armed in REAPER.' }) as ReadAloudRecording,
    );
    const { result } = renderHook(() => useRecordInReaper('chapter-1', true), { wrapper: wrapper(fakeApi({ settingsForScope, readAloudRecordStart })) });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => expect(await result.current.beforeStart()).toBe(false));
    expect(result.current.recording).toBe(false);
    expect(result.current.error).toBe('No track is armed in REAPER.');
  });

  it('afterStop is a no-op unless beforeStart actually started a recording', async () => {
    const readAloudRecordStop = vi.fn();
    const { result } = renderHook(() => useRecordInReaper('chapter-1', true), { wrapper: wrapper(fakeApi({ readAloudRecordStop })) });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.afterStop());

    expect(readAloudRecordStop).not.toHaveBeenCalled();
  });

  it('afterStop stops a recording this hook started, and clears the recording flag', async () => {
    const settingsForScope = vi.fn(async () => ({ ReadAloud: [field('record_in_reaper', 'true'), field('record_confirmed', 'true')] }));
    const readAloudRecordStart = vi.fn(async () => ({ outcome: 'started', trackGuid: '{1}', position: 0 }) as ReadAloudRecording);
    const readAloudRecordStop = vi.fn(async () => ({ outcome: 'stopped', restored: 1, kept: 0 }) as ReadAloudRecording);
    const { result } = renderHook(() => useRecordInReaper('chapter-1', true), {
      wrapper: wrapper(fakeApi({ settingsForScope, readAloudRecordStart, readAloudRecordStop })),
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    await act(async () => {
      await result.current.beforeStart();
    });
    expect(result.current.recording).toBe(true);

    act(() => result.current.afterStop());

    expect(result.current.recording).toBe(false);
    await waitFor(() => expect(readAloudRecordStop).toHaveBeenCalledTimes(1));
  });
});
