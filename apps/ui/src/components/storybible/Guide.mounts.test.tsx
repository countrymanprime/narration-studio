// @vitest-environment jsdom
// SN-B8: the Story Bible route mounts the Studio Next pieces built before it, and the old pronunciation query UI is gone.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
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

async function renderGuide() {
  window.localStorage.clear();
  const api = createMockApi();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findAllByText('Alice');
  return api;
}

const entryRow = (name: string) =>
  within(screen.getByRole('table', { name: 'Story Bible entries' }))
    .getAllByRole('row')
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
