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
5. If your change alters what `apps/ui` draws, show it in the pull request: see
   [UI PRs show their screenshots](#ui-prs-show-their-screenshots).
6. If you settled a decision that changes the structure, a dependency, an interface between parts or a platform and is
   costly to reverse, record it as an ADR in `docs/adr/`.

## UI PRs show their screenshots

A permanent owner rule (2026-09-29). A pull request that changes what `apps/ui` draws shows the change as images in its
description. Without them the owner rejects it: the owner has to see that it looks better and does not trust a number.

- **What to show.** A **Screenshots** section with one row per changed state at 1440×900: the Studio Next mock page,
  before (`main`) and after (your branch). Capture the before and after in the same state, viewport and fixture, and
  crop or scale the mock to match. There is no match percentage for Studio Next pages; the owner looks at the images.
- **Other viewports.** Small-desktop and tablet (and `reflow` at 390 px for Settings) as before/after pairs in a
  collapsed `<details>`.
- **Where the images live.** Commit them on the pull request's own branch under `pr-screenshots/<branch>/` and embed
  them by commit SHA:
  `https://github.com/countrymanprime/narration-utils/blob/<commit-sha>/pr-screenshots/<branch>/<file>.png?raw=true`.
  After every push that changes the UI, regenerate them and update the SHA in the description. The last commit on the
  branch before merge deletes `pr-screenshots/`, so the squash has no net change there and the images never reach
  `main`. GitHub keeps every commit of a pull request reachable through its ref, so the SHA links keep rendering after
  the merge. Do not create a separate `pr-images/*` branch; that scheme is retired. The lasting record is
  `docs/images/ui/` and the Playwright visual suite; `apps/ui/screenshots/` stays ignored scratch.
- **How to capture.** `cd apps/ui && npx playwright test tests/visual/app.spec.ts -g "<page>.*<state>"` writes
  `apps/ui/screenshots/app/<page>/<state>/<viewport>.png`. The mock runs from `docs/research/mockups/studio-next/`
  (`npm ci` there, then its Playwright scripts in `e2e/`). Without network, list the missing mock image in the pull
  request and the owner supplies it.

## Licensing of contributions

The project is licensed under AGPL-3.0-or-later ([ADR 0039](docs/adr/0039-the-project-is-licensed-agpl-3-or-later.md)).
By opening a pull request you agree that your contribution is licensed under the same terms. There is no
contributor license agreement.

## Reporting a security problem

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
