// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { sameClock } from './docClock';
import { useChapterSound } from './useChapterSound';

afterEach(cleanup);

/** Peaks of 50 buckets a second: a loud second (127) then a quiet one, as the host's min/max bytes. */
const bytes = (levels: number[]): string => btoa(String.fromCharCode(...levels.flatMap((v) => [(256 - v) % 256, v])));
const loudThenQuiet = [...Array(50).fill(100), ...Array(50).fill(2)];

describe('useChapterSound', () => {
  it('gives the levels of the audio on the document clock once the peaks are read', async () => {
    const api = {
      ...createMockApi(),
      workspacePeaks: async (chapterId: string) => ({
        chapterId,
        items: [{ index: 0, peaks: { startSeconds: 0, bucketsPerSecond: 50, buckets: 100, minMax: bytes(loudThenQuiet), sampleRate: 44100, channels: 1 } }],
      }),
    };
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => useChapterSound('c-1', sameClock([0])), { wrapper });
    // Not read yet: it cannot tell, so a play keeps its fixed tail.
    expect(result.current(0, 2)).toBeUndefined();
    await waitFor(() => expect(result.current(0, 2)).toBeDefined());
    const env = result.current(0, 2)!;
    expect(env.start).toBe(0);
    expect(env.step).toBeCloseTo(0.02, 6);
    expect(env.level[10]).toBeCloseTo(100 / 127, 2);
    expect(env.level[75]).toBeCloseTo(2 / 127, 2);
    expect(result.current(5, 4)).toBeUndefined();
  });
});
