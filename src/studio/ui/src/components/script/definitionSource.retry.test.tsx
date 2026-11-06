// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { overlay } from '../../overlay/overlayService';
import { useDefinitionSource } from './scriptPageHost';

afterEach(() => vi.restoreAllMocks());

// Issue #2919: the definition source saves at once, the menu shows the old source again when the save fails, and the error toast offers
// Retry, which chooses the same source again.
describe('a failed save of the definition source', () => {
  it('is an error toast with Retry, which saves the same source again', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings').mockRejectedValueOnce(new Error('the settings file is read-only'));
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => useDefinitionSource(), { wrapper });
    await waitFor(() => expect(result.current[0]).toBeTruthy());
    const before = result.current[0];
    const next = before === 'web' ? 'builtin' : 'web';
    act(() => result.current[1](next as typeof before));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [text, options] = toast.mock.calls[0];
    expect(text).toContain('read-only');
    expect(options).toMatchObject({ tone: 'error', action: { label: 'Retry' } });
    act(() => options!.action!.onAction());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
    await waitFor(() => expect(result.current[0]).toBe(next));
  });
});
