// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { Finding } from '../../api/contracts/findings';
import type { ScriptPrep } from '../../api/contracts/scriptPrep';
import { createMockApi } from '../../api/mockApi';
import type { ManuscriptChapter, MeasureFileResult, MeasureJob, NarrationApi } from '../../types';
import { usePipelineSources } from './usePipelineSources';

const finding = (chapterId: string | undefined, status: Finding['review']['status'], extra: Partial<Finding> = {}) =>
  ({ id: `${chapterId}-${status}-${Math.random()}`, manuscript: chapterId ? { chapter_id: chapterId } : undefined, review: { status }, ...extra }) as Finding;

const chapter = (id: string, index: number, title: string) => ({ id, index, title }) as ManuscriptChapter;
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
    manuscriptChapters: () => Promise.resolve(over.chapters ?? []),
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
      manuscriptChapters: () => Promise.resolve([]),
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
