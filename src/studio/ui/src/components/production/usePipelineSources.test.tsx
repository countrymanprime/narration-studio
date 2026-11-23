// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StudioProvider, useStoreHandle } from '../../studio/StudioProvider';
import { useChapters } from '../../studio/useChapters';
import { ApiProvider } from '../../api/ApiContext';
import type { Finding } from '../../api/contracts/findings';
import type { ScriptPrep } from '../../api/contracts/scriptPrep';
import { createMockApi } from '../../api/mockApi';
import type { ManuscriptChapter, MeasureFileResult, MeasureJob, NarrationApi } from '../../types';
import { usePipelineSources } from './usePipelineSources';
import { chaptersOf } from '../../api/chaptersOf';

const finding = (chapterId: string | undefined, status: Finding['review']['status'], extra: Partial<Finding> = {}) =>
  ({ id: `${chapterId}-${status}-${Math.random()}`, manuscript: chapterId ? { chapter_id: chapterId } : undefined, review: { status }, ...extra }) as Finding;

const chapter = (id: string, index: number, title: string) => ({ id, index, title, wordCount: 10, status: 'not_started' }) as ManuscriptChapter;
const file = (name: string, status: 'met' | 'not_met' | 'not_measurable' | 'not_checked'): MeasureFileResult =>
  ({
    name,
    path: `C:\\book\\${name}`,
    status: 'measured',
    report: null,
    fingerprint: null,
    findings: [],
    rules: [{ ruleId: 'r', status }],
  }) as unknown as MeasureFileResult;

function sources(over: {
  findings?: Finding[];
  files?: MeasureFileResult[];
  chapters?: ManuscriptChapter[];
  failFindings?: boolean;
  prep?: ScriptPrep['chapters'] | 'down';
}) {
  const api = {
    ...createMockApi(),
    findingsList: () =>
      over.failFindings ? Promise.reject(new Error('down')) : Promise.resolve({ findings: over.findings ?? [], total: over.findings?.length ?? 0 }),
    measureState: () => Promise.resolve({ phase: 'success', files: over.files ?? [] } as unknown as MeasureJob),
    manuscriptChapters: () => Promise.resolve(chaptersOf(over.chapters ?? [])),
    scriptPrepList: () => (over.prep === 'down' ? Promise.reject(new Error('down')) : Promise.resolve({ chapters: over.prep ?? [], words: [] })),
  } as NarrationApi;
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return renderHook(() => usePipelineSources(true, 'm'), { wrapper });
}

describe('usePipelineSources', () => {
  it('counts the cleared and all notes of the latest run per chapter', async () => {
    const view = sources({
      findings: [
        finding('c1', 'dismissed'),
        finding('c1', 'accepted'),
        finding('c1', 'unreviewed'),
        finding('c1', 'dismissed', { not_in_latest_run: true }),
        finding('c2', 'deferred'),
        finding(undefined, 'unreviewed'),
      ],
    });
    await waitFor(() => expect(view.result.current.proof).toEqual({ c1: { cleared: 1, total: 3 }, c2: { cleared: 0, total: 1 } }));
  });

  it("reads each chapter's mastered flag and QC verdict from its measured file", async () => {
    const view = sources({
      chapters: [chapter('c1', 0, 'One'), chapter('c2', 1, 'Two'), chapter('c3', 2, 'Three')],
      files: [file('One.wav', 'met'), file('Two.wav', 'not_met'), file('Three.wav', 'not_measurable')],
    });
    await waitFor(() =>
      expect(view.result.current.master).toEqual({
        c1: { mastered: true, qc: 'PASS' },
        c2: { mastered: true, qc: 'FAIL' },
        c3: { mastered: false, qc: null },
      }),
    );
  });

  it('a chapter with no reading leaves its cell Not measured yet', async () => {
    const view = sources({
      failFindings: true,
      chapters: [chapter('c1', 0, 'One'), chapter('c2', 1, 'Two')],
      files: [file('One.wav', 'met')],
    });
    await waitFor(() => expect(view.result.current.master).toEqual({ c1: { mastered: true, qc: 'PASS' } }));
    // c2 has no file and the findings could not be read: both stay absent, which the pipeline draws as "Not measured yet".
    expect(view.result.current.master?.c2).toBeUndefined();
    expect(view.result.current.proof).toBeUndefined();
  });

  it('leaves the master source absent while no file has been measured', async () => {
    const view = sources({ chapters: [chapter('c1', 0, 'One')], files: [] });
    await waitFor(() => expect(view.result.current.proof).toEqual({}));
    expect(view.result.current.master).toBeUndefined();
  });

  it("reads each chapter's prep state from the Script page's prep record", async () => {
    const view = sources({
      prep: [
        { chapterId: 'c1', state: 'prepped' },
        { chapterId: 'c2', state: 'progress' },
        { chapterId: 'c3', state: 'none' },
      ],
    });
    await waitFor(() => expect(view.result.current.prep).toEqual({ c1: 'prepped', c2: 'progress', c3: 'none' }));
  });

  it('leaves prep absent when the prep record cannot be read, and drops an earlier reading', async () => {
    let down = false;
    const api = {
      ...createMockApi(),
      findingsList: () => Promise.resolve({ findings: [], total: 0 }),
      measureState: () => Promise.resolve({ phase: 'success', files: [] } as unknown as MeasureJob),
      manuscriptChapters: () => Promise.resolve(chaptersOf([])),
      scriptPrepList: () =>
        down ? Promise.reject(new Error('down')) : Promise.resolve({ chapters: [{ chapterId: 'c1', state: 'prepped' as const }], words: [] }),
    } as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const view = renderHook(({ key }) => usePipelineSources(true, key), { wrapper, initialProps: { key: 'a' } });
    await waitFor(() => expect(view.result.current.prep).toEqual({ c1: 'prepped' }));
    down = true;
    view.rerender({ key: 'b' });
    await waitFor(() => expect(view.result.current.prep).toBeUndefined());
  });
});

describe('usePipelineSources under the store (#3658)', () => {
  it('shares the chapter list with the other readers instead of reading it again', async () => {
    const api = createMockApi();
    const read = vi.spyOn(api, 'manuscriptChapters');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => ({ chapters: useChapters(), pipeline: usePipelineSources(true, 'a') }), { wrapper });
    await waitFor(() => expect(result.current.chapters.chapters).toBeDefined());
    await waitFor(() => expect(result.current.pipeline.prep).toBeDefined());
    expect(read).toHaveBeenCalledTimes(1);
  });
  // The qa-breaker's breaks on the first version of the hook: it read the measurement on a new refresh key but not the list.
  function storeHook(chapters: () => Promise<ManuscriptChapter[]>, files: MeasureFileResult[]) {
    const api = {
      ...createMockApi(),
      findingsList: () => Promise.resolve({ findings: [], total: 0 }),
      measureState: () => Promise.resolve({ phase: 'success', files } as unknown as MeasureJob),
      manuscriptChapters: vi.fn(async () => chaptersOf(await chapters())),
      scriptPrepList: () => Promise.resolve({ chapters: [], words: [] }),
    } as unknown as NarrationApi & { manuscriptChapters: ReturnType<typeof vi.fn> };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const view = renderHook(({ key }) => usePipelineSources(true, key), { wrapper, initialProps: { key: 'a' } });
    return { api, view };
  }

  it('reads the chapter list again when the refresh key changes, with no job:ended', async () => {
    let list = [chapter('c1', 0, 'Alpha')];
    const { api, view } = storeHook(async () => list, [file('Alpha.wav', 'met'), file('Beta.wav', 'met')]);
    await waitFor(() => expect(view.result.current.master).toEqual({ c1: { mastered: true, qc: 'PASS' } }));
    list = [chapter('c1', 0, 'Alpha'), chapter('c2', 1, 'Beta')];
    view.rerender({ key: 'b' });
    await waitFor(() => expect(view.result.current.master?.c2).toEqual({ mastered: true, qc: 'PASS' }));
    expect(api.manuscriptChapters).toHaveBeenCalledTimes(2);
  });

  it('asks for the chapter list again on a refresh after its first read failed', async () => {
    let fail = true;
    const { view } = storeHook(async () => (fail ? Promise.reject(new Error('down')) : [chapter('c1', 0, 'Alpha')]), [file('Alpha.wav', 'met')]);
    await waitFor(() => expect(view.result.current.prep).toBeDefined());
    expect(view.result.current.master).toBeUndefined();
    fail = false;
    view.rerender({ key: 'b' });
    await waitFor(() => expect(view.result.current.master).toEqual({ c1: { mastered: true, qc: 'PASS' } }));
  });

  it("leaves Master and Next up's failing chapter absent while the chapter list's last read failed", async () => {
    let fail = false;
    const { view } = storeHook(async () => (fail ? Promise.reject(new Error('down')) : [chapter('c1', 0, 'Alpha')]), [file('Alpha.wav', 'not_met')]);
    await waitFor(() => expect(view.result.current.master).toBeDefined());
    fail = true;
    view.rerender({ key: 'b' });
    await waitFor(() => expect(view.result.current.master).toBeUndefined());
    expect(view.result.current.failing).toBeNull();
  });
  it("never pairs a reloaded chapter list with the previous project's measurement", async () => {
    let project = 'a';
    const files = { a: [file('Alpha.wav', 'met')], b: [file('Gamma.wav', 'met')] };
    const lists = { a: [chapter('a1', 0, 'Alpha')], b: [chapter('b1', 0, 'Alpha')] };
    const api = {
      ...createMockApi(),
      findingsList: () => Promise.resolve({ findings: [], total: 0 }),
      measureState: () => Promise.resolve({ phase: 'success', files: files[project as 'a' | 'b'] } as unknown as MeasureJob),
      manuscriptChapters: async () => chaptersOf(lists[project as 'a' | 'b']),
      scriptPrepList: () => Promise.resolve({ chapters: [], words: [] }),
    } as unknown as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const renders: unknown[] = [];
    const { result } = renderHook(
      () => {
        const out = { pipeline: usePipelineSources(true, 'same'), store: useStoreHandle() };
        renders.push(out.pipeline.master);
        return out;
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.pipeline.master).toEqual({ a1: { mastered: true, qc: 'PASS' } }));
    project = 'b';
    renders.length = 0;
    act(() => result.current.store.reset());
    // Project B's own measurement (Gamma.wav) matches none of its chapters: the cell ends empty, and no render before that shows project A's Alpha.wav against B's Alpha.
    await waitFor(() => expect(result.current.pipeline.master).toEqual({}));
    expect(renders.filter((master) => master && 'b1' in (master as object))).toEqual([]);
  });
  it("drops the previous project's proof and prep on a switch until the new reads answer", async () => {
    let project: 'a' | 'b' = 'a';
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const api = {
      ...createMockApi(),
      findingsList: async () => {
        if (project === 'b') await gate;
        return { findings: [finding('c-0001', 'dismissed')], total: 1 };
      },
      measureState: () => Promise.resolve({ phase: 'success', files: [] } as unknown as MeasureJob),
      manuscriptChapters: async () => chaptersOf([chapter('c-0001', 0, 'Alpha')]),
      scriptPrepList: async () => {
        if (project === 'b') await gate;
        return { chapters: [{ chapterId: 'c-0001', state: 'ready' }], words: [] } as unknown as ScriptPrep;
      },
    } as unknown as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => ({ pipeline: usePipelineSources(true, 'same'), store: useStoreHandle() }), { wrapper });
    await waitFor(() => expect(result.current.pipeline.proof).toBeDefined());
    await waitFor(() => expect(result.current.pipeline.prep).toBeDefined());
    project = 'b';
    act(() => result.current.store.reset());
    await waitFor(() => expect(result.current.pipeline.proof).toBeUndefined());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.pipeline.proof).toBeUndefined();
    expect(result.current.pipeline.prep).toBeUndefined();
    release();
    await waitFor(() => expect(result.current.pipeline.proof).toBeDefined());
  });

  it('never pairs a chapter list and a measurement read under different refresh keys', async () => {
    let key: 'a' | 'b' = 'a';
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const api = {
      ...createMockApi(),
      findingsList: () => Promise.resolve({ findings: [], total: 0 }),
      measureState: () => Promise.resolve({ phase: 'success', files: [file(key === 'a' ? 'Alpha.wav' : 'Beta.wav', 'met')] } as unknown as MeasureJob),
      manuscriptChapters: async () => {
        if (key === 'b') await gate;
        return key === 'a' ? chaptersOf([chapter('c1', 0, 'Alpha')]) : chaptersOf([chapter('c1', 0, 'Beta')]);
      },
      scriptPrepList: () => Promise.resolve({ chapters: [], words: [] }),
    } as unknown as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result, rerender } = renderHook(({ k }) => usePipelineSources(true, k), { wrapper, initialProps: { k: 'a' } });
    await waitFor(() => expect(result.current.master).toEqual({ c1: { mastered: true, qc: 'PASS' } }));
    key = 'b';
    rerender({ k: 'b' });
    // The new measurement (Beta.wav) has answered; the list is still the old one (Alpha): nothing is paired until the new list lands.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.master).toBeUndefined();
    release();
    await waitFor(() => expect(result.current.master).toEqual({ c1: { mastered: true, qc: 'PASS' } }));
  });
  it("reads everything again after a second switch made before the first switch's list arrived, with the same key", async () => {
    let project: 'a' | 'b' | 'c' = 'a';
    const measured = { a: 'Alpha.wav', b: 'Alpha.wav', c: 'Gamma.wav' } as const;
    const calls: string[] = [];
    const api = {
      ...createMockApi(),
      findingsList: async () => {
        calls.push(project);
        return { findings: [finding(`${project}1`, 'dismissed')], total: 1 };
      },
      measureState: () => Promise.resolve({ phase: 'success', files: [file(measured[project], 'met')] } as unknown as MeasureJob),
      manuscriptChapters: async () => {
        if (project === 'b') throw new Error('offline');
        return chaptersOf([chapter('c1', 0, 'Alpha')]);
      },
      scriptPrepList: () => Promise.resolve({ chapters: [], words: [] }),
    } as unknown as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result } = renderHook(() => ({ pipeline: usePipelineSources(true, 'same'), store: useStoreHandle() }), { wrapper });
    await waitFor(() => expect(result.current.pipeline.master).toEqual({ c1: { mastered: true, qc: 'PASS' } }));
    project = 'b';
    act(() => result.current.store.reset());
    await waitFor(() => expect(calls).toContain('b'));
    project = 'c';
    act(() => result.current.store.reset());
    // Project C's file (Gamma.wav) matches none of its chapters; project B's Alpha.wav is never paired with C's Alpha chapter, and B's proof is gone.
    await waitFor(() => expect(result.current.pipeline.master).toEqual({}));
    await waitFor(() => expect(result.current.pipeline.proof).toEqual({ c1: { cleared: 1, total: 1 } }));
    expect(calls).toContain('c');
  });

  it('pairs only what was read under the current key when keys change quickly', async () => {
    let key = 'a';
    const api = {
      ...createMockApi(),
      findingsList: () => Promise.resolve({ findings: [], total: 0 }),
      measureState: async () => {
        const mine = key;
        await new Promise((resolve) => setTimeout(resolve, mine === 'b' ? 80 : 5));
        return { phase: 'success', files: [file(mine === 'c' ? 'Gamma.wav' : 'Alpha.wav', 'met')] } as unknown as MeasureJob;
      },
      manuscriptChapters: async () => chaptersOf([chapter('c1', 0, key === 'c' ? 'Gamma' : 'Alpha')]),
      scriptPrepList: () => Promise.resolve({ chapters: [], words: [] }),
    } as unknown as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result, rerender } = renderHook(({ k }) => usePipelineSources(true, k), { wrapper, initialProps: { k: 'a' } });
    await waitFor(() => expect(result.current.master).toBeDefined());
    key = 'b';
    rerender({ k: 'b' });
    key = 'c';
    rerender({ k: 'c' });
    await waitFor(() => expect(result.current.master).toEqual({ c1: { mastered: true, qc: 'PASS' } }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(result.current.master).toEqual({ c1: { mastered: true, qc: 'PASS' } });
  });
  it('re-pairs when the store refreshes the chapter list on the same key (a rename, a recovery after a failed read)', async () => {
    let title = 'Alpha';
    let fail = false;
    const api = {
      ...createMockApi(),
      findingsList: () => Promise.resolve({ findings: [], total: 0 }),
      measureState: () => Promise.resolve({ phase: 'success', files: [file('Alpha.wav', 'met')] } as unknown as MeasureJob),
      manuscriptChapters: async () => {
        if (fail) throw new Error('offline');
        return chaptersOf([chapter('c1', 0, title)]);
      },
      scriptPrepList: () => Promise.resolve({ chapters: [], words: [] }),
    } as unknown as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result, rerender } = renderHook(({ k }) => ({ pipeline: usePipelineSources(true, k), store: useStoreHandle() }), {
      wrapper,
      initialProps: { k: 'a' },
    });
    await waitFor(() => expect(result.current.pipeline.master).toEqual({ c1: { mastered: true, qc: 'PASS' } }));
    title = 'Beta';
    await act(() => result.current.store.load('chapters'));
    await waitFor(() => expect(result.current.pipeline.master).toEqual({}));
    // A key whose list read fails, then the slot recovers on an event: the cells come back without another key.
    fail = true;
    rerender({ k: 'b' });
    title = 'Alpha';
    await waitFor(() => expect(result.current.store.getState().errors.chapters).toBeDefined());
    fail = false;
    await act(() => result.current.store.load('chapters'));
    await waitFor(() => expect(result.current.pipeline.master).toEqual({ c1: { mastered: true, qc: 'PASS' } }));
  });
  it('reads each source once for a project switch whose new key follows the reset, as a key change alone does', async () => {
    const counts = { findings: 0, prep: 0, measure: 0, chapters: 0 };
    const api = {
      ...createMockApi(),
      findingsList: async () => {
        counts.findings += 1;
        return { findings: [], total: 0 };
      },
      measureState: async () => {
        counts.measure += 1;
        return { phase: 'success', files: [file('Alpha.wav', 'met')] } as unknown as MeasureJob;
      },
      manuscriptChapters: async () => {
        counts.chapters += 1;
        return chaptersOf([chapter('c1', 0, 'Alpha')]);
      },
      scriptPrepList: async () => {
        counts.prep += 1;
        return { chapters: [], words: [] };
      },
    } as unknown as NarrationApi;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
    const { result, rerender } = renderHook(({ k }) => ({ pipeline: usePipelineSources(true, k), store: useStoreHandle() }), {
      wrapper,
      initialProps: { k: 'a' },
    });
    await waitFor(() => expect(result.current.pipeline.master).toBeDefined());
    expect(counts).toEqual({ findings: 1, prep: 1, measure: 1, chapters: 1 });
    act(() => result.current.store.reset());
    rerender({ k: 'b' });
    await waitFor(() => expect(result.current.pipeline.master).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(counts).toEqual({ findings: 2, prep: 2, measure: 2, chapters: 2 });
  });
});
