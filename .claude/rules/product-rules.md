---
paths:
  - "src/studio/**"
  - "tests/**"
---

# Product rules

Owner rules that bind any change to the app, whoever makes it. They load whenever the code is edited.

- **One thing per job (owner rule, #3962, from #3674).** The owner's words, verbatim: "If we already have a thing that does something, we SHOULD NOT MAKE A NEW ONE UNLESS WE ARE REPLACING THE OLD ONE WITH A BETTER ONE". This is the only statement of the rule; every other file points here. A thing is a primitive, component, hook, helper, cache, test utility, Go package, sidecar mode, bridge command, setting or page.
  - **Search before building.** Run the searches below, and write the commands and what they found in the plan and in the PR's Reuse section (`Existing thing searched:`). Search the primitives (`src/studio/ui/src/components/primitives/`), the other components, `docs/ui/inventory.json` and the atlas (`docs/ui/atlas/`), then the helpers and hooks, the caches (`grep -rn` for the data's name and for its file or key), the test utilities and fixtures, the Go packages under `src/studio/desktop/internal/` and `narration_common`. Search by what the thing does (a colour picker is a `colour`, `color`, `swatch`, `hex` search), not only by the name you would give it.
  - **Found one: use it.** If it falls short, change it so every consumer gets the change.
  - **A new one needs a replacement.** It is allowed only when it replaces the old one with a better one: the PR names what it replaces (`Replaces: <path>`) and deletes the old one and migrates its consumers in the same PR. A new thing that keeps the old one beside it is refused.
  - **A mock-up or a board option is a proposal.** A concept mock, a drawn variant, a Storybook draft or an owner-board option that shows an alternative to an existing control proposes a new thing: it follows this rule, shows the existing control, and offers a replacement only with the owner-visible case for it.
- **Mock-first behind every port (D67).** A feature builds against a mock that passes the port's schema; going to production is a swap behind the port, and the mock stays for the demo build and the tests. Depend on the ports (`internal/dawport` roles, the provider ports, `NarrationApi`), never on a concrete adapter.
- **One app-wide theme (D69).** No page or surface forces light or dark ([Theme](../../docs/design/design-system.md#theme)).
- **Development data (D70, D71).** A feature still in development uses public-domain or synthetic data, and results calibrated on it are provisional: a re-run on the owner's own material is an owner item before it ships. Real speech comes from LibriVox by default: record the source URL, reader, book and public-domain statement, and keep the audio out of git as ignored local data. Synthetic audio is the fallback.
- **Outbound data (D72).** The app may fetch reference data (dictionary, pronunciation; local first, online optional) but never sends the narrator's or authors' data out. An online lookup sends a single word, never passages, file names or project identifiers; it is narrator-initiated, or opt-in with a notice for a batch; results are cached locally. No telemetry and no project-run proxy. A service that needs a key uses the narrator's own key, stored locally and never logged.
- **Settings keeps every setting.** A working page may add a compact modal or side-panel entry for a setting, never remove or replace the control on the Settings page.
