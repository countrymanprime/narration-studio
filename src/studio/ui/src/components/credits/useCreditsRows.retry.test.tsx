// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { useCreditsRows } from './useCreditsRows';

afterEach(() => vi.restoreAllMocks());

// Issue #2919: setting the same credits status again writes the same value, so the failure carries a retry that sets it again.
describe('a failed credits status save', () => {
  it('hands the failure a retry that sets the same status again', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'setCreditsStatus').mockRejectedValueOnce(new Error('the credits file is locked'));
    const onError = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => useCreditsRows('manuscript-1', onError), { wrapper });
    await waitFor(() => expect(result.current.rows).toBeTruthy());
    await act(async () => result.current.setStatus('opening', 'finalized'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain('locked');
    await act(async () => onError.mock.calls[0][1]());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('opening', 'finalized');
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
