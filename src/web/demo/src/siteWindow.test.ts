// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  delete document.documentElement.dataset.motion;
});

describe('the site window protocol', () => {
  it('reads only well-formed messages from the page, and never a route that is an address', async () => {
    const { readFromSite } = await import('./siteWindow');
    const channel = 'narration-site';
    expect(readFromSite({ channel, kind: 'theme', theme: 'dark' })).toEqual({ channel, kind: 'theme', theme: 'dark' });
    expect(readFromSite({ channel, kind: 'motion', play: true })).toEqual({ channel, kind: 'motion', play: true });
    expect(readFromSite({ channel, kind: 'daw-panel', open: false })).toEqual({ channel, kind: 'daw-panel', open: false });
    expect(readFromSite({ channel, kind: 'navigate', path: '/proof/ch-3' })).toEqual({ channel, kind: 'navigate', path: '/proof/ch-3' });
    for (const bad of [
      null,
      'theme',
      { kind: 'theme', theme: 'dark' },
      { channel: 'other', kind: 'theme', theme: 'dark' },
      { channel, kind: 'theme', theme: 'blue' },
      { channel, kind: 'motion', play: 'yes' },
      { channel, kind: 'navigate', path: 'https://example.com/' },
      { channel, kind: 'navigate', path: '//example.com' },
      { channel, kind: 'navigate', path: '/proof?x=<b>' },
      { channel, kind: 'unknown' },
    ])
      expect(readFromSite(bad)).toBeNull();
  });

  it('is the site window only in the site build opened with ?embed=1, and only then reads the handed theme and motion', async () => {
    window.history.replaceState(null, '', '/?embed=1&siteTheme=dark&motion=play');
    vi.stubEnv('VITE_SITE', undefined);
    let module = await import('./siteWindow');
    expect([module.inSiteWindow(), module.handedTheme(), module.handedPlay()]).toEqual([false, null, false]);
    vi.resetModules();
    vi.stubEnv('VITE_SITE', '1');
    module = await import('./siteWindow');
    expect([module.inSiteWindow(), module.handedTheme(), module.handedPlay()]).toEqual([true, 'dark', true]);
    window.history.replaceState(null, '', '/?siteTheme=dark');
    expect([module.inSiteWindow(), module.handedTheme()]).toEqual([false, null]);
  });

  it('reports each route to the page, including a move the router makes with pushState, with the guide that explains it', async () => {
    vi.stubEnv('VITE_SITE', '1');
    window.history.replaceState(null, '', '/?embed=1#/proof');
    const parent = { postMessage: vi.fn() };
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window);
    const { startSiteWindow } = await import('./siteWindow');
    startSiteWindow();
    window.history.pushState(null, '', '/?embed=1#/master/ch-2');
    expect(parent.postMessage.mock.calls.map(([message]) => message)).toEqual([
      { channel: 'narration-site', kind: 'route', path: '/proof', guide: 'proof' },
      { channel: 'narration-site', kind: 'route', path: '/master/ch-2', guide: 'master-and-qc' },
    ]);
  });

  it("opens a route and switches Play animations when the page asks, and ignores another window's message", async () => {
    vi.stubEnv('VITE_SITE', '1');
    window.history.replaceState(null, '', '/?embed=1#/proof');
    const parent = { postMessage: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent);
    (await import('@ui/appExtension')).registerAppExtension({ playAnimations: true });
    const { startSiteWindow } = await import('./siteWindow');
    startSiteWindow();
    const send = (data: unknown, source: unknown = parent) => window.dispatchEvent(new MessageEvent('message', { data, source: source as Window }));

    send({ channel: 'narration-site', kind: 'navigate', path: '/pickups' }, window);
    expect(window.location.hash).toBe('#/proof');
    send({ channel: 'narration-site', kind: 'navigate', path: '/pickups' });
    expect(window.location.hash).toBe('#/pickups');
    send({ channel: 'narration-site', kind: 'motion', play: true });
    expect(document.documentElement.dataset.motion).toBe('play');
    send({ channel: 'narration-site', kind: 'motion', play: false });
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('turns the route of a hash into a path', async () => {
    const { routeOf } = await import('./siteWindow');
    expect(['', '#', '#/', '#/proof', '#/proof/ch-3?x=1', 'proof'].map(routeOf)).toEqual(['/', '/', '/', '/proof', '/proof/ch-3', '/proof']);
  });
});
