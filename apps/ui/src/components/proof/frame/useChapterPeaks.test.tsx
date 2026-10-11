// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { useChapterPeaks } from './useChapterPeaks';

const wrap = (api: ReturnType<typeof createMockApi>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <ApiProvider api={api}>{children}</ApiProvider>;
  };

describe('useChapterPeaks', () => {
  it('reads the chapter peaks through the workspace port', async () => {
    const api = createMockApi();
    const result = { chapterId: 'ch1', items: [{ index: 0, reason: 'no waveform' }] };
    const spy = vi.spyOn(api, 'workspacePeaks').mockResolvedValue(result);
    const { result: hook } = renderHook(() => useChapterPeaks('ch1'), { wrapper: wrap(api) });
    await waitFor(() => expect(hook.current).toEqual(result));
    expect(spy).toHaveBeenCalledWith('ch1');
  });

  it('stays undefined when the call fails, and asks for nothing without a chapter', async () => {
    const api = createMockApi();
    const spy = vi.spyOn(api, 'workspacePeaks').mockRejectedValue(new Error('down'));
    const { result: hook } = renderHook(() => useChapterPeaks('ch1'), { wrapper: wrap(api) });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(hook.current).toBeUndefined();
    spy.mockClear();
    renderHook(() => useChapterPeaks(undefined), { wrapper: wrap(api) });
    expect(spy).not.toHaveBeenCalled();
  });
});
