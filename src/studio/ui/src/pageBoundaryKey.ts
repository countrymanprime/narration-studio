/**
 * The key of the boundary around the routed page. It changes with the page and with the project, so React remounts the page when either changes: what a page holds in its
 * own state for the project that was open (a dialog whose confirm would act on that project's chapter, a draft) does not carry into the next project (#4057).
 */
export function pageBoundaryKey(projectFolder: string, pathname: string): string {
  return JSON.stringify([projectFolder, pathname.split('/')[1] || 'production']);
}
