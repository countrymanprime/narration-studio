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

const probe = vi.hoisted(() => ({ saves: vi.fn(), hang: false }));
vi.mock('./components/script/page/ScriptPage', () => ({
  ScriptPage: function ProbePage() {
    const [dirty, setDirty] = useState(true);
    useUnsavedDraft('probe-draft', {
      dirty,
      label: 'a probe note',
      save: async () => {
        if (probe.hang) return new Promise<boolean>(() => {});
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
  probe.hang = false;
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
  'Switch project from the jump menu': {
    go: () => runFromJump('Switch project…'),
    left: () => expect(screen.getByRole('heading', { name: 'Choose your project' })).toBeTruthy(),
  },
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

describe('a stop after an entry the router never numbered restores to where the page was (#3446 PB-1)', () => {
  it('a typed fragment, then two steps back, then Cancel: the address is the page again', async () => {
    await mount();
    // A fragment typed by hand pushes an entry with no state; the router never numbered it.
    act(() => {
      window.location.hash = '#a';
    });
    await waitFor(() => expect(window.location.hash).toBe('#a'));
    act(() => window.history.go(-2));
    fireEvent.click(within(await question()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(window.location.pathname).toBe('/script'));
    expect(screen.getByRole('heading', { name: 'Probe page' })).toBeTruthy();
    expect((window.history.state as { idx?: number } | null)?.idx).toBeGreaterThan(0);
  });
});

describe('the message about a slow save goes with the text it speaks of (#3446 PB-2)', () => {
  it('Discard & continue clears "Saving is taking too long"', async () => {
    probe.hang = true;
    await mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'Production' })[0]!);
    const asked = await question();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.click(within(asked).getByRole('button', { name: 'Save & continue' }));
      await act(async () => void vi.advanceTimersByTime(15_001));
    } finally {
      vi.useRealTimers();
    }
    const slow = () => overlay.getSnapshot().toasts.some((toast) => toast.text === 'Saving is taking too long. What you typed is still here.');
    await waitFor(() => expect(slow()).toBe(true));
    fireEvent.click(within(await question()).getByRole('button', { name: 'Discard & continue' }));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(slow()).toBe(false);
  });
});

describe('the key that answered a question does not decide in the box the focus goes back to (#3457 B10b, B13)', () => {
  const press = (target: Element, init: KeyboardEventInit = {}, type: 'keydown' | 'keyup' = 'keydown') => {
    const event = new KeyboardEvent(type, { key: 'Enter', bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const scene = () => {
    document.body.innerHTML = '<div role="alertdialog"><button id="keep">Keep editing</button></div><input id="alias" /><textarea id="note"></textarea>';
    const reached = vi.fn();
    const alias = document.getElementById('alias') as HTMLInputElement;
    alias.onkeydown = reached;
    return { keep: document.getElementById('keep')!, alias, note: document.getElementById('note')!, reached };
  };
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a held Enter that answered the question does nothing in the box it returns to, however long it is held', () => {
    const { keep, alias, reached } = scene();
    press(keep);
    for (let n = 0; n < 5; n++) expect(press(alias, { repeat: true }).defaultPrevented).toBe(true);
    expect(reached).not.toHaveBeenCalled();
    // Released: a held key that starts repeating later is a new press.
    press(alias, {}, 'keyup');
    expect(press(alias, { repeat: true }).defaultPrevented).toBe(false);
  });

  it('a deliberate Enter right after the answer reaches the box', () => {
    const { keep, alias, reached } = scene();
    press(keep);
    press(keep, {}, 'keyup');
    expect(press(alias).defaultPrevented).toBe(false);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('a space typed right after the question is answered reaches the box, and so does a newline in a textarea', () => {
    const { keep, alias, note, reached } = scene();
    press(keep);
    expect(press(alias, { key: ' ' }).defaultPrevented).toBe(false);
    expect(press(alias, { key: 'c' }).defaultPrevented).toBe(false);
    expect(reached).toHaveBeenCalledTimes(2);
    expect(press(note, { repeat: true }).defaultPrevented).toBe(false);
  });
});
