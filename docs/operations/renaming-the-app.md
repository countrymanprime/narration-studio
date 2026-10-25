# Renaming the app

The product's display name is `name` in `config/brand.json`. Everything that shows it reads it from there, through the files
`pnpm run brand:sync` generates ([Product and technical names](../architecture/codebase-map.md#product-and-technical-names)). A rename is one command and a short
list of follow-ups.

## Rename

1. See what would change: `pnpm run rename-app -- "<New Name>" --dry-run`.
2. Rename: `pnpm run rename-app -- "<New Name>"`. It:
   - writes the new name to `config/brand.json`;
   - adds the outgoing name to `scripts/ci/retired-names.json`, so `scripts/ci/old-name.mjs` fails on it from now on;
   - runs the brand sync: the Go, TypeScript, Python and Lua brand modules, `wails.json`, the docs site's `mkdocs.yml` and the
     brand regions in Markdown and HTML.

   It refuses a name of the wrong shape (words that start with a capital letter or a digit, one space apart), the current name
   and a retired one.
3. Do what it prints:
   - Retake the guide screenshots, which show the name: `node scripts/dev/guide-screenshots.mjs --all`.
   - Add a CHANGELOG entry.
   - To rename the GitHub repository too, follow [The repository was renamed](repository-rename.md) and set `repository.name`
     in `config/brand.json`. The Pages link check reads the repository's name from the workflow, so it needs no edit.
4. Open a pull request. The `rename rehearsal` and name-guard checks run on it as on any other.

## What stays

The `identity` values in `config/brand.json` do not follow a rename: the data folder, the project folder, the program file
name, the release asset prefix, the install folder, the uninstall key, the REAPER extension-state prefix, launcher and resource
folder, the Audacity label track, the credential entropy, the environment-variable prefix and the product identifier. Each is
on narrators' machines or in their projects, and the app finds it again by its exact value (`IDENTITY_KEYS` in
`scripts/brand/brand.mjs` says what each names). After a rename they still spell the outgoing name, and the old-name guard
allows them: in the brand file, the generated files and what the app ships.

An installed copy keeps its old Start Menu and desktop shortcuts until it is reinstalled.

## How a rename is kept cheap

- `scripts/ci/brand-name.mjs` fails on the current name anywhere but the brand file, its generated files, brand regions,
  identity file names, the repository's own addresses and a short allowlist of history (dated research, ADRs, the changelog,
  recorded output and fixtures).
- `scripts/ci/retired-names.json` keeps each retired name as its words. A name `rename-app` retires gets `"history": true`,
  so the brand file, the generated files, identity file names, the repository's addresses and the history allowlist may
  keep it; the first name has `"history": false` and no exception.
- The `rename rehearsal` job (`scripts/brand/rehearse-rename.mjs`) renames a throwaway worktree of each pull request's commit
  to a made-up name (`REHEARSAL_NAME`, built from its words; a test that needs a made-up brand uses another name or builds
  it from its words too, so no literal matches it) and runs the sync, both guards and the tests that read the name, so anything that spells the name fails
  before a real rename needs it. main-health runs it with `--full`. It never writes to the checkout, so it runs locally as is:
  `node scripts/brand/rehearse-rename.mjs` (it rehearses `HEAD`, so commit first).
