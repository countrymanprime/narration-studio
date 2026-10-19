// The public site's demo page draws the app inside a window frame: an `<iframe sandbox="allow-scripts">` of the one-file demo with `?embed=1`
// (scripts/site/windowPages.mjs). The frame has an opaque origin, so it shares no storage with the page around it; the two talk by postMessage
// instead. The page sends the site's theme, the Play animations switch, a route to open and the Simulated DAW panel's open state; the app sends
// its route and what the Simulated DAW badge would say, which the page shows in the window's title bar so nothing floats over the app.
// Only the site build (`VITE_SITE=1`) reads any of this, and only a message from the frame's own parent is read.
import { setPlayAnimations } from '../../motion';
import { guideForPath } from './demoGuide';

export const SITE_CHANNEL = 'narration-site';

export type SiteTheme = 'light' | 'dark';

/** What the page around the frame tells the app. */
export type FromSite =
  | { channel: typeof SITE_CHANNEL; kind: 'theme'; theme: SiteTheme }
  | { channel: typeof SITE_CHANNEL; kind: 'motion'; play: boolean }
  | { channel: typeof SITE_CHANNEL; kind: 'navigate'; path: string }
  | { channel: typeof SITE_CHANNEL; kind: 'daw-panel'; open: boolean };

/** What the app tells the page: the route on screen, and the Simulated DAW's badge. */
export type FromApp =
  | { channel: typeof SITE_CHANNEL; kind: 'route'; path: string; guide: string }
  | { channel: typeof SITE_CHANNEL; kind: 'daw'; daw: string; answering: boolean; recording: boolean; open: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A message from the page, or null for anything else (another sender's message, a wrong shape). */
export function readFromSite(data: unknown): FromSite | null {
  if (!isRecord(data) || data.channel !== SITE_CHANNEL) return null;
  if (data.kind === 'theme' && (data.theme === 'light' || data.theme === 'dark')) return { channel: SITE_CHANNEL, kind: 'theme', theme: data.theme };
  if (data.kind === 'motion' && typeof data.play === 'boolean') return { channel: SITE_CHANNEL, kind: 'motion', play: data.play };
  // A route is a path inside the app's hash router, never an address: anything else could send the frame somewhere.
  if (data.kind === 'navigate' && typeof data.path === 'string' && /^\/[\w\-/]*$/.test(data.path))
    return { channel: SITE_CHANNEL, kind: 'navigate', path: data.path };
  if (data.kind === 'daw-panel' && typeof data.open === 'boolean') return { channel: SITE_CHANNEL, kind: 'daw-panel', open: data.open };
  return null;
}

/** Whether this page is the app inside the demo page's window: the site build, opened with `?embed=1`. Read per call so a test can stub both. */
export function inSiteWindow(): boolean {
  return import.meta.env.VITE_SITE === '1' && new URLSearchParams(window.location.search).get('embed') === '1';
}

/** The site's theme as the page handed it over in the frame's address (`?siteTheme=`), so the first paint already matches the page. */
export function handedTheme(): SiteTheme | null {
  if (!inSiteWindow()) return null;
  const theme = new URLSearchParams(window.location.search).get('siteTheme');
  return theme === 'light' || theme === 'dark' ? theme : null;
}

/** Whether the page's Play animations switch was on when it opened the frame (`?motion=play`). */
export function handedPlay(): boolean {
  return inSiteWindow() && new URLSearchParams(window.location.search).get('motion') === 'play';
}

/** Tells the page something. The page's origin is not known to a sandboxed frame, and nothing sent here is private, so any target is allowed. */
export function tellSite(message: FromApp): void {
  if (window.parent === window) return;
  window.parent.postMessage(message, '*');
}

type Listener = (message: FromSite) => void;
const listeners = new Set<Listener>();
let listening = false;

/** Calls `listener` with each message the page sends; returns the unsubscribe. */
export function onSiteMessage(listener: Listener): () => void {
  listeners.add(listener);
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent || window.parent === window) return;
      const message = readFromSite(event.data);
      if (message) listeners.forEach((notify) => notify(message));
    });
  }
  return () => listeners.delete(listener);
}

/** The route the hash router shows: `#/proof/ch-3` is `/proof/ch-3`. */
export function routeOf(hash: string): string {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  return path.startsWith('/') ? path : `/${path}`;
}

/** Starts the app's side of the window: reports each route to the page, and opens a route or switches Play animations when the page asks. */
export function startSiteWindow(): void {
  if (handedPlay()) setPlayAnimations(true);
  const report = () => {
    const path = routeOf(window.location.hash);
    tellSite({ channel: SITE_CHANNEL, kind: 'route', path, guide: guideForPath(path) });
  };
  // The hash router moves with history.pushState, which fires no event, so the two history calls report the route after they run.
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      report();
    };
  }
  // The page around the frame never sees the pointer over it, and a key pressed with focus on that page goes to the page, not the app. So
  // the app takes focus when the pointer enters it, and the shortcuts it documents work without a click first.
  document.addEventListener('pointerover', () => {
    if (!document.hasFocus()) window.focus();
  });
  window.addEventListener('hashchange', report);
  window.addEventListener('popstate', report);
  report();
  onSiteMessage((message) => {
    if (message.kind === 'navigate' && routeOf(window.location.hash) !== message.path) window.location.hash = `#${message.path}`;
    if (message.kind === 'motion') setPlayAnimations(message.play);
  });
}
