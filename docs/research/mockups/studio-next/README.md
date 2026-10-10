# Studio Next: the working mock

A self-contained, runnable React + TypeScript mock of the narrator studio, built to settle the design before the real app is rebuilt around it. It is **not** wired to the repo's host, sidecars or REAPER bridge; every real capability (DAW, speech engine, alignment, measurement, extraction, component downloads) sits behind a small interface with a mock implementation fed by fixture data. A later change replaces a mock provider with the real one without rebuilding a screen.

The owner's rulings that shaped it are in [`research/repo-compare-decisions.md`](research/repo-compare-decisions.md). The research behind them (repo comparison, editing FX, icon audit, Story Bible extraction, local and own-model LLMs) is in [`research/`](research/). `ARCHITECTURE.md` describes the layers, stores and registries.

## Run it

This folder is a standalone npm project (it is not part of the pnpm workspace).

```bash
cd docs/research/mockups/studio-next
npm ci
npm run dev        # http://localhost:5173
npm test           # vitest, jsdom
npm run typecheck
npm run artifact   # one self-contained HTML file (SINGLE=1 vite build)
```

`e2e/` holds Playwright scripts used to audit overflow at 860 to 1600 px (`overflow.mjs`) and to take screenshots; they expect a Chromium and the `@fontsource` fonts from `node_modules`.

## What it covers

Production, Schedule, Script, Story Bible, Booth, Editing (script-based audio editing), Proof, Pickups, Master, Delivery, Settings, Companion (parked), with the jump menu, undo history, key-hint footers, Mock states panel and DAW capability model (REAPER, built-in recorder, Audacity).

## Status

Design reference only. Lifecycle: this folder is deleted when the real app matches it (CLAUDE.md, "Which mocks are the spec"). Items deliberately left out or deferred are listed in the decisions file (time tracking, the Companion, proofer CSV, FX chains on whole takes, Audacity 4, redo).
