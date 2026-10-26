// @vitest-environment jsdom
// What Production offers the jump menu: its pipeline's chapters, the checks and the page's actions, read from the page's own state.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { DawCapabilities } from '../../api/contracts/daw';
import { createMockApi } from '../../api/mockApi';
import { PRODUCTION_SCENARIOS } from '../../api/productionMock';
import { COMMAND_CATALOG } from '../../input/commands.catalog';
import { defaultKeymap } from '../../input/keymap';
import { currentPageContext, type PageItem } from '../../input/pageCommands';
import { OverlayHost } from '../../overlay/OverlayHost';
import { createOverlayService, overlay } from '../../overlay/overlayService';
import type { NarrationApi } from '../../types';
import { openJumpMenu } from '../layout/JumpMenu';
import { TooltipProvider } from '../primitives/Tooltip';
import * as checkRecordings from '../recordingcheck/openCheckRecordings';
import { ProductionPage } from './ProductionPage';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  act(() => overlay.getSnapshot().dialogs.forEach((entry) => ('close' in entry ? entry.close() : entry.answer(false))));
  vi.restoreAllMocks();
});

async function renderPage({ overrides = {}, initial = {} }: { overrides?: Partial<NarrationApi>; initial?: Parameters<typeof createMockApi>[1] } = {}) {
  const api = createMockApi(overrides, { production: PRODUCTION_SCENARIOS['on-pace'], ...initial });
  const data = await api.bootstrap();
  const goToBooth = vi.fn();
  const view = render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <TooltipProvider>
          <ProductionPage
            data={data}
            go={vi.fn()}
            notify={vi.fn()}
            goToScript={vi.fn()}
            goToBooth={goToBooth}
            refreshBootstrap={async () => {}}
            dawConnectGraceMs={0}
          />
        </TooltipProvider>
        <OverlayHost />
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, goToBooth, ...view };
}

const items = (group?: string): readonly PageItem[] => (currentPageContext()?.items ?? []).filter((row) => group === undefined || row.group === group);
const byId = (id: string) => items().find((row) => row.id === id)!;
const pipelineRows = async () => {
  const table = await screen.findByRole('table', { name: 'Chapter pipeline' });
  return [...table.querySelectorAll<HTMLElement>('tbody tr')];
};
const listed = () => waitFor(() => expect(items('Chapters').length).toBeGreaterThan(0));
const reason = (id: string) => byId(id).disabledReason;

describe('production-page-commands', () => {
  it('registers-as-Production-replacing-the-global-chapter-rows-and-goes-when-the-page-unmounts', async () => {
    const { unmount } = await renderPage();
    await listed();
    expect(currentPageContext()).toMatchObject({ id: 'production', label: 'Production', supersedes: ['Chapters'] });
    unmount();
    expect(currentPageContext()).toBeNull();
  });

  it('lists-one-chapter-per-pipeline-row-and-choosing-one-scrolls-to-its-row-and-focuses-it', async () => {
    await renderPage();
    const rows = await pipelineRows();
    await listed();
    const chapters = items('Chapters');
    expect(chapters).toHaveLength(rows.length);
    expect(chapters.map((row) => row.id)).toEqual(chapters.map((row) => `chapter.${row.id.slice('chapter.'.length)}`));
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    const last = rows.length - 1;
    act(() => chapters[last].run());
    expect(scrolled).toHaveBeenCalled();
    expect(rows[last].contains(document.activeElement)).toBe(true);
  });

  it('check-recordings-follows-the-recording-check-card', async () => {
    const open = vi.spyOn(checkRecordings, 'openCheckRecordings').mockReturnValue(() => {});
    await renderPage({ initial: { chapterSync: 'activity' } });
    await pipelineRows();
    await listed();
    const card = screen.getByRole('button', { name: 'Check recordings' }) as HTMLButtonElement;
    await waitFor(() => expect(Boolean(reason('check.recordings'))).toBe(card.disabled));
    if (!card.disabled) {
      act(() => byId('check.recordings').run());
      expect(open).toHaveBeenCalledOnce();
    } else {
      expect(reason('check.recordings')).toBe('Every chapter is checked as of the last save');
    }
  });

  it('check-recordings-says-the-DAW-is-not-running', async () => {
    const caps: DawCapabilities = { daw: 'REAPER', reachable: false, capabilities: {} };
    await renderPage({ overrides: { dawCapabilities: async () => caps, subscribeDawCapabilities: () => () => undefined } });
    await pipelineRows();
    await waitFor(() => expect(reason('check.recordings')).toBe('REAPER is not running.'));
  });

  it('start-session-is-off-with-the-reason-the-header-gives-and-goes-to-the-Booth-when-it-can', async () => {
    const { goToBooth } = await renderPage();
    await pipelineRows();
    const button = screen.getByRole('button', { name: /Start session/ }) as HTMLButtonElement;
    await waitFor(() => expect(Boolean(reason('action.session'))).toBe(button.disabled));
    if (button.disabled) expect(reason('action.session')).toBeTruthy();
    else {
      act(() => byId('action.session').run());
      expect(goToBooth).toHaveBeenCalled();
    }
  });

  it('the-timer-can-be-stopped-only-while-one-runs', async () => {
    await renderPage();
    await pipelineRows();
    await waitFor(() => expect(reason('action.timer') === undefined).toBe(screen.queryByRole('button', { name: 'Stop timer' }) !== null));
  });

  it('with-no-timer-running-stop-timer-stays-listed-and-says-so', async () => {
    const overview = await createMockApi({}, { production: PRODUCTION_SCENARIOS['on-pace'] }).productionOverview();
    await renderPage({ overrides: { productionOverview: async () => ({ ...overview, running: null }) } });
    await waitFor(() => expect(items('Actions').some((row) => row.id === 'action.timer')).toBe(true));
    await waitFor(() => expect(reason('action.timer')).toBe('No stage timer is running.'));
  });

  it('export-opens-the-status-report', async () => {
    await renderPage();
    await pipelineRows();
    expect(reason('action.export')).toBeUndefined();
    act(() => byId('action.export').run());
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('stage-suggestions-can-be-read-again', async () => {
    const { api } = await renderPage();
    const read = vi.spyOn(api, 'stageRecommendations');
    await pipelineRows();
    await waitFor(() => expect(reason('check.stages')).toBeUndefined());
    act(() => byId('check.stages').run());
    await waitFor(() => expect(read).toHaveBeenCalled());
  });

  it('with-no-manuscript-it-offers-the-import-the-page-shows-and-nothing-else', async () => {
    await renderPage({ initial: { noManuscript: true } });
    await screen.findByRole('button', { name: 'Import manuscript' });
    expect(items().map((row) => row.id)).toEqual(['action.import']);
    expect(reason('action.import')).toBeUndefined();
    act(() => byId('action.import').run());
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('shows-under-On-this-page-in-the-jump-menu', async () => {
    await renderPage();
    await pipelineRows();
    await listed();
    const service = createOverlayService();
    render(<OverlayHost service={service} />);
    act(() => void openJumpMenu({ service, keymap: defaultKeymap(COMMAND_CATALOG, false), runCommand: () => {} }));
    expect(await screen.findByRole('option', { name: /^Chapters\d+ ›/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /^Checks2 ›/ })).toBeTruthy();
    await userEvent.setup().keyboard('{Escape}');
  });
});
