// @vitest-environment jsdom
// Global Settings before a project is open (issue 3024): the picker has a Settings button, the jump menu's Settings rows and Ctrl+, open the
// same page, Back and the Settings close return to the picker, and downloads and the update check run with no project.
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { CommandRouter } from './input/router';
import { overlay } from './overlay/overlayService';
import { ThemeProvider } from './theme/ThemeContext';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.title = '';
  for (const toast of overlay.getSnapshot().toasts) overlay.dismissToast(toast.id);
});
afterEach(cleanup);
configure({ asyncUtilTimeout: 12_000 });

function renderApp(initial: Parameters<typeof createMockApi>[1] = {}) {
  return mount({ projectFolder: '', ...initial });
}

function mount(initial: Parameters<typeof createMockApi>[1]) {
  const api = createMockApi({}, initial);
  render(
    <ThemeProvider>
      <ApiProvider api={api}>
        <CommandRouter>
          <App />
        </CommandRouter>
      </ApiProvider>
    </ThemeProvider>,
  );
  return api;
}

const picker = () => screen.findByRole('heading', { level: 1, name: 'Choose your project' });
const settingsHeading = () => screen.findByRole('heading', { level: 1, name: 'Settings' });

describe('Settings from the project picker', () => {
  it('the picker has a Settings icon button that opens Settings, and Back returns to the picker', async () => {
    renderApp();
    await picker();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await settingsHeading();
    expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
    // The shell is not there: no project, no navigation rail.
    expect(screen.queryByRole('navigation', { name: /^(Main|Pages)/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to project picker' }));
    await picker();
    expect(window.location.pathname).toBe('/');
  });

  it("shows the picker's Settings button only where there is no project: over an open project the picker has Back", async () => {
    mount({});
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.click(within(screen.getAllByRole('banner')[0]!).getByRole('button', { name: /, switch project$/ }));
    await picker();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  });

  it("Ctrl+, and the jump menu's Settings rows open it with no project", async () => {
    renderApp();
    await picker();
    fireEvent.keyDown(document.body, { key: ',', code: 'Comma', ctrlKey: true });
    await settingsHeading();
    fireEvent.click(screen.getByRole('button', { name: 'Back to project picker' }));
    await picker();

    // Ctrl+K at the picker: the Settings categories are rows of the menu, and one opens its category.
    fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: '> Settings: Models' } });
    fireEvent.click(await screen.findByRole('option', { name: /^Settings: Models & downloads/ }));
    await settingsHeading();
    await screen.findByRole('heading', { level: 2, name: 'Models & downloads' });
  });

  it("opens a project from Settings' Back, then the picker, and the project opens as before", async () => {
    renderApp();
    await picker();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await settingsHeading();
    fireEvent.click(screen.getByRole('button', { name: 'Back to project picker' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Voltage and the Undercroft' }));
    await screen.findByRole('heading', { level: 1, name: 'Production' });
  });

  it('downloads a model with no project', async () => {
    const api = renderApp();
    const install = vi.spyOn(api, 'assetsInstall');
    await picker();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await settingsHeading();
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Models & downloads/ }));
    const download = await screen.findAllByRole('button', { name: /^Download /i });
    await userEvent.click(download[0]!);
    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    // The job runs and ends; nothing about a project is refused.
    expect(document.querySelector('[data-toast-region]')?.textContent).toBe('');
  });

  it('checks for an update with no project', async () => {
    const api = renderApp({ update: 'current' });
    const check = vi.spyOn(api, 'updateCheck');
    await picker();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await settingsHeading();
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^App & updates/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Check now' }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
  });
});
