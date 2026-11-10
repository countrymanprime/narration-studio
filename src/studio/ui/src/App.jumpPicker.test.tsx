// @vitest-environment jsdom
// The jump menu over the project picker (issues 3035, 3037): with no project it offers only what works there, and a "Go to" chosen with
// the picker over a project closes the picker so the destination is what the narrator sees.
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { CommandRouter } from './input/router';
import { ThemeProvider } from './theme/ThemeContext';

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(cleanup);
configure({ asyncUtilTimeout: 12_000 });

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
});
