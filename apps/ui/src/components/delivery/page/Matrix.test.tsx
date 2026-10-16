// @vitest-environment jsdom
// The Delivery page's state matrix (docs/research/delivery-state-matrix.md): each test is one cell, named by its control and its state.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { MOCK_ACX, mockCustomProfile } from '../../../api/deliveryProfilesMock';
import { createMockApi } from '../../../api/mockApi';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { ExportJob, JobEnded, ManuscriptChapter, MeasureFileResult, MeasureJob, NarrationApi, PackageJob } from '../../../types';
import { failingTwo, passing } from '../../masterqc/files/testFiles';
import { DeliveryPage } from './DeliveryPage';

const chapter = (index: number, title = `Chapter ${String(index).padStart(2, '0')}`): ManuscriptChapter =>
  ({ id: `c${index}`, title, index: index - 1, wordCount: 100, status: 'not_started' }) as unknown as ManuscriptChapter;
const CHAPTERS = [1, 2, 3, 4].map((n) => chapter(n));
const PASSING = CHAPTERS.map((c) => passing(`${c.title}.wav`));
const measureJob = (files: MeasureFileResult[], extra: Partial<MeasureJob> = {}) =>
  ({ phase: 'success', files, profile: null, bookRules: [], ...extra }) as unknown as MeasureJob;
const exportJob = (phase: ExportJob['phase'] = 'success', done = 1) =>
  ({
    phase,
    files: Array.from({ length: done }, (_, i) => ({ status: 'done', kind: 'chapter', title: `Chapter ${i + 1}`, encodedPath: `C:/enc/${i + 1}.mp3` })),
  }) as unknown as ExportJob;
const BUILT = {
  id: 'p1',
  kind: 'render_package',
  phase: 'success',
  message: 'Built',
  profile: 'acx@2026-09',
  outputDir: 'C:/Deliver/ACX',
  files: [1, 2, 3, 4].map((n) => ({ kind: 'chapter', name: `0${n}.mp3`, destPath: `C:/Deliver/ACX/0${n}.mp3`, tagged: true })),
  checklist: [],
  elapsed: 1,
} as unknown as PackageJob;
const IDLE = { ...BUILT, id: null, phase: 'idle', files: [], outputDir: '', message: '' } as PackageJob;
const RUNNING = { ...BUILT, id: 'p2', phase: 'running', files: [], outputDir: 'C:/Deliver/ACX' } as PackageJob;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

type Overrides = Partial<NarrationApi>;

function mount(overrides: Overrides = {}, props: { onOpenInMaster?: (id: string) => void; onOpenMaster?: () => void } = {}) {
  const ended: Array<(event: JobEnded) => void> = [];
  const api = createMockApi({
    manuscriptChapters: async () => CHAPTERS,
    creditsTemplates: async () => [],
    measureState: async () => measureJob(PASSING),
    exportState: async () => exportJob(),
    packageState: async () => IDLE,
    subscribeJobEnded: (handler) => {
      ended.push(handler);
      return () => void ended.splice(ended.indexOf(handler), 1);
    },
    ...overrides,
  });
  const view = render(
    <ApiProvider api={api}>
      <StudioProvider>
        <DeliveryPage hasManuscript onOpenInMaster={props.onOpenInMaster ?? (() => undefined)} onOpenMaster={props.onOpenMaster} />
      </StudioProvider>
    </ApiProvider>,
  );
  const jobEnded = () => ended.slice().forEach((handler) => handler({ id: 'j', kind: 'measurement', outcome: 'success', message: '', durationMs: 1 }));
  return { api, view, jobEnded };
}

const buildButton = () => screen.findByRole('button', { name: /^Build .* package$/ });
const READY = 'Every chapter passes.';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('D5 Build: what it waits for', () => {
  it('empty: a book with no chapters says so and cannot build', async () => {
    mount({ manuscriptChapters: async () => [] });
    expect(await screen.findByText('0 of 0')).toBeTruthy();
    expect(screen.getByText('There are no chapters to check.')).toBeTruthy();
    expect(await buildButton()).toHaveProperty('disabled', true);
  });

  it('one: a single passing chapter is ready and builds with the files that were encoded', async () => {
    const packageStart = vi.fn(async () => BUILT);
    mount({ manuscriptChapters: async () => [chapter(1)], measureState: async () => measureJob([passing('Chapter 01.wav')]), packageStart });
    await screen.findByText(READY);
    await userEvent.click(await buildButton());
    expect(packageStart).toHaveBeenCalledOnce();
    const request = (packageStart.mock.calls[0] as unknown as [{ profileId: string; items: { kind: string; path: string }[] }])[0];
    expect(request.profileId).toBe('acx');
    expect(request.items).toEqual([{ kind: 'chapter', title: 'Chapter 1', path: 'C:/enc/1.mp3' }]);
  });

  it('huge: 500 chapters with 300-character titles are listed and counted', async () => {
    const many = Array.from({ length: 500 }, (_, i) => chapter(i + 1, `${'Long title '.repeat(30)}${i + 1}`));
    mount({ manuscriptChapters: async () => many, measureState: async () => measureJob([]) });
    expect(await screen.findByText('0 of 500', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Open in Master & QC/ })).toHaveLength(500);
  });

  it('loading: nothing is judged before the chapters and the measurement have been read', async () => {
    mount({ manuscriptChapters: () => new Promise(() => undefined) });
    expect(await screen.findByText('Reading the chapters…')).toBeTruthy();
    expect(await screen.findByText("Can't tell which chapters pass yet.")).toBeTruthy();
    expect(screen.queryByText('Not mastered')).toBeNull();
    expect(await buildButton()).toHaveProperty('disabled', true);
  });

  it('long, right-to-left and emoji chapter names are kept as written and read in their own direction', async () => {
    const names = ['الفصل الأول: بداية', 'פרק ראשון 🐇', 'Chapter 🎧 ' + 'x'.repeat(300)];
    const list = names.map((name, i) => chapter(i + 1, name));
    mount({ manuscriptChapters: async () => list, measureState: async () => measureJob([]) });
    for (const name of names) {
      const row = await screen.findByRole('button', { name: new RegExp(name.slice(0, 12)) });
      expect(row.getAttribute('aria-label')).toContain(name);
      expect(within(row).getByText(name).getAttribute('dir')).toBe('auto');
    }
  });

  it('no files encoded: says to master first, and Build stays off', async () => {
    mount({ exportState: async () => exportJob('success', 0) });
    expect(await screen.findByText('Master all to spec in Master & QC first.')).toBeTruthy();
    expect(await buildButton()).toHaveProperty('disabled', true);
  });

  it('the export is still running elsewhere: says so, and Build stays off', async () => {
    mount({ exportState: async () => exportJob('running', 2) });
    expect(await screen.findByText('Master & QC is still preparing the files.')).toBeTruthy();
    // Busy, not disabled: the button keeps keyboard focus while it works, and a press does nothing.
    expect((await buildButton()).getAttribute('aria-busy')).toBe('true');
  });

  it('a measurement that is running: says so with its progress, and Build stays off', async () => {
    mount({ measureState: async () => measureJob(PASSING, { phase: 'running', percent: 40, message: 'Measuring Chapter 02.wav' }) });
    expect(await screen.findByText('Measuring the files in Master & QC.')).toBeTruthy();
    expect(screen.getByText('Measuring Chapter 02.wav (40%)')).toBeTruthy();
    expect(await buildButton()).toHaveProperty('disabled', true);
  });

  it('failing and waiting chapters are counted and keep Build off', async () => {
    mount({ measureState: async () => measureJob([passing('Chapter 01.wav'), failingTwo('Chapter 04.wav')]) });
    expect(await screen.findByText('1 failing, 2 not ready')).toBeTruthy();
    expect(await buildButton()).toHaveProperty('disabled', true);
  });
});

describe('D5 Build: pressing it', () => {
  it("refused: the host's words are shown and the button is usable again", async () => {
    const packageStart = vi.fn().mockRejectedValueOnce(new Error('a package is already being built')).mockResolvedValue(BUILT);
    mount({ packageStart });
    await screen.findByText(READY);
    await userEvent.click(await buildButton());
    expect((await screen.findByRole('alert')).textContent).toContain('a package is already being built');
    expect(await buildButton()).toHaveProperty('disabled', false);
    await userEvent.click(await buildButton());
    expect(await screen.findByText('4 files')).toBeTruthy();
    expect(screen.queryByText(/already being built/)).toBeNull();
  });

  it('rapid double-fire: two presses before the host answers ask for the folder once', async () => {
    const answer = deferred<PackageJob>();
    const packageStart = vi.fn(() => answer.promise);
    mount({ packageStart });
    await screen.findByText(READY);
    const button = await buildButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(packageStart).toHaveBeenCalledOnce();
    expect(screen.getByText('Choose a folder in the window that opened…')).toBeTruthy();
    expect(button.getAttribute('aria-busy')).toBe('true');
    await act(async () => answer.resolve(BUILT));
    expect(await screen.findByText('4 files')).toBeTruthy();
    expect(screen.queryByText('Choose a folder in the window that opened…')).toBeNull();
  });

  it('never answers: the page stays usable and says it is waiting for the folder', async () => {
    mount({ packageStart: () => new Promise(() => undefined) });
    await screen.findByText(READY);
    await userEvent.click(await buildButton());
    expect(screen.getByText('Choose a folder in the window that opened…')).toBeTruthy();
    // The rest of the page still answers: a chapter row opens Master & QC.
    expect(screen.getAllByRole('button', { name: /Open in Master & QC/ }).length).toBeGreaterThan(0);
  });

  it('the folder picker closed without a folder: says nothing was built, and builds nothing', async () => {
    mount({ packageStart: async () => IDLE });
    await screen.findByText(READY);
    await userEvent.click(await buildButton());
    expect(await screen.findByText('No folder was chosen, so no package was built.')).toBeTruthy();
    expect(screen.queryByText('Built')).toBeNull();
  });

  it('the folder picker closed after an earlier build: says so and keeps the earlier build', async () => {
    mount({ packageState: async () => BUILT, packageStart: async () => BUILT });
    await screen.findByText('4 files');
    await userEvent.click(await buildButton());
    expect(await screen.findByText('No folder was chosen, so no package was built.')).toBeTruthy();
    expect(screen.getByText('4 files')).toBeTruthy();
  });

  it('failed: a job that ended in error shows its reason and no written files', async () => {
    mount({ packageStart: async () => ({ ...BUILT, phase: 'error', error: 'could not create "C:/ro": access is denied', files: [] }) as PackageJob });
    await screen.findByText(READY);
    await userEvent.click(await buildButton());
    expect((await screen.findByRole('alert')).textContent).toContain('access is denied');
    expect(screen.queryByText('Written')).toBeNull();
  });

  it("a build for another profile is not shown as this profile's package", async () => {
    mount({ packageState: async () => ({ ...BUILT, profile: 'custom@r3' }) as PackageJob });
    await screen.findByText(READY);
    expect(screen.queryByText('4 files')).toBeNull();
    expect(screen.getByText('Chosen when you build')).toBeTruthy();
  });

  it('leave mid-action: leaving while the host is asked writes nothing and logs no error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const answer = deferred<PackageJob>();
    const { view } = mount({ packageStart: () => answer.promise });
    await screen.findByText(READY);
    await userEvent.click(await buildButton());
    view.unmount();
    await act(async () => answer.resolve(BUILT));
    expect(error).not.toHaveBeenCalled();
  });
});

describe('D5 and D6 a running build', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it('reload mid-action: a build already running is shown with Cancel and followed until it ends', async () => {
    let calls = 0;
    mount({ packageState: async () => (++calls < 3 ? RUNNING : BUILT) });
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Building the package' })).toBeTruthy();
    expect((await buildButton()).getAttribute('aria-busy')).toBe('true');
    await act(async () => vi.advanceTimersByTimeAsync(1200));
    expect(await screen.findByText('4 files')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('Cancel: the job says it was cancelled and Build is usable again', async () => {
    let cancelled = false;
    const packageCancel = vi.fn(async () => {
      cancelled = true;
      return { ...RUNNING, phase: 'cancelled', message: 'Packaging cancelled.' } as PackageJob;
    });
    mount({
      packageState: async () => (cancelled ? ({ ...RUNNING, phase: 'cancelled', message: 'Packaging cancelled.' } as PackageJob) : RUNNING),
      packageCancel,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }), { advanceTimers: vi.advanceTimersByTime });
    expect(await screen.findByText('Packaging cancelled.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(await buildButton()).toHaveProperty('disabled', false);
  });

  it("Cancel refused: the host's words are shown and the build keeps running", async () => {
    mount({ packageState: async () => RUNNING, packageCancel: async () => Promise.reject(new Error('nothing to cancel')) });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }), { advanceTimers: vi.advanceTimersByTime });
    expect((await screen.findByRole('alert')).textContent).toContain('nothing to cancel');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('quiet host: a read that fails says it cannot tell, keeps trying every two seconds and clears when the host answers', async () => {
    let calls = 0;
    let silent = false;
    const packageState = vi.fn(async () => {
      calls += 1;
      if (calls > 1 && silent) throw new Error('the host did not answer');
      return RUNNING;
    });
    mount({ packageState });
    await screen.findByRole('button', { name: 'Cancel' });
    silent = true;
    await act(async () => vi.advanceTimersByTimeAsync(700));
    const alert = await screen.findByText(/Can't tell how the build is going, last heard \d+ s ago: the host did not answer/);
    expect(alert).toBeTruthy();
    // The same words twice must still schedule the next try: three more failures in six seconds.
    const before = packageState.mock.calls.length;
    for (let tick = 0; tick < 3; tick += 1) await act(async () => vi.advanceTimersByTimeAsync(2100));
    expect(packageState.mock.calls.length - before).toBeGreaterThanOrEqual(3);
    silent = false;
    await act(async () => vi.advanceTimersByTimeAsync(2100));
    await waitFor(() => expect(screen.queryByText(/Can't tell how the build is going/)).toBeNull());
  });

  it('Check again forces a fresh read', async () => {
    let silent = false;
    const packageState = vi.fn(async () => {
      if (silent) throw new Error('boom');
      return IDLE;
    });
    mount({ packageState });
    await screen.findByText(READY);
    silent = true;
    act(() => window.dispatchEvent(new Event('focus')));
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }), { advanceTimers: vi.advanceTimersByTime });
    silent = false;
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }), { advanceTimers: vi.advanceTimersByTime });
    await waitFor(() => expect(screen.queryByText(/Can't tell how the build is going/)).toBeNull());
  });

  it('late and out of order: an answer to an older read never replaces the Cancel answer', async () => {
    const slow = deferred<PackageJob>();
    let calls = 0;
    mount({
      packageState: () => (++calls === 2 ? slow.promise : Promise.resolve(RUNNING)),
      packageCancel: async () => ({ ...RUNNING, phase: 'cancelled', message: 'Packaging cancelled.' }) as PackageJob,
    });
    await screen.findByRole('button', { name: 'Cancel' });
    await act(async () => vi.advanceTimersByTimeAsync(600)); // the second read starts and does not answer
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }), { advanceTimers: vi.advanceTimersByTime });
    expect(await screen.findByText('Packaging cancelled.')).toBeTruthy();
    await act(async () => slow.resolve(RUNNING)); // the old answer arrives last
    expect(screen.getByText('Packaging cancelled.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('host restarted mid-run: the job is gone (idle), the page stops waiting and says nothing false', async () => {
    let calls = 0;
    mount({ packageState: async () => (++calls < 2 ? RUNNING : IDLE) });
    await screen.findByRole('button', { name: 'Cancel' });
    await act(async () => vi.advanceTimersByTimeAsync(700));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await buildButton()).toHaveProperty('disabled', false);
  });
});

describe('D5 focus and the profile', () => {
  it('Cancel puts keyboard focus back on Build, which stays on the page', async () => {
    mount({
      packageState: async () => RUNNING,
      packageCancel: async () => ({ ...RUNNING, phase: 'cancelled', message: 'Packaging cancelled.' }) as PackageJob,
    });
    const build = await buildButton();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(build);
  });

  it('a profile change reads the measurement again, so the verdicts follow the profile', async () => {
    const measureState = vi.fn(async () => measureJob(PASSING));
    mount({ measureState });
    await screen.findByText('4 of 4');
    const before = measureState.mock.calls.length;
    await userEvent.selectOptions(await screen.findByRole('combobox'), 'acx@2026-09');
    await waitFor(() => expect(measureState.mock.calls.length).toBeGreaterThan(before));
  });
});

describe('D5 and the profile while it builds', () => {
  it('a refusal belongs to the profile it was made with: changing the profile drops it', async () => {
    const custom = mockCustomProfile();
    const profiles = {
      profiles: [MOCK_ACX, custom],
      globalDefault: { id: MOCK_ACX.id },
      hasProject: true,
      projectChoice: null,
      projectProfile: 'acx@2026-09',
    };
    mount({
      deliveryProfiles: async () => profiles,
      deliverySelectProfile: async () => ({ ...profiles, projectProfile: `${custom.id}@r${custom.revision}` }),
      packageStart: async () => Promise.reject(new Error('access is denied')),
    });
    await screen.findByText(READY);
    await userEvent.click(await buildButton());
    expect((await screen.findByRole('alert')).textContent).toContain('access is denied');
    await userEvent.selectOptions(await screen.findByRole('combobox'), `${custom.id}@r${custom.revision}`);
    await waitFor(() => expect(screen.queryByText(/access is denied/)).toBeNull());
  });

  it('the profile cannot be changed while a build runs under it', async () => {
    mount({ packageState: async () => RUNNING });
    await screen.findByRole('button', { name: 'Cancel' });
    expect(await screen.findByRole('combobox')).toHaveProperty('disabled', true);
  });
});

describe('D10 Check again and the host events', () => {
  it('a first read that fails says it cannot tell (not "Not mastered") and recovers on Check again', async () => {
    let fail = true;
    mount({
      measureState: async () => {
        if (fail) throw new Error('the measurement could not be read');
        return measureJob(PASSING);
      },
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Can't tell which chapters pass, not heard yet: the measurement could not be read");
    expect(screen.queryByText('Not mastered')).toBeNull();
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('4 of 4')).toBeTruthy();
    expect(screen.queryByText(/Can't tell which chapters pass/)).toBeNull();
  });

  it('stale: a read that fails after one succeeded keeps the list and marks it out of date', async () => {
    let fail = false;
    const { jobEnded } = mount({
      measureState: async () => {
        if (fail) throw new Error('gone quiet');
        return measureJob(PASSING);
      },
    });
    expect(await screen.findByText('4 of 4')).toBeTruthy();
    fail = true;
    act(() => jobEnded());
    expect((await screen.findByRole('alert')).textContent).toMatch(/last heard \d+ s ago: gone quiet The list below may be out of date\./);
    expect(screen.getByText('4 of 4')).toBeTruthy();
  });

  it('the chapters cannot be read: says so with Check again, and recovers', async () => {
    let fail = true;
    mount({
      manuscriptChapters: async () => {
        if (fail) throw new Error('the manuscript is locked');
        return CHAPTERS;
      },
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('the manuscript is locked');
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('4 of 4')).toBeTruthy();
  });

  it('an event repeated: two job-ended events read twice and leave the same page', async () => {
    const measureState = vi.fn(async () => measureJob(PASSING));
    const { jobEnded } = mount({ measureState });
    await screen.findByText('4 of 4');
    const before = measureState.mock.calls.length;
    act(() => {
      jobEnded();
      jobEnded();
    });
    await waitFor(() => expect(measureState.mock.calls.length).toBe(before + 2));
    expect(screen.getByText('4 of 4')).toBeTruthy();
  });

  it('a lost event: the window regaining focus reads again, so a measurement finished elsewhere shows', async () => {
    let files: MeasureFileResult[] = [];
    mount({ measureState: async () => measureJob(files) });
    expect(await screen.findByText('0 of 4')).toBeTruthy();
    files = PASSING;
    act(() => window.dispatchEvent(new Event('focus')));
    expect(await screen.findByText('4 of 4')).toBeTruthy();
  });

  it('a job that ends elsewhere reads the measurement again', async () => {
    let files: MeasureFileResult[] = [];
    const { jobEnded } = mount({ measureState: async () => measureJob(files) });
    expect(await screen.findByText('0 of 4')).toBeTruthy();
    files = PASSING;
    act(() => jobEnded());
    expect(await screen.findByText('4 of 4')).toBeTruthy();
  });

  it('the credits cannot be read: the page says it cannot tell, builds nothing and recovers on Check again', async () => {
    let fail = true;
    mount({ creditsTemplates: async () => (fail ? Promise.reject(new Error('templates locked')) : []) });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The credits could not be read: templates locked');
    // Nothing is judged without them: no "4 of 4", and Build stays off.
    expect(screen.queryByText('4 of 4')).toBeNull();
    expect(await buildButton()).toHaveProperty('disabled', true);
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('4 of 4')).toBeTruthy();
  });
});

describe('D8 and D9 the aside', () => {
  it('a chapter row opens that chapter in Master & QC, a credits row opens its own id', async () => {
    const onOpenInMaster = vi.fn();
    mount(
      {
        creditsTemplates: async () => [
          { id: 'o', kind: 'opening', name: 'Opening', body: 'x' },
          { id: 'c', kind: 'closing', name: 'Closing', body: 'x' },
        ],
      },
      { onOpenInMaster },
    );
    await userEvent.click(await screen.findByRole('button', { name: /^Chapter 02: Pass/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Closing credits: / }));
    expect(onOpenInMaster.mock.calls).toEqual([['c2'], ['credits-closing']]);
  });

  it('the header button opens Master & QC itself; without a handler there is no button', async () => {
    const onOpenMaster = vi.fn();
    mount({}, { onOpenMaster });
    await userEvent.click(await screen.findByRole('button', { name: 'Open in Master & QC' }));
    expect(onOpenMaster).toHaveBeenCalledOnce();
    cleanup();
    mount();
    await screen.findByText('4 of 4');
    expect(screen.queryByRole('button', { name: 'Open in Master & QC' })).toBeNull();
  });
});

describe('D7 Open the folder', () => {
  it('a double press asks the host once; a refusal is shown in its words', async () => {
    const answer = deferred<{ folder: string }>();
    const deliveryOpenPackageFolder = vi.fn(() => answer.promise);
    mount({ packageState: async () => BUILT, deliveryOpenPackageFolder });
    const open = await screen.findByRole('button', { name: 'Open the folder' });
    fireEvent.click(open);
    fireEvent.click(open);
    expect(deliveryOpenPackageFolder).toHaveBeenCalledOnce();
    await act(async () => answer.reject(new Error('the package folder C:/Deliver/ACX is no longer there; build the package again')));
    expect((await screen.findByRole('alert')).textContent).toContain('no longer there');
    expect(screen.getByRole('button', { name: 'Open the folder' }).getAttribute('aria-busy')).toBeNull();
  });
});
