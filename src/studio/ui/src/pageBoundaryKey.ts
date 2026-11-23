/**
 * The key of the boundary around the routed page. It changes with the page and with the project, so React remounts the page when either changes: what a page holds in its
 * own state for the project that was open (a dialog whose confirm would act on that project's chapter, a draft) does not carry into the next project (#4057).
 */
export function pageBoundaryKey(projectFolder: string, pathname: string): string {
  return JSON.stringify([projectFolder, pageOfPath(pathname).slice(1) || 'production']);
}

/**
 * The page's own address: its first path segment, with nothing a project filled in. `/editing/chapter-9` is `/editing`; the query goes with it (the caller
 * drops it). A chapter or a name in an address belongs to the project it was written under, so a project change returns to this (#4059).
 */
export function pageOfPath(pathname: string): string {
  const page = pathname.split('/')[1];
  return page ? `/${page}` : '/';
}

/** An address as the router holds it. */
export type PageAddress = { pathname: string; search: string; hash: string };

/**
 * The address cut back to the page: no chapter, query or anchor of the project it was written under. Settings' anchor (`/settings#credits`) names a category, not
 * project content, so it stays. An address that is already the bare page comes back equal, which is how a caller tells there is nothing to drop (#4059).
 */
export function addressWithoutProject({ pathname, hash }: PageAddress): PageAddress {
  const page = pageOfPath(pathname);
  return { pathname: page, search: '', hash: page === '/settings' ? hash : '' };
}
