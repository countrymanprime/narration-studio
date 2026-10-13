# Walkthrough audit screenshots (N-U293)

Screenshots for the defects filed from the assembled-app walkthrough on 2026-10-13. This branch (`audit/walkthrough`) is never merged.

How they were taken: `pnpm --dir apps/ui run build:mock` at `e2616b1`, served with `vite preview` on :4173; the Studio Next mock served from `docs/research/mockups/studio-next` on :5173; Playwright with Chromium at `/opt/pw-browsers/chromium`. Sample project: Alice's Adventures in Wonderland from the mock API. Viewports 1440x900, 1100x800 and 390x844, light and dark. Editing with audio used `?mockChapterLink=confirmed&mockDawExperimentalOn=1`; Booth recording used `?mockRecordCapabilityOn=1&mockDawExperimentalOn=1`.

Console per page (default sample project, every route): no page errors and no failed requests other than `/wails/custom.js` (404, expected in a browser preview) and the Wails "Browser Environment Detected" warning. The Editing page also logs Chromium's `MidiSysEx permission has been blocked` warning on every load.

`*-mock-*.png` is the Studio Next mock's page in the same viewport and theme; `*-app-*.png` is the app.
