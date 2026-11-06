// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { clearToasts, findToast, pressToastAction, toastTexts } from '../../fixtures/toasts';
import { MasteringChain, useMasteringProviders } from './MasteringChain';

afterEach(() => {
  cleanup();
  clearToasts();
});

describe('the mastering chain card', () => {
  it('tells a failed read as a toast, and the card draws no alert in the page (rule 7, #2632)', () => {
    render(<MasteringChain problem="the host did not answer" />);
    expect(toastTexts()).toEqual(['The mastering chain could not be read: the host did not answer']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it('says nothing while the chain is read without a problem', () => {
    render(<MasteringChain />);
    expect(toastTexts()).toEqual([]);
  });
});

// Issue #2919: reading the chains changes nothing, so a failed read is an error toast with Retry, which reads them again.
describe('a failed read of the mastering chains', () => {
  it('puts Retry on the toast when the page gives it one, and it runs that', async () => {
    const retry = vi.fn();
    render(<MasteringChain problem="the host did not answer" retry={retry} />);
    pressToastAction(await findToast('could not be read'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('the hook reads the chains again on reload, and the problem goes when the host answers', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'masteringProviders').mockRejectedValueOnce(new Error('the host did not answer'));
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => useMasteringProviders(), { wrapper });
    await waitFor(() => expect(result.current.problem).toContain('did not answer'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.providers).toBeTruthy());
    expect(result.current.problem).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
