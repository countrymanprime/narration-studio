// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { MOCK_ASSET_ROOT, MOCK_MOVED_ROOT } from '../../../api/mockHost/assets';
import type { MockApiSeed } from '../../../api/mockHost/state';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { NarrationApi } from '../../../types';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// A move is polled every 400 ms and takes three polls.
const SLOW = { timeout: 10_000 };

async function renderModels(seed: MockApiSeed = {}, overrides: Partial<NarrationApi> = {}) {
  const api = createMockApi(overrides, seed);
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <SettingsPage
            data={data}
            notify={vi.fn()}
            onDirtyChange={vi.fn()}
            registerActions={vi.fn()}
            onProjectDataCleared={async () => undefined}
            onLinkDawFile={vi.fn()}
            go={vi.fn()}
            refreshBootstrap={async () => undefined}
          />
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Models & downloads/ }));
  await screen.findByRole('heading', { level: 2, name: 'Models & downloads' });
  await screen.findByRole('button', { name: 'Change location…' });
  return api;
}

const row = () => document.querySelector<HTMLElement>('[data-row="models.folder"]')!;
const move = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Change location…' }));
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Choose a folder…' }));
};

describe('Models folder', () => {
  it('is a Settings row with the folder in use and Change location, and no Reset while the default is used', async () => {
    await renderModels();
    expect(within(row()).getByText(MOCK_ASSET_ROOT)).toBeTruthy();
    expect(within(row()).queryByRole('button', { name: /^Reset the models folder/ })).toBeNull();
    expect(row().getAttribute('data-changed')).toBeNull();
  });

  it('asks first, then moves with progress, then uses the new folder and offers to delete the old copy', async () => {
    await renderModels();
    fireEvent.click(await screen.findByRole('button', { name: 'Change location…' }));
    const question = await screen.findByRole('alertdialog', { name: 'Change where downloads are kept?' });
    expect(question.textContent).toContain('The current copy stays until you delete it.');
    fireEvent.click(within(question).getByRole('button', { name: 'Choose a folder…' }));

    const dialog = await screen.findByRole('dialog', { name: 'Moving models and downloads' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy(), SLOW);
    expect(dialog.textContent).toContain('The models are in the new folder and in use.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(within(row()).getByText(MOCK_MOVED_ROOT)).toBeTruthy());
    expect(row().getAttribute('data-changed')).toBe('true');
    expect(within(row()).getByRole('button', { name: 'Reset the models folder to the default folder' })).toBeTruthy();
    expect(within(row()).getByText(MOCK_ASSET_ROOT)).toBeTruthy(); // the old copy, offered
    expect(within(row()).getByRole('button', { name: 'Delete old copy…' })).toBeTruthy();
  });

  it('cancelling a move leaves the old folder in use', async () => {
    await renderModels({ assetMove: 'copying' });
    await move();
    const dialog = await screen.findByRole('dialog', { name: 'Moving models and downloads' });
    await waitFor(() => expect(within(dialog).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40'), SLOW);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(dialog.textContent).toContain('Your models are still where they were.'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(within(row()).getByText(MOCK_ASSET_ROOT)).toBeTruthy();
    expect(within(row()).queryByRole('button', { name: /^Reset the models folder/ })).toBeNull();
  });

  it('a failed move says why in the dialog and changes nothing', async () => {
    await renderModels({ assetMove: 'fails' });
    await move();
    const dialog = await screen.findByRole('dialog', { name: 'Moving models and downloads' });
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('The disk filled up'), SLOW);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(within(row()).getByText(MOCK_ASSET_ROOT)).toBeTruthy();
  });

  it('closing the folder dialog without a choice starts nothing', async () => {
    const api = await renderModels({ assetMove: 'cancel' });
    const start = vi.spyOn(api, 'assetsMoveStart');
    await move();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Moving models and downloads' })).toBeNull();
  });

  it('a move the host refuses is an error toast and no dialog', async () => {
    const refusal = new Error('A download is running: wait for it to finish or cancel it, then move the models.');
    const { overlay } = await import('../../../overlay/overlayService');
    const toast = vi.spyOn(overlay, 'toast');
    await renderModels({}, { assetsMoveStart: async () => Promise.reject(refusal) });
    await move();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('A download is running'), { tone: 'error' }));
    expect(screen.queryByRole('dialog', { name: 'Moving models and downloads' })).toBeNull();
  });

  it('deleting the old copy asks first and ends the offer; keeping it deletes nothing', async () => {
    const api = await renderModels({ assetMove: 'moved' });
    const deleteOld = vi.spyOn(api, 'assetsMoveDeleteOld');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete old copy…' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete the old copy?' });
    expect(confirm.textContent).toContain('Anything else in that folder stays.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete old copy…' })).toBeNull());
    expect(deleteOld).toHaveBeenCalledTimes(1);
  });

  it('Keep it ends the offer without deleting', async () => {
    const api = await renderModels({ assetMove: 'moved' });
    const deleteOld = vi.spyOn(api, 'assetsMoveDeleteOld');
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Keep it' })).toBeNull());
    expect(deleteOld).not.toHaveBeenCalled();
  });

  it('Reset moves back to the default folder by the same move, after asking', async () => {
    const api = await renderModels({ assetMove: 'moved' });
    const start = vi.spyOn(api, 'assetsMoveStart');
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' })); // an old copy waiting blocks another move
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Keep it' })).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: 'Reset the models folder to the default folder' }));
    const question = await screen.findByRole('alertdialog', { name: 'Move the downloads back to the default folder?' });
    fireEvent.click(within(question).getByRole('button', { name: 'Move back' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith(''));
    const dialog = await screen.findByRole('dialog', { name: 'Moving models and downloads' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy(), SLOW);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(row().getAttribute('data-changed')).toBeNull());
  });

  it('is found by search and by the Changed filter', async () => {
    await renderModels({ assetMove: 'moved' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'location' } });
    expect(await screen.findByText('Models folder')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Changed' }));
    await waitFor(() => expect(document.querySelector('[data-row="models.folder"]')).not.toBeNull());
  });
});
