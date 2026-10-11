# 0657. `FocusShell` takes a `contentClassName` for a host's own main-region look

**Status:** Proposed (the mock-fidelity work on [#509](https://github.com/countrymanprime/narration-utils/issues/509))
**Date:** 2026-09-28
**Amends:** `primitives/FocusShell.tsx`'s slots-only API ([ADR 0360](0360-studio-primitives-land-as-flat-leaf-files-after-one-token-batch-and-capability-gating-is-a-primitive.md))

## Context

Mock 03's reading surface is darker than the app's ordinary `--bg` (`--reading-bg`, [ADR 0590](0590-the-mock-fidelity-token-batch-fills-badges-with-opaque-soft-tokens-and-names-the-mocks-sizes-and-type.md)). `FocusShell` (`primitives/FocusShell.tsx`) is the shared full-screen layout the Booth (and, through `CompactShell`, the companion) is built on; its own outer wrapper always paints `bg-[var(--bg)]`, and its `className` prop only reaches that outer wrapper, not the scrollable main content region `Content` renders.

`FocusShell` also has other, non-Booth-specific consumers of the same shell shape (`ReaderRail.tsx`, `ReadAlongView.tsx`, `BoothSession.tsx` all reference it, alongside `CompactShell.tsx`), so hard-coding a darker main-region background into the primitive itself would force every host to draw it, including any host that doesn't want the Booth's specific reading tint.

## Decision

`FocusShell` gains an optional `contentClassName` prop (default `''`), applied to the `Content` element's existing class list alongside its `p-4`/`overflow-y-auto`. It changes nothing for a caller that omits it. `booth/BoothView.tsx` is the first and, for now, only caller to pass one: `contentClassName="bg-[var(--reading-bg)]"`.

## Consequences

- The Booth's reading pane matches the mock's darker surface without `FocusShell` gaining Booth-specific defaults or a second look.
- Any later host that needs its own main-region styling (a tinted focus mode, a different page's own reading surface) has a documented, additive way to ask for it instead of restyling `FocusShell`'s markup locally or wrapping it in an extra `<div>`.
