// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAppExtension, resetAppExtension } from '../appExtension';
import { ThemeProvider, useTheme } from './ThemeContext';
import { THEME_STORAGE_KEY } from './theme';

// An embedding page (the public site's window frame) hands the app its theme through the extension's hostTheme and sends its theme switch as events.
// The site's own tests cover reading a message; these cover what the provider does with the host theme.
const host = vi.hoisted(() => ({ handed: null as 'light' | 'dark' | null, listeners: new Set<(theme: 'light' | 'dark') => void>() }));

const send = (theme: 'light' | 'dark') => act(() => host.listeners.forEach((listener) => listener(theme)));
const install = () =>
  registerAppExtension({
    hostTheme: {
      initial: () => host.handed,
      subscribe: (listener) => {
        host.listeners.add(listener);
        return () => host.listeners.delete(listener);
      },
    },
  });

function ThemeProbe() {
  const { preference, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <button onClick={() => setPreference('light')}>light</button>
    </div>
  );
}

const renderProvider = () =>
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  host.handed = null;
  host.listeners.clear();
  resetAppExtension();
  vi.unstubAllGlobals();
});

describe('ThemeProvider with a host theme', () => {
  it('opens in the theme the page handed over, over the stored preference', () => {
    install();
    host.handed = 'dark';
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderProvider();
    expect(screen.getByTestId('preference').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it("follows the page's theme switch, and the app's own setting still works after it", async () => {
    install();
    host.handed = 'light';
    const user = userEvent.setup();
    renderProvider();
    send('dark');
    expect(screen.getByTestId('preference').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'light' }));
    expect(screen.getByTestId('preference').textContent).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('stops listening when the provider goes', () => {
    install();
    host.handed = 'light';
    const { unmount } = renderProvider();
    send('light');
    expect(screen.getByTestId('preference').textContent).toBe('light');
    expect(host.listeners.size).toBe(1);
    unmount();
    expect(host.listeners.size).toBe(0);
  });

  it('does not listen without an extension, or when the host handed no theme', () => {
    host.handed = 'dark';
    const outside = renderProvider();
    expect(host.listeners.size).toBe(0);
    outside.unmount();

    install();
    host.handed = null;
    renderProvider();
    expect(host.listeners.size).toBe(0);
  });
});
