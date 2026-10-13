# Contributing

Thanks for helping. Narration Studio is a local-first toolkit that helps a narrator find and review issues faster.
It never edits audio or text automatically; see the [product boundary](docs/roadmap.md#product-boundary).

## Before you start

- Check the [documentation index](docs/README.md) and the [roadmap](docs/roadmap.md).
- Open an issue first for anything beyond a small fix, using the bug or feature form.
  [Tracking work on GitHub](docs/operations/github-workflow.md) explains labels, milestones, and the project board.
- If your change touches the UI primitives, `styles.css`, or a behaviour an ADR names, read the
  [ADR index](docs/adr/README.md) first.

## Setting up

```bash
pnpm run bootstrap   # once after cloning
pnpm run check       # the full quality gate
```

Details, including the Git hooks and CI, are in [CI and releases](docs/operations/ci-and-releases.md).

## Making a change

1. Work on a branch and write tests first; the repository expects them alongside behaviour changes.
   Put code in the folder that names its role (see the [codebase map](docs/architecture/codebase-map.md)); tests follow
   the toolchain, with one `tests/` folder per project where it does not want them beside the code.
2. Run `pnpm run check` before you push. If you changed `apps/ui`, also review the visual-suite screenshots at every
   viewport and run `pnpm --dir apps/ui atlas`. If you changed `integrations/reaper` (Lua), the bridge harness in `pnpm run check` covers its protocol, but
   REAPER's own API behaviour is only checked by hand inside REAPER.
3. Open a pull request whose **title is a Conventional Commit** (`feat: …`, `fix(scope): …`). It becomes the squash
   commit and decides the next version. Put `Closes #<issue>` in the description and fill in the template.
4. Update the docs your change owes. CI fails a change to mapped code that touches none of its docs, unless the description says `Docs: none — <reason>` ([Documentation gates](docs/operations/documentation-gates.md)).
   [Which document](docs/README.md#which-document) says where each kind of fact goes: a file the app writes and reads
   back goes in [data files](docs/reference/data-files.md), a new way untrusted data reaches the app goes in the
   [threat model](docs/architecture/threat-model.md).
5. If your change alters what a page draws or how it is used, update that page's guide: see
   [UI PRs update the how-to guide](#ui-prs-update-the-how-to-guide).
6. If you settled a decision that changes the structure, a dependency, an interface between parts or a platform and is
   costly to reverse, record it as an ADR in `docs/adr/`.

## UI PRs update the how-to guide

An owner rule (2026-10-13). The how-to guide, [Using the app](docs/guides/using-the-app/README.md), has one page per app
page. It shows how to use the page and its interactions, with screenshots in `docs/images/ui/`. Those are the only UI
images the repository keeps, and a pull request does not carry a set of its own.

- **What changes.** A pull request that changes what a page draws or how it is used updates that page's guide in the
  same pull request: the text in `docs/guides/using-the-app/<page>.md` and the screenshots of the states and interactions
  it changes. A changed image replaces the file in place, so GitHub's image diff shows before and after. A new
  interaction gets a new image and a short how-to step. A removed one loses its image, its manifest entry and its text.
- **How to capture.** The guide's images are listed in `apps/ui/tests/visual/doc-screenshots.json`, each a state of
  `apps/ui/tests/visual/state-catalog.ts` at one viewport. From the repo root, `node scripts/dev/guide-screenshots.mjs <page>...`
  runs the real app (the visual-suite drivers on the mock API) for those pages and rewrites their WebP images; an image
  whose pixels did not change is left alone. `<page>` is a guide page (`booth`, `master-and-qc`) or a state-catalog page
  (`storybible`); `--all` does the whole guide. A new image starts as a new manifest entry: add the state to the catalog
  first if it is not there (`visual-catalog-sync`).
- **Looking at every state.** The targeted runs show every catalogued state of a page, light and dark, at every
  viewport, and are how you check the page before you push. They write to the ignored `apps/ui/screenshots/`, and CI keeps
  the full run's PNGs as artifacts; nothing from them is committed.
  - `pnpm --dir apps/ui visual:page <page>...` runs the page's rows of the real-app suite and prints PASS, FAIL or SKIP
    per state.
  - `pnpm --dir apps/ui atlas:page <page-or-component>...` builds Storybook and runs the stories of those titles.
  - In a container with its own Chromium and no `playwright install`, both find the headless shell under
    `PLAYWRIGHT_BROWSERS_PATH`; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` names another.
- **The pull request.** Its description states the real-app (Playwright) result and the Storybook result for the pages
  it names, and links the guide diff. A change to a page that owes the guide nothing says
  `No guide change: <specific reason>`; the `Docs / Guide impact` check fails without one of the two
  ([Documentation gates](docs/operations/documentation-gates.md)).
- **Compared with the mock.** A page built to the Studio Next mock (`docs/research/mockups/studio-next/`) is compared with
  the mock's page in the same state and theme; the mock's `e2e/` Playwright scripts capture it. Put that comparison in a
  comment on the pull request when the owner asks for it.
- **The sweep.** `node scripts/dev/guide-screenshots.mjs --all` also runs as a periodic sweep, to catch an image that a
  change to a shared component moved on a page it did not name.

## Licensing of contributions

The project is licensed under AGPL-3.0-or-later ([ADR 0039](docs/adr/0039-the-project-is-licensed-agpl-3-or-later.md)).
By opening a pull request you agree that your contribution is licensed under the same terms. There is no
contributor license agreement.

## Reporting a security problem

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
