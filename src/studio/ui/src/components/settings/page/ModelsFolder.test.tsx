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

async function renderModels(seed: MockApiSeed = {}, overrides: Partial<NarrationApi> = {}, settled = true) {
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
  if (settled) await screen.findByRole('button', { name: 'Change location…' });
  return api;
}

/** The dialog that says how a move ended, once it has. */
const ended = (title: string) => screen.findByRole('dialog', { name: title }, SLOW);
const row = () => document.querySelector<HTMLElement>('[data-row="models.folder"]')!;
const move = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Change location…' }));
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Choose a folder…' }));
};

describe('Models folder: breaks', () => {
  it('turns Change location and Reset off while an old copy waits, and says why on the offer line', async () => {
    const api = await renderModels({ assetMove: 'moved' });
    const pick = vi.spyOn(api, 'assetsFolderPick');
    const change = await screen.findByRole('button', { name: 'Change location…' });
    expect(change.hasAttribute('disabled')).toBe(true);
    fireEvent.click(change);
    const reset = await screen.findByRole('button', { name: 'Reset the models folder to the default folder' });
    expect(reset.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(reset);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(pick).not.toHaveBeenCalled();
    // The reason lives on the disabled buttons (a tooltip), not as a sentence in the flow.
    expect(document.querySelector('[data-old-copy]')!.textContent).toContain('The old copy is still in');
    expect(document.querySelector('[data-old-copy]')!.textContent).not.toContain('before moving again');
  });

  it("Keep it says where the old copy stays and that deleting it is the narrator's to do", async () => {
    const { overlay } = await import('../../../overlay/overlayService');
    const toast = vi.spyOn(overlay, 'toast');
    await renderModels({ assetMove: 'moved' });
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('Delete that folder yourself when you no longer need it')));
    expect(toast.mock.calls.at(-1)![0]).toContain(MOCK_ASSET_ROOT);
  });

  it('counts each pass against the real total, the same size the disk bar says is used', async () => {
    await renderModels({ assetMove: 'copying' });
    const used = document.querySelector('[data-disk]')!.textContent!;
    await move();
    const dialog = await screen.findByRole('dialog', { name: /^Moving models/ });
    await waitFor(() => expect(dialog.textContent).toMatch(/\d+ MB of 495 MB/), SLOW);
    expect(used).toContain('495 MB');
  });

  it('counts the elapsed time from when the host says the move began, also on a page opened mid-move', async () => {
    const base = createMockApi();
    const startedAt = new Date(Date.now() - 95_000).toISOString();
    const assetsMoveState = vi.fn(async () => ({
      id: 'm1',
      startedAt,
      phase: 'copying' as const,
      target: 'D:/Models',
      message: 'Copying the models…',
      percent: 20,
      bytesDone: 10,
      bytesTotal: 100,
      error: '',
    }));
    await renderModels({}, { assetsMoveState, assetsMoveStart: base.assetsMoveStart }, false);
    const dialog = await screen.findByRole('dialog', { name: /^Moving models/ });
    expect(dialog.textContent).toMatch(/9[5-9] s elapsed|10\d s elapsed/);
  });

  it('shows a move that failed while Settings was closed, once', async () => {
    const assetsMoveState = vi.fn(async () => ({
      id: 'm-old',
      startedAt: new Date().toISOString(),
      phase: 'error' as const,
      target: 'D:/Models',
      message: 'x',
      percent: 30,
      bytesDone: 1,
      bytesTotal: 2,
      error: 'The disk filled up while the models were being copied. Your models are still where they were.',
    }));
    const api = createMockApi({ assetsMoveState });
    const renderOnce = async () => {
      const data = await api.bootstrap();
      return render(
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
    };
    const first = await renderOnce();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Models & downloads/ }));
    const dialog = await ended('The move failed');
    expect(dialog.textContent).toContain('The disk filled up');
    expect(within(dialog).queryByRole('progressbar')).toBeNull();
    expect(dialog.textContent).not.toContain('elapsed');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    first.unmount();
    await renderOnce();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Models & downloads/ }));
    await screen.findByRole('button', { name: 'Change location…' });
    expect(screen.queryByRole('dialog', { name: 'The move failed' })).toBeNull();
  });

  it('draws every path left to right, so a path with right-to-left letters keeps its order', async () => {
    const base = createMockApi();
    const rtl = 'D:/نماذج/مجلد';
    const assetsList = vi.fn(async () => ({ ...(await base.assetsList()), cacheRoot: rtl, custom: true, previousRoot: 'E:/עברית' }));
    await renderModels({}, { assetsList });
    await waitFor(() => expect(within(row()).getByText(rtl).getAttribute('dir')).toBe('ltr'));
    expect(within(row()).getByText('E:/עברית').getAttribute('dir')).toBe('ltr');
    fireEvent.click(within(row()).getByRole('button', { name: 'Delete old copy…' }));
    const confirm = await screen.findByRole('alertdialog', { name: /^Delete the old copy in/ });
    expect(confirm.textContent).toContain('\u2066E:/עברית\u2069');
    for (const code of confirm.querySelectorAll('code')) expect(code.getAttribute('dir')).toBe('ltr');
  });
});

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

    const dialog = await screen.findByRole('dialog', { name: /^Moving models/ });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    const done = await ended('The models were moved');
    expect(done.textContent).toContain(`The models are in ${MOCK_MOVED_ROOT} and in use.`);
    expect(within(done).queryByRole('progressbar')).toBeNull();
    fireEvent.click(within(done).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(within(row()).getByText(MOCK_MOVED_ROOT)).toBeTruthy());
    expect(row().getAttribute('data-changed')).toBe('true');
    expect(within(row()).getByRole('button', { name: 'Reset the models folder to the default folder' })).toBeTruthy();
    expect(within(row()).getByText(MOCK_ASSET_ROOT)).toBeTruthy(); // the old copy, offered
    expect(within(row()).getByRole('button', { name: 'Delete old copy…' })).toBeTruthy();
  });

  it('cancelling a move leaves the old folder in use', async () => {
    await renderModels({ assetMove: 'copying' });
    await move();
    const dialog = await screen.findByRole('dialog', { name: /^Moving models/ });
    await waitFor(() => expect(within(dialog).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40'), SLOW);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const stopped = await ended('The move was cancelled');
    expect(stopped.textContent).toContain('Your models are still where they were.');
    expect(within(stopped).queryByRole('progressbar')).toBeNull();
    expect(stopped.textContent).not.toContain('elapsed');
    fireEvent.click(within(stopped).getByRole('button', { name: 'Close' }));
    expect(within(row()).getByText(MOCK_ASSET_ROOT)).toBeTruthy();
    expect(within(row()).queryByRole('button', { name: /^Reset the models folder/ })).toBeNull();
  });

  it('a failed move says why in the dialog and changes nothing', async () => {
    await renderModels({ assetMove: 'fails' });
    await move();
    const dialog = await ended('The move failed');
    expect(within(dialog).getByRole('alert').textContent).toContain('The disk filled up');
    expect(within(dialog).queryByRole('progressbar')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(within(row()).getByText(MOCK_ASSET_ROOT)).toBeTruthy();
  });

  it('says what the app did about a folder in the settings it cannot use', async () => {
    const base = createMockApi();
    const assetsList = vi.fn(async () => ({ ...(await base.assetsList()), folderNote: 'The models folder cannot be found. Reconnect its disk.' }));
    await renderModels({}, { assetsList });
    await waitFor(() => expect(within(row()).getByRole('status').textContent).toContain('cannot be found'));
  });

  it('closing the folder dialog without a choice starts nothing', async () => {
    const api = await renderModels({ assetMove: 'cancel' });
    const start = vi.spyOn(api, 'assetsMoveStart');
    await move();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /^Moving models/ })).toBeNull();
  });

  it('a move the host refuses is an error toast and no dialog', async () => {
    const refusal = new Error('A download is running: wait for it to finish or cancel it, then move the models.');
    const { overlay } = await import('../../../overlay/overlayService');
    const toast = vi.spyOn(overlay, 'toast');
    await renderModels({}, { assetsMoveStart: async () => Promise.reject(refusal) });
    await move();
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('A download is running'), { tone: 'error' }));
    expect(screen.queryByRole('dialog', { name: /^Moving models/ })).toBeNull();
  });

  it('deleting the old copy asks first and ends the offer; keeping it deletes nothing', async () => {
    const api = await renderModels({ assetMove: 'moved' });
    const deleteOld = vi.spyOn(api, 'assetsMoveDeleteOld');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete old copy…' }));
    const confirm = await screen.findByRole('alertdialog', { name: /^Delete the old copy in/ });
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
    const dialog = await ended('The models were moved back');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(row().getAttribute('data-changed')).toBeNull());
  });

  it('is found by search and by the Changed filter', async () => {
    await renderModels({ assetMove: 'moved' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'location' } });
    expect(await screen.findByText('Models folder location')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Changed' }));
    await waitFor(() => expect(document.querySelector('[data-row="models.folder"]')).not.toBeNull());
  });
});
