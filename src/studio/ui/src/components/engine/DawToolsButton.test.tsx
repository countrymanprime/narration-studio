// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_TICKED_CHAPTER_LINKS } from '../../api/mockFixtures';
import type { NarrationApi } from '../../types';
import { DawToolsButton } from './DawToolsButton';

afterEach(cleanup);

function renderButton(overrides: Partial<NarrationApi> = {}, initial: Parameters<typeof createMockApi>[1] = {}) {
  const api = createMockApi(overrides, initial);
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <DawToolsButton groups={['structure']} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return api;
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'DAW tools' }));
  return screen.findByRole('menu');
};

describe('DawToolsButton, the page header form of the DAW tools', () => {
  it('opens the structure tools as live entries for a project with tracks and chapters linked to them', async () => {
    const user = userEvent.setup();
    renderButton({ chapterTrackMapList: async () => ({ mappings: WIRE_TICKED_CHAPTER_LINKS }) as never });
    const menu = await open(user);
    await waitFor(() =>
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .every((item) => item.getAttribute('aria-disabled') === null),
      ).toBe(true),
    );
    console.log(
      'ITEMS',
      JSON.stringify(
        within(menu)
          .getAllByRole('menuitem')
          .map((i) => i.textContent),
      ),
    );
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Prepare chapter render…', 'Create chapter regions…']);
    for (const item of items) expect(item.getAttribute('aria-disabled')).toBeNull();
  });

  it('says no chapter is linked yet, on both entries, when the book has chapters and none is linked', async () => {
    const user = userEvent.setup();
    renderButton({ chapterTrackMapList: async () => ({ mappings: [] }) as never });
    await open(user);
    await waitFor(() => expect(screen.getAllByText('No chapter is linked to a REAPER track yet. Link one on Production.')).toHaveLength(2));
  });

  it('says the project has no tracks when it has none', async () => {
    const user = userEvent.setup();
    renderButton({ tracksList: async () => ({ tracks: [] }) as never });
    await open(user);
    await waitFor(() => expect(screen.getAllByText('This REAPER project has no tracks yet.')).toHaveLength(2));
  });

  it('says the project could not be read when the read fails, so the entries are never silently live', async () => {
    const user = userEvent.setup();
    renderButton({ tracksList: async () => Promise.reject(new Error('disk gone')) });
    await open(user);
    await waitFor(() => expect(screen.getAllByText(/The REAPER project could not be read/)).toHaveLength(2));
  });

  it('keeps both entries for an Audacity project, off, each saying what Audacity cannot do', async () => {
    const user = userEvent.setup();
    renderButton(
      {},
      { daw: { daw: 'Audacity' }, audacityLink: { module: 'on', running: true, pipe: 'answering', openProject: 'linked', linkedFile: 'Book One.aup3' } },
    );
    await open(user);
    await waitFor(() => expect(screen.getByText(/Chapter regions are written in REAPER/)).toBeTruthy());
    expect(screen.getByText(/Render setup is written in REAPER/)).toBeTruthy();
  });

  it('says the DAW is not running, ahead of the tracks, when it does not answer', async () => {
    const user = userEvent.setup();
    renderButton({}, { daw: { reachable: false } });
    await open(user);
    await waitFor(() => expect(screen.getAllByText(/not answering/i).length).toBeGreaterThanOrEqual(2));
  });
});
