// @vitest-environment jsdom
// A Proof decision reaches the other pages on the mock host as it does on the real one (docs/reference/cross-page-handoffs.md): Needs
// pickup adds a "Proof note" line to Pickups, the rail's Pickups count and Production's open pickups; taking the decision back removes it.
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { CommandRouter } from './input/router';
import { ThemeProvider } from './theme/ThemeContext';

configure({ asyncUtilTimeout: 12_000 });
beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(cleanup);

const press = (key: string, code: string) => fireEvent.keyDown(document.body, { key, code });
const rail = async (name: RegExp) => within(await screen.findByRole('complementary', { name: 'Primary navigation' })).findByRole('button', { name });

describe('a Proof decision carries to Pickups, the rail and Production', () => {
  it('Needs pickup adds a Proof note line everywhere and taking it back removes it', async () => {
    window.history.replaceState(null, '', '/proof?chapter=chapter-1');
    const api = createMockApi();
    render(
      <ThemeProvider>
        <ApiProvider api={api}>
          <CommandRouter>
            <App />
          </CommandRouter>
        </ApiProvider>
      </ThemeProvider>,
    );
    const user = userEvent.setup();
    const notes = await screen.findByRole('region', { name: 'Notes' });
    await waitFor(() => expect(notes.querySelectorAll('tr[data-row]').length).toBeGreaterThan(0));
    const row = [...notes.querySelectorAll<HTMLElement>('tr[data-row]')].find(
      (candidate) => candidate.textContent?.includes('misread') && candidate.textContent?.includes('To review'),
    );
    if (!row) throw new Error('the chapter has no note to review');
    await user.click(row);
    const before = (await api.pickupsList()).pickups.length;
    press('p', 'KeyP');
    await waitFor(async () => expect((await api.pickupsList()).pickups).toHaveLength(before + 1));

    // The rail reads the list again as the narrator leaves the page.
    await user.click(await rail(/^Pickups/));
    expect(await rail(new RegExp(`^Pickups, ${before + 1}$`))).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 1, name: 'Pickups' })).toBeTruthy();
    expect(within(await screen.findByRole('main')).getAllByText('Proof note').length).toBeGreaterThan(0);

    await user.click(await rail(/^Proof/));
    // The header has no Undo button now; Ctrl+Z is the same command (the jump menu lists it too).
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true });
    await waitFor(async () => expect((await api.pickupsList()).pickups).toHaveLength(before));
    await user.click(await rail(/^Pickups/));
    expect(await rail(new RegExp(`^Pickups, ${before}$`))).toBeTruthy();
  });
});
