# 0155. Settings gain a number kind with a declared range, and delivery limits are the narrator's own

**Status:** Proposed; decision 5 superseded by ADR-0179
**Date:** 2026-09-23

## Context

The layered settings store (`apps/desktop/app.go` `fieldSchemas`, `saveSettings`) validated only the `text`, `choice`,
`color` and `bool` kinds. Two features need numbers a narrator can type: the delivery limits of
the diagnostics tools, and the four threshold settings of
[the recording check](../utilities/recording-coverage.md). The owner has not answered whether delivery limits ship with a
built-in numeric preset or as named, switchable sets, so this change takes the conservative answer: limits only, no
built-in numeric preset (as ADR 0025 already requires), stored as a `Delivery` section of the layered settings, one limit
set per layer.

## Decision

1. **A `number` kind.** A number setting is stored, like every setting, as text: a plain decimal (`-3`, `0.5`; no
   exponent, sign `+`, spaces, unit, NaN or Inf). Its range is declared in `numberSpecs` (`apps/desktop/settings_number.go`),
   keyed by tool and key: an inclusive `min` and `max`, a `step` counted from `min` (or zero), and a `unit`, any of them
   optional. `saveSettings` rejects a value that is not a plain number, is out of range or is off step, and a number field
   with no declared range fails closed. The range is kept beside `fieldSchemas`, not inside `fieldSchema`, so the kind did
   not rewrite every existing positional field literal; a test keeps the two maps in step.
2. **Clearing a number saves `null`**, never `""`: a project override is removed and a global value reset, so an emptied
   box means "not set" in every layer. The Settings page shows a number box with only its own scope's value (so it can be
   emptied) and what it inherits as the placeholder, with its unit beside it and its range, or what is wrong, below it.
3. **Paired fields.** `numberPairs` names a tool's lowest and highest keys of one quantity; a save is refused when the
   effective lowest would be above the effective highest across all layers once the save lands.
4. **The wire contract.** A `number` field carries a `number: {min, max, step, unit}` object and no other kind does
   (`apps/ui/src/api/schemas/settings.ts`). A new kind the older page cannot render is a contract change: `hostAPIVersion`
   is 29.
5. **Delivery limits.** The `Delivery` section holds seven limits, the bounds that mean something: integrated loudness
   and RMS level lowest and highest, sample peak, true peak and noise floor highest. `config/defaults.json` has an empty
   `Delivery` section. `measure.ProfileFromLimits` builds a `measure.Profile` from the effective values: a blank key is no
   limit, an empty section is a profile with no limits (so `Evaluate` raises nothing), and a non-finite value or a minimum
   above its maximum is an error. `Profile` gains a `SamplePeakdBFS` limit. The ranges keep a typo out; they are not advice.

## Consequences

- Any feature can add a numeric setting by adding a `number` field to `fieldSchemas` and its range to `numberSpecs`, with
  validation, the page's rendering and the wire check already in place.
- The diagnostics and cleanup analyzer thresholds (clipping ceiling, long-pause length, level-shift step,
  silence floor, minimum silence and breath length, pad/hold time) are added with the analyzers that read them, not
  ahead of them, so no setting exists that changes nothing.
- Named, switchable limit sets are not possible: one set per layer. Revisit only if narrators need several per book.
- Owner review: this ADR is Proposed because it records defaults for questions the owner has not answered.
