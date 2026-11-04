// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { overlay } from '../../../overlay/overlayService';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createJournal } from '../../../studio/journal/createJournal';
import { useBackups } from './useBackups';

afterEach(() => vi.restoreAllMocks());

// Issue #2919: reading the DAW's table of backups changes nothing, so a failed read is an error toast with Retry, which reads it again.
describe('a failed read of the backups table', () => {
  it('is an error toast with Retry, which reads the table again', async () => {
    const reads = vi.fn().mockRejectedValueOnce(new Error('the DAW did not answer')).mockResolvedValue([]);
    const daw = { ...createMockDawClient(DAW_SETUPS.audacity), backups: reads };
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
    const journal = createJournal({ dawName: () => 'Audacity', dawLastAction: async () => 'unknown' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw }}>{children}</PortOverrides>
      </ApiProvider>
    );
    renderHook(() => useBackups(journal, 'chapter-1'), { wrapper });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [text, options] = toast.mock.calls[0];
    expect(text).toContain('did not answer');
    expect(options).toMatchObject({ tone: 'error', action: { label: 'Retry' } });
    expect(reads).toHaveBeenCalledTimes(1);
    options!.action!.onAction();
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(2));
  });
});
