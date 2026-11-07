---
paths:
  - "src/studio/**"
  - "tests/**"
---

# Product rules

Owner rules that bind any change to the app, whoever makes it. They load whenever the code is edited.

- **Mock-first behind every port (D67).** A feature builds against a mock that passes the port's schema; going to production is a swap behind the port, and the mock stays for the demo build and the tests. Depend on the ports (`internal/dawport` roles, the provider ports, `NarrationApi`), never on a concrete adapter.
- **One app-wide theme (D69).** No page or surface forces light or dark ([Theme](../../docs/design/design-system.md#theme)).
- **Development data (D70, D71).** A feature still in development uses public-domain or synthetic data, and results calibrated on it are provisional: a re-run on the owner's own material is an owner item before it ships. Real speech comes from LibriVox by default: record the source URL, reader, book and public-domain statement, and keep the audio out of git as ignored local data. Synthetic audio is the fallback.
- **Outbound data (D72).** The app may fetch reference data (dictionary, pronunciation; local first, online optional) but never sends the narrator's or authors' data out. An online lookup sends a single word, never passages, file names or project identifiers; it is narrator-initiated, or opt-in with a notice for a batch; results are cached locally. No telemetry and no project-run proxy. A service that needs a key uses the narrator's own key, stored locally and never logged.
- **Settings keeps every setting.** A working page may add a compact modal or side-panel entry for a setting, never remove or replace the control on the Settings page.
