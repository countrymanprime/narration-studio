// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportItem } from '../../types';
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

  it('scrolls to a refusal that shows with no files', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<MasterToSpecPanel jobs={jobs()} />);
    rerender(<MasterToSpecPanel jobs={jobs({ problem: 'Could not read the folder.' })} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe('Could not read the folder.');
  });
});

describe('MasterToSpecPanel: after the files are prepared (issue 2631)', () => {
  const done = {
    phase: 'success',
    message: 'Prepared 1 files.',
    percent: 100,
    files: [{ path: item.path, kind: 'chapter', title: 'Chapter 01', status: 'done' }],
  };

  it('says the files are new copies that Delivery has not measured, and offers Check files…', () => {
    const onCheckFiles = vi.fn();
    render(<MasterToSpecPanel jobs={jobs({ exportJob: done as never, items: [item] })} onCheckFiles={onCheckFiles} />);
    expect(screen.getByText(/new copies/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check files…' }));
    expect(onCheckFiles).toHaveBeenCalledTimes(1);
  });

  it('offers no Check files… after a failed or cancelled export, or when the page gives no way to check', () => {
    const { rerender } = render(<MasterToSpecPanel jobs={jobs({ exportJob: { ...done, phase: 'error' } as never })} onCheckFiles={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Check files…' })).toBeNull();
    rerender(<MasterToSpecPanel jobs={jobs({ exportJob: done as never })} />);
    expect(screen.queryByRole('button', { name: 'Check files…' })).toBeNull();
  });
});
