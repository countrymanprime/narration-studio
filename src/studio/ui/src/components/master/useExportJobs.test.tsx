// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { MOCK_EXPORT_PATHS } from '../../api/renderEncodeMasterMock';
import type { ExportJob, NarrationApi } from '../../types';
import { clearToasts, toastTexts } from '../../fixtures/toasts';
import { useExportJobs } from './useExportJobs';

beforeEach(clearToasts);
afterEach(() => vi.useRealTimers());

function mount(api: NarrationApi) {
  const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
  return renderHook(() => useExportJobs(), { wrapper });
}

const job = (phase: ExportJob['phase'], status: ExportJob['files'][number]['status'], paths: readonly string[] = MOCK_EXPORT_PATHS.slice(0, 2)): ExportJob => ({
  id: 'export-1',
  kind: 'render_export',
  phase,
  message: `The export is ${phase}.`,
  percent: phase === 'running' ? 40 : 100,
  master: true,
  provider: 'builtin',
  format: 'mp3',
  logs: [],
  elapsed: 0,
  files: paths.map((path) => ({ kind: 'chapter', title: path.split('/').pop() ?? path, path, status })),
});

describe('useExportJobs: following a running export (#2935 review)', () => {
  it('keeps polling after one failed read of a running export', async () => {
    let reads = 0;
    const exportState = vi.fn(async () => {
      reads += 1;
      if (reads === 1) return job('running', 'mastering');
      if (reads === 2) throw new Error('The app did not answer.');
      return job('success', 'done');
    });
    const { result } = mount(createMockApi({ exportState }));
    await waitFor(() => expect(result.current.exportJob?.phase).toBe('success'), { timeout: 4000 });
    expect(reads).toBeGreaterThanOrEqual(3);
    // Once a read answers again, the error is no longer true: its toast goes.
    await waitFor(() => expect(result.current.problem).toBeUndefined());
  });

  it('marks Cancel pending while its request is out, and sends one request however often it is pressed', async () => {
    let answer: (job: ExportJob) => void = () => undefined;
    const exportCancel = vi.fn(() => new Promise<ExportJob>((resolve) => (answer = resolve)));
    const { result } = mount(createMockApi({ exportState: async () => job('running', 'mastering'), exportCancel }));
    await waitFor(() => expect(result.current.exportRunning).toBe(true));
    act(() => result.current.cancelExport());
    act(() => result.current.cancelExport());
    act(() => result.current.cancelExport());
    expect(result.current.cancelling).toBe(true);
    expect(exportCancel).toHaveBeenCalledTimes(1);
    await act(async () => answer(job('cancelled', 'cancelled')));
    expect(result.current.cancelling).toBe(false);
  });
});

describe('useExportJobs: picking (#2935 review)', () => {
  it('drops repeats within one batch, and says once which picked files are already in the list', async () => {
    const [a, b] = MOCK_EXPORT_PATHS;
    const exportPickFiles = vi
      .fn()
      .mockResolvedValueOnce({ paths: [a, a, b] })
      .mockResolvedValueOnce({ paths: [b] });
    const { result } = mount(createMockApi({ exportPickFiles }));
    await act(() => result.current.pick());
    expect(result.current.items.map((item) => item.path)).toEqual([a, b]);
    expect(toastTexts()).toEqual([]);
    await act(() => result.current.pick());
    expect(result.current.items.map((item) => item.path)).toEqual([a, b]);
    expect(toastTexts()).toEqual(['Chapter 01.wav is already in the list.']);
  });

  it('counts the files already in the list when there are several', async () => {
    const [a, b] = MOCK_EXPORT_PATHS;
    const exportPickFiles = vi.fn().mockResolvedValue({ paths: [a, b] });
    const { result } = mount(createMockApi({ exportPickFiles }));
    await act(() => result.current.pick());
    await act(() => result.current.pick());
    expect(toastTexts()).toEqual(['2 files are already in the list.']);
  });
});

describe('useExportJobs: the last run and its rows (#2935 review)', () => {
  it("takes an ended job's files as the picked files when the page opens with none, once", async () => {
    const { result } = mount(createMockApi({ exportState: async () => job('cancelled', 'cancelled') }));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map((item) => item.path)).toEqual(MOCK_EXPORT_PATHS.slice(0, 2));
    // Removing them dismisses the last run: they do not come back.
    act(() => MOCK_EXPORT_PATHS.slice(0, 2).forEach((path) => result.current.removeItem(path)));
    expect(result.current.items).toEqual([]);
    await act(async () => undefined);
    expect(result.current.items).toEqual([]);
  });

  it('takes the files of a job that was running when the page opened once it ends', async () => {
    let phase: ExportJob['phase'] = 'running';
    const { result } = mount(createMockApi({ exportState: async () => job(phase, phase === 'running' ? 'mastering' : 'done') }));
    await waitFor(() => expect(result.current.exportRunning).toBe(true));
    expect(result.current.items).toEqual([]);
    phase = 'success';
    await waitFor(() => expect(result.current.items).toHaveLength(2), { timeout: 3000 });
  });

  it('gives a row no result once its file is removed, even when it is picked again', async () => {
    const { result } = mount(createMockApi({ exportState: async () => job('cancelled', 'cancelled') }));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    const [a] = MOCK_EXPORT_PATHS;
    expect(result.current.resultFor(a)?.status).toBe('cancelled');
    act(() => result.current.removeItem(a));
    expect(result.current.resultFor(a)).toBeUndefined();
  });

  it("shows no row the last run's result while a new start waits for its answer", async () => {
    let answer: (job: ExportJob) => void = () => undefined;
    const exportStart = vi.fn(() => new Promise<ExportJob>((resolve) => (answer = resolve)));
    const { result } = mount(createMockApi({ exportState: async () => job('success', 'done'), exportStart }));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    const [a] = MOCK_EXPORT_PATHS;
    expect(result.current.resultFor(a)?.status).toBe('done');
    act(() => void result.current.startExport(null));
    expect(result.current.resultFor(a)).toBeUndefined();
    await act(async () => answer(job('running', 'pending')));
    expect(result.current.resultFor(a)?.status).toBe('pending');
  });
});
