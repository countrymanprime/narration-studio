// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChapters } from '../../../fixtures/chapters';
import type { DeliveryProfile, MeasureFileResult, NarrationApi } from '../../../types';
import { chapterStates } from '../../delivery/page/chapterStates';
import { MasterPage } from './MasterPage';
import { ALL_PASS, CHAPTERS, PageHost, TWO_FAIL, acx, apiOf, failingTwo, jobOf, noRules, passing } from './testPage';

afterEach(cleanup);

const PROPS = { hasManuscript: true, projectFolder: '/p', onImport: () => undefined };

const mount = (files: readonly MeasureFileResult[], profile: DeliveryProfile = acx, overrides: Partial<NarrationApi> = {}, onOpenDelivery = vi.fn()) => {
  const api = apiOf(jobOf(files, profile), profile, overrides);
  render(
    <PageHost api={api}>
      {/* The shell's focusable landmark, which a Retry that goes away hands focus to. */}
      <main tabIndex={-1}>
        <MasterPage {...PROPS} onOpenDelivery={onOpenDelivery} openSettings={vi.fn()} />
      </main>
    </PageHost>,
  );
  return { api, onOpenDelivery };
};
const package_ = () => screen.getByRole('complementary', { name: /Delivery package/ });
const chart = () => screen.getByRole('img', { name: /RMS by file/ });

/** The mock's opening and closing credits, which Delivery lists after and before the chapters. */
const CREDITS_FILES = 2;

describe('Master & QC page body', () => {
  const withChapters = (files: readonly MeasureFileResult[], props: Partial<React.ComponentProps<typeof MasterPage>> = {}) => {
    const api = apiOf(jobOf(files, acx), acx, { manuscriptChapters: async () => CHAPTERS });
    render(
      <PageHost api={api}>
        <MasterPage {...PROPS} onOpenDelivery={vi.fn()} openSettings={vi.fn()} {...props} />
      </PageHost>,
    );
  };
  const bar = () => screen.getByRole('button', { name: /^Chapter: / });

  it('selecting a file moves the shared chapter and the chapter bar follows', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    withChapters(TWO_FAIL);
    // Opens on the first failing file, and the bar says so.
    await waitFor(() => expect(bar().getAttribute('aria-label')).toContain('Chapter 4 — The Rabbit Sends in a Little Bill'));
    expect(window.localStorage.getItem('narration.proof.lastChapter./p')).toBe('chapter-4');
    await user.click(screen.getByRole('row', { name: /Chapter 2 — The Pool of Tears/ }));
    expect(bar().getAttribute('aria-label')).toContain('Chapter 2 — The Pool of Tears');
    expect(window.localStorage.getItem('narration.proof.lastChapter./p')).toBe('chapter-2');
    // The arrow keys move between files, and the bar goes with them.
    screen.getByRole('row', { name: /Chapter 2 — The Pool of Tears/ }).focus();
    await user.keyboard('{ArrowDown}');
    expect(bar().getAttribute('aria-label')).toContain('Chapter 3');
    // The bar moves the file the other way; a chapter with no file reads Not mastered yet.
    await user.click(screen.getByRole('button', { name: 'Previous chapter' }));
    expect(screen.getByRole('row', { name: /Chapter 2 — The Pool of Tears/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('a chapter with no file yet says no file was measured for it', async () => {
    const user = userEvent.setup();
    withChapters([passing('Chapter 01.wav'), failingTwo('Chapter 04.wav')]);
    await waitFor(() => expect(bar().getAttribute('aria-label')).toContain('Chapter 4'));
    await user.click(screen.getByRole('button', { name: 'Previous chapter' }));
    await user.click(screen.getByRole('button', { name: 'Previous chapter' }));
    expect(await screen.findByRole('heading', { name: 'Chapter 2 — The Pool of Tears · Not mastered' })).toBeTruthy();
    expect(screen.getByText('No file measured yet.')).toBeTruthy();
  });

  it('has a row for every chapter, the credits and the retail sample before anything is measured, each Waiting', async () => {
    withChapters([]);
    const grid = await screen.findByRole('grid', { name: 'Per-file checks' });
    const rows = await waitFor(() => {
      const found = grid.querySelectorAll('tbody tr');
      expect(found.length).toBe(CHAPTERS.length + CREDITS_FILES + 1);
      return [...found];
    });
    expect(rows.every((tr) => within(tr as HTMLElement).getByText('Waiting'))).toBe(true);
    expect(within(rows.at(-1) as HTMLElement).getByText('Retail sample')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText(/No file measured yet · not mastered/)).toBeTruthy();
  });

  it('a chapter with open pickups says how many it waits on, from the Pickups page list, and counts only the open ones', async () => {
    const pickup = {
      id: 'p',
      chapterId: 'chapter-2',
      paragraphId: null,
      paragraph: null,
      time: 1,
      at: 1,
      type: 'misread',
      script: '',
      context: '',
      source: 'speech',
      confidence: null,
      confReason: '',
      included: true,
      done: false,
      waiting: false,
    } as const;
    const list = [pickup, { ...pickup, id: 'q' }, { ...pickup, id: 'r' }, { ...pickup, id: 's', done: true }, { ...pickup, id: 't', chapterId: 'chapter-1' }];
    const api = apiOf(jobOf([]), acx, { manuscriptChapters: async () => CHAPTERS, pickupsList: async () => ({ pickups: list, leftOut: [] }) });
    render(
      <PageHost api={api}>
        <MasterPage {...PROPS} onOpenDelivery={vi.fn()} openSettings={vi.fn()} />
      </PageHost>,
    );
    const two = await screen.findByRole('row', { name: /Chapter 2 — The Pool of Tears/ });
    expect(within(two).getByText('Waiting on 3 pickups · not mastered')).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /^Chapter 1 / })).getByText('Waiting on 1 pickup · not mastered')).toBeTruthy();
  });

  it('draws the title, the chapter bar, the profile as a pill and one refresh icon in the table panel', async () => {
    const onOpenDelivery = vi.fn();
    withChapters(TWO_FAIL, { onOpenDelivery });
    const panel = (await screen.findByRole('grid', { name: 'Per-file checks' })).closest('section')!;
    expect(within(panel).getByRole('heading', { level: 1, name: 'Master & QC' })).toBeTruthy();
    await userEvent.click(within(panel).getByRole('button', { name: 'ACX' }));
    expect(onOpenDelivery).toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Check the files again' })).toHaveLength(1);
    expect(within(panel).getByRole('button', { name: 'Check the files again' })).toBeTruthy();
  });

  it('opens on the chapter a link names by its id when the chapter has a file', async () => {
    withChapters(TWO_FAIL, { focusFile: 'chapter-2' });
    expect(await screen.findByRole('heading', { name: 'Chapter 2 — The Pool of Tears · Checks' })).toBeTruthy();
  });

  it('asks for the manuscript first', () => {
    render(
      <PageHost api={apiOf(jobOf(TWO_FAIL))}>
        <MasterPage {...PROPS} hasManuscript={false} onOpenDelivery={vi.fn()} openSettings={vi.fn()} />
      </PageHost>,
    );
    expect(screen.getByText('Import manuscript')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('opens on the file a #file= link names (masterLink.ts), not on the first failing file', async () => {
    const api = apiOf(jobOf(TWO_FAIL, acx), acx);
    render(
      <PageHost api={api}>
        <MasterPage {...PROPS} onOpenDelivery={vi.fn()} openSettings={vi.fn()} focusFile="C:/Renders/Chapter 02.wav" />
      </PageHost>,
    );
    expect(await screen.findByRole('heading', { name: 'Chapter 02.wav · Checks' })).toBeTruthy();
  });

  it('says so when a #file= link names a file this check does not include, and offers the way out', async () => {
    const user = userEvent.setup();
    withChapters(TWO_FAIL, { focusFile: 'C:/Renders/Gone.wav' });
    const note = await screen.findByRole('status', { name: 'Link not found' });
    expect(note.textContent).toContain('C:/Renders/Gone.wav');
    expect(screen.queryByRole('heading', { name: /Not mastered/ })).toBeNull();
    await user.click(within(note).getByRole('button', { name: 'Show the first file instead' }));
    expect(screen.queryByRole('status', { name: 'Link not found' })).toBeNull();
  });

  it('says what a #file= link needs when nothing is measured yet', async () => {
    withChapters([], { focusFile: 'C:/Renders/Chapter 02.wav' });
    const note = await screen.findByRole('status', { name: 'Link not found' });
    expect(note.textContent).toContain('C:/Renders/Chapter 02.wav');
    expect(note.textContent).toContain('no files are measured yet');
  });

  it('follows a #file= link that arrives while the page is open', async () => {
    const api = apiOf(jobOf(TWO_FAIL, acx), acx);
    const view = render(
      <PageHost api={api}>
        <MasterPage {...PROPS} onOpenDelivery={vi.fn()} openSettings={vi.fn()} focusFile="C:/Renders/Chapter 04.wav" />
      </PageHost>,
    );
    expect(await screen.findByRole('heading', { name: 'Chapter 04.wav · Why it fails' })).toBeTruthy();
    view.rerender(
      <PageHost api={api}>
        <MasterPage {...PROPS} onOpenDelivery={vi.fn()} openSettings={vi.fn()} focusFile="C:/Renders/Chapter 02.wav" />
      </PageHost>,
    );
    expect(await screen.findByRole('heading', { name: 'Chapter 02.wav · Checks' })).toBeTruthy();
  });

  it('does not call a link stale when it names a measured file or a chapter', async () => {
    withChapters(TWO_FAIL, { focusFile: 'C:/Renders/Chapter 02.wav' });
    expect(await screen.findByRole('heading', { name: /· (Checks|Why it fails)$/ })).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Link not found' })).toBeNull();
  });

  it('shows-book-consistency-and-the-package-checks-drawn-from-the-profile', async () => {
    mount(ALL_PASS);
    expect(await screen.findByText(/Spread \d+\.\d dB across 2 files/)).toBeTruthy();
    expect(chart().querySelectorAll('line')).toHaveLength(2);
    expect(chart().querySelector('rect')).toBeTruthy();
    const list = within(package_());
    expect(list.getByText('Chapters are one file each')).toBeTruthy();
    expect(list.getByText('Every file under 120 min')).toBeTruthy();
    // Behaviour change: the MP3 format is not judged on a WAV render, so this line waits instead of ticking.
    expect(list.getByText('mono or stereo · 44.1 kHz · 192 kbps+ CBR (the MP3 format is checked on the MP3 you upload)')).toBeTruthy();
  });

  it('does not tick the MP3 format the host did not judge on a WAV render', async () => {
    mount(ALL_PASS);
    const list = within(await screen.findByRole('complementary', { name: /Delivery package/ }));
    const item = list.getByText(/the MP3 format is checked on the MP3 you upload/).closest('li')!;
    expect(item.textContent).not.toMatch(/^Pass/);
  });

  it('counts-failing-and-not-ready-from-the-files', async () => {
    mount(TWO_FAIL);
    const aside = within(await screen.findByRole('complementary', { name: /Delivery package/ }));
    // Behaviour change: the opening and closing credits files count as chapters, as Delivery counts them, so each is one more not ready.
    expect(aside.getByText(`1 failing and ${1 + CREDITS_FILES} not ready.`)).toBeTruthy();
    expect(aside.getByText('Chapter 04.wav fails 2 checks')).toBeTruthy();
    expect(aside.getByText(`${1 + CREDITS_FILES} chapters not ready`)).toBeTruthy();
    cleanup();
    mount(ALL_PASS);
    expect(await screen.findByText(`0 failing and ${CREDITS_FILES} not ready.`)).toBeTruthy();
  });

  it('says-nothing-passes-when-nothing-is-measured: no tick, and the same not-ready count Delivery shows', async () => {
    const api = apiOf(jobOf([]), acx, { manuscriptChapters: async () => CHAPTERS });
    render(
      <PageHost api={api}>
        <MasterPage {...PROPS} onOpenDelivery={vi.fn()} openSettings={vi.fn()} />
      </PageHost>,
    );
    const notReady = chapterStates(CHAPTERS, []).filter((state) => state.kind === 'wait').length + CREDITS_FILES;
    expect(notReady).toBe(CHAPTERS.length + CREDITS_FILES);
    const aside = within(await screen.findByRole('complementary', { name: /Delivery package/ }));
    expect(await aside.findByText(`0 failing and ${notReady} not ready.`)).toBeTruthy();
    expect(aside.getByText(`${notReady} chapters not ready`)).toBeTruthy();
    expect(aside.queryByText('✓')).toBeNull();
    expect(aside.queryByText(/^Passes: /)).toBeNull();
  });

  it('counts-failing-and-not-ready-from-the-chapters Delivery judges: one readiness source', async () => {
    const files = [...TWO_FAIL];
    // Six chapters, four files: two chapters have no file at all, which the files alone never count.
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 6 });
    const api = apiOf(jobOf(files), acx, { manuscriptChapters: async () => chapters });
    render(
      <PageHost api={api}>
        <MasterPage {...PROPS} onOpenDelivery={vi.fn()} openSettings={vi.fn()} />
      </PageHost>,
    );
    const states = chapterStates(chapters, files);
    const bad = states.filter((state) => state.kind === 'bad').length;
    const wait = states.filter((state) => state.kind === 'wait').length + CREDITS_FILES;
    expect(bad).toBeGreaterThan(0);
    const aside = within(await screen.findByRole('complementary', { name: /Delivery package/ }));
    expect(await aside.findByText(`${bad} failing and ${wait} not ready.`)).toBeTruthy();
  });

  it('the-active-profile-decides: a tighter limit flips a pass to a fail in the chart and the package list together', async () => {
    const tight: DeliveryProfile = {
      ...acx,
      rules: acx.rules.map((r) => (r.id === 'acx.file_length' ? { ...r, max: 60 } : r)),
    };
    const long = { ...passing('Chapter 01.wav'), report: { ...passing().report!, duration_seconds: 90 * 60 } };
    mount([long], tight);
    expect(await screen.findByText('Every file under 1 min')).toBeTruthy();
    expect(within(package_()).getByText('✕')).toBeTruthy();
    cleanup();
    mount([long], acx);
    expect(await screen.findByText('Every file under 120 min')).toBeTruthy();
    expect(within(package_()).queryByText('✕')).toBeNull();
    // The chart marks a file the profile's RMS rule missed in the danger colour.
    cleanup();
    mount([failingRms()]);
    await screen.findByRole('img', { name: /RMS by file/ });
    expect(chart().querySelector('line')!.getAttribute('stroke')).toBe('var(--danger-text)');
  });

  it('the-profile-pill-and-open-delivery-go-to-delivery', async () => {
    const { onOpenDelivery } = mount(ALL_PASS);
    await userEvent.click(await screen.findByRole('button', { name: 'ACX' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open Delivery' }));
    expect(onOpenDelivery).toHaveBeenCalledTimes(2);
  });

  it('the-kept-panels-mount-unchanged-below', async () => {
    mount(ALL_PASS);
    for (const title of ['Mastering chain', 'Diagnostics', 'Multi-platform export']) {
      expect(await screen.findByRole('heading', { name: new RegExp(title) })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /report/i })).toBeTruthy();
  });

  it('the-run-controls-are-kept-above-the-table: Check files picks, measures and shows progress with Cancel', async () => {
    const running = { ...jobOf([]), phase: 'running' as const, percent: 40, message: 'Reading Chapter 01.wav' };
    const analyze = vi.fn().mockResolvedValue(running);
    const { api } = mount([], acx, {
      measurePickFiles: async () => ({ paths: ['C:/a.wav'] }),
      measureAnalyze: analyze,
      measureState: vi.fn().mockResolvedValue(jobOf([])),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Check files…' }));
    await waitFor(() => expect(analyze).toHaveBeenCalledWith(['C:/a.wav']));
    expect(await screen.findByText('Reading Chapter 01.wav')).toBeTruthy();
    const cancel = vi.spyOn(api, 'measureCancel');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalled();
  });

  it('a-profile-that-lacks-a-rule-shows-no-row-for-it', async () => {
    mount(ALL_PASS, noRules);
    await screen.findByRole('complementary', { name: /Delivery package · Other/ });
    const list = within(package_());
    expect(list.queryByText(/Every file under/)).toBeNull();
    expect(list.queryByText(/kbps/)).toBeNull();
    expect(list.queryByText('Chapters are one file each')).toBeNull();
    expect(chart().querySelector('rect')).toBeNull();
  });

  it('daw-wording-from-capabilities: no component under masterqc names a DAW', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const sources = walk(join(__dirname, '..')).filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f));
    expect(sources.length).toBeGreaterThan(5);
    expect(sources.filter((f) => readFileSync(f, 'utf8').includes('REAPER'))).toEqual([]);
  });
});

function failingRms(): MeasureFileResult {
  const file = failingTwo('Chapter 09.wav');
  return {
    ...file,
    rules: file.rules.map((r) => (r.ruleId === 'acx.rms' ? { ...r, status: 'not_met' as const, value: -30 } : r)),
    report: { ...file.report!, rms_dbfs: -30 },
  };
}

// The loading state of the Delivery package panel (state matrix): no count is drawn until the profile and the chapters have been read, because
// "0 failing and 0 not ready" would read as a pass; a failed read ends it, never an endless skeleton.
describe('Master & QC package panel loading state', () => {
  const never = () => new Promise<never>(() => undefined);
  const region = () => screen.queryByRole('group', { name: 'Loading the delivery package checks' });

  it('shows a busy region and no counts while the chapters are read, however long that takes', async () => {
    mount(ALL_PASS, acx, { manuscriptChapters: never });
    await screen.findByRole('complementary', { name: /Delivery package/ });
    expect(region()?.getAttribute('aria-busy')).toBe('true');
    expect(within(region()!).getByRole('status').textContent).toBe('Reading the profile and the chapters…');
    expect(screen.queryByText(/failing and \d+ not ready/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Delivery' })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(region()).toBeTruthy();
  });

  it('shows the counts, and no region, once both have been read', async () => {
    mount(TWO_FAIL, acx, { manuscriptChapters: async () => CHAPTERS });
    expect(await screen.findByText(/\d+ failing and \d+ not ready\./)).toBeTruthy();
    expect(region()).toBeNull();
  });

  it('ends the region when the chapters cannot be read, and says so', async () => {
    mount(ALL_PASS, acx, { manuscriptChapters: () => Promise.reject(new Error('unreadable')) });
    expect(await screen.findByText(/The chapters could not be read/)).toBeTruthy();
    await waitFor(() => expect(region()).toBeNull());
  });
});

// A failed read of the chapters or of the profile leaves the page working with a line that says so; each line offers Retry that reads again.
describe.each([
  // The package panel shows its skeleton while the chapters are read again; a measured job already carries its profile, so a profile read
  // again shows no skeleton, only the line going away and coming back if it fails again.
  {
    what: 'the chapters',
    seam: 'manuscriptChapters',
    skeleton: true,
    line: (reason: string) => new RegExp(`The chapters could not be read, so the files keep their file names: ${reason}`),
  },
  {
    what: 'the delivery profile',
    seam: 'deliveryProfiles',
    skeleton: false,
    line: (reason: string) => new RegExp(`The delivery profile could not be read: ${reason}`),
  },
] as const)('Master & QC: a failed read of $what offers Retry', ({ seam, line, skeleton }) => {
  const region = () => screen.queryByRole('group', { name: 'Loading the delivery package checks' });
  const retry = () => screen.getByRole('button', { name: `Retry reading ${seam === 'manuscriptChapters' ? 'the chapters' : 'the delivery profile'}` });
  const fail = (reason: string) => () => Promise.reject(new Error(reason));
  const never = () => new Promise<never>(() => undefined);
  // Each call takes the next step; the last step repeats.
  const steps = (list: Array<() => Promise<unknown>>) => vi.fn(() => (list.length > 1 ? (list.shift() as () => Promise<unknown>)() : list[0]()));
  const real = () =>
    (apiOf(jobOf(ALL_PASS, acx), acx, { manuscriptChapters: async () => CHAPTERS }) as unknown as Record<string, () => Promise<unknown>>)[seam]();
  const mountWith = (read: unknown) => mount(ALL_PASS, acx, { manuscriptChapters: async () => CHAPTERS, [seam]: read } as Partial<NarrationApi>);

  it('shows the line as an alert with Retry beside it, and no skeleton', async () => {
    mountWith(fail('first'));
    const text = await screen.findByText(line('first'));
    expect(text.getAttribute('role')).toBe('alert');
    expect(retry()).toBeTruthy();
    await waitFor(() => expect(region()).toBeNull());
  });

  it("shows no stale line while it reads again (the package panel's skeleton where it applies), then the loaded page", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    mountWith(steps([fail('first'), () => held.then(real)]));
    await screen.findByText(line('first'));
    await userEvent.click(retry());
    if (skeleton) expect(region()?.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText(line('first'))).toBeNull();
    expect(screen.queryByRole('button', { name: /^Retry reading/ })).toBeNull();
    await act(async () => release());
    await waitFor(() => expect(region()).toBeNull());
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it('shows the new line with Retry when the second read fails too', async () => {
    mountWith(steps([fail('first'), fail('second')]));
    await screen.findByText(line('first'));
    await userEvent.click(retry());
    expect(await screen.findByText(line('second'))).toBeTruthy();
    expect(screen.queryByText(line('first'))).toBeNull();
    expect(retry()).toBeTruthy();
  });

  it('keeps focus on the page when Retry removes the line it was pressed on, each time', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    mountWith(steps([fail('first'), fail('second'), () => held.then(real)]));
    await screen.findByText(line('first'));
    await userEvent.click(retry());
    await screen.findByText(line('second'));
    // The second line is a new button: pressing it removes it as the first was.
    await userEvent.click(retry());
    expect(screen.queryByRole('button', { name: /^Retry reading/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('main'));
    await act(async () => release());
    await waitFor(() => expect(region()).toBeNull());
  });

  it('reads again once for a double press, as for a single press', async () => {
    const reads = async (presses: number) => {
      const read = steps([fail('first'), never]);
      const view = mountWith(read);
      await screen.findByText(line('first'));
      const before = read.mock.calls.length;
      const button = retry();
      await act(async () => {
        for (let press = 0; press < presses; press++) button.click();
      });
      const extra = read.mock.calls.length - before;
      cleanup();
      return { extra, view };
    };
    const single = (await reads(1)).extra;
    expect(single).toBeGreaterThan(0);
    expect((await reads(2)).extra).toBe(single);
  });

  it('sets nothing when the page is left mid-retry', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mountWith(steps([fail('first'), () => held.then(real)]));
    await screen.findByText(line('first'));
    await userEvent.click(retry());
    cleanup();
    await act(async () => release());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
