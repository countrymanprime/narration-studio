# Page-owner hand-off checklist

For a page owner whose page sends the narrator to another page, or receives them. The seams are listed in [Cross-page hand-offs](../reference/cross-page-handoffs.md).

Before the page's PR is ready:

1. **Add a row** to the seam table in that reference: source control, destination, how it travels, what it carries, what the destination does with a stale, missing or malformed address, and the test that covers each side. A row with no test says **none**.
2. **Use the typed address module** (`apps/ui/src/navigation/`) to build and read every address. Do not write `/booth?...`, `/script#...` or `/editing/...` strings in a page.
3. **Show a bad address.** A stale id, an unknown chapter or a malformed address shows a message and a way out. It never renders nothing and never lands on a different place without saying so.
4. **Add one row to the cross-page matrix test** for each new seam, including the failure rows (stale, missing, malformed, DAW not running, project closed).
5. **Say when state changed elsewhere.** If another page can change what yours shows, use the shared invalidation mechanism rather than a patch inside your page.
6. In the PR body, list the rows you added under "Exercised" and any you could not drive under "Not exercised".
