# 0790. Leaving the Booth while recording asks to stop the recording the app started, and a reading-only session keeps running

**Status:** Proposed (register row A10 in the [ADR register](../prds/studio-next-adr-register.prd.md), the rebuild PRD's A10; the owner accepts or rejects it on [#992](https://github.com/countrymanprime/narration-utils/issues/992))
**Date:** 2026-10-11
**Supersedes:** [ADR 0388](0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) decision 3, while a recording runs only. Amends [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md).

## Context

"A10" names two decisions in the Studio Next series. This ADR records the one in the [rebuild PRD's](../prds/studio-next-rebuild.prd.md) ADR conflicts table, row A10, "Leaving the Booth while recording asks to stop". The other is the register's DQ-5 row, tagged A10 in its working title, "Record arms the chapter's track and starts at the end of the last item"; [ADR 0791](0791-record-arms-only-the-chapters-track-and-starts-at-the-end-of-its-last-item-and-a-failed-precondition-shows-the-capabilitys-refusal-reason.md) records it.

[ADR 0388](0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) decision 3 says leaving the Booth by the nav, Back or a new chapter keeps the session running in the host. That was written for reading. With a DAW recording, it lets the narrator leave a page that shows no recording while the DAW keeps recording. [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) says the app stops only the recording it started, but names no moment at which the app asks.

The mock decides this in `docs/research/mockups/studio-next/src/state/commands/booth.ts`: a change guard (`setChangeGuard`) fires when the page changes away from a Booth that is recording. It asks "Stop recording?" with the DAW's name, confirm label "Stop and leave", cancel label "Keep recording", and focus on cancel. Confirm stops the take and replays the navigation; cancel stays. `tests/booth-daw.test.tsx` exercises it. The [Booth PRD](../prds/studio-next-booth.prd.md) ("Proposed Solution" item 3 and "Supersedes / depends on ADRs") says the same.

## Decision

1. **While a DAW recording started by this app runs, any exit from the Booth asks "Stop recording?" first.** The Booth registers a leave guard for as long as the recording runs. The nav, Back, a page change and Escape all pass through it. Escape is heard on the Booth's own root per [ADR 0388](0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) decision 2.
2. **Confirm stops the recording the app started, then leaves.** It uses the DAW stop that [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) decision 4 limits to the recording the app started, and then replays the navigation. Cancel stays on the Booth and the recording continues. The dialog's initial focus is Cancel.
3. **Nothing stops a recording the app did not start.** [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md)'s rule is unchanged. The wording names the DAW through its capability, not through a REAPER-only sentence.
4. **A reading-only session keeps [ADR 0388](0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) decision 3.** Leaving by the nav keeps the session running in the host, and the Booth picks it up on return. [ADR 0388](0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) decisions 1 and 2 are unchanged.

The mock's dialog title, body and button labels are the spec for the dialog's words. The host's stop path, the guard's registration and the tests are left to the Booth slice that builds them (SNO), per the Booth PRD.

## Consequences

- A take cannot be lost by leaving the Booth. The Booth PRD's metric is zero silent stops, with every exit while recording asking or blocked.
- A path that leaves a recording running with no way to stop it would contradict this ADR. That is the failure the Booth PRD says would prove it wrong.
- [ADR 0388](0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) stays in force for its other decisions and for reading-only sessions. Its Status line is not edited here; the Booth slice that lands the guard edits it, per the register's migration-period rule.
- [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) is extended, not replaced: it still decides arming, remembered arms and the stop-only-our-own rule.
- To change the rule, write a new ADR that supersedes this one.
