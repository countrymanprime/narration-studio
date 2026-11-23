// @vitest-environment jsdom
// SN-P8's acceptance tests for the swapped Production page, end to end against the mock host: the rebuilt layout, the dialogs its
// icons open, the timer and the chip's feed, chapter sync, and the row menu that keeps the features the mock has no equivalent for.
import { StudioProvider } from '../../studio/StudioProvider';
import type { DawChoice } from '../../api/contracts/daw';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../api/ApiContext';
import { ChapterTrackStateProvider, useChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { createMockApi } from '../../api/mockApi';
import { PRODUCTION_SCENARIOS } from '../../api/productionMock';
import { DAW_SETUPS } from '../../fixtures/daw';
import { overlay } from '../../overlay/overlayService';
import { OverlayHost } from '../../overlay/OverlayHost';
import { contextItemsFor } from '../../registries/context';
import type { ManuscriptChapter, NarrationApi } from '../../types';
import { TooltipProvider } from '../primitives/Tooltip';
import { resetOpenOnce } from '../connection/useOpenOnce';
import { addressPath } from '../../navigation/address';
import { ProductionPage } from './ProductionPage';

afterEach(() => {
  cleanup();
  resetOpenOnce();
  // Layers the overlay singleton still holds belong to the test that opened them.
  act(() => overlay.getSnapshot().dialogs.forEach((entry) => ('close' in entry ? entry.close() : entry.answer(false))));
});

type Initial = Parameters<typeof createMockApi>[1];

async function renderPage({
  overrides = {},
  initial = {},
  onManuscriptChanged,
  dawConnectGraceMs = 0,
}: { overrides?: Partial<NarrationApi>; initial?: Initial; onManuscriptChanged?: () => void; dawConnectGraceMs?: number } = {}) {
  const api = createMockApi(overrides, initial);
  const data = await api.bootstrap();
  const go = vi.fn();
  const goToBooth = vi.fn();
  const notify = vi.fn();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        {/* As in the app: the chapter list is the store's slot, shared with every page. */}
        <StudioProvider>
          <TooltipProvider>
            {/* As in the app shell: the board reads each chapter's link state from the one chapter-track state. */}
            <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
              <ProductionPage
                data={data}
                go={go}
                notify={notify}
                goToScript={vi.fn()}
                goToBooth={goToBooth}
                refreshBootstrap={async () => {}}
                onManuscriptChanged={onManuscriptChanged}
                dawConnectGraceMs={dawConnectGraceMs}
              />
            </ChapterTrackStateProvider>
          </TooltipProvider>
        </StudioProvider>
        <OverlayHost />
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, go, goToBooth, notify };
}

const pipeline = () => screen.findByRole('table', { name: 'Chapter pipeline' });

describe('production-route-draws-the-mock-page', () => {
  it('draws the header, the KPI row, the stage bar, This week, the recording check, the pipeline, Next up and the chart', async () => {
    await renderPage({ initial: { production: PRODUCTION_SCENARIOS['on-pace'] } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Production' })).toBeTruthy();
    const kpis = await screen.findByRole('list', { name: 'Production figures' });
    expect(
      within(kpis)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('span')?.textContent),
    ).toHaveLength(6);
    for (const title of ['Where the book stands', 'This week', 'Recording check', 'Chapter pipeline', 'Next up', 'Recorded vs plan']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    expect(await pipeline()).toBeTruthy();
  });

  // #2634: the strip and the stage bar draw one book. "Recorded audio" is the stage bar's recorded-or-further total out of its whole.
  it('draws the same book length and the same recorded hours on the figures strip as on Where the book stands', async () => {
    await renderPage({ initial: { production: PRODUCTION_SCENARIOS['on-pace'] } });
    const kpis = await screen.findByRole('list', { name: 'Production figures' });
    const bar = (await screen.findByRole('heading', { name: 'Where the book stands' })).closest('.grid')!.firstElementChild as HTMLElement;
    const legend = Object.fromEntries(
      within(bar)
        .getAllByRole('listitem')
        .map((li) => [li.textContent!.replace(/\s*\d+h \d+m.*$/, ''), li.querySelector('b [aria-hidden="true"]')!.textContent!]),
    );
    const minutes = (clock: string) => {
      const [, h, m] = /(\d+)h (\d+)m/.exec(clock)!;
      return Number(h) * 60 + Number(m);
    };
    const total = Object.values(legend).reduce((a, clock) => a + minutes(clock), 0);
    const recorded = total - minutes(legend['Not recorded yet']);
    const tile = within(kpis).getByRole('button', { name: /Recorded audio/ }).textContent!;
    const [value, whole] = [...tile.matchAll(/(\d+h \d+m)/g)].map((m) => minutes(m[1]));
    // The legend and the tile print each figure floored to the minute, so a sum of printed figures can fall short of a printed total (itself floored
    // from the exact sum) by less than a minute per figure: four segments and the tile's own floor for Recorded (up to 2 minutes), five and the
    // tile for the book (3). The exact, unfloored agreement is pinned in overview.test.tsx over four books.
    expect(Math.abs(whole - total)).toBeLessThanOrEqual(3);
    expect(Math.abs(value - recorded)).toBeLessThanOrEqual(2);
    expect(within(kpis).getByRole('button', { name: /Open pickups/ }).textContent).not.toMatch(/not measured yet/i);
  });

  // The mock's `.pstats` (1.5fr 1fr 1fr) and `.pgrid` (the pipeline beside a 360 px Next up), app.css:110-112.
  it('lays the stats row out 1.5 : 1 : 360 px over the pipeline and its 360 px Next up column, so the right-hand cards share their edges', async () => {
    await renderPage({ initial: { production: PRODUCTION_SCENARIOS['on-pace'] } });
    const stats = (await screen.findByRole('heading', { name: 'Where the book stands' })).closest('.grid') as HTMLElement;
    // Three columns above 1280, the last as wide as Next up below it (alignment audit XPR2-5); two from 640 with the stage card across
    // both, so This week and Recording check are never two full-width bars (XPR2-13); one below.
    expect(stats.className).toContain('min-[1281px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_22.5rem]');
    expect(stats.className).toContain('min-[640px]:grid-cols-2');
    expect(stats.className).toContain('min-[640px]:max-[1281px]:[&>:first-child]:col-span-2');
    const board = screen.getByRole('heading', { name: 'Chapter pipeline' }).closest('.grid') as HTMLElement;
    expect(board.className).toContain('min-[1281px]:grid-cols-[minmax(0,1fr)_22.5rem]');
    expect(board.className).toContain('items-stretch');
  });

  it('is the import when there is no manuscript', async () => {
    await renderPage({ initial: { noManuscript: true } });
    expect(await screen.findByRole('button', { name: 'Import manuscript' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Production figures' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Chapter pipeline' })).toBeNull();
  });

  // ML-5: Replace manuscript is in Settings, under Manuscript, and nowhere else.
  it('has no Replace manuscript once a manuscript exists', async () => {
    await renderPage();
    await pipeline();
    expect(screen.queryByRole('button', { name: /replace manuscript/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /import manuscript/i })).toBeNull();
    expect(screen.queryByText(/replace manuscript/i)).toBeNull();
  });

  it('imports no file the swap deleted', () => {
    const source = readFileSync(join(__dirname, 'ProductionPage.tsx'), 'utf8');
    for (const gone of ['ChapterBoard', 'PlanPanel', 'StatusReportPanel', 'StageSummary']) expect(source).not.toContain(gone);
  });
});

describe('page-data-load-failure', () => {
  it('keeps the title, says the page could not be loaded and reads again on Retry', async () => {
    const real = createMockApi();
    let failed = false;
    const overrides: Partial<NarrationApi> = {
      productionOverview: async () => {
        if (failed) return real.productionOverview();
        failed = true;
        throw new Error('The production log is unreadable.');
      },
    };
    await renderPage({ overrides });
    expect(await screen.findByText('This page could not be loaded')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Production' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await pipeline();
    expect(screen.queryByText('This page could not be loaded')).toBeNull();
  });
});

// The loading state (definition-of-done.md state matrix): the page's header stays and the overview is blocks while the production log is read, then
// the page, or the error with Retry; Retry shows the blocks again while it reads. Never an endless skeleton.
describe('production loading state', () => {
  const never = () => new Promise<never>(() => {});
  const region = () => screen.queryByRole('group', { name: 'Loading the production overview' });

  it('keeps the title and shows one busy region in place of the overview while the log is read, however long that takes', async () => {
    await renderPage({ overrides: { productionOverview: never } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Production' })).toBeTruthy();
    expect(region()?.getAttribute('aria-busy')).toBe('true');
    expect(within(region()!).getByRole('status').textContent).toBe('Reading the production log…');
    expect(screen.queryByRole('table', { name: 'Chapter pipeline' })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(region()).toBeTruthy();
  });

  it('shows no chapter count, word count or due date in the header until the first read ends', async () => {
    await renderPage({ overrides: { productionOverview: never } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Production' })).toBeTruthy();
    expect(region()).toBeTruthy();
    expect(screen.queryByText(/\d+ chapters/)).toBeNull();
    expect(screen.queryByText(/no delivery date set/)).toBeNull();
    expect(screen.queryByText('No due date set')).toBeNull();
    expect(within(region()!).getAllByRole('status')).toHaveLength(1);
  });

  it('says "0 chapters" when the log is read and has none', async () => {
    const base = await createMockApi().productionOverview();
    // The chapters are the shared list, so a book with none has an empty list as well as an empty overview.
    await renderPage({ overrides: { productionOverview: async () => ({ ...base, chapters: [] }), manuscriptChapters: async () => [] } });
    expect(await screen.findByText(/0 chapters · 0 words/)).toBeTruthy();
    expect(region()).toBeNull();
  });

  // #4058 (owner): every page that needs the chapter list reads the one shared list, so a rename or a failed read shows on this page as on the others.
  it('names its rows from the shared chapter list: a chapter renamed there is renamed here', async () => {
    const base = createMockApi();
    const list = await base.manuscriptChapters();
    const renamed = list.map((chapter) => (/^Chapter 3\b/.test(chapter.title) ? { ...chapter, title: 'Chapter 3 renamed in the list' } : chapter));
    await renderPage({ overrides: { manuscriptChapters: async () => renamed } });
    const table = await pipeline();
    expect(table.textContent).toContain('renamed in the list');
  });

  it('a chapter list that cannot be read is the page error with Retry, not a table of the overview; Retry reads the shared list again', async () => {
    const base = createMockApi();
    const original = base.manuscriptChapters.bind(base);
    let failing = true;
    const manuscriptChapters = vi.fn(async () => {
      if (failing) throw new Error('the chapter list is down');
      return original();
    });
    await renderPage({ overrides: { manuscriptChapters } });
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.queryByRole('table', { name: 'Chapter pipeline' })).toBeNull();
    failing = false;
    fireEvent.click(retry);
    expect(await pipeline()).toBeTruthy();
  });

  it('shows the skeleton while Retry reads a chapter list that is still down, then the error again', async () => {
    let release: () => void = () => undefined;
    let reads = 0;
    const manuscriptChapters = vi.fn(async () => {
      reads += 1;
      if (reads > 1) await new Promise<void>((resolve) => (release = resolve));
      throw new Error('the chapter list is down');
    });
    await renderPage({ overrides: { manuscriptChapters } });
    const retry = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    // The old failure is still in the store, but the page does not look dead while the new read runs.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull());
    release();
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('is replaced by the overview when the log arrives', async () => {
    await renderPage({ initial: { production: PRODUCTION_SCENARIOS['on-pace'] } });
    await pipeline();
    expect(region()).toBeNull();
  });

  it('ends in the error with Retry, never a skeleton, when the log cannot be read, and shows the blocks again while Retry reads', async () => {
    let mode: 'fail' | 'hold' = 'fail';
    await renderPage({
      overrides: { productionOverview: () => (mode === 'fail' ? Promise.reject(new Error('The production log is unreadable.')) : never()) },
    });
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(region()).toBeNull();
    mode = 'hold';
    await userEvent.click(retry);
    await waitFor(() => expect(region()).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByText(/\d+ chapters/)).toBeNull();
  });
});

describe('header-icons-and-dialogs-open', () => {
  it('opens the status report dialog from Export status report', async () => {
    await renderPage();
    await pipeline();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export status report' }));
    expect(await screen.findByRole('dialog', { name: 'Export status report' })).toBeTruthy();
  });

  it('opens Check recordings from the Recording check card', async () => {
    await renderPage();
    await pipeline();
    const card = screen.getByRole('heading', { name: 'Recording check' }).closest('section') as HTMLElement;
    const button = within(card).getByRole('button', { name: 'Check recordings' });
    if (button.getAttribute('aria-disabled') === 'true') return; // every chapter checked: nothing to preselect
    await userEvent.setup().click(button);
    expect(await screen.findByRole('dialog', { name: /Check recordings/ })).toBeTruthy();
  });

  it('draws the target info icon on the Recording tile', async () => {
    await renderPage();
    const kpis = await screen.findByRole('list', { name: 'Production figures' });
    expect(within(kpis).getByRole('button', { name: /target/i })).toBeTruthy();
  });

  it('opens the Schedule from the verdict pill and the Due tile', async () => {
    const { go } = await renderPage({ initial: { production: PRODUCTION_SCENARIOS['on-pace'] } });
    await pipeline();
    const user = userEvent.setup();
    const kpis = screen.getByRole('list', { name: 'Production figures' });
    await user.click(
      within(kpis)
        .getAllByRole('button')
        .find((b) => b.textContent?.startsWith('Due')) as HTMLElement,
    );
    expect(go).toHaveBeenLastCalledWith('/schedule');
  });
});

describe('timer-and-chip-still-work', () => {
  it('draws the running timer as a chip beside Stop timer, and Stop timer stops it and takes the chip away', async () => {
    await renderPage({ initial: { production: PRODUCTION_SCENARIOS['on-pace'] } });
    const chip = await screen.findByRole('timer', { name: /^Timer running on / });
    expect(chip.closest('header')).toBe((await screen.findByRole('button', { name: 'Stop timer' })).closest('header'));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Stop timer' }));
    expect(await screen.findByText(/Timer stopped/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Stop timer' })).toBeNull();
  });

  it('keeps the stage timer figures, drawn once time is logged', async () => {
    await renderPage({ initial: { production: PRODUCTION_SCENARIOS['on-pace'] } });
    const strip = await screen.findByRole('list', { name: 'Stage timer figures' });
    for (const label of ['Work time logged', 'Hours per finished hour', 'Effective rate']) expect(strip.textContent).toContain(label);
  });

  it('draws no timer figures before anything is logged', async () => {
    await renderPage();
    await pipeline();
    expect(screen.queryByRole('list', { name: 'Stage timer figures' })).toBeNull();
  });
});

describe('daw-dialog-check-again', () => {
  it('opens the connect dialog by itself, reads the DAW again on Check again and says when it last looked', async () => {
    const dawCapabilities = vi.fn(async () => structuredClone(DAW_SETUPS['reaper-off']));
    await renderPage({ overrides: { dawCapabilities } });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('REAPER is not connected')).toBeTruthy();
    expect(dialog.textContent).toContain('REAPER is not answering. Check that REAPER is open');
    expect(dialog.textContent).toContain('Progress that comes from REAPER may be out of date until it is running again.');
    const before = dawCapabilities.mock.calls.length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(dawCapabilities.mock.calls.length).toBeGreaterThan(before));
    expect(dialog.textContent).toMatch(/Waiting for REAPER to answer\. Last checked \d+ s ago\./);
  });

  it('drops the mark and the dialog on Check again once the DAW is running', async () => {
    let running = false;
    const dawCapabilities = vi.fn(async () => structuredClone(DAW_SETUPS[running ? 'reaper' : 'reaper-off']));
    await renderPage({ overrides: { dawCapabilities } });
    const dialog = await screen.findByRole('dialog');
    running = true;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: /REAPER not connected/ })).toBeNull();
  });

  it('closes with the header X and stays closed; the mark reopens it', async () => {
    await renderPage({ overrides: { dawCapabilities: vi.fn(async () => structuredClone(DAW_SETUPS['reaper-off'])) } });
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: /REAPER not connected/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('Start REAPER runs the host’s launcher and the dialog goes once REAPER answers', async () => {
    let running = false;
    const dawCapabilities = vi.fn(async () => structuredClone(DAW_SETUPS[running ? 'reaper' : 'reaper-off']));
    const launchDaw = vi.fn(async () => {
      running = true;
      return { launched: true, path: 'C:/REAPER/reaper.exe', source: 'uninstall_registry' };
    });
    await renderPage({ overrides: { dawCapabilities, launchDaw } });
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Start REAPER' }));
    await waitFor(() => expect(launchDaw).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 4000 });
  });

  it('writes a refused Start in the dialog', async () => {
    const launchDaw = vi.fn(async () => Promise.reject(new Error('Link a REAPER project file before starting REAPER.')));
    await renderPage({ overrides: { dawCapabilities: vi.fn(async () => structuredClone(DAW_SETUPS['reaper-off'])), launchDaw } });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start REAPER' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Link a REAPER project file before starting REAPER.');
  });
});

describe('daw-connect-grace', () => {
  it('shows Connecting while the app has just opened, then the mark and the dialog if it never connects', async () => {
    await renderPage({
      overrides: { dawCapabilities: vi.fn(async () => structuredClone(DAW_SETUPS['reaper-off'])) },
      dawConnectGraceMs: 1500, // counted from when the DAW stopped answering, not from app start; long enough that a slow runner still sees it connecting
    });
    expect(await screen.findByText('Connecting to REAPER…')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('dialog', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText('Connecting to REAPER…')).toBeNull();
  });

  it('says the DAW is starting, and does not ask, while the host reports its own start, however long after the app opened (#3668)', async () => {
    const starting = {
      hasProject: true,
      daw: 'REAPER',
      source: 'linked',
      chosen: 'REAPER',
      state: 'starting',
      reachable: false,
      linkedFile: 'Alice.rpp',
      foundFiles: ['Alice.rpp'],
      launcherAutoStart: false,
      options: [],
      starting: { since: new Date().toISOString() },
      bridge: null,
    } as unknown as DawChoice;
    await renderPage({
      overrides: {
        dawCapabilities: vi.fn(async () => structuredClone(DAW_SETUPS['reaper-off'])),
        dawChoice: vi.fn(async () => starting),
      },
      dawConnectGraceMs: 200,
    });
    expect(await screen.findByText('Starting REAPER…')).toBeTruthy();
    // Past the 200 ms grace, long after the app opened: only the host's "starting" is holding the dialog back.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks at once when the host says it is not starting anything and the grace has run out', async () => {
    await renderPage({ overrides: { dawCapabilities: vi.fn(async () => structuredClone(DAW_SETUPS['reaper-off'])) }, dawConnectGraceMs: 0 });
    expect(await screen.findByRole('dialog', {}, { timeout: 3000 })).toBeTruthy();
  });

  it('never shows the dialog when the host connects inside the grace', async () => {
    let push: (next: (typeof DAW_SETUPS)['reaper']) => void = () => {};
    await renderPage({
      overrides: {
        dawCapabilities: vi.fn(async () => structuredClone(DAW_SETUPS['reaper-off'])),
        subscribeDawCapabilities: (onUpdate: typeof push) => {
          push = onUpdate;
          return () => {};
        },
      },
      dawConnectGraceMs: 60_000,
    });
    await screen.findByText('Connecting to REAPER…');
    act(() => push(structuredClone(DAW_SETUPS['reaper'])));
    await waitFor(() => expect(screen.queryByText('Connecting to REAPER…')).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /not connected/ })).toBeNull();
  });
});

describe('daw-dialog-follows-the-host', () => {
  it('drops the dialog when the host pushes a reachable DAW, with no Check again', async () => {
    let push: (next: (typeof DAW_SETUPS)['reaper']) => void = () => {};
    const subscribeDawCapabilities = vi.fn((onUpdate: typeof push) => {
      push = onUpdate;
      return () => {};
    });
    await renderPage({
      overrides: { dawCapabilities: vi.fn(async () => structuredClone(DAW_SETUPS['reaper-off'])), subscribeDawCapabilities },
    });
    await screen.findByRole('dialog');
    act(() => push(structuredClone(DAW_SETUPS['reaper'])));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: /REAPER not connected/ })).toBeNull();
  });
});

describe('chapter-sync-feeds-survive', () => {
  it('reads the chapters again on a later chaptersync:state', async () => {
    const { api } = await renderPage();
    await pipeline();
    const read = vi.spyOn(api, 'productionOverview');
    const state = await api.chapterSyncState();
    act(() => (api as unknown as { emitChapterSync?: (s: typeof state) => void }).emitChapterSync?.(state));
    if (!(api as unknown as { emitChapterSync?: unknown }).emitChapterSync) return;
    await waitFor(() => expect(read).toHaveBeenCalled());
  });
});

describe('the row menu keeps the features the mock has none for', () => {
  it('offers the mock items, the chapter track, the checks and the status override on a pipeline row', async () => {
    await renderPage();
    const table = await pipeline();
    // The rows after the header: the opening credits, then chapter 1.
    const row = within(table).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'recording')?.unavailable).toBeUndefined());
    const labels = (contextItemsFor(row) ?? []).map((item) => item.label);
    for (const label of ['Open prep in Script', 'Open in Booth', 'Open Proof', 'Open Master & QC', 'Chapter track…', 'Check recordings', 'Editing check…']) {
      expect(labels).toContain(label);
    }
    expect(labels.some((label) => label.startsWith('Set status: '))).toBe(true);
  });

  it('says the manuscript changed after a chapter status is set, so other pages read the chapter list again', async () => {
    const onManuscriptChanged = vi.fn();
    await renderPage({ onManuscriptChanged });
    const table = await pipeline();
    const row = within(table).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.label.startsWith('Set status: '))).toBeTruthy());
    const baseline = onManuscriptChanged.mock.calls.length;
    await act(async () =>
      contextItemsFor(row)
        ?.find((item) => item.label.startsWith('Set status: '))
        ?.onSelect(),
    );
    await waitFor(() => expect(onManuscriptChanged.mock.calls.length).toBeGreaterThan(baseline));
  });

  it("opens Check recordings from the row menu with the row's chapter ticked, the one recording check every page opens", async () => {
    await renderPage();
    const table = await pipeline();
    // The rows after the header: the opening credits, then chapter 1.
    const row = within(table).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'recording')?.unavailable).toBeUndefined());
    act(() =>
      contextItemsFor(row)
        ?.find((item) => item.key === 'recording')
        ?.onSelect(),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Check recordings' });
    expect(await within(dialog).findByRole('button', { name: 'Check 1 chapter' })).toBeTruthy();
  });

  // REAPER with Select a track switched on.
  const selecting = async () => {
    const setup = structuredClone(DAW_SETUPS.reaper);
    setup.capabilities.track_select = { level: 'experimental', available: true };
    return setup;
  };

  it("goes to a linked chapter's track in the DAW, as Show in REAPER", async () => {
    const trackSelectInReaper = vi.fn(async (trackGuid: string) => ({ outcome: 'selected' as const, trackGuid }));
    const { notify } = await renderPage({ overrides: { trackSelectInReaper, dawCapabilities: selecting }, initial: { chapterSync: 'activity' } });
    const table = await pipeline();
    const row = within(table).getAllByRole('row')[2];
    const goto = () => contextItemsFor(row)?.find((item) => item.key === 'goto');
    await waitFor(() => expect(goto()?.unavailable).toBeUndefined());
    expect(goto()?.label).toBe('Show in REAPER');
    act(() => goto()?.onSelect());
    await waitFor(() => expect(trackSelectInReaper).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Selected in REAPER.'));
  });

  it('says why Show in REAPER is off: the DAW cannot select a track, or the chapter has no linked track', async () => {
    const cannot = 'REAPER could not select the track.';
    const noSelect = async () => {
      const caps = structuredClone(DAW_SETUPS.reaper);
      return {
        ...caps,
        capabilities: { ...caps.capabilities, track_select: { level: 'experimental' as const, available: false, reason: 'failed' as const, message: cannot } },
      };
    };
    await renderPage({ overrides: { dawCapabilities: noSelect } });
    const offTable = await pipeline();
    const offRow = within(offTable).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(offRow)?.find((item) => item.key === 'goto')?.unavailable).toBe(cannot));
    cleanup();
    await renderPage({ overrides: { dawCapabilities: selecting } });
    const table = await pipeline();
    const row = within(table).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'recording')?.unavailable).toBeUndefined());
    // The mock's chapter has a suggested track, not a confirmed link: the reason says so (#3363).
    expect(contextItemsFor(row)?.find((item) => item.key === 'goto')?.unavailable).toMatch(/only a suggestion/);
  });

  // #3415: the board's links are read from the saved project; REAPER's tracks now say whether a linked track is still there.
  it('keeps Show in REAPER off for a track deleted in REAPER since the save, as the Engine row and the panel say Track missing', async () => {
    const base = createMockApi({}, { chapterSync: 'activity' });
    const links = await base.chapterTrackLinks();
    const linkedGuid = links.chapters.find((chapter) => chapter.status === 'confirmed')?.links[0]?.trackGuid;
    expect(linkedGuid).toBeTruthy();
    const tracksLive = async () => {
      const answer = await base.tracksLive();
      return { ...answer, project: { ...answer.project, tracks: answer.project.tracks.filter((track) => track.guid !== linkedGuid) } };
    };
    await renderPage({ overrides: { dawCapabilities: selecting, tracksLive }, initial: { chapterSync: 'activity' } });
    const table = await pipeline();
    const row = within(table).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'recording')?.unavailable).toBeUndefined());
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'goto')?.unavailable).toMatch(/linked to this chapter is missing/));
  });

  it('asks REAPER once when Show in REAPER is pressed again while the first press is out', async () => {
    let release: () => void = () => {};
    const trackSelectInReaper = vi.fn(
      (trackGuid: string) =>
        new Promise<{ outcome: 'selected'; trackGuid: string }>((resolve) => (release = () => resolve({ outcome: 'selected', trackGuid }))),
    );
    await renderPage({ overrides: { trackSelectInReaper, dawCapabilities: selecting }, initial: { chapterSync: 'activity' } });
    const row = within(await pipeline()).getAllByRole('row')[2];
    const goto = () => contextItemsFor(row)?.find((item) => item.key === 'goto');
    await waitFor(() => expect(goto()?.unavailable).toBeUndefined());
    act(() => goto()?.onSelect());
    act(() => goto()?.onSelect());
    act(() => goto()?.onSelect());
    await waitFor(() => expect(trackSelectInReaper).toHaveBeenCalledTimes(1));
    release();
  });

  it('keeps Show in REAPER off for a track that is not in the saved project, as the chapter track panel does (#3168)', async () => {
    const base = createMockApi();
    const chapterTrackLinks = async () => {
      const links = await base.chapterTrackLinks();
      return { ...links, chapters: links.chapters.map((chapter) => ({ ...chapter, warnings: [...chapter.warnings, 'confirmed-track-missing' as const] })) };
    };
    const suggestedLinks = async () => {
      const links = await base.chapterTrackLinks();
      return { ...links, chapters: links.chapters.map((chapter) => ({ ...chapter, status: 'matched' as const })) };
    };
    await renderPage({ overrides: { dawCapabilities: selecting, chapterTrackLinks } });
    const table = await pipeline();
    const row = within(table).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'recording')?.unavailable).toBeUndefined());
    expect(contextItemsFor(row)?.find((item) => item.key === 'goto')?.unavailable).toMatch(/linked to this chapter is missing/);
    cleanup();
    // A suggested track, not yet linked, is off too.
    await renderPage({ overrides: { dawCapabilities: selecting, chapterTrackLinks: suggestedLinks } });
    const suggestedRow = within(await pipeline()).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(suggestedRow)?.find((item) => item.key === 'recording')?.unavailable).toBeUndefined());
    expect(contextItemsFor(suggestedRow)?.find((item) => item.key === 'goto')?.unavailable).toMatch(/only a suggestion/);
  });

  // #3228's review: the ambiguous case (two candidate tracks) was covered by the shared function only, not by the menu (#3231).
  it("keeps Show in REAPER off while the chapter's track is ambiguous, as the panel does", async () => {
    const base = createMockApi();
    const ambiguousLinks = async () => {
      const links = await base.chapterTrackLinks();
      return { ...links, chapters: links.chapters.map((chapter) => ({ ...chapter, status: 'ambiguous' as const })) };
    };
    await renderPage({ overrides: { dawCapabilities: selecting, chapterTrackLinks: ambiguousLinks } });
    const row = within(await pipeline()).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'recording')?.unavailable).toBeUndefined());
    expect(contextItemsFor(row)?.find((item) => item.key === 'goto')?.unavailable).toMatch(/More than one track could be this chapter/);
  });

  // #3363 (ux-review): the saved read of two confirmed links with one track gone says missing; the board and its menu read it as the panel does
  // (several), also while the live track list has not been read or cannot be.
  it('reads two confirmed links with one track gone as several on the board menu when the live list fails', async () => {
    const base = createMockApi();
    const severalLinks = async () => {
      const links = await base.chapterTrackLinks();
      return {
        ...links,
        chapters: links.chapters.map((chapter) => ({
          ...chapter,
          status: 'confirmed' as const,
          links: ['{A}', '{B}'].map((trackGuid) => ({
            trackGuid,
            chapterId: chapter.chapterId,
            chapterTitle: chapter.chapterTitle,
            confirmedAt: '2026-10-01T10:00:00Z',
          })),
          warnings: ['confirmed-track-missing' as const],
        })),
      };
    };
    const tracksLive = async () => {
      throw new Error('REAPER is not answering');
    };
    await renderPage({ overrides: { dawCapabilities: selecting, chapterTrackLinks: severalLinks, tracksLive } });
    const row = within(await pipeline()).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'goto')?.unavailable).toMatch(/more than one track: keep one first/));
  });

  // #3398: the link is written and "Track linked." said; the read after it fails. The narrator is told the change was made, once, never that the link failed.
  it('says the link was made, and that the list could not be read again, when only the read after a link rejects', async () => {
    const base = createMockApi();
    let written = false;
    const chapterTrackLinks = async () => {
      const links = await base.chapterTrackLinks();
      return { ...links, chapters: links.chapters.map((chapter) => ({ ...chapter, status: 'matched' as const })) };
    };
    const chapterTrackMapList = async () => {
      if (written) throw new Error('the project file is locked');
      return base.chapterTrackMapList();
    };
    const chapterTrackSet = async (chapterId: string, trackGuid: string) => {
      written = true;
      return base.chapterTrackSet(chapterId, trackGuid);
    };
    const onManuscriptChanged = vi.fn();
    const { notify } = await renderPage({ overrides: { chapterTrackLinks, chapterTrackMapList, chapterTrackSet }, onManuscriptChanged });
    const row = within(await pipeline()).getAllByRole('row')[2];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'track')?.unavailable).toBeUndefined());
    act(() =>
      contextItemsFor(row)
        ?.find((item) => item.key === 'track')
        ?.onSelect(),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('The change was made, but the list could not be read again'), 'error'));
    expect(notify.mock.calls.filter(([text]) => /linked/i.test(String(text)) && !/could not be read/.test(String(text)))).toHaveLength(1);
    expect(notify.mock.calls.filter(([, tone]) => tone === 'error')).toHaveLength(1);
    expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/^Error: /), 'error');
    // The board still hears the change and reads its own state again, whatever the links read did.
    await waitFor(() => expect(onManuscriptChanged).toHaveBeenCalled());
  });

  it('matches nothing outside the pipeline', async () => {
    await renderPage();
    await pipeline();
    expect(contextItemsFor(screen.getByRole('heading', { level: 1, name: 'Production' }))).toBeNull();
  });
});

describe('the pipeline lists the credits as the mock does (issue 1705)', () => {
  const rowNames = (table: HTMLElement) =>
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

  it('puts the opening credits before chapter 1 and the closing credits after the last chapter', async () => {
    await renderPage();
    const names = rowNames(await pipeline());
    await waitFor(async () => expect(rowNames(await pipeline())[0]).toBe('Opening credits'));
    expect(rowNames(await pipeline()).at(-1)).toBe('Closing credits');
    expect(names.length).toBeGreaterThan(2);
  });

  it('draws the credits rows in the pipeline format: a cell for each stage, a dash where nothing measures it', async () => {
    await renderPage();
    const table = await pipeline();
    const opening = await within(table).findByRole('row', { name: /Opening credits/ });
    expect(within(opening).getAllByRole('cell')).toHaveLength(10);
    expect(within(opening).getByRole('button', { name: /^Opening credits: Prep / })).toBeTruthy();
    expect(within(opening).getByRole('button', { name: /^Opening credits: Record / })).toBeTruthy();
  });

  it('offers the credits row the same row menu as a chapter, with the credits panel besides', async () => {
    await renderPage();
    const table = await pipeline();
    const opening = await within(table).findByRole('row', { name: /Opening credits/ });
    const labels = (contextItemsFor(opening) ?? []).map((item) => item.label);
    for (const label of ['Open prep in Script', 'Open in Booth', 'Open Proof', 'Editing check…', 'Check recordings', 'Chapter track…', 'Credits…'])
      expect(labels).toContain(label);
    expect(labels.some((label) => label.startsWith('Set status: '))).toBe(true);
  });

  it('counts the credits among the chapters', async () => {
    await renderPage();
    const table = await pipeline();
    const rows = within(table).getAllByRole('row').length - 1;
    await waitFor(() => expect(screen.getByText(new RegExp(`^${rows} chapters ·`))).toBeTruthy());
  });

  it('opens a credits row in Proof like a chapter', async () => {
    const { go } = await renderPage();
    const table = await pipeline();
    const opening = await within(table).findByRole('row', { name: /Opening credits/ });
    contextItemsFor(opening)
      ?.find((item) => item.key === 'proof')
      ?.onSelect();
    expect(go).toHaveBeenLastCalledWith(addressPath({ page: 'proof', chapter: 'credits-opening' }));
  });

  it('opens a credits row in Script and the Booth at the credits, not at a chapter', async () => {
    const { goToBooth } = await renderPage();
    const table = await pipeline();
    const opening = await within(table).findByRole('row', { name: /Opening credits/ });
    await userEvent.click(within(opening).getByRole('button', { name: /^Opening credits: Record / }));
    expect(goToBooth).toHaveBeenCalledWith('credits-opening');
  });

  // Audit cluster 15 (docs/research/ui-function-audit.md): the credits' prep is the narrator's mark on Script ("My prep"), the one record the
  // Script card sets and Production reads; no template reading overrides it.
  it("shows the prep the narrator marked for the credits on Script, whatever the template's tokens say", async () => {
    const api = createMockApi();
    await api.scriptPrepSetChapter('credits:opening', 'progress');
    const data = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <TooltipProvider>
            <ProductionPage
              data={data}
              go={vi.fn()}
              notify={vi.fn()}
              goToScript={vi.fn()}
              goToBooth={vi.fn()}
              refreshBootstrap={async () => {}}
              dawConnectGraceMs={0}
            />
          </TooltipProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    const table = await pipeline();
    const opening = await within(table).findByRole('row', { name: /Opening credits/ });
    await waitFor(() => expect(within(opening).getByRole('button', { name: /^Opening credits: Prep In progress/i })).toBeTruthy());
  });

  it('has no separate Credits list under the pipeline: the rows are where the credits are', async () => {
    await renderPage();
    await pipeline();
    expect(screen.queryByRole('region', { name: 'Credits' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Opening credits' })).toBeNull();
  });
});

describe('deleted-files-have-no-importers', () => {
  const SRC = join(__dirname, '..', '..');
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? sources(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
    );
  it.each(['ChapterBoard', 'PlanPanel', 'StatusReportPanel', 'StageSummary'])('no source imports %s', (name) => {
    const importers = sources(SRC).filter((file) => new RegExp(`from '[^']*/${name}'`).test(readFileSync(file, 'utf8')));
    expect(importers).toEqual([]);
  });

  it('opens the Schedule from the calendar button on the Recorded vs plan panel', async () => {
    const { go } = await renderPage({ initial: { production: PRODUCTION_SCENARIOS['on-pace'] } });
    await pipeline();
    await userEvent.setup().click(within(screen.getByRole('region', { name: 'Recorded vs plan' })).getByRole('button', { name: 'Open schedule' }));
    expect(go).toHaveBeenLastCalledWith('/schedule');
  });
});

// The narrator walkthrough of #3414: the board's Rec. column comes from the overview, so a link changed in the Engine panel has to make the
// page read the overview again.
describe('the board follows a link changed elsewhere', () => {
  it('reads the overview again when a chapter is linked, cleared or created in another screen', async () => {
    const api = createMockApi();
    const data = await api.bootstrap();
    const overview = vi.spyOn(api, 'productionOverview');
    const seen: { current?: ReturnType<typeof useChapterTrackState> } = {};
    function Elsewhere() {
      seen.current = useChapterTrackState({ enabled: true, tracks: false });
      return null;
    }
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <TooltipProvider>
            <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
              <Elsewhere />
              <ProductionPage
                data={data}
                go={vi.fn()}
                notify={vi.fn()}
                goToScript={vi.fn()}
                goToBooth={vi.fn()}
                refreshBootstrap={async () => {}}
                dawConnectGraceMs={0}
              />
            </ChapterTrackStateProvider>
          </TooltipProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    await pipeline();
    await waitFor(() => expect(overview).toHaveBeenCalled());
    // Let the first reads settle, then change a link the way the Engine panel does.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const before = overview.mock.calls.length;
    const links = await api.chapterTrackLinks();
    const chapter = links.chapters.find((c) => c.status === 'none')!;
    const result = await api.chapterTrackSet(chapter.chapterId, links.tracks.at(-1)!.guid);
    act(() => seen.current!.applyMappings(result.mappings));
    await waitFor(() => expect(overview.mock.calls.length).toBeGreaterThan(before));
  });

  // #3869 (delta intent F1): audio under one second is no audio on the whole page. One chapter, host absent or at 0: the tile, the stage bar and the row all say nothing is recorded;
  // at one second the tile and the row say "<0h 01m" and 1%.
  describe('audio under one second on the whole page', () => {
    const zero = { paragraphId: 'p1', paragraph: 1, word: 0, percent: 0, complete: false, source: 'booth' as const, confident: true };
    const boardWith = async (recordedSeconds: number, host: typeof zero | undefined) => {
      const base = createMockApi();
      const overview = await base.productionOverview();
      const row = {
        ...overview.chapters.find((c) => /^Chapter 1\b/.test(c.title))!,
        status: 'recording' as const,
        recordedSeconds,
        recordedThrough: host,
      };
      // The row's names, status and recorded audio come from the shared chapter list; the overview adds its numbers.
      const listed = { ...row, index: 0 } as unknown as ManuscriptChapter;
      await renderPage({ overrides: { productionOverview: async () => ({ ...overview, chapters: [row] }), manuscriptChapters: async () => [listed] } });
      const kpis = await screen.findByRole('list', { name: 'Production figures' });
      const table = await pipeline();
      return {
        tile: within(kpis).getByRole('button', { name: /Recorded audio/ }).textContent!,
        table: table.textContent!,
        segment: document.querySelector('[title^="Recorded:"]'),
        chartY: document.querySelector('circle[data-marker="today"]')?.getAttribute('cy') ?? null,
      };
    };
    for (const host of [undefined, zero]) {
      for (const seconds of [0.5, 0.99]) {
        it(`${seconds} s, ${host ? 'host 0' : 'no host percent'}: the tile, the stage bar and the row say nothing is recorded`, async () => {
          const { tile, table, segment } = await boardWith(seconds, host);
          expect(tile).toMatch(/^Recorded audio0h 00m/);
          expect(segment).toBeNull();
          expect(table).toContain('None yet');
          expect(table).toContain('0%');
        });
      }
    }
    it('puts the plan chart’s today point of 0.5 s and 0.99 s where 0 s puts it, and one second above it', async () => {
      const zero = (await boardWith(0, undefined)).chartY;
      expect(zero).not.toBeNull();
      cleanup();
      expect((await boardWith(0.5, undefined)).chartY).toBe(zero);
      cleanup();
      expect((await boardWith(0.99, undefined)).chartY).toBe(zero);
      cleanup();
      expect((await boardWith(1, undefined)).chartY).not.toBe(zero);
    });
    it('1 s: the tile and the row say <0h 01m and 1%', async () => {
      const { tile, table } = await boardWith(1, undefined);
      expect(tile).toMatch(/^Recorded audio<0h 01m/);
      expect(table).toContain('1%');
    });
  });
});
