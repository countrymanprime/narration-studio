// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { overlay } from '../../../../overlay/overlayService';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { useSuggestions } from './useSuggestions';

afterEach(() => vi.restoreAllMocks());

// Issue #2919: the list, the sources and the scan state are reads, so a read that fails after the panel has loaded is an error toast with
// Retry, which makes that same read again.
describe('a failed read in the suggestions panel', () => {
  const setup = () => {
    const api = createMockApi();
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    return { api, toast, wrapper };
  };

  it('a failed reload of the list offers Retry, which reads the list again', async () => {
    const { api, toast, wrapper } = setup();
    const { result } = renderHook(() => useSuggestions({ pollMs: 10_000 }), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const list = vi.spyOn(api, 'extractionList').mockRejectedValueOnce(new Error('the list is locked'));
    await act(async () => result.current.reload());
    const [text, options] = toast.mock.calls.at(-1)!;
    expect(text).toContain('locked');
    expect(options).toMatchObject({ tone: 'error', action: { label: 'Retry' } });
    await act(async () => options!.action!.onAction());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('a failed read of the sources on open offers Retry, which reads them again', async () => {
    const { api, toast, wrapper } = setup();
    const sources = vi.spyOn(api, 'extractionSources').mockRejectedValueOnce(new Error('the sources are locked'));
    renderHook(() => useSuggestions({ pollMs: 10_000 }), { wrapper });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [, options] = toast.mock.calls[0];
    expect(options).toMatchObject({ tone: 'error', action: { label: 'Retry' } });
    await act(async () => options!.action!.onAction());
    expect(sources).toHaveBeenCalledTimes(2);
  });
});
