// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.motion;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('DemoBanner', () => {
  it('renders nothing when VITE_DEMO is unset, so it never appears in a mock-build capture', async () => {
    vi.stubEnv('VITE_DEMO', undefined);
    const { DemoBanner } = await import('./DemoBanner');
    const { container } = render(<DemoBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the demo notice and a link to the source when VITE_DEMO=1', async () => {
    vi.stubEnv('VITE_DEMO', '1');
    const { DemoBanner } = await import('./DemoBanner');
    render(<DemoBanner />);
    expect(screen.getByText(/nothing you do here is saved/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /view source/i });
    expect(link.getAttribute('href')).toBe('https://github.com/countrymanprime/narration-utils');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('links the landing page and the Storybook beside the demo only in the public site build', async () => {
    vi.stubEnv('VITE_DEMO', '1');
    vi.stubEnv('VITE_SITE', '1');
    const { DemoBanner } = await import('./DemoBanner');
    render(<DemoBanner />);
    expect(screen.getByRole('link', { name: 'Site' }).getAttribute('href')).toBe('../index.html');
    expect(screen.getByRole('link', { name: 'Storybook' }).getAttribute('href')).toBe('../storybook/index.html');
    expect(screen.getByText(/at least 860 px wide/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'How to use this page' }).getAttribute('href')).toBe('../guides/production.html');
  });

  it('points How to use this page at the guide of the route on screen', async () => {
    vi.stubEnv('VITE_DEMO', '1');
    vi.stubEnv('VITE_SITE', '1');
    const { DemoBanner } = await import('./DemoBanner');
    const { MemoryRouter } = await import('react-router-dom');
    render(
      <MemoryRouter initialEntries={['/pickups']}>
        <DemoBanner />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'How to use this page' }).getAttribute('href')).toBe('../guides/pickups.html');
  });

  it('has no site links in the Pages demo build', async () => {
    vi.stubEnv('VITE_DEMO', '1');
    vi.stubEnv('VITE_SITE', undefined);
    const { DemoBanner } = await import('./DemoBanner');
    render(<DemoBanner />);
    expect(screen.queryByRole('link', { name: 'Storybook' })).toBeNull();
  });

  it('has a Play animations switch, off by default, that plays motion and is remembered', async () => {
    vi.stubEnv('VITE_DEMO', '1');
    const { DemoBanner } = await import('./DemoBanner');
    render(<DemoBanner />);
    const toggle = screen.getByRole('switch', { name: 'Play animations' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset.motion).toBe('play');
    expect(localStorage.getItem('narration-ui-demo-play-motion')).toBe('1');
    cleanup();
    render(<DemoBanner />);
    expect(screen.getByRole('switch', { name: 'Play animations' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Play animations' }));
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('draws nothing inside the site window, where the page around the frame says all of it', async () => {
    vi.stubEnv('VITE_DEMO', '1');
    vi.stubEnv('VITE_SITE', '1');
    window.history.replaceState(null, '', '/?embed=1');
    const { DemoBanner } = await import('./DemoBanner');
    const { container } = render(<DemoBanner />);
    expect(container.firstChild).toBeNull();
    window.history.replaceState(null, '', '/');
  });

  it("draws the toolbar's item in its row, and counts itself in while it is on screen", async () => {
    vi.stubEnv('VITE_DEMO', '1');
    vi.stubEnv('VITE_SITE', '1');
    const { DemoBanner } = await import('./DemoBanner');
    const { demoToolbarSlots, setDemoToolbarItem } = await import('./demoToolbar');
    setDemoToolbarItem(() => <button type="button">Simulated DAW · REAPER</button>);
    const { unmount } = render(<DemoBanner />);
    expect(screen.getByRole('note').contains(screen.getByRole('button', { name: 'Simulated DAW · REAPER' }))).toBe(true);
    expect(demoToolbarSlots.count()).toBe(1);
    unmount();
    expect(demoToolbarSlots.count()).toBe(0);
  });
});
