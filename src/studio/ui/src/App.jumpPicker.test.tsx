// @vitest-environment jsdom
// The jump menu over the project picker (issues 3035, 3037): with no project it offers only what works there, and a "Go to" chosen with
// the picker over a project closes the picker so the destination is what the narrator sees.
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { CommandRouter } from './input/router';
import { ThemeProvider } from './theme/ThemeContext';

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(cleanup);
configure({ asyncUtilTimeout: 12_000 });

async function underPicker(path: string) {
  window.history.replaceState(null, '', path);
  mount({});
  await screen.findAllByRole('banner');
  fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
  fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: '> Switch project' } });
  fireEvent.click(await screen.findByRole('option', { name: /^Switch project/ }));
  await picker();
}

function mount(initial: Parameters<typeof createMockApi>[1]) {
  render(
    <ThemeProvider>
      <ApiProvider api={createMockApi({}, initial)}>
        <CommandRouter>
          <App />
        </CommandRouter>
      </ApiProvider>
    </ThemeProvider>,
  );
}

const picker = () => screen.findByRole('heading', { level: 1, name: 'Choose your project' });

async function openJump(term: string) {
  fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
  const box = await screen.findByRole('combobox', { name: 'Jump menu' });
  fireEvent.change(box, { target: { value: term } });
}

describe('jump menu over the project picker', () => {
  it('with no project lists Settings but no project page, chapter or Switch project', async () => {
    mount({ projectFolder: '' });
    await picker();
    await openJump('> Go to');
    await screen.findByRole('option', { name: /^Go to Settings/ });
    // The mock still carries a manuscript with no project open; its chapters are not offered either.
    expect(screen.queryByRole('option', { name: /^Go to Chapter 1/ })).toBeNull();
    for (const name of [/^Go to Booth/, /^Go to Production/, /^Go to Script/, /Switch project/]) expect(screen.queryByRole('option', { name })).toBeNull();
  });

  it('with the picker over a project, Go to Booth closes the picker and opens Booth', async () => {
    mount({});
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: '> Switch project' } });
    fireEvent.click(await screen.findByRole('option', { name: /^Switch project/ }));
    await picker();
    await openJump('> Go to Booth');
    fireEvent.click(await screen.findByRole('option', { name: /^Go to Booth/ }));
    await screen.findByRole('heading', { level: 1, name: /Booth/ });
    expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
  });

  it('with the picker over a project, Ctrl+, opens Settings', async () => {
    mount({});
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: '> Switch project' } });
    fireEvent.click(await screen.findByRole('option', { name: /^Switch project/ }));
    await picker();
    fireEvent.keyDown(document.body, { key: ',', code: 'Comma', ctrlKey: true });
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
  });

  it('with the picker over a project, a Settings category row opens that category', async () => {
    mount({});
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    fireEvent.keyDown(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Jump menu' }), { target: { value: '> Switch project' } });
    fireEvent.click(await screen.findByRole('option', { name: /^Switch project/ }));
    await picker();
    await openJump('> Settings: Models');
    fireEvent.click(await screen.findByRole('option', { name: /^Settings: Models & downloads/ }));
    await screen.findByRole('heading', { level: 2, name: 'Models & downloads' });
  });

  it('over a project, Go to the page under the picker closes the picker', async () => {
    await underPicker('/');
    await openJump('> Go to Production');
    fireEvent.click(await screen.findByRole('option', { name: /^Go to Production/ }));
    await screen.findByRole('heading', { level: 1, name: 'Production' });
    expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull();
  });

  it('over Script, Go to a chapter closes the picker (only the # of the address changes)', async () => {
    await underPicker('/script');
    await openJump('> Go to Chapter 2');
    fireEvent.click((await screen.findAllByRole('option', { name: /Chapter 2/ }))[0]!);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull());
    await screen.findByRole('heading', { level: 1, name: 'Script' });
  });

  it('over Settings, Ctrl+, closes the picker', async () => {
    await underPicker('/settings');
    fireEvent.keyDown(document.body, { key: ',', code: 'Comma', ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Choose your project' })).toBeNull());
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
  });

  it('with no project, choosing a Settings category row opens it', async () => {
    mount({ projectFolder: '' });
    await picker();
    await openJump('> Settings: Models');
    fireEvent.click(await screen.findByRole('option', { name: /^Settings: Models & downloads/ }));
    await screen.findByRole('heading', { level: 2, name: 'Models & downloads' });
  });

  it('with no project, the commands that need one are off with a reason', async () => {
    mount({ projectFolder: '' });
    await picker();
    await openJump('>');
    for (const name of [/^Replace manuscript…/, /^Import manuscript…/, /^Open Companion/]) {
      const row = await screen.findByRole('option', { name });
      expect(row.getAttribute('aria-disabled')).toBe('true');
      expect(row.textContent).toContain('Open a project first');
    }
  });

  it('a Settings category anchor applies when the address changes while Settings is already open', async () => {
    window.history.replaceState(null, '', '/settings#category-models');
    mount({});
    await screen.findByRole('heading', { level: 2, name: 'Models & downloads' });
    act(() => {
      window.history.pushState(null, '', '/settings#category-delivery');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await screen.findByRole('heading', { level: 2, name: /^Delivery/ });
    expect(screen.queryByRole('heading', { level: 2, name: 'Models & downloads' })).toBeNull();
  });
});
