// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FromSite } from '../components/layout/siteWindow';
import { ThemeProvider, useTheme } from './ThemeContext';
import { THEME_STORAGE_KEY } from './theme';

// The public site's window frame hands the app the site's theme in the frame's address and sends the page's theme switch as messages
// (components/layout/siteWindow.ts). siteWindow's own tests cover reading a message; these cover what the provider does with them.
const site = vi.hoisted(() => ({ handed: null as 'light' | 'dark' | null, listeners: new Set<(message: FromSite) => void>() }));

vi.mock('../components/layout/siteWindow', () => ({
  handedTheme: () => site.handed,
  onSiteMessage: (listener: (message: FromSite) => void) => {
    site.listeners.add(listener);
    return () => site.listeners.delete(listener);
  },
}));

const send = (message: FromSite) => act(() => site.listeners.forEach((listener) => listener(message)));
const CHANNEL = 'narration-site' as const;

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
  site.handed = null;
  site.listeners.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('ThemeProvider in the site window', () => {
  it('opens in the theme the page handed over, over the stored preference', () => {
    vi.stubEnv('VITE_SITE', '1');
    site.handed = 'dark';
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderProvider();
    expect(screen.getByTestId('preference').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it("follows the page's theme switch, and the app's own setting still works after it", async () => {
    vi.stubEnv('VITE_SITE', '1');
    site.handed = 'light';
    const user = userEvent.setup();
    renderProvider();
    send({ channel: CHANNEL, kind: 'theme', theme: 'dark' });
    expect(screen.getByTestId('preference').textContent).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'light' }));
    expect(screen.getByTestId('preference').textContent).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('ignores a message that is not a theme, and stops listening when the provider goes', () => {
    vi.stubEnv('VITE_SITE', '1');
    site.handed = 'light';
    const { unmount } = renderProvider();
    send({ channel: CHANNEL, kind: 'motion', play: true });
    expect(screen.getByTestId('preference').textContent).toBe('light');
    expect(site.listeners.size).toBe(1);
    unmount();
    expect(site.listeners.size).toBe(0);
  });

  it('does not listen outside the site build, or in the site build without a handed theme', () => {
    site.handed = 'dark';
    const outside = renderProvider();
    expect(site.listeners.size).toBe(0);
    outside.unmount();

    vi.stubEnv('VITE_SITE', '1');
    site.handed = null;
    renderProvider();
    expect(site.listeners.size).toBe(0);
  });
});
