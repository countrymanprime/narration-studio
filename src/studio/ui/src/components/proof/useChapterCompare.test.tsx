// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRANSCRIPT } from '../../api/mockFixtures';
import type { TranscriptState } from '../../types';
import { useChapterCompare } from './useChapterCompare';

const chapter = WIRE_CHAPTERS[0];
const run = (summary: string): TranscriptState => ({ ...WIRE_TRANSCRIPT, phase: 'success', summary });

describe('useChapterCompare', () => {
  it('re-reads the last completed run when a run ends, so "Review last run" offers the run just made', async () => {
    const transcriptLastCompleted = vi.fn().mockResolvedValueOnce(run('run A')).mockResolvedValue(run('run B'));
    const api = createMockApi({ transcriptLastCompleted });
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result, rerender } = renderHook(({ transcript }: { transcript: TranscriptState }) => useChapterCompare(chapter, transcript), {
      wrapper,
      initialProps: { transcript: { ...WIRE_TRANSCRIPT, phase: 'running' } as TranscriptState },
    });
    await waitFor(() => expect(result.current.lastCompleted?.summary).toBe('run A'));
    rerender({ transcript: run('run B') });
    await waitFor(() => expect(result.current.lastCompleted?.summary).toBe('run B'));
    expect(transcriptLastCompleted).toHaveBeenCalledTimes(2);
  });

  it('does not re-read while a run is still going', async () => {
    const transcriptLastCompleted = vi.fn().mockResolvedValue(run('run A'));
    const api = createMockApi({ transcriptLastCompleted });
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { rerender } = renderHook(({ transcript }: { transcript: TranscriptState }) => useChapterCompare(chapter, transcript), {
      wrapper,
      initialProps: { transcript: { ...WIRE_TRANSCRIPT, phase: 'running', percent: 10 } as TranscriptState },
    });
    await waitFor(() => expect(transcriptLastCompleted).toHaveBeenCalledTimes(1));
    rerender({ transcript: { ...WIRE_TRANSCRIPT, phase: 'running', percent: 50 } });
    expect(transcriptLastCompleted).toHaveBeenCalledTimes(1);
  });
});
