# Cross-page hand-offs

Every way one page sends the narrator to another, how the destination is addressed, and what the destination does with a bad address. Surveyed 2026-10-16 against `main` at `05f6233`. A page owner adds a row here when a page adds a seam ([checklist](../operations/page-owner-handoff-checklist.md)).

"Coverage" names the test that drives each side. **none** means no test drives it. The typed layer is `apps/ui/src/navigation/` (planned in this change; rows say what it replaces).

## Seams

One owner per seam: the destination page owns reading the address; the source page owns only calling the builder.

| # | Source control | Destination | Travels as | Carries | Destination on a stale, missing or malformed address (today) | Coverage: source / destination |
| - | - | - | - | - | - | - |
| S1 | Script: Record in Booth, Record from here | Booth | route `/booth` + query `?chapter=&para=&at=` or `?credits=` (ADR 0388, `boothQuery.ts`) | chapter id, paragraph id, character offset | Unknown chapter: `useBoothData` finds no chapter, `source` is undefined and `BoothLoaded` renders `null` (a blank page, by reading the code; no test drives it). Non-numeric `at`: 0. Negative `at`: 0. | `ScriptPage.test.tsx` (calls `goToBooth` with the target) / `BoothNextPage.test.tsx` (`?chapter=c1&para=p3&at=28`); unknown chapter: **none** |
| S2 | Production: Start session, row Record | Booth | same as S1 via `goToBooth` in `App.tsx` | chapter id or credits kind (`creditsKindOfId`) | as S1 | `ProductionPage.test.tsx` (`goToBooth` called with `credits-opening`) / as S1 |
| S3 | Proof: note menu "Open this chapter in Booth", chapter row | Booth | same as S1 | chapter id | as S1 | `ProofPage.test.tsx` mocks the handler / as S1 |
| S4 | Pickups: Open in Booth | Booth | `/booth?chapter=<first>&pickups=<id>,<id>` (`boothSessionPath`) | first pickup's chapter, pickup ids in order | Unknown chapter as S1. Unknown pickup ids: not traced in this survey | `pickupCounts.test.tsx` (`boothSessionPath`) / `BoothNextPage.test.tsx` (`pickups=k1,k2`) |
| S5 | Companion: Open in Booth | Booth | `/booth` + `boothQuery` | chapter id or credits kind | as S1 | `CompanionPage.test.tsx` (`/booth?chapter=<id>`) / as S1 |
| S6 | Script, Production, Proof, Story Bible "Appears in", Pickups, jump menu "Go to <chapter>" | Script | route `/script` + hash `#p<index>`, `#c<chapter id or title>`, `#credits-opening`, `#credits-closing` (`App.tsx goToScript`) | book-wide paragraph index or chapter | `useDeepLink`: unknown index or chapter: the hash stays, nothing happens, no message. Reference chapter: a notice. Malformed escape (`#c%`): `decodeURIComponent` throws `URIError` and the page's `ErrorBoundary` shows. | `useDeepLink.test.ts`, `evidenceLinks.test.ts`, `AppearsIn.test.tsx` / `useDeepLink.test.ts` (resolution only; malformed: **none**) |
| S7 | Story Bible: Find in the manuscript | Script | `/script?find=<text>` (`scriptQuery.ts`) | search text | Blank text: no Find bar. | `scriptQuery.test.ts` / `ScriptPage.test.tsx` |
| S8 | Script entity chip, Booth entity link, jump menu | Story Bible | route `/story-bible` + hash `#<entity id>` | entity id | `Guide.tsx` `decodeURIComponent` on the hash: malformed escape throws and the page's `ErrorBoundary` shows. Unknown id: passed to `load(entityId)`. | **none** / `Guide.test.tsx` (hash not covered) |
| S9 | Proof, Production, Script, Editing links | Editing | route `/editing/:chapterId` + `?finding=&passage=&t=&drawer=` (`App.tsx goToEditing`, `EditingRoute`) | chapter id, finding id, passage id, seconds, drawer tab | Unknown chapter: `EditingPage` falls back to the first chapter without saying so. Bad `t` (NaN, negative): dropped. Bad `drawer`: dropped. Link applies once, until the narrator moves. | `ProofPage.test.tsx`, `ProductionPage.test.tsx` (handler called) / `EditingPage.test.tsx` (unknown chapter: **none**) |
| S10 | Editing panel, Engine panel chapter links | Editing | `<Link to=/editing/<id>[?drawer=cleanup]>` hand-built in `EditingCheckPanel.tsx`, `ChapterLinksTable.tsx` | chapter id | as S9 | `EditingCheckPanel.test.tsx` / as S9 |
| S11 | Pickups: Go to Proof | Proof | `/proof?finding=<id>` | finding id | `ProofPage`: a finding not in the list selects the first finding. | **none** found / **none** for `?finding=` from the address |
| S12 | Production, Proof, Master | Proof | `/proof`, `/proof/:chapterId` (`proofAt`), `?chapter=` | chapter id | `?chapter=` is read as the scope; behaviour for an unknown chapter not traced in this survey. | **none** / `ProofPage.test.tsx` (`?chapter=` kept across chapter changes) |
| S13 | Delivery: Open in Master & QC; finding links | Master & QC | `/master#file=<path>&rule=<id>` (`masterLink.ts`); `/delivery#file=` redirects | file path, rule id | Missing `file`: no focus. | `masterLink.test.ts` / **none** for the page |
| S14 | Booth, Production, Proof, Engine | Settings | `/settings#recording`, `#credits`, `#delivery`, `#cleanup`, `#daw`, `#booth`, `#teleprompter` (`SETTINGS_ANCHORS`) | category | Unknown anchor: the default category opens. `#daw`, which the Booth sends, is not in `SETTINGS_ANCHORS`. | **none** for the Booth's links / `App.test.tsx` (`#booth`, `#teleprompter`) |
| S15 | Any page, "no manuscript" panel | Production (import) | `/` | nothing | Always valid. | **none** found |
| S16 | Retired addresses `/manuscript`, `/teleprompter`, `/review`, `/proofing`, `/production`, `/tracks/chapter/:id` | Script, Booth, Proof, `/`, Editing | `RedirectKeepingLocation` | the old query and hash | Kept as-is. | `App.test.tsx` (`/teleprompter`, `/review`, `/proofing`) |

## Shared state a hand-off relies on

| # | State | Written by | Read by | How the reader learns of a change today | Coverage |
| - | - | - | - | - | - |
| T1 | Chapter list (`slots.chapters`, ADR 0770) | Manuscript import, re-split | `App.tsx` (jump menu), Script, Booth, Editing, Proof, Pickups | Store slot: stale on `job:ended`, reloaded on focus (30 s throttle). Booth and Editing read `manuscriptChapters()` themselves on mount and do not use the slot. | `slots.test.ts`, `createStudioStore.test.ts`; the pages that bypass the slot: **none** |
| T2 | `data.manuscript` / `projectFolder` (bootstrap) | `refreshBootstrap` in `App.tsx` | every route's `hasManuscript` | The bootstrap is passed down; `refreshBootstrap` is called by Production and Settings. | `App.test.tsx` |
| T3 | Bookmarks (`slots.bookmarks`) | bookmark commands | Script | Slot reloaded by each command and on focus. | `bookmarks.test.ts` |
| T4 | Findings | Proof, Editing, take review | Proof, Editing, Pickups, Production | Each page re-reads on mount. No shared invalidation. | per page |
| T5 | Notices and toasts | `setNotice` in `App.tsx` | `ToastRegion` | Held in `App`, outlive a route change. | `App.test.tsx` |

## Findings that need a fix

- S1–S5: an unknown chapter in a Booth address renders nothing. The Booth is owned by the `fix/booth-resiliency` worker; this change does not touch it. It is reported in the PR.
- S6, S8: a malformed percent escape in the hash crashes the page to its error boundary.
- S6: an unknown chapter or paragraph in the hash does nothing and says nothing.
- S9: an unknown chapter in an Editing address opens the first chapter without saying so.
