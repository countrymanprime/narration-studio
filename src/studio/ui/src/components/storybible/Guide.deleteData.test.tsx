// @vitest-environment jsdom
// More actions > Delete Story Bible data: the confirm names the project and counts what goes, opens on Cancel, and the page is empty after.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { deletedMessage } from './DeleteStoryBibleData';
import { entryRows } from './entryTableTestKit';
import { Guide } from './Guide';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderGuide() {
  window.localStorage.clear();
  const api = createMockApi();
  const notify = vi.fn();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Guide notify={notify} goToManuscript={vi.fn()} projectName="Alice in Wonderland" />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(entryRows().length).toBeGreaterThan(0));
  return { api, notify, user: userEvent.setup() };
}

async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete Story Bible data…' }));
  return screen.findByRole('alertdialog', { name: 'Delete Story Bible data' });
}

describe('Delete Story Bible data', () => {
  it('names the project, counts the entries and suggestions, says what stays and that there is no undo, and opens on Cancel', async () => {
    const { api, user } = await renderGuide();
    const entries = (await api.guideEntities()).length;
    const suggestions = (await api.extractionList()).length;
    const dialog = await openConfirm(user);
    const text = dialog.textContent ?? '';
    expect(text).toContain('“Alice in Wonderland”');
    expect(text).toContain(`${entries} entries`);
    expect(text).toContain(`${suggestions} scan suggestions`);
    expect(text).toContain('This cannot be undone.');
    expect(text).toContain('The script, takes, recordings, settings, voice samples and voice references stay.');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' })));
  });

  it('Cancel deletes nothing', async () => {
    const { api, user } = await renderGuide();
    const deleteAll = vi.spyOn(api, 'guideDeleteAll');
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteAll).not.toHaveBeenCalled();
    expect(entryRows().length).toBeGreaterThan(0);
  });

  it('deletes, says what went, and leaves the empty Story Bible', async () => {
    const { api, notify, user } = await renderGuide();
    const samples = (await api.voiceSamplesList()).totals.count;
    const entries = (await api.guideEntities()).length;
    const suggestions = (await api.extractionList()).length;
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete Story Bible data' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(notify).toHaveBeenCalledWith(`Story Bible data deleted: ${entries} entries and ${suggestions} scan suggestions.`);
    expect(await screen.findByText('No entries yet. Add one, or scan the manuscript from More actions.')).toBeTruthy();
    expect(entryRows()).toHaveLength(0);
    expect((await api.voiceSamplesList()).totals.count).toBe(samples);
  });

  it('a refusal is an error toast and the dialog stays, with Cancel the way out', async () => {
    const { api, notify, user } = await renderGuide();
    vi.spyOn(api, 'guideDeleteAll').mockRejectedValue(
      new Error('wait for the Story Bible build or the manuscript scan to finish, then delete the Story Bible data'),
    );
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Delete Story Bible data' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringMatching(/scan to finish/i), 'error'));
    expect(screen.getByRole('alertdialog', { name: 'Delete Story Bible data' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(entryRows().length).toBeGreaterThan(0);
  });

  it('pressing Delete twice deletes once', async () => {
    const { api, user } = await renderGuide();
    let finish: () => void = () => {};
    const deleteAll = vi.spyOn(api, 'guideDeleteAll').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ entries: 1, suggestions: 0 });
        }),
    );
    const dialog = await openConfirm(user);
    const confirm = within(dialog).getByRole('button', { name: /Delete Story Bible data/ });
    await user.click(confirm);
    await user.click(confirm);
    expect(deleteAll).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
    finish();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

describe('deletedMessage', () => {
  it('counts in words a narrator reads', () => {
    expect(deletedMessage({ entries: 1, suggestions: 0 })).toBe('Story Bible data deleted: one entry.');
    expect(deletedMessage({ entries: 0, suggestions: 1 })).toBe('Story Bible data deleted: one scan suggestion.');
    expect(deletedMessage({ entries: 1200, suggestions: 3 })).toBe('Story Bible data deleted: 1,200 entries and 3 scan suggestions.');
    expect(deletedMessage({ entries: 0, suggestions: 0 })).toBe('There were no Story Bible entries or scan suggestions to delete.');
  });
});
