// @vitest-environment jsdom
// Issue #2919: reading the pronunciation sources changes nothing, so a failed read is an error toast with Retry, which reads the list
// again; a name row that shows the failure offers the same Retry, and the toast goes once the list answers.
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { overlay } from '../../../overlay/overlayService';
import { StudioProvider } from '../../../studio/StudioProvider';
import { TooltipProvider } from '../../primitives/Tooltip';
import { NamePronunciation } from './NamePronunciation';
import { usePronunciationSources } from './usePronunciationSources';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a failed read of the pronunciation sources', () => {
  it('hands back a retry that reads the list again and clears the error when it answers', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'pronunciationSources').mockRejectedValueOnce(new Error('the sources did not answer'));
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => usePronunciationSources(), { wrapper });
    await waitFor(() => expect(result.current.error).toContain('did not answer'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.sources.length).toBeGreaterThan(0));
    expect(result.current.error).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("is an error toast with Retry on a name's row, which reads the list again", async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'pronunciationSources').mockRejectedValueOnce(new Error('the sources did not answer'));
    const toast = vi.spyOn(overlay, 'toast');
    function Row() {
      const sources = usePronunciationSources();
      return (
        <NamePronunciation
          entityId="alice"
          row={{ name: 'Alice', pronunciation: { ipa: '', source: '', confidence: '' } }}
          editing
          sources={sources}
          reload={async () => undefined}
          notify={vi.fn()}
        />
      );
    }
    render(
      <ApiProvider api={api}>
        <StudioProvider>
          <TooltipProvider>
            <Row />
          </TooltipProvider>
        </StudioProvider>
      </ApiProvider>,
    );
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const [text, options] = toast.mock.calls[0]!;
    expect(text).toContain('did not answer');
    expect(options).toMatchObject({ tone: 'error', action: { label: 'Retry' } });
    act(() => options!.action!.onAction());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByLabelText('How I say Alice')).toBeTruthy());
  });
});
