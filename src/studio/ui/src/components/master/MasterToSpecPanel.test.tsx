// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { ExportItem } from '../../types';
import { toastTexts } from '../../fixtures/toasts';
import { MasterToSpecPanel } from './MasterToSpecPanel';
import { type ExportJobs, useExportJobs } from './useExportJobs';

afterEach(cleanup);

const item: ExportItem = { path: 'C:\\renders\\Chapter 01.wav', kind: 'chapter', title: 'Chapter 01' };

function jobs(patch: Partial<ExportJobs> = {}): ExportJobs {
  return { picking: false, items: [], exportJob: undefined, exportRunning: false, problem: undefined, ...patch } as unknown as ExportJobs;
}

describe('MasterToSpecPanel: showing up', () => {
  it('draws nothing until files are picked', () => {
    const { container } = render(<MasterToSpecPanel jobs={jobs()} />);
    expect(container.firstChild).toBeNull();
  });

  it('scrolls to its files and puts the keyboard on them when picking first shows it', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<MasterToSpecPanel jobs={jobs()} />);
    rerender(<MasterToSpecPanel jobs={jobs({ items: [item] })} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('table', { name: 'Files to export' }).parentElement);
  });

  it('does not move the page when it is already showing on arrival or gains a file', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<MasterToSpecPanel jobs={jobs({ items: [item] })} />);
    rerender(<MasterToSpecPanel jobs={jobs({ items: [item, { ...item, path: 'C:\\renders\\Chapter 02.wav' }] })} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('tells a refusal that has no files as a toast and draws no panel for it', () => {
    const { container, rerender } = render(<MasterToSpecPanel jobs={jobs()} />);
    rerender(<MasterToSpecPanel jobs={jobs({ problem: 'Could not read the folder.' })} />);
    expect(toastTexts()).toEqual(['Could not read the folder.']);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tells a job that ended in error as one toast, and draws no red line under the table (rule 7, #2632)', () => {
    const failed = {
      ...jobs({ items: [item] }),
      exportJob: { id: 'j', phase: 'error', message: 'The encoder stopped.', percent: 40, files: [] },
    } as unknown as ExportJobs;
    const { container } = render(<MasterToSpecPanel jobs={failed} />);
    expect(toastTexts()).toEqual(['The encoder stopped.']);
    expect(container.textContent).not.toContain('The encoder stopped.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('MasterToSpecPanel: after the files are prepared (issue 2631)', () => {
  const done = {
    phase: 'success',
    message: 'Prepared 1 files.',
    percent: 100,
    files: [{ path: item.path, kind: 'chapter', title: 'Chapter 01', status: 'done' }],
  };

  it('offers an icon button that checks the prepared files, and draws no explanatory sentence', () => {
    const onCheckFiles = vi.fn();
    render(<MasterToSpecPanel jobs={jobs({ exportJob: done as never, items: [item] })} onCheckFiles={onCheckFiles} />);
    expect(screen.queryByText(/new copies/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /check the prepared files/i }));
    expect(onCheckFiles).toHaveBeenCalledTimes(1);
  });

  it('offers no Check files… after a failed or cancelled export, or when the page gives no way to check', () => {
    const { rerender } = render(<MasterToSpecPanel jobs={jobs({ exportJob: { ...done, phase: 'error' } as never })} onCheckFiles={() => undefined} />);
    expect(screen.queryByRole('button', { name: /check the prepared files/i })).toBeNull();
    rerender(<MasterToSpecPanel jobs={jobs({ exportJob: done as never })} />);
    expect(screen.queryByRole('button', { name: /check the prepared files/i })).toBeNull();
  });
});

describe('MasterToSpecPanel: the chain it masters with', () => {
  it.each([
    ['built-in', 'builtin', 'Built-in chain (EQ, limiter, gain)', 'Master before encoding: Built-in chain (EQ, limiter, gain)'],
    ['DAW', 'daw', "Your DAW's FX chain", "Master before encoding: Your DAW's FX chain"],
    ['Audacity', 'audacity', "Audacity's effect macro", "Master before encoding: Audacity's effect macro"],
  ])("names the %s row in the host's own words, never lowercased into the sentence (#2879's review)", (_, name, label, wording) => {
    render(<MasterToSpecPanel jobs={jobs({ items: [item], master: true } as never)} chain={{ name, label } as never} />);
    expect(screen.getByRole('checkbox', { name: wording })).toBeTruthy();
    cleanup();
  });
});

// #2935: a job that ended (cancelled, finished or failed) gave back none of the panel's controls until the page reloaded.
describe('MasterToSpecPanel: after a job ends, the controls come back (#2935)', () => {
  function Harness() {
    const exportJobs = useExportJobs();
    return (
      <>
        <button type="button" onClick={() => void exportJobs.pick()}>
          Pick
        </button>
        <MasterToSpecPanel jobs={exportJobs} />
      </>
    );
  }

  async function mount(renderExport?: 'hold') {
    const api = createMockApi({}, renderExport ? { renderExport } : {});
    const exportStart = vi.spyOn(api, 'exportStart');
    render(
      <ApiProvider api={api}>
        <Harness />
      </ApiProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pick' }));
    await screen.findByRole('button', { name: 'Master & encode' });
    return { exportStart };
  }

  const controls = () => ({
    masterAndEncode: !!screen.queryByRole('button', { name: 'Master & encode' }),
    addFiles: !!screen.queryByRole('button', { name: 'Add files…' }),
    master: !!screen.queryByRole('checkbox', { name: /^Master before encoding/ }),
  });

  it('hides them while the job runs, and gives them back when it is cancelled', async () => {
    await mount('hold');
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    await screen.findByRole('progressbar', { name: 'Preparing files' });
    expect(controls()).toEqual({ masterAndEncode: false, addFiles: false, master: false });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByText(/^Export cancelled\./);
    expect(controls()).toEqual({ masterAndEncode: true, addFiles: true, master: true });
    // The files are editable again, each still saying how the last run left it.
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(5);
    expect(screen.getAllByText('Cancelled')).toHaveLength(5);
  });

  it('gives them back when the job finishes, and Master & encode runs again', async () => {
    const { exportStart } = await mount();
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    await screen.findByText(/^Prepared 5 files\./, undefined, { timeout: 10_000 });
    expect(controls()).toEqual({ masterAndEncode: true, addFiles: true, master: true });
    await userEvent.click(screen.getByRole('button', { name: 'Master & encode' }));
    await waitFor(() => expect(exportStart).toHaveBeenCalledTimes(2));
  }, 15_000);
});

describe('MasterToSpecPanel: which controls each job phase draws (#2935)', () => {
  const job = (phase: string, status: string) =>
    ({ id: 'j', phase, message: `The job is ${phase}.`, percent: 50, files: [{ path: item.path, kind: 'chapter', title: 'Chapter 01', status }] }) as never;

  it.each([
    ['running', 'mastering', false],
    ['success', 'done', true],
    ['cancelled', 'cancelled', true],
    ['error', 'failed', true],
  ])('a %s job with files picked draws the controls: %s', (phase, status, shown) => {
    render(<MasterToSpecPanel jobs={jobs({ items: [item], master: true, exportJob: job(phase, status), exportRunning: phase === 'running' } as never)} />);
    expect(!!screen.queryByRole('button', { name: 'Master & encode' })).toBe(shown);
    expect(!!screen.queryByRole('button', { name: 'Add files…' })).toBe(shown);
    expect(!!screen.queryByRole('checkbox', { name: /^Master before encoding/ })).toBe(shown);
    expect(!!screen.queryByRole('combobox', { name: 'Role for Chapter 01.wav' })).toBe(shown);
  });

  it('after a reload with a finished job and nothing picked: the last run read-only, and Add files… to start again', () => {
    render(<MasterToSpecPanel jobs={jobs({ exportJob: job('success', 'done') })} />);
    expect(screen.getByRole('cell', { name: 'Chapter 01.wav' })).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add files…' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Master & encode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
