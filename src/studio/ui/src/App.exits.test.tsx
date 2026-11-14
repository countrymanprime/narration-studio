// @vitest-environment jsdom
// The shared unsaved-drafts mechanism proves its exits without any screen: the Script page is replaced by a probe that registers one dirty draft, and every way out of a
// page the shell has asks the same question, once per exit on a fresh mount (a question makes the nav and Back inert, so one mounted app cannot take them in turn) (#3400).
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { CommandRouter } from './input/router';
import { overlay } from './overlay/overlayService';
import { ThemeProvider } from './theme/ThemeContext';
import { useUnsavedDraft } from './studio/drafts/unsavedDrafts';

const probe = vi.hoisted(() => ({ saves: vi.fn() }));
vi.mock('./components/script/page/ScriptPage', () => ({
  ScriptPage: function ProbePage() {
    const [dirty, setDirty] = useState(true);
    useUnsavedDraft('probe-draft', {
      dirty,
      label: 'a probe note',
      save: async () => {
        probe.saves();
        setDirty(false);
        return true;
      },
      discard: () => setDirty(false),
    });
    return <h1>Probe page</h1>;
  },
}));

configure({ asyncUtilTimeout: 12_000 });
beforeEach(() => {
  probe.saves.mockClear();
  window.history.replaceState(null, '', '/');
  document.title = '';
  for (const toast of overlay.getSnapshot().toasts) overlay.dismissToast(toast.id);
});
afterEach(cleanup);

const mount = async () => {
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Script' })[0]!);
  await screen.findByRole('heading', { name: 'Probe page' });
  await waitFor(() => expect(window.location.pathname).toBe('/script'));
};
const runFromJump = async (label: string) => {
  fireEvent.click(screen.getByRole('button', { name: /^Jump to or run…/ }));
  fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: `> ${label}` } });
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^${label}`) }));
};
const question = () => screen.findByRole('alertdialog', { name: 'Unsaved changes' });

const exits: Record<string, { go: () => unknown; left: () => void }> = {
  'the nav': {
    go: () => fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]!),
    left: () => expect(window.location.pathname).toBe('/'),
  },
  'a jump menu Go to row': { go: () => runFromJump('Go to Production'), left: () => expect(window.location.pathname).toBe('/') },
  'the jump menu Back': { go: () => runFromJump('Back'), left: () => expect(window.location.pathname).toBe('/') },
  'Alt+Left': {
    go: () => fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }),
    left: () => expect(window.location.pathname).toBe('/'),
  },
  'the mouse back button': { go: () => fireEvent.mouseUp(document, { button: 3 }), left: () => expect(window.location.pathname).toBe('/') },
  'a browser Back': { go: () => act(() => window.history.back()), left: () => expect(window.location.pathname).toBe('/') },
  'Switch project from the header': {
    go: () => fireEvent.click(within(screen.getAllByRole('banner')[0]!).getByRole('button', { name: /, switch project$/ })),
    left: () => expect(screen.getByRole('heading', { name: 'Choose your project' })).toBeTruthy(),
  },
};

describe('every exit of a page that holds a draft asks (#3400)', () => {
  for (const [name, exit] of Object.entries(exits)) {
    it(`${name}: Cancel keeps the page and the draft, and Save & continue saves it, then leaves`, async () => {
      await mount();
      await exit.go();
      fireEvent.click(within(await question()).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      await waitFor(() => expect(window.location.pathname).toBe('/script'));
      expect(screen.getByRole('heading', { name: 'Probe page' })).toBeTruthy();
      expect(probe.saves).not.toHaveBeenCalled();
      await exit.go();
      fireEvent.click(within(await question()).getByRole('button', { name: 'Save & continue' }));
      await waitFor(() => exit.left());
      expect(probe.saves).toHaveBeenCalledTimes(1);
    });

    it(`${name}: Discard & continue leaves and saves nothing`, async () => {
      await mount();
      await exit.go();
      fireEvent.click(within(await question()).getByRole('button', { name: 'Discard & continue' }));
      await waitFor(() => exit.left());
      expect(probe.saves).not.toHaveBeenCalled();
    });
  }
});
