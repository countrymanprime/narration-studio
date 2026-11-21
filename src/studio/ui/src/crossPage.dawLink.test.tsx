// @vitest-environment jsdom
// #2823: the project file is linked from the DAW connection dialog of any page, and every other page follows without a reload, the Booth
// included (it used to keep its own copy of the bootstrap's link flag).
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { DAW_SETUPS } from './fixtures/daw';
import { DAW_CONNECT_GRACE_MS } from './components/connection/useDawConnecting';
import { CommandRouter } from './input/router';
import { ThemeProvider } from './theme/ThemeContext';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('linking the project file from one page', () => {
  it("Proof's dialog links it, and the Booth reads the new link with no reload", async () => {
    window.history.replaceState(null, '', '/proof?chapter=chapter-1');
    // The mock's choice follows its own (answering) DAW, so the off DAW's choice is stated here from the link the host holds.
    const choiceOf = async () => {
      const linked = (await api.bootstrap()).dawFileLinked;
      return {
        hasProject: true,
        daw: 'REAPER',
        state: linked ? 'not_running' : 'not_linked',
        linkedFile: linked ? 'Alice.rpp' : null,
        foundFiles: ['Alice.rpp'],
        options: [],
      } as never;
    };
    const api: ReturnType<typeof createMockApi> = createMockApi(
      { dawCapabilities: async () => DAW_SETUPS['reaper-off'], subscribeDawCapabilities: () => () => undefined, dawChoice: choiceOf },
      { dawFileLinked: false, dawChoice: { linkedFile: null, foundFiles: ['Alice.rpp'] } },
    );
    render(
      <ThemeProvider>
        <ApiProvider api={api}>
          <CommandRouter>
            <App />
          </CommandRouter>
        </ApiProvider>
      </ThemeProvider>,
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    expect((await api.bootstrap()).dawFileLinked).toBe(false);
    // A DAW that is off is "connecting" for its grace; the chip says "not connected" once that has passed.
    await screen.findByRole('button', { name: /Connecting to REAPER/, hidden: true });
    await act(() => vi.advanceTimersByTimeAsync(DAW_CONNECT_GRACE_MS));
    await user.click(await screen.findByRole('button', { name: /REAPER not connected/, hidden: true }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'Link project file…' }));
    await waitFor(async () => expect((await api.bootstrap()).dawFileLinked).toBe(true));
    // The dialog's link button goes away once the link is there: the page followed without a reload.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Link project file…', hidden: true })).toBeNull());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await within(await screen.findByRole('navigation', { name: 'Primary navigation' })).findByRole('button', { name: /^Booth|^Record/ }));
    await screen.findByRole('heading', { level: 1, name: /Booth|Record/ });
    expect(screen.queryByText(/No REAPER project file is linked/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link project file…', hidden: true })).toBeNull();
  });
});
