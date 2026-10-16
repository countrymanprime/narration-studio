# Page-owner hand-off checklist

For a page owner whose page sends the narrator to another page, or receives them. The seams are listed in [Cross-page hand-offs](../reference/cross-page-handoffs.md).

Before the page's PR is ready:

1. **Add a row** to the seam table in that reference: source control, destination, how it travels, what it carries, what the destination does with a stale, missing or malformed address, and the test that covers each side. A row with no test says **none**.
2. **Use the typed address module** (`apps/ui/src/navigation/`) to build and read every address. Do not write `/booth?...`, `/script#...` or `/editing/...` strings in a page.
3. **Show a bad address.** A stale id, an unknown chapter or a malformed address shows a message and a way out. It never renders nothing and never lands on a different place without saying so.
4. **Add one row to the cross-page matrix test** (`apps/ui/src/crossPage.matrix.test.tsx`) for each new seam, including the failure rows (stale, missing, malformed, DAW not running, project closed). A seam only a browser shows (history, reload, a key) also gets a test in `apps/ui/tests/visual/crossPage.spec.ts`. A seam you cannot drive goes in `NOT_DRIVEN` in the matrix file with the reason.
5. **Say when state changed elsewhere.** If your page changes something another page shows, call the store's `publish(topic)` (`studio/slots.ts` lists the topics) rather than patching the other page. If your page shows a chapter list, read the `chapters` slot instead of calling `manuscriptChapters()` yourself.
6. In the PR body, list the rows you added under "Exercised" and any you could not drive under "Not exercised".
