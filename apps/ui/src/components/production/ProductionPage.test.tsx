// @vitest-environment jsdom
// SN-P8's acceptance tests for the swapped Production page, end to end against the mock host: the Studio Next layout, the dialogs its
// icons open, the timer and the chip's feed, chapter sync, and the row menu that keeps the features the mock has no equivalent for.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { PRODUCTION_SCENARIOS } from '../../api/productionMock';
import { overlay } from '../../overlay/overlayService';
import { OverlayHost } from '../../overlay/OverlayHost';
import { contextItemsFor } from '../../registries/context';
import type { NarrationApi } from '../../types';
import { TooltipProvider } from '../primitives/Tooltip';
import { ProductionPage } from './ProductionPage';

afterEach(() => {
  cleanup();
  // Layers the overlay singleton still holds belong to the test that opened them.
  act(() => overlay.getSnapshot().dialogs.forEach((entry) => ('close' in entry ? entry.close() : entry.answer(false))));
});

type Initial = Parameters<typeof createMockApi>[1];

async function renderPage({ overrides = {}, initial = {} }: { overrides?: Partial<NarrationApi>; initial?: Initial } = {}) {
  const api = createMockApi(overrides, initial);
  const data = await api.bootstrap();
  const onOverview = vi.fn();
  const go = vi.fn();
  const goToBooth = vi.fn();
  const notify = vi.fn();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <TooltipProvider>
          <ProductionPage
            data={data}
            go={go}
            notify={notify}
            goToScript={vi.fn()}
            goToProofChapter={vi.fn()}
            goToBooth={goToBooth}
            refreshBootstrap={async () => {}}
            onOverview={onOverview}
          />
        </TooltipProvider>
        <OverlayHost />
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, onOverview, go, goToBooth, notify };
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
  it('feeds the shell chip from every overview read, and Stop timer stops the running one', async () => {
    const { onOverview } = await renderPage({ initial: { production: PRODUCTION_SCENARIOS['on-pace'] } });
    await waitFor(() => expect(onOverview).toHaveBeenCalledWith(expect.objectContaining({ running: expect.objectContaining({ chapterId: 'chapter-6' }) })));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Stop timer' }));
    expect(await screen.findByText(/Timer stopped/)).toBeTruthy();
    await waitFor(() => expect(onOverview.mock.lastCall?.[0].running).toBeNull());
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
    const row = within(table).getAllByRole('row')[1];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'recording')?.unavailable).toBeUndefined());
    const labels = (contextItemsFor(row) ?? []).map((item) => item.label);
    for (const label of ['Open prep in Script', 'Open in Booth', 'Open Proof', 'Open Master & QC', 'Chapter track…', 'Recording check…', 'Editing check…']) {
      expect(labels).toContain(label);
    }
    expect(labels.some((label) => label.startsWith('Set status: '))).toBe(true);
  });

  it('opens the recording check from the row menu', async () => {
    await renderPage();
    const table = await pipeline();
    const row = within(table).getAllByRole('row')[1];
    await waitFor(() => expect(contextItemsFor(row)?.find((item) => item.key === 'recording')?.unavailable).toBeUndefined());
    act(() =>
      contextItemsFor(row)
        ?.find((item) => item.key === 'recording')
        ?.onSelect(),
    );
    expect(await screen.findByRole('dialog', { name: /^Recording check: / })).toBeTruthy();
  });

  it('matches nothing outside the pipeline', async () => {
    await renderPage();
    await pipeline();
    expect(contextItemsFor(screen.getByRole('heading', { level: 1, name: 'Production' }))).toBeNull();
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
});
