import { overlayGuardFor } from './helpers/overlayGuardFor';
import { GUARDED_PAGES, SHELL_CHROME_PAGES, shellChromeCases, shellPageCases } from './overlays/pages';

// The overlay guard (definition of done, rule 1): every overlay of a page is the topmost element at its own points and fully on
// screen, opened at every window edge and corner, beside the sidebar and the top bar, over scrolled content, at narrow sizes and
// while another overlay is open (helpers/overlayGuard.ts measures it, helpers/overlayGuardFor.ts registers the tests).
//
// A page with the sidebar adopts it by being listed in overlays/pages.ts: it runs the overlays the shell draws over the page's own
// content (the context menu, the rail) and the page's own list (overlays/<page>.ts). The overlays the shell draws in the top bar run
// on SHELL_CHROME_PAGES only (overlays/shell.ts says why that is the same code path on every page).
for (const [page, own] of Object.entries(GUARDED_PAGES) as Array<[keyof typeof GUARDED_PAGES, (typeof GUARDED_PAGES)[keyof typeof GUARDED_PAGES]]>) {
  overlayGuardFor(page, shellPageCases, SHELL_CHROME_PAGES.includes(page) ? shellChromeCases : [], own);
}
