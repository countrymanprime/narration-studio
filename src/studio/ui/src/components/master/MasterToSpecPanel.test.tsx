// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  const resultFor = (path: string) => patch.exportJob?.files.find((file) => file.path === path);
  return { picking: false, items: [], exportJob: undefined, exportRunning: false, problem: undefined, resultFor, ...patch } as unknown as ExportJobs;
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

  // The hook now takes an ended job's files as the picked files (useExportJobs.test.tsx), so they are editable and removable; with none
  // picked, an ended job draws no rows of its own that could not be cleared (#2935 review, break 1).
  it('with an ended job and nothing picked, draws no rows', () => {
    const { container } = render(<MasterToSpecPanel jobs={jobs({ exportJob: job('success', 'done') })} />);
    expect(container.innerHTML).toBe('');
  });

  it('a long unbroken failure reason wraps inside the Status cell instead of running past it', () => {
    const reason = `could-not-read-${'x'.repeat(200)}`;
    const failed = {
      ...(job('error', 'failed') as object),
      files: [{ path: item.path, kind: 'chapter', title: 'Chapter 01', status: 'failed', error: reason }],
    };
    render(<MasterToSpecPanel jobs={jobs({ items: [item], exportJob: failed as never })} />);
    const text = screen.getByText(reason);
    expect(text.className).toContain('[overflow-wrap:anywhere]');
    expect(text.className).toContain('whitespace-normal');
  });

  it('locks the rows, Add files… and the checkbox while a start waits for its answer', () => {
    render(<MasterToSpecPanel jobs={jobs({ items: [item], master: true, starting: true } as never)} />);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add files…' }).hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByRole('checkbox', { name: /^Master before encoding/ }).getAttribute('aria-disabled') ??
        screen.getByRole('checkbox', { name: /^Master before encoding/ }).getAttribute('data-disabled'),
    ).not.toBeNull();
    // Master & encode keeps its place and the keyboard, showing it is busy.
    expect(screen.getByRole('button', { name: 'Master & encode' }).getAttribute('aria-busy')).toBe('true');
  });

  it('shows Cancel busy while its request is out', () => {
    render(<MasterToSpecPanel jobs={jobs({ items: [item], exportJob: job('running', 'mastering'), exportRunning: true, cancelling: true } as never)} />);
    expect(screen.getByRole('button', { name: 'Cancel' }).getAttribute('aria-busy')).toBe('true');
  });
});

describe('MasterToSpecPanel: dismissing the last run (#2935 review)', () => {
  function Harness({ onEmptied }: { onEmptied?: () => void }) {
    const exportJobs = useExportJobs();
    return (
      <>
        <button type="button" onClick={() => void exportJobs.pick()}>
          Pick
        </button>
        <MasterToSpecPanel jobs={exportJobs} onEmptied={onEmptied} />
      </>
    );
  }

  async function cancelled(onEmptied?: () => void) {
    render(
      <ApiProvider api={createMockApi({}, { renderExport: 'hold' })}>
        <Harness onEmptied={onEmptied} />
      </ApiProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pick' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Master & encode' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByText(/^Export cancelled\./);
  }

  it('removing the last picked file after a cancelled job leaves no rows', async () => {
    await cancelled();
    for (const button of screen.getAllByRole('button', { name: 'Remove' })) await userEvent.click(button);
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    expect(screen.queryByText('Cancelled')).toBeNull();
  });
});

// Every Master to spec action that takes its own button away hands the keyboard on, never to <body> (#2935 review, break 3).
describe('MasterToSpecPanel: no action leaves the keyboard on the page body', () => {
  const onBody = () => document.activeElement === null || document.activeElement === document.body;

  it('Cancel pressed from the keyboard puts the keyboard on Master & encode once the run ends', async () => {
    render(
      <ApiProvider api={createMockApi({}, { renderExport: 'hold' })}>
        <MasterToSpecHarness />
      </ApiProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pick' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Master & encode' }));
    (await screen.findByRole('button', { name: 'Cancel' })).focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByText(/^Export cancelled\./);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Master & encode' })));
  });

  it('a run that ends on its own while the keyboard is on Cancel moves it to Master & encode', () => {
    const running = {
      id: 'j',
      phase: 'running',
      message: 'Preparing 1 file.',
      percent: 40,
      files: [{ path: item.path, kind: 'chapter', title: 'Chapter 01', status: 'mastering' }],
    };
    const { rerender } = render(<MasterToSpecPanel jobs={jobs({ items: [item], master: true, exportJob: running as never, exportRunning: true } as never)} />);
    screen.getByRole('button', { name: 'Cancel' }).focus();
    const done = { ...running, phase: 'success', message: 'Prepared 1 file.', files: [{ ...running.files[0], status: 'done' }] };
    rerender(<MasterToSpecPanel jobs={jobs({ items: [item], master: true, exportJob: done as never } as never)} />);
    expect(onBody()).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Master & encode' }));
  });

  it('Remove hands the keyboard to the next row, then the one before, and the last one to the way back in', async () => {
    const onEmptied = vi.fn(() => document.getElementById('entry')?.focus());
    const second = { ...item, path: 'C:\\renders\\Chapter 02.wav', title: 'Chapter 02' };
    function Rows() {
      const [items, setItems] = useState<ExportItem[]>([item, second]);
      const removeItem = (path: string) => setItems((current) => current.filter((row) => row.path !== path));
      return (
        <>
          <button id="entry" type="button">
            Entry
          </button>
          <MasterToSpecPanel jobs={jobs({ items, removeItem, master: true } as never)} onEmptied={onEmptied} />
        </>
      );
    }
    render(<Rows />);
    const removeOf = (file: string) => within(screen.getByRole('cell', { name: file }).closest('tr') as HTMLElement).getByRole('button', { name: 'Remove' });
    await userEvent.click(removeOf('Chapter 01.wav'));
    expect(document.activeElement).toBe(removeOf('Chapter 02.wav'));
    await userEvent.click(removeOf('Chapter 02.wav'));
    expect(onEmptied).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe('entry');
  });
});

function MasterToSpecHarness() {
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
