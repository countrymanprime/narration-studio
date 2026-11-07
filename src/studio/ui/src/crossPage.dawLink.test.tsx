// @vitest-environment jsdom
// #2823: the project file is linked from the DAW connection dialog of any page, and every other page follows without a reload, the Booth
// included (it used to keep its own copy of the bootstrap's link flag).
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { DAW_SETUPS } from './fixtures/daw';
import { CommandRouter } from './input/router';
import { ThemeProvider } from './theme/ThemeContext';

configure({ asyncUtilTimeout: 12_000 });
beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(cleanup);

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
    const user = userEvent.setup();
    expect((await api.bootstrap()).dawFileLinked).toBe(false);
    await user.click(await screen.findByRole('button', { name: /REAPER not connected/, hidden: true }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'Link project file…' }));
    await waitFor(async () => expect((await api.bootstrap()).dawFileLinked).toBe(true));
    // The dialog's link button goes away once the link is there: the page followed without a reload.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Link project file…', hidden: true })).toBeNull());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await within(await screen.findByRole('complementary', { name: 'Primary navigation' })).findByRole('button', { name: /^Booth|^Record/ }));
    await screen.findByRole('heading', { level: 1, name: /Booth|Record/ });
    expect(screen.queryByText(/No REAPER project file is linked/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link project file…', hidden: true })).toBeNull();
  });
});
