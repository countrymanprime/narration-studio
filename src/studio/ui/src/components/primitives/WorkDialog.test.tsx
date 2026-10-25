// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkJob } from '../../types';
import { WorkDialog } from './WorkDialog';

afterEach(cleanup);

const job = (patch: Partial<WorkJob>): WorkJob => ({
  id: 'job-1',
  kind: 'manuscript_import',
  phase: 'running',
  message: 'Parsing chapter 4 of 12',
  percent: 35,
  elapsed: 12,
  logs: [],
  ...patch,
});

const PHASES: WorkJob['phase'][] = ['preparing', 'running', 'committing', 'success', 'error', 'cancelled'];

describe('WorkDialog', () => {
  it('stays open when the backdrop is pressed, whatever phase the job is in: a job is ended with its own buttons (issue 1706)', () => {
    for (const phase of PHASES) {
      const close = vi.fn();
      const background = vi.fn();
      render(<WorkDialog title="Rebuild Story Bible" job={job({ phase })} close={close} cancel={vi.fn()} background={background} />);
      fireEvent.click(document.querySelector('[data-dialog-backdrop]') as HTMLElement);
      expect(close, phase).not.toHaveBeenCalled();
      expect(background, phase).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Rebuild Story Bible' }), phase).toBeTruthy();
      cleanup();
    }
  });

  it('never leaves a dialog with nothing to press and nothing said about it', () => {
    // Every phase, with and without a cancel handler: a control to press, or the dialog says why there is none.
    for (const phase of PHASES) {
      for (const cancel of [undefined, vi.fn()]) {
        render(<WorkDialog title="Rebuild Story Bible" job={job({ phase })} close={vi.fn()} cancel={cancel} />);
        const dialog = screen.getByRole('dialog', { name: 'Rebuild Story Bible' });
        const buttons = dialog.querySelectorAll('button');
        const describedBy = dialog.getAttribute('aria-describedby');
        const explained = /cannot be cancelled/.test((describedBy && document.getElementById(describedBy)?.textContent) || '');
        expect(buttons.length > 0 || explained, `${phase} ${cancel ? 'with' : 'without'} cancel`).toBe(true);
        cleanup();
      }
    }
  });

  it('says a running job cannot be cancelled when it has no Cancel, and describes the dialog with it', () => {
    render(<WorkDialog title="Rebuild Story Bible" job={job({ phase: 'running' })} close={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Rebuild Story Bible' });
    expect(screen.getByText(/cannot be cancelled/i).closest('[id]')?.id).toBe(dialog.getAttribute('aria-describedby'));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders no empty action row while a job with no Cancel runs', () => {
    render(<WorkDialog title="Rebuild Story Bible" job={job({ phase: 'committing' })} close={vi.fn()} />);
    expect(document.querySelector('[data-dialog-actions]')).toBeNull();
  });

  it('shows Cancel and no explanation while a cancellable job runs', () => {
    render(<WorkDialog title="Import manuscript" job={job({ phase: 'preparing' })} close={vi.fn()} cancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(document.querySelector('[data-dialog-actions]')).not.toBeNull();
    expect(screen.queryByText(/cannot be cancelled/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('offers Close, and no explanation, once the job has finished', () => {
    for (const phase of ['success', 'error', 'cancelled'] as const) {
      render(<WorkDialog title="Rebuild Story Bible" job={job({ phase, percent: 100 })} close={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
      expect(screen.queryByText(/cannot be cancelled/i)).toBeNull();
      cleanup();
    }
  });

  it('lets a job that the app announces on its own be sent to the background, by button and by Escape, and only while it runs', () => {
    const background = vi.fn();
    render(<WorkDialog title="Rebuild Story Bible" job={job({ phase: 'running' })} close={vi.fn()} background={background} />);
    expect(screen.getByText(/keeps running, and a message appears/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue in background' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(background).toHaveBeenCalled();
    cleanup();
    render(<WorkDialog title="Rebuild Story Bible" job={job({ phase: 'success', percent: 100 })} close={vi.fn()} background={background} />);
    expect(screen.queryByRole('button', { name: 'Continue in background' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('slides and fills only for people who have not asked for reduced motion', () => {
    render(<WorkDialog title="Rebuild Story Bible" job={job({ percent: 0 })} close={vi.fn()} />);
    const fill = document.querySelector('.progressbar > div');
    expect(fill).not.toBeNull();
    const classes = (fill as HTMLElement).className.split(/\s+/);
    expect(classes).toContain('motion-ok:animate-[work-progress-slide_1.15s_ease-in-out_infinite]');
    expect(classes).toContain('motion-ok:transition-[width]');
    expect(classes.filter((c) => /^(animate|transition)-/.test(c))).toEqual([]);
  });
});

describe('WorkDialog live activity', () => {
  // jsdom lays nothing out, so a log box reports the size the test gives it.
  const sized = (box: HTMLElement, scrollHeight: number, clientHeight = 100) => {
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: clientHeight });
  };
  const logBox = () => screen.getByText('first').parentElement!;
  const withLogs = (logs: string[]) => <WorkDialog title="Import manuscript" job={job({ logs })} close={vi.fn()} cancel={vi.fn()} />;

  it('follows the newest line, so the log moves while a job runs', () => {
    const view = render(withLogs(['first']));
    const box = logBox() as HTMLElement;
    sized(box, 500);
    view.rerender(withLogs(['first', 'second']));
    expect(box.scrollTop).toBe(500);
    sized(box, 800);
    view.rerender(withLogs(['first', 'second', 'third']));
    expect(box.scrollTop).toBe(800);
  });

  it('stops following once the narrator scrolls up to read, and follows again when they return to the bottom', () => {
    const view = render(withLogs(['first']));
    const box = logBox() as HTMLElement;
    sized(box, 500);
    box.scrollTop = 0;
    fireEvent.scroll(box);
    view.rerender(withLogs(['first', 'second']));
    expect(box.scrollTop).toBe(0);
    box.scrollTop = 400;
    fireEvent.scroll(box);
    sized(box, 900);
    view.rerender(withLogs(['first', 'second', 'third']));
    expect(box.scrollTop).toBe(900);
  });
});

describe('WorkDialog says each thing once (R4SB-8, R3SE1-1, R3SB2-15, R3PR2-22)', () => {
  it('draws no log while the log only repeats the status line', () => {
    render(<WorkDialog title="Download voice" job={job({ message: 'Downloading the voice...', logs: ['Downloading the voice...'] })} cancel={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Downloading the voice…');
    expect(screen.queryByText('Live activity')).toBeNull();
  });

  it('keeps the earlier lines in the log and leaves out the one the status line says', () => {
    render(
      <WorkDialog
        title="Import manuscript"
        job={job({ message: 'Parsing chapter 4 of 12', logs: ['Reading the file', 'Parsing chapter 4 of 12'] })}
        cancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Live activity')).toBeTruthy();
    expect(screen.getByText('Reading the file')).toBeTruthy();
    expect(screen.getAllByText('Parsing chapter 4 of 12')).toHaveLength(1);
  });

  it('writes one ellipsis, the character, whatever the host sent', () => {
    render(
      <WorkDialog title="Recording check" job={job({ message: 'Transcribing item 2 of 2...', logs: ['Starting the recording check...'] })} cancel={vi.fn()} />,
    );
    expect(screen.getByText('Starting the recording check…')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Transcribing item 2 of 2…');
  });

  it('says the elapsed time under the bar, as a phrase', () => {
    render(<WorkDialog title="Import manuscript" job={job({ elapsed: 12.6 })} cancel={vi.fn()} />);
    expect(screen.getByText('12 s elapsed')).toBeTruthy();
  });

  it('offers Retry beside Close when the caller can start the job again, and draws the bar in the failure colour', () => {
    const retry = vi.fn();
    render(<WorkDialog title="Download voice" job={job({ phase: 'error', error: 'The download failed.' })} close={vi.fn()} retry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(document.querySelector('.bg-\\[var\\(--danger\\)\\]')).not.toBeNull();
  });

  it('offers no Retry while the job runs, nor after a failure the caller cannot repeat', () => {
    render(<WorkDialog title="Download voice" job={job({ phase: 'running' })} cancel={vi.fn()} retry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    cleanup();
    render(<WorkDialog title="Download voice" job={job({ phase: 'error', error: 'The download failed.' })} close={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
