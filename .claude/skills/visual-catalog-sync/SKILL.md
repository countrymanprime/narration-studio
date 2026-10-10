---
name: visual-catalog-sync
description: When apps/ui/src changes add, remove, or visibly change a page/state, keep apps/ui/tests/visual/state-catalog.ts and app.spec.ts's drivers matching reality before anyone trusts the visual suite's output.
---

# visual-catalog-sync

## Why this exists

`apps/ui/tests/visual/state-catalog.ts` describes itself as "the single naming authority" for
every `{page, state}` the app can be in, and `app.spec.ts` drives each one to produce the
screenshots used for both manual QA review and `docs/guides/using-the-app/*.md`. That authority
only holds if it's updated in the same change that alters the UI it describes — otherwise it
quietly drifts: a new modal never gets a state entry, a removed button leaves a driver that now
no-ops, a renamed page leaves stale catalog rows. Everything downstream (`full-verification-gate`'s
visual review, `doc-screenshot-sync`) trusts this file; this skill is what keeps that trust valid.

## When to use this

After implementing (but before verifying) any change to `apps/ui/src/**` that:
- Adds a new page, modal, panel, or otherwise reachable UI state.
- Removes or renames a page/state that `STATE_CATALOG` currently lists.
- Changes what a default view or existing state actually looks like (new fields, changed
  layout, changed default data) enough that the existing screenshot would mislead a reviewer.

Skip it for changes that don't alter what's on screen (refactors, internal logic, non-visual
bug fixes).

## What to do

1. Diff the change against `STATE_CATALOG`: for each new reachable state, add an entry
   (`page`, `state`, `description`) and a corresponding driver in `APP_DRIVERS` in `app.spec.ts`
   that reaches it through real UI interaction (click/hover/drag), matching the existing style —
   accessible-name selectors, not `data-testid` (the app has no such convention).
2. For a removed or renamed page/state, remove or update the matching `STATE_CATALOG` entry and
   its driver. Don't leave an orphaned entry pointing at UI that no longer exists.
3. If a state's driver can't safely reach it yet (e.g. no seam to force an error state), leave it
   out of `APP_DRIVERS` deliberately — `app.spec.ts` already skips catalog entries with no driver
   — and say so explicitly rather than writing a driver that only sometimes works.
4. Before finishing, run the affected tests to confirm each new/changed driver actually reaches
   the state it claims to:

   ```bash
   cd apps/ui && npx playwright test tests/visual -g "<page> / <state>"
   ```

   Open the resulting PNG under `screenshots/app/<page>/<state>/` and confirm it actually shows
   what the description says — a driver that clicks the right thing but the state closes before
   the screenshot, or a state that turns out identical to another one already catalogued, is not
   a state worth keeping in the catalog.

## What this skill is not

It doesn't decide which states are worth putting in front of a user in documentation — that's
`doc-screenshot-sync`'s manifest. It also isn't the visual review step itself — that's
`full-verification-gate`, which should be run after this skill so the suite it reviews is
actually accurate.
