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
  // #2931: it used to draw nothing until files were picked, so the only way in was the page header's unlabelled icon.
  it('with nothing picked, draws its card with a labelled primary that picks the files, and the mastering checkbox', () => {
    const pick = vi.fn(() => Promise.resolve());
    render(
      <MasterToSpecPanel jobs={jobs({ master: true, pick } as never)} chain={{ name: 'builtin', label: 'Built-in chain (EQ, limiter, gain)' } as never} />,
    );
    expect(screen.getByRole('region', { name: 'Master to spec' })).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Choose files to master…' });
    expect(button.textContent).toBe('Choose files to master…');
    expect(screen.getByRole('checkbox', { name: 'Master before encoding: Built-in chain (EQ, limiter, gain)' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add files…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Master & encode' })).toBeNull();
    fireEvent.click(button);
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('with mastering off, the same button says it chooses files to encode', () => {
    render(<MasterToSpecPanel jobs={jobs({ master: false })} />);
    expect(screen.getByRole('button', { name: 'Choose files to encode…' })).toBeTruthy();
  });

  it('shows the picker open on the button, and takes the button away once files are picked', () => {
    const { rerender } = render(<MasterToSpecPanel jobs={jobs({ master: true, picking: true } as never)} />);
    expect(screen.getByRole('button', { name: 'Choose files to master…' }).getAttribute('aria-busy')).toBe('true');
    rerender(<MasterToSpecPanel jobs={jobs({ master: true, items: [item] } as never)} />);
    expect(screen.queryByRole('button', { name: 'Choose files to master…' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add files…' })).toBeTruthy();
  });

  it('removing the last file puts the keyboard on Choose files to master…, not the page body', () => {
    const { rerender } = render(<MasterToSpecPanel jobs={jobs({ master: true, items: [item] } as never)} />);
    screen.getByRole('button', { name: 'Remove' }).focus();
    rerender(<MasterToSpecPanel jobs={jobs({ master: true, items: [] } as never)} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Choose files to master…' }));
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

  it('tells a refusal that has no files as a toast, and draws no text for it in the card', () => {
    const { container, rerender } = render(<MasterToSpecPanel jobs={jobs()} />);
    rerender(<MasterToSpecPanel jobs={jobs({ problem: 'Could not read the folder.' })} />);
    expect(toastTexts()).toEqual(['Could not read the folder.']);
    expect(container.textContent).not.toContain('Could not read the folder.');
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
