// @vitest-environment jsdom
// The state matrix of docs/research/master-qc-state-matrix.md: the cells about an integration that goes quiet, answers late or is pressed twice.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { overlay } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { MeasureFileResult, MeasureJob, NarrationApi } from '../../../types';
import { MasterPage } from './MasterPage';
import { acx, apiOf, jobOf, passing } from './testPage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  overlay.getSnapshot().toasts.forEach((toast) => overlay.dismissToast(toast.id));
});

const PROPS = { hasManuscript: true, projectFolder: '/p', onOpenDelivery: vi.fn(), openSettings: vi.fn() };

function mount(files: readonly MeasureFileResult[], overrides: Partial<NarrationApi> = {}, daw?: DawClient) {
  const client = daw ?? createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: [], measuredFiles: files });
  const api = apiOf(jobOf(files), acx, overrides);
  render(
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw: client }}>
        <MasterPage {...PROPS} />
      </PortOverrides>
    </ApiProvider>,
  );
  return { api, client };
}

const running = (percent: number): MeasureJob => ({ ...jobOf([passing('Chapter 01.wav')]), phase: 'running', percent, message: `Reading ${percent}` });

describe('Master & QC: the DAW goes quiet', () => {
  it('a capability read that fails says it cannot tell and offers Check again, not "Checking" for ever', async () => {
    const base = createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: [], measuredFiles: [passing('Chapter 01.wav')] });
    let fail = true;
    const daw: DawClient = { ...base, capabilities: () => (fail ? Promise.reject(new Error('the bridge is not answering')) : base.capabilities()) };
    mount([passing('Chapter 01.wav')], {}, daw);
    expect(await screen.findByText(/Can't tell what your DAW can do right now: the bridge is not answering/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Play the quietest 5 s' }) as HTMLButtonElement).disabled ||
        screen.getByRole('button', { name: 'Play the quietest 5 s' }).getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.queryByText(/Can't tell what your DAW/)).toBeNull());
    expect(screen.getByRole('button', { name: 'Play the quietest 5 s' }).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('a daw_capabilities_changed event turns the buttons on without a reload', async () => {
    const base = createMockDawClient(DAW_SETUPS['reaper-off'], {
      chapterIds: [],
      candidateIds: [],
      findingIds: [],
      measuredFiles: [passing('Chapter 01.wav')],
    });
    let push: (next: DawCapabilities) => void = () => undefined;
    const daw: DawClient = { ...base, subscribeCapabilities: (listener) => ((push = listener), () => undefined) };
    mount([passing('Chapter 01.wav')], {}, daw);
    const button = await screen.findByRole('button', { name: 'Play the quietest 5 s' });
    expect(button.getAttribute('aria-disabled') === 'true' || (button as HTMLButtonElement).disabled).toBe(true);
    act(() => push(DAW_SETUPS.reaper));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play the quietest 5 s' }).getAttribute('aria-disabled')).not.toBe('true'));
  });

  it('the window regaining focus reads the capabilities again', async () => {
    const base = createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: [], measuredFiles: [passing('Chapter 01.wav')] });
    const read = vi.spyOn(base, 'capabilities');
    mount([passing('Chapter 01.wav')], {}, base);
    await screen.findByRole('button', { name: 'Play the quietest 5 s' });
    const before = read.mock.calls.length;
    fireEvent.focus(window);
    expect(read.mock.calls.length).toBeGreaterThan(before);
  });

  it('Play pressed twice while the DAW has not answered sends one call', async () => {
    const file = passing('Chapter 01.wav');
    const base = createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: [], measuredFiles: [file] });
    let answer: (value: Awaited<ReturnType<DawClient['playQuietest']>>) => void = () => undefined;
    const play = vi.fn(() => new Promise<Awaited<ReturnType<DawClient['playQuietest']>>>((resolve) => (answer = resolve)));
    mount([file], {}, { ...base, playQuietest: play });
    const button = await screen.findByRole('button', { name: 'Play the quietest 5 s' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(play).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true, message: 'Playing.' } as never));
    await userEvent.click(button);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('a DAW call that never answers shows nothing wrong on the page and does not block Open in the DAW', async () => {
    const file = passing('Chapter 01.wav');
    const base = createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: [], measuredFiles: [file] });
    const open = vi.spyOn(base, 'openFile');
    mount([file], {}, { ...base, playQuietest: () => new Promise(() => undefined) });
    await userEvent.click(await screen.findByRole('button', { name: 'Play the quietest 5 s' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open in REAPER' }));
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('Master & QC: the measurement host goes quiet', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it('one failed poll does not stop the polling: the bar moves on once the host answers again, and the lapse was shown with Check again', async () => {
    const states: Array<() => Promise<MeasureJob>> = [
      () => Promise.resolve(running(10)),
      () => Promise.reject(new Error('timed out')),
      () => Promise.resolve(running(60)),
    ];
    const measureState = vi.fn(() => (states.shift() ?? (() => Promise.resolve(running(60))))());
    mount([], { measureState });
    expect(await screen.findByText('Reading 10')).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(600)));
    expect(await screen.findByText(/Can't tell how the measurement is going/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2100)));
    expect(await screen.findByText('Reading 60')).toBeTruthy();
    expect(screen.queryByText(/Can't tell how the measurement is going/)).toBeNull();
  });

  it('a state read that arrives after Cancel does not bring the progress bar back', async () => {
    let late: (job: MeasureJob) => void = () => undefined;
    const calls: Array<() => Promise<MeasureJob>> = [() => Promise.resolve(running(10)), () => new Promise<MeasureJob>((resolve) => (late = resolve))];
    const measureState = vi.fn(() => (calls.shift() ?? (() => Promise.resolve(running(10))))());
    const cancelled: MeasureJob = { ...jobOf([passing('Chapter 01.wav')]), phase: 'cancelled', message: 'Cancelled.' };
    mount([], { measureState, measureCancel: async () => cancelled });
    await screen.findByText('Reading 10');
    await act(async () => void (await vi.advanceTimersByTimeAsync(600))); // the second read is now in flight
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Measuring' })).toBeNull());
    await act(async () => late(running(40))); // the old read lands after the cancel
    expect(screen.queryByRole('progressbar', { name: 'Measuring' })).toBeNull();
  });

  it('a host restart (idle) after a running state clears the progress bar', async () => {
    const idle: MeasureJob = { ...jobOf([]), phase: 'idle', files: [], message: '' };
    const states = [running(30), idle];
    const measureState = vi.fn(() => Promise.resolve(states.shift() ?? idle));
    mount([], { measureState });
    await screen.findByText('Reading 30');
    await act(async () => void (await vi.advanceTimersByTimeAsync(600)));
    await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Measuring' })).toBeNull());
  });

  it('a measurement already running when the page opens is shown again (leave and come back)', async () => {
    mount([], { measureState: async () => running(55) });
    expect(await screen.findByText('Reading 55')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('cancelling the file dialog changes nothing and shows no error', async () => {
    const analyze = vi.fn();
    mount([], { measurePickFiles: async () => ({ paths: [] }), measureAnalyze: analyze, measureState: async () => jobOf([]) });
    await userEvent.click(await screen.findByRole('button', { name: 'Check files…' }));
    expect(analyze).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a refused start says why and leaves the page usable', async () => {
    mount([], {
      measurePickFiles: async () => ({ paths: ['/a.wav'] }),
      measureAnalyze: async () => {
        throw new Error('a measurement is already running');
      },
      measureState: async () => jobOf([]),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Check files…' }));
    expect(await screen.findByText(/a measurement is already running/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check files…' })).toBeTruthy();
  });
});

describe('Master & QC: what the narrator can name and how many', () => {
  it('300 files list, with spaces, Unicode, emoji, right-to-left and a 250-character name, each selectable by its own path', async () => {
    const odd = ['my chapter  with spaces.wav', '書籍 📚.wav', 'פרק 1 🎧 كتاب.wav', `${'x'.repeat(246)}.wav`];
    const files = [...odd.map((name) => passing(name)), ...Array.from({ length: 296 }, (_, i) => passing(`Chapter ${String(i + 5).padStart(3, '0')}.wav`))];
    mount(files);
    const grid = await screen.findByRole('grid', { name: 'Per-file checks' });
    expect(grid.querySelectorAll('tbody tr').length).toBe(300);
    for (const name of odd) expect(screen.getAllByText((_, element) => element?.tagName === 'TD' && element.textContent === name).length).toBe(1);
    await userEvent.click(within(grid).getByText('פרק 1 🎧 كتاب.wav', { exact: false }));
    expect(await screen.findByRole('heading', { name: /פרק 1 🎧 كتاب\.wav · / })).toBeTruthy();
  });

  it('Re-check pressed twice starts one measurement', async () => {
    let finish: (job: MeasureJob) => void = () => undefined;
    const analyze = vi.fn(() => new Promise<MeasureJob>((resolve) => (finish = resolve)));
    const files = [passing('Chapter 01.wav')];
    mount(files, { measureAnalyze: analyze });
    const button = await screen.findByRole('button', { name: /^Re-check 1 file$/ });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(analyze).toHaveBeenCalledTimes(1);
    await act(async () => finish(jobOf(files)));
  });
});
