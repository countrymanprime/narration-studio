// @vitest-environment jsdom
// Every dirty Settings source against every in-page move that would unmount the panel under it asks first, and Cancel keeps what was typed (#3400, #3456).
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { CommandRouter } from './input/router';
import { overlay } from './overlay/overlayService';
import { ThemeProvider } from './theme/ThemeContext';

configure({ asyncUtilTimeout: 12_000 });
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.title = '';
  for (const toast of overlay.getSnapshot().toasts) overlay.dismissToast(toast.id);
});
afterEach(cleanup);

const categories = () => screen.getByRole('navigation', { name: 'Settings categories' });
const openSettings = async () => {
  render(
    <ThemeProvider>
      <ApiProvider api={createMockApi()}>
        <CommandRouter>
          <App />
        </CommandRouter>
      </ApiProvider>
    </ThemeProvider>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Production' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
  await screen.findByRole('navigation', { name: 'Settings categories' });
};
const category = (name: RegExp) => fireEvent.click(within(categories()).getByRole('button', { name }));

type Source = { name: string; hold: () => Promise<void>; kept: () => HTMLElement; expected: string };
const sources: Source[] = [
  {
    name: 'a page-setting edit under Set on a page',
    hold: async () => {
      category(/^Set on a page/);
      const entry = await waitFor(() => {
        const found = document.querySelector<HTMLElement>('[data-page-setting="ps.coverage"]');
        if (!found) throw new Error('not drawn');
        return found;
      });
      fireEvent.click(within(entry).getByRole('button', { name: /Change it here for now/ }));
      const panel = await within(entry).findByRole('region', { name: 'Recording check' });
      fireEvent.change(await within(panel).findByRole('textbox', { name: 'Longest run of missing words allowed' }), { target: { value: '7' } });
    },
    kept: () => screen.getByRole('textbox', { name: 'Longest run of missing words allowed' }),
    expected: '7',
  },
  {
    name: 'a pasted Merriam-Webster key',
    hold: async () => {
      category(/^Voice & pronunciation/);
      fireEvent.click(await screen.findByRole('button', { name: /Advanced/ }));
      fireEvent.change(await screen.findByLabelText('Merriam-Webster key'), { target: { value: 'pasted-key-123' } });
    },
    kept: () => screen.getByLabelText('Merriam-Webster key'),
    expected: 'pasted-key-123',
  },
];

const moves: Record<string, () => void> = {
  'another category': () => category(/^Appearance/),
  'the search': () => fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'abc' } }),
  'the Changed filter': () => fireEvent.click(screen.getByRole('button', { name: 'Changed' })),
};

describe('a dirty Settings source against every in-page move (#3456)', () => {
  for (const source of sources) {
    for (const [moveName, move] of Object.entries(moves)) {
      it(`${moveName} over ${source.name} asks, and Cancel keeps it`, async () => {
        await openSettings();
        await source.hold();
        move();
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect((source.kept() as HTMLInputElement).value).toBe(source.expected);
      });
    }
  }
});
