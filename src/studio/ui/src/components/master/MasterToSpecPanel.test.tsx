// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportItem } from '../../types';
import { toastTexts } from '../../fixtures/toasts';
import { MasterToSpecPanel } from './MasterToSpecPanel';
import type { ExportJobs } from './useExportJobs';

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
