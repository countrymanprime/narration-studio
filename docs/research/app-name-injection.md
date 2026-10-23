# App name injection: one place for the product name

Researched 2026-10-23 for the owner (#2251 item 41), on `refactor/purge-old-name` at `661c617`; the design is rebased on #2264, which retires the old name with no migration. The counts are for that commit and are not kept current; `scripts/ci/old-name.mjs` reports what is left.

**Question.** Where does the product name appear, and how does each place get it from one file, so that renaming the product is one edit plus one command?

**The owner's request** (coordination chat, 2026-10-23): use a variable to inject the app name, a constant in a project or environment file that can be changed with minimal effort; where the name cannot be injected, use a generic phrase such as "the app"; take the name out of data sets and inject it later; never hunt for the name again.

## Inventory

Method: `git grep -n -I -i -E "narration[ _-]?studio"` over the tracked files (lock files left out), each matching line put in the first kind whose pattern it matches. 4,563 lines in 1,203 files.

| Kind | Example | Lines | Files | Where | Decision |
| --- | --- | --- | --- | --- | --- |
| Go module path | `github.com/<owner>/<repository>/shell/internal/...` | 2,088 | 869 | every Go import, `go.mod`, `.golangci.yml`, the generated Wails bindings path in the UI | Brand-neutral module path; no product name |
| Display name | "Narration Studio" | 580 | 256 | UI text and mocks (119), Go messages and reports (114), Lua dialogs (102), docs (139), the site (24), release notes, installer | Injected from the brand (`brand.Name`, `brand.name`); "the app" where the name adds nothing |
| Repository URL | `https://github.com/countrymanprime/narration-studio/issues/188` | 421 | 135 | issue and run links in docs (354), the update checker, the site, release scripts | From `brand.repository`; links in docs are rewritten by `rename-app` when the repository moves |
| Other slug uses | `narration-studio` in comments, test names, temp folders | 350 | 198 | everywhere | Generic phrase, or the matching identity constant |
| Project folder | `<project>/narration-studio/manuscript/manuscript.json` | 291 | 175 | Go path joins (59), Go tests (113), docs (53), the UI's path text, Python | Identity `projectFolder` |
| REAPER P_EXT keys | `P_EXT:narration_studio_line_id` | 227 | 45 | Lua (77), Go tests (114), docs | Identity `reaperExtPrefix` |
| Program and release assets | `narration-studio.exe`, `narration-studio-<version>-windows-x64.zip` | 208 | 52 | release scripts (84), Go tests (55), docs, workflows | Identity `executable`, `releaseAssetPrefix` |
| Environment variables | `NARRATION_STUDIO_FFMPEG`, `NARRATION_STUDIO_SPIKE_OUT` | 114 | 29 | Lua spikes (89), docs, Go tests | Identity `envPrefix` |
| Per-user data folder | `%APPDATA%\narration-studio\global-settings.json` | 100 | 50 | Go (20), Go tests, fixtures (21), docs, Python, installer text | Identity `dataFolder` |
| REAPER launcher | `NarrationStudio_Launcher.lua` | 76 | 40 | Go, Lua, the installer check, docs | Identity `reaperLauncher` |
| Package and Nx names | `narration-studio-ui`, `narration-studio-shell`, the root `narration-studio` | 53 | 20 | `package.json`, `project.json`, workflows (16), `nx.json` release project | Brand-neutral names |
| Uninstall key, default projects folder, REAPER resource folder | `NarrationStudio` | 43 | 25 | `project.nsi`, the install check, `projectsdir.go`, `dawautoconnect.go`, docs | Identity `uninstallKey`, `defaultProjectsFolder`, `reaperResourceFolder` |
| Python identifiers | `narration_studio_*` keys read by Python | 6 | 6 | Lua and Python | Identity `reaperExtPrefix` |

By area: Go 1,283 lines and Go tests 1,506 (most of both the module path), docs 750, Lua 328, UI 75 and UI tests 127, scripts 200, workflows 46, the site 37, Python 35, fixtures 62, skills 13.

Not found: an AppUserModelID (the app sets none; Windows derives one from the program path), a file extension or magic string of the app's own, a bundle id (no macOS bundle is built), a signing identity (releases are not signed), and an update channel name (the updater reads the repository's releases).

**Screenshots that show the name.** `docs/images/ui/settings-about-updates.webp` draws the name (About). `docs/images/ui/project-new-dialog.webp` draws the default projects folder, an identity value that does not change on a rename. Both are retaken by `scripts/dev/guide-screenshots.mjs` from the mock UI, which reads the name from the brand module; nobody edits them by hand. The mockups under `docs/research/mockups/` are dated evidence and stay as recorded.

## Design

### One brand file: `config/brand.json`

`config/` already holds the repo's shared data files (`defaults.json` and the asset catalogs), which Go, Python and the release scripts read; it is an Nx project (`config`) that the desktop host and `narration_common` already depend on, so a brand change marks them affected in CI. JSON needs no parser dependency in any of the four languages. The file holds:

- **`name`**, the display name. Its other spellings (`slug`, `snake`, `pascal`, `constant`) are derived by `scripts/brand/brand.mjs` (`nameForms`), not stored, so there is one value to change.
- **`repository`**, the GitHub owner and repository name. The repository URL and the public site URL are derived from it. It is apart from `name` because renaming the product does not rename the repository; the owner does that on GitHub.
- **`identity`**, the values already written to narrators' machines and projects: the per-user and project data folders, the default projects folder, the program and release asset names, the install folder, the uninstall key, the REAPER P_EXT key prefix, launcher file and resource folder, the Audacity label track, the credential entropy and the environment variable prefix. **They do not follow a rename.** Each one is found again by its exact value (an installed copy downloads its update by the asset name; the bridge reads its own P_EXT keys from saved projects; DPAPI needs the same entropy to decrypt), so changing one strands what is already on a narrator's machine or in their projects. The app has no migration for them (the old name was retired before the first release, with none). `IDENTITY_KEYS` in `brand.mjs` says what each one names.

### How each kind of place gets the name

`pnpm run brand:sync` (`scripts/brand/sync.mjs`) writes one generated module per runtime from the brand file; `pnpm run brand:check` fails when one is out of date, and `scripts/brand/sync.test.mjs` runs that check in the `repo-scripts` tests. Each module's own test compares it with the brand file.

| Place | How it gets the name |
| --- | --- |
| Go host | Generated constants, `src/studio/desktop/internal/brand/brand_gen.go`. No `-ldflags`: a constant compiles into every build and test without a build step. |
| UI | Generated module, `src/studio/ui/src/brand.gen.ts`. A file and not Vite `define`, so Vitest, Storybook and the type checker see the same value with no config. Text that shows the name uses `brand.name`. |
| Python sidecars | Generated module, `narration_common/brand.py`. |
| REAPER Lua | Generated table, `src/studio/integrations/reaper/narration_brand.lua`, shipped with the bridge files. |
| Installer, Wails config, package metadata | Generated or patched by `brand:sync` at the same time (NSIS defines; `wails.json` product and company name). |
| Package and Nx project names, Go module path | Brand-neutral, so a rename does not touch them. |
| Workflows | Read the brand file through the release scripts, or `${{ github.event.repository.name }}` for the repository. |
| Docs and READMEs | "the app" wherever the name is not needed. Where it is (a title), a brand region (`<!-- brand:name -->` before the name, `<!-- /brand -->` after it), which `brand:sync` rewrites and which GitHub, MkDocs and the site all render as plain text. |
| Public site (`src/web`) | The site build reads the brand file. |
| Fixtures, goldens, mocks, stories | The name is taken out of the data. A display name is injected where it is shown; a golden that records an identity path is written and compared through the brand module. |

### The guard

`scripts/ci/old-name.mjs` fails the gate on a retired name in any spelling. The retired names are in `scripts/ci/retired-names.json`, each as its words, not in the brand file, so the brand file and the generated modules never hold them. The first old name (#2264) has no exception. A name `rename-app` retires has `"history": true`: the brand file, the generated files, the identity file names, the repository's addresses and the history `brand-name.mjs` allows may still hold it, and a built folder may ship the identity values, which keep its spelling.

`scripts/ci/brand-name.mjs` fails on the current name from the brand file, in every spelling and across a wrapped line, in a tracked file's path or text. `brand-name.test.mjs` runs it in the `repo-scripts` check. It does not judge:

- the brand file and the files `brand:sync` writes (`TARGETS` in `scripts/brand/sync.mjs`);
- a brand region (`<!-- brand:… -->value<!-- /brand -->`);
- the identity file names (the REAPER launcher and its startup script);
- the repository's own addresses (`github.com/<owner>/<repository>`, its Pages URL and the `/<repository>/` sub-path), which name the repository, not the product;
- `ALLOWED`: dated research, ADRs, the changelog, recorded spike output, contract fixtures and saved REAPER projects that hold identity values, each with its reason.

A golden file that would hold the name holds `{{brand.name}}` instead: `brand.Golden` swaps it in Go tests before the comparison. Workflows read the repository's name from the workflow context (`github.event.repository.name`), and the docs site's addresses are a `brand:sync` target. The built site and the release assets are checked for the old name only.

### The rename

`pnpm run rename-app -- "<New Name>"` (with `--dry-run`, `scripts/brand/rename-app.mjs`) writes the new name, adds the outgoing one to `retired-names.json`, runs `brand:sync` and prints what it cannot do: the screenshots, which `scripts/dev/guide-screenshots.mjs` retakes, a CHANGELOG entry, the GitHub repository's own name, and the identity values that keep the outgoing spelling. [Renaming the app](../operations/renaming-the-app.md) is the how-to.

The `rename rehearsal` CI job (`scripts/brand/rehearse-rename.mjs`) renames each pull request's checkout to "Zebra Audio Lab" and runs the sync check, both guards, `go vet ./...` and the tests that read the name; main-health runs it with `--full` (every Go, UI, shared-library Python and Lua test, the built site and the strict docs build). Tests that need a made-up brand use another name, or assemble it from its words, so the rehearsal's name never matches a literal.
