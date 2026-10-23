// @vitest-environment jsdom
// SN-B8: the Story Bible route mounts the Studio Next pieces built before it, and the old pronunciation query UI is gone.
// SN-X91: the page's Scan button reaches the first-scan prompt or the scan, over the mock host and the fake asset registry.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { CommandRouter } from '../../input/router';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi } from '../../types';
import { ANALYSIS_TOOLS, createFakeTools } from '../settings/analysis/fixtures';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { Guide } from './Guide';
import { unattached, verifyCount } from './suggested/row/selectors';

afterEach(async () => {
  // The overlay service is module-level: close what a test left open so the next page is not behind it.
  const { overlay } = await import('../../overlay/overlayService');
  for (const entry of overlay.getSnapshot().dialogs) {
    if (entry.kind === 'confirm') entry.answer(false);
    else entry.close();
  }
  cleanup();
});

async function renderGuide(overrides: Partial<NarrationApi> = {}) {
  window.localStorage.clear();
  const api = createMockApi(overrides);
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findAllByText('Alice');
  return api;
}

const entryRow = (name: string) =>
  within(screen.getByRole('list', { name: 'Story Bible entries' }))
    .queryAllByRole('button')
    .find((row) => row.textContent?.includes(name));

describe('story-bible-route-mounts-the-new-pieces', () => {
  it('the header has Scan and Import, and no pronunciation queries button', async () => {
    await renderGuide();
    expect(screen.getByRole('button', { name: 'Scan the manuscript for suggestions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import entries (CSV or JSON)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pronunciation queries' })).toBeNull();
  });

  it('Import opens the import dialog', async () => {
    await renderGuide();
    await userEvent.click(screen.getByRole('button', { name: 'Import entries (CSV or JSON)' }));
    expect(await screen.findByRole('dialog', { name: 'Import entries' })).toBeTruthy();
  });

  it('the Needs verification chip filters the entries and lists the suggestions with no entry yet above them; choosing one shows its row', async () => {
    const api = await renderGuide();
    const list = await api.extractionList();
    const chip = await screen.findByRole('button', { name: `Needs verification · ${verifyCount(list)}` });
    await userEvent.click(chip);
    const loose = within(screen.getByRole('list', { name: 'Suggestions not in the Story Bible yet' })).getAllByRole('button');
    expect(loose).toHaveLength(unattached(list).length);
    expect(entryRow('Alice')).toBeUndefined();
    await userEvent.click(loose[0]!);
    expect(document.querySelector('[data-suggested]')).toBeTruthy();
  });

  it('an entry shows its names with source tags, its suggestions to verify, and no status or query controls', async () => {
    await renderGuide();
    await userEvent.click(entryRow('White Rabbit')!);
    const names = await screen.findByRole('list', { name: 'Names' });
    expect(within(names).getAllByRole('listitem').length).toBeGreaterThan(1);
    await waitFor(() => expect(document.querySelector('[data-suggested]')?.textContent).toMatch(/Suggested · \d+/));
    expect(screen.queryByText(/Query sent|Author confirmed/)).toBeNull();
  });
});

describe('the first scan from the page', () => {
  // The fake registry with the tools given installed, the prompt setting at its default, and the host's sources answering the installed
  // ones as available, as ExtractionSources does once the registry has them.
  const withTools = (installed: string[]) => {
    const fake = createFakeTools({ tools: ANALYSIS_TOOLS.map((t) => (installed.includes(t.id) ? { ...t, installState: 'installed' as const } : t)) });
    const base = createMockApi();
    const extractionScan = vi.fn(base.extractionScan);
    const overrides: Partial<NarrationApi> = {
      ...fake.port,
      settingsForScope: vi.fn(async () => ({ ManuscriptGuide: [{ key: 'analysis_prompt', effectiveValue: 'ask' }] }) as never),
      extractionSources: async () =>
        (await base.extractionSources()).map((s) => (installed.some((id) => id.startsWith(s.id)) ? { ...s, available: true, reason: undefined } : s)),
      extractionScan,
    };
    return { overrides, extractionScan };
  };
  const scanButton = () => screen.getByRole('button', { name: 'Scan the manuscript for suggestions' });

  it('Scan with nothing installed opens the prompt; with a tool installed it starts the scan with that source', async () => {
    const none = withTools([]);
    await renderGuide(none.overrides);
    await userEvent.click(scanButton());
    expect(await screen.findByRole('dialog', { name: 'Scan the manuscript' })).toBeTruthy();
    expect(none.extractionScan).not.toHaveBeenCalled();
    cleanup();
    const { overlay } = await import('../../overlay/overlayService');
    for (const entry of overlay.getSnapshot().dialogs) if (entry.kind !== 'confirm') entry.close();

    const gliner = withTools(['gliner']);
    await renderGuide(gliner.overrides);
    await userEvent.click(scanButton());
    await waitFor(() => expect(gliner.extractionScan).toHaveBeenCalledWith(['rules', 'gliner']));
    expect(screen.queryByRole('dialog', { name: 'Scan the manuscript' })).toBeNull();
  });
});
