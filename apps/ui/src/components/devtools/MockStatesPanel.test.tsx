// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockStatesPanel } from './MockStatesPanel';

// `boot` mounts the whole app through main.tsx, which never unmounts its root. Left mounted, its pending renders run after
// the file's jsdom is torn down ("window is not defined"), so every root made here is unmounted after each test.
const roots = vi.hoisted(() => [] as { unmount(): void }[]);
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args);
      roots.push(root);
      return root;
    },
  };
});

beforeEach(() => window.history.replaceState(null, '', '/?mockPanel=1&mockZoom=125'));
afterEach(() => {
  cleanup();
  act(() => roots.splice(0).forEach((root) => root.unmount()));
});

describe('choosing-writes-the-parameter-and-reloads', () => {
  it('rewrites the URL, keeps the others, and reloads', async () => {
    const reload = vi.fn();
    const user = userEvent.setup();
    render(<MockStatesPanel reload={reload} />);
    await user.click(screen.getByRole('button', { name: 'Mock states' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mock states' });
    expect(dialog.textContent).toContain('This panel forces states and is not part of the app');
    await user.click(screen.getByRole('radio', { name: '40 chapters' }));
    expect(window.location.search).toBe('?mockPanel=1&mockZoom=125&mockChapters=40');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: '40 chapters' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: '125%' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('checkbox', { name: 'No input devices' }));
    expect(window.location.search).toContain('mockNoDevices=1');
  });
});

describe('panel-is-keyboard-reachable', () => {
  it('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<MockStatesPanel reload={() => undefined} />);
    const opener = screen.getByRole('button', { name: 'Mock states' });
    await user.click(opener);
    await screen.findByRole('dialog', { name: 'Mock states' });
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});

describe('invisible-by-default', () => {
  async function boot(search: string) {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCK_API', '1');
    window.history.replaceState(null, '', `/${search}`);
    document.body.innerHTML = '<div id="root"></div>';
    await import('../../main');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  it('adds nothing without ?mockPanel=1', async () => {
    await boot('');
    expect([...document.body.children].map((el) => el.id)).toEqual(['root']);
  });

  it('adds a "Mock states" button with ?mockPanel=1', async () => {
    await boot('?mockPanel=1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mock states' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Mock states' }).parentElement?.className).toContain('fixed');
  });
});
