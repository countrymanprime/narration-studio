// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportItem } from '../../types';
import { toastTexts } from '../../overlay/toastTesting';
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
});
