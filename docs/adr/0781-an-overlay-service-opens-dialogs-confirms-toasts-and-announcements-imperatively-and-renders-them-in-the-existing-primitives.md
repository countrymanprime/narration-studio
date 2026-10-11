# 0781. An overlay service opens dialogs, confirms, toasts and announcements imperatively and renders them in the existing primitives

**Status:** Accepted (owner ruling 2026-10-11; owner ruling SNR-Q4 of 2026-10-11 and the PRD's Decisions Log row "Overlay API is imperative, rendering is declarative", register row A4; taken as defaults under the standing instruction)
**Date:** 2026-10-11
**Supersedes:** none. It extends [ADR 0048](0048-every-dialog-is-one-modal-shell-and-confirms-are-alert-dialogs.md), [ADR 0172](0172-popover-is-an-interactive-layer-above-the-dialog-and-escape-defers-to-the-topmost-one.md) and [ADR 0630](0630-overlays-keep-the-mocks-frame-a-nested-dialog-dims-the-page-and-a-combobox-popup-is-a-listbox-not-a-popover.md) and keeps their rules.

## Context

In the mock, `docs/research/mockups/studio-next/src/ui/overlay.ts` is a small store of modals, one popover, one context menu, toasts and a live-region message. Any code can call `openModal`, `toast`, `toastUndo` or `announce` without being a component. `toastUndo(msg, entry)` gives a toast whose Undo undoes exactly one journal entry and says so, or says why not.

In the real app a dialog or toast is opened by the component that owns its state: `useToasts` and `Notify` for toasts, a `useState` flag per `Dialog`, `ConfirmDialog` and `SlideOver`. A command run from the jump menu or the keymap is not a component, so it cannot open a confirm without a host component to hold the flag. The rules for how overlays stack and how focus returns live in the primitives, not in a store:

- [ADR 0048](0048-every-dialog-is-one-modal-shell-and-confirms-are-alert-dialogs.md): one modal shell, confirms are alert dialogs, Escape, backdrop and focus-return policy.
- [ADR 0172](0172-popover-is-an-interactive-layer-above-the-dialog-and-escape-defers-to-the-topmost-one.md): a popover sits above a dialog, and Escape closes the topmost layer first.
- [ADR 0630](0630-overlays-keep-the-mocks-frame-a-nested-dialog-dims-the-page-and-a-combobox-popup-is-a-listbox-not-a-popover.md): the mock's frame, a nested dialog dims the page, a combobox popup is a `Listbox`.

Porting the mock's store would bring a second stacking and focus-return implementation next to the primitives' own.

## Decision

1. **The overlay service's API is imperative.** `overlay.confirm(spec)`, `overlay.toast(text, options?)`, `overlay.toastUndo(text, entry)`, `overlay.announce(text)` and `overlay.open(dialog spec)` can be called from a command handler, a menu item, a provider or a leave guard, with no component in the caller. `overlay.confirm` returns a promise of the narrator's answer; `overlay.open` returns a function that closes it.
2. **Its rendering stays declarative, in the existing primitives.** One host component mounted by the shell reads the service's state and renders `ConfirmDialog`, `Toast`, `Dialog`, `SlideOver` and `Popover` ([ADR 0047](0047-the-ui-primitives-wrap-base-ui-and-app-code-never-imports-it.md) wraps Base UI in them). The service does not draw an overlay, position one, trap focus, return focus or decide which layer closes on Escape. Those stay the primitives' and the rules in ADR 0048, 0172 and 0630 apply unchanged. The mock's own stack, `opener` bookkeeping and z-order are not ported.
3. **Import rule: the overlay service imports primitives only.** It lives in `apps/ui/src/overlay/`. It imports from `components/primitives/` and from nothing else in the app: not a feature, not a registry, not a page, not the UI store. A feature or registry imports the service. The undo it needs for `toastUndo` is passed in by the caller as a function (decision 5), so the service does not import the journal. A dependency-cruiser rule enforces it ([ADR 0062](0062-ui-import-rules-are-a-dependency-cruiser-config-and-a-mark-scan-that-name-their-adr.md)).
4. **One toast and dialog system.** The existing `Notify` and `useToasts` become callers of the service when the service lands; no second modal or toast stack stays beside it. A migration moves one call site at a time and each is its own slice. A dialog a component renders itself with `Dialog` stays valid until it is migrated.
5. **A toast's Undo undoes one journal entry, and a DAW entry only when it is the last (SNR-Q4).** `overlay.toastUndo(text, entry)` takes the entry's undo as a function and shows the journal's refusal sentence when it refuses ([ADR 0771](0771-undo-is-one-in-memory-journal-that-refuses-with-a-reason-and-reaches-the-daw-only-for-its-last-action.md) decision 4). The toast is not what decides whether an undo is allowed.
6. **Announcements use one live region.** `overlay.announce` writes to a single polite region the host renders with `aria-live`, outside any modal that hides the rest of the page, as [ADR 0048](0048-every-dialog-is-one-modal-shell-and-confirms-are-alert-dialogs.md) does for toasts raised from inside a dialog. A failure stays an error toast that stays until dismissed ([ADR 0075](0075-every-action-that-leaves-the-interface-acknowledges-within-100-ms-cannot-be-fired-twice-and-tells-the-narrator-when-it-ends.md) rule 5).
7. **Tests.** The service has unit tests for its state, and component tests that open each kind through it and check the primitive's own behaviour (focus return, Escape order, the alert role) is unchanged; the dialog aria snapshots do not change.

## Consequences

- A command can ask "Delete this?" and wait for the answer without a host component of its own, which the jump menu, the context menu host and leave guards need.
- Focus return, stacking and Escape order stay in one place per layer. A fix to a primitive fixes the service's overlays too.
- The service's state is a second source of "which overlays are open". It holds specs and callbacks only, never the open/closed truth of a primitive's own internal state. A spec that outlives its caller (a closed page) runs its callbacks against whatever is current, so a caller passes functions that do not capture a stale page.
- The mock's `popAt` and `popAbove` (a popover sized and placed from an element, in zoomed coordinates) are not part of the API. A popover anchored to a trigger stays a `Popover` with its trigger. Whether the service ever opens one without a trigger is decided when a slice needs it.
- To let the service import features or the store, or to give it its own rendering and focus handling, write a new ADR that supersedes this one.
