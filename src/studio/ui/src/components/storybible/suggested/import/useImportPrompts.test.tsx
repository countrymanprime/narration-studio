// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { overlay } from '../../../../overlay/overlayService';
import { useImportPrompts } from './useImportPrompts';

afterEach(() => vi.restoreAllMocks());

// Issue #2919: the prompts are a read the dialog needs and has no control to repeat, so a failed read is an error toast with Retry.
describe('a failed read of the import prompts', () => {
  it('is an error toast with Retry, which reads them again', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'extractionImportPrompt').mockRejectedValueOnce(new Error('the host did not answer'));
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => useImportPrompts(), { wrapper });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [text, options] = toast.mock.calls[0];
    expect(text).toContain('did not answer');
    expect(options).toMatchObject({ tone: 'error', action: { label: 'Retry' } });
    options!.action!.onAction();
    await waitFor(() => expect(Object.keys(result.current).length).toBeGreaterThan(0));
  });
});
