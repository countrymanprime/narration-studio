// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('makes no host call for the menu until it is first opened, so a page that never opens it pays nothing', async () => {
    const user = userEvent.setup();
    const api = renderButton();
    const tracksList = vi.spyOn(api, 'tracksList');
    const chapterTrackMapList = vi.spyOn(api, 'chapterTrackMapList');
    const audacityLink = vi.spyOn(api, 'audacityLink');
    await screen.findByRole('button', { name: 'DAW tools' });
    expect(tracksList).not.toHaveBeenCalled();
    expect(chapterTrackMapList).not.toHaveBeenCalled();
    expect(audacityLink).not.toHaveBeenCalled();
    await open(user);
    await waitFor(() => expect(tracksList).toHaveBeenCalledTimes(1));
    expect(chapterTrackMapList).toHaveBeenCalled();
  });

  it('returns focus to the DAW tools button when a dialog it opened is closed', async () => {
    const user = userEvent.setup();
    renderButton({ chapterTrackMapList: async () => ({ mappings: WIRE_TICKED_CHAPTER_LINKS }) as never });
    const menu = await open(user);
    const item = await within(menu).findByRole('menuitem', { name: /Create chapter regions/ });
    await waitFor(() => expect(item.getAttribute('aria-disabled')).toBeNull());
    await user.click(item);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'DAW tools' })));
  });

  // QA break B4 of #2820: links that could not be read said nothing and left the structure entries live.
  it('says the chapter links could not be read, on both entries, instead of leaving them live', async () => {
    const user = userEvent.setup();
    renderButton({ chapterTrackMapList: async () => Promise.reject(new Error('links gone')) });
    await open(user);
    await waitFor(() => expect(screen.getAllByText(/chapter links could not be read/i)).toHaveLength(2));
  });

  // QA break B5 of #2820: a failed read was kept until the DAW answered differently.
  it('reads the project again each time the menu is opened, so a failed read is retried', async () => {
    const user = userEvent.setup();
    const api = renderButton();
    const tracksList = vi.spyOn(api, 'tracksList');
    await open(user);
    await waitFor(() => expect(tracksList).toHaveBeenCalledTimes(1));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await open(user);
    await waitFor(() => expect(tracksList).toHaveBeenCalledTimes(2));
  });

  // QA break B3 of #2820, the owner's call: with another project open in the DAW the entries are off, with the Booth's sentence.
  it('says another project is open in the DAW, on both entries, as the Booth does', async () => {
    const user = userEvent.setup();
    const base = createMockApi();
    renderButton({ bootstrap: async () => ({ ...(await base.bootstrap()), dawFileLinked: true, dawReachable: true, dawProjectMatches: false }) });
    await open(user);
    await waitFor(() => expect(screen.getAllByText(/has a different project open than the one linked here/)).toHaveLength(2));
  });

  it('leaves the entries live when the open project is the linked one', async () => {
    const user = userEvent.setup();
    const base = createMockApi();
    renderButton({
      bootstrap: async () => ({ ...(await base.bootstrap()), dawFileLinked: true, dawReachable: true, dawProjectMatches: true }),
      chapterTrackMapList: async () => ({ mappings: WIRE_TICKED_CHAPTER_LINKS }) as never,
    });
    const menu = await open(user);
    await waitFor(() =>
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .every((item) => item.getAttribute('aria-disabled') === null),
      ).toBe(true),
    );
  });

  it('says whether the DAW has the linked project open could not be read, rather than leaving the entries live', async () => {
    const user = userEvent.setup();
    renderButton({ bootstrap: async () => Promise.reject(new Error('host down')) });
    await open(user);
    await waitFor(() => expect(screen.getAllByText(/has the linked project open could not be read/)).toHaveLength(2));
  });
});
