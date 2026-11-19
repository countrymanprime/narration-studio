// The rail's pages by name and path, for a sentence that names where a move goes ("Leaving the Booth for Script ..."). AppShell's rail draws the same pages with their
// icons; `AppShell.test.tsx` holds this list to the rail's own (`shellPages`), so a renamed or added page cannot leave a sentence naming the old one.
export const RAIL_PAGES: { name: string; path: string }[] = [
  { name: 'Production', path: '/' },
  { name: 'Schedule', path: '/schedule' },
  { name: 'Script', path: '/script' },
  { name: 'Story Bible', path: '/story-bible' },
  { name: 'Booth', path: '/booth' },
  { name: 'Editing', path: '/editing' },
  { name: 'Proof', path: '/proof' },
  { name: 'Pickups', path: '/pickups' },
  { name: 'Master & QC', path: '/master' },
  { name: 'Delivery', path: '/delivery' },
  { name: 'Settings', path: '/settings' },
];

export const isActivePath = (pathname: string, path: string) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`));

/** The rail's name for the page `to` is on (`/editing/chapter-2?x=1` is Editing), or undefined for a path no rail item owns. */
export const pageNameFor = (to: string): string | undefined => {
  // A move by history steps (Back, Forward) does not know its page: '' names none, where '/' would name Production (#3555 item 3).
  if (to === '') return undefined;
  const pathname = to.split(/[?#]/)[0] || '/';
  return RAIL_PAGES.find((page) => isActivePath(pathname, page.path))?.name;
};
