// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { makeChapters } from '../../../fixtures/chapters';
import type { CoverageResult, CoverageState, MeasureFileResult } from '../../../types';
import { passing } from './testFiles';
import { useTextMatches } from './textMatch';

const current = (chapterId: string, present = 90): CoverageResult => ({
  chapterId,
  state: 'current',
  reasons: [],
  result: { bodyTokens: 100, presentTokens: present } as never,
  judgement: { state: 'met', reason: '', thresholds: { minParagraphPresent: 0.9, maxMissingRun: 5 } },
});

type Overrides = { coverageResult?: (id: string) => Promise<CoverageResult>; subscribeCoverage?: (listener: (state: CoverageState) => void) => () => void };

function host(overrides: Overrides) {
  const api = { ...createMockApi(), ...overrides };
  return ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
}
const reads = (coverageResult: (id: string) => Promise<CoverageResult>) => host({ coverageResult });

describe('useTextMatches, keyed by the measured file (#2105)', () => {
  it('reads only the chapters that have a file, not all 5000 of a long book', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 5000 });
    const read = vi.fn(async (id: string) => current(id));
    const files = [passing('Chapter 0007.wav')];
    const { result } = renderHook(() => useTextMatches(chapters, files), { wrapper: reads(read) });
    await waitFor(() => expect(Object.keys(result.current)).toEqual([files[0]!.path]));
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(chapters[6]!.id);
  });

  it('reads nothing before a file is measured', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 50 });
    const read = vi.fn(async (id: string) => current(id));
    const { result } = renderHook(() => useTextMatches(chapters, []), { wrapper: reads(read) });
    await Promise.resolve();
    expect(result.current).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });

  it('leaves a file whose chapter’s check cannot be read without a figure, and keeps the others', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 4 });
    const read = vi.fn(async (id: string) => {
      if (id === chapters[1]!.id) throw new Error('the ledger is unreadable');
      return current(id);
    });
    const files = [passing('Chapter 01.wav'), passing('Chapter 02.wav')];
    const { result } = renderHook(() => useTextMatches(chapters, files), { wrapper: reads(read) });
    await waitFor(() => expect(Object.keys(result.current)).toEqual([files[0]!.path]));
  });

  // Q1: "chapter 1" is inside "chapter 10"; the whole-word title decides, so Chapter 10.wav is Chapter 10's, never Chapter 1's.
  it('credits Chapter 10.wav to Chapter 10, and carries the chapter it was read for', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 11 });
    const read = vi.fn(async (id: string) => current(id, id === 'chapter-1' ? 100 : 40));
    const files = [passing('Chapter 10.wav')];
    const { result } = renderHook(() => useTextMatches(chapters, files), { wrapper: reads(read) });
    await waitFor(() => expect(result.current[files[0]!.path]).toEqual({ percent: 40, met: true, chapterId: 'chapter-10' }));
    expect(read).not.toHaveBeenCalledWith('chapter-1');
  });

  it('still credits a file whose name matches exactly one chapter', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 11 });
    const files = [passing('Chapter 1 — Down the Rabbit-Hole.wav'), passing('Chapter 05.wav')];
    const { result } = renderHook(() => useTextMatches(chapters, files), { wrapper: reads(async (id) => current(id, id === 'chapter-5' ? 80 : 95)) });
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2));
    expect(result.current[files[0]!.path]!.percent).toBe(95);
    expect(result.current[files[1]!.path]!.percent).toBe(80);
  });

  // Q2: measuring the same files again (a new size, a new hash) reads the checks again.
  it('reads again when a file is measured again, though the chapters with files are the same', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 3 });
    let present = 90;
    const read = vi.fn(async (id: string) => current(id, present));
    const first = passing('Chapter 01.wav');
    const { result, rerender } = renderHook(({ files }: { files: MeasureFileResult[] }) => useTextMatches(chapters, files), {
      wrapper: reads(read),
      initialProps: { files: [first] },
    });
    await waitFor(() => expect(result.current[first.path]?.percent).toBe(90));
    present = 60;
    const again = { ...first, fingerprint: { ...first.fingerprint!, sha256: 'f'.repeat(64), size_bytes: first.fingerprint!.size_bytes + 1 } };
    rerender({ files: [again] });
    await waitFor(() => expect(result.current[first.path]?.percent).toBe(60));
  });

  // Q3: the figures appear as each batch is read, not all at the end.
  it('publishes each batch as it is read', async () => {
    // Titles that no other title or number can be found inside, so every file names exactly one chapter.
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 20 }).map((chapter, index) => ({
      ...chapter,
      title: `Tale ${String.fromCharCode(65 + index)}`,
    }));
    const files = chapters.map((chapter) => passing(`${chapter.title}.wav`));
    const gate: { release: () => void } = { release: () => undefined };
    const later = new Promise<void>((resolve) => (gate.release = resolve));
    const read = vi.fn(async (id: string) => {
      if (Number(id.replace('chapter-', '')) > 8) await later;
      return current(id);
    });
    const { result } = renderHook(() => useTextMatches(chapters, files), { wrapper: reads(read) });
    await waitFor(() => expect(Object.keys(result.current).length).toBeGreaterThan(0));
    expect(Object.keys(result.current).length).toBeLessThan(20);
    gate.release();
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(20));
  });

  it('follows the check while Master stays open: a re-run updates the figure, a stale check drops it to no figure', async () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 3 });
    const id = chapters[0]!.id;
    let stored: CoverageResult = current(id);
    let notify: (state: CoverageState) => void = () => undefined;
    const wrapper = host({
      coverageResult: async () => stored,
      subscribeCoverage: (listener) => {
        notify = listener;
        return () => undefined;
      },
    });
    const files = [passing('Chapter 01.wav')];
    const path = files[0]!.path;
    const { result } = renderHook(() => useTextMatches(chapters, files), { wrapper });
    await waitFor(() => expect(result.current[path]).toMatchObject({ percent: 90, met: true }));

    // The check runs again and finds less: a running state changes nothing, the ended one is read.
    stored = { ...current(id), result: { bodyTokens: 100, presentTokens: 70 } as never, judgement: { ...current(id).judgement!, state: 'not_met' } };
    act(() => notify({ phase: 'running', percent: 10, message: '' }));
    act(() => notify({ phase: 'complete', percent: 100, message: '' }));
    await waitFor(() => expect(result.current[path]).toMatchObject({ percent: 70, met: false }));

    // The recording changes after that: the stored check is stale, so the figure goes ("Not checked") when the window comes back.
    stored = { chapterId: id, state: 'stale', reasons: ['item_trimmed'], result: stored.result, judgement: stored.judgement };
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current[path]).toBeUndefined());
  });
});
