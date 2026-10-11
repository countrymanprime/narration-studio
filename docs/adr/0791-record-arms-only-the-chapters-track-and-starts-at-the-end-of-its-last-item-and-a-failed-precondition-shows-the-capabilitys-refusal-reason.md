# 0791. Record arms only the chapter's track and starts at the end of its last item, and a failed precondition shows the capability's refusal reason

**Status:** Accepted (owner ruling 2026-10-11; register row DQ-5 in the [ADR register](../prds/studio-next-adr-register.prd.md), tagged A10 there)
**Date:** 2026-10-11
**Supersedes:** [ADR 0380](0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md) to the extent of its separate arming click. [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) and [ADR 0249](0249-read-aloud-asks-reaper-once-whether-the-chapters-linked-track-is-the-one-track-armed.md) stand except where the mock's Record differs.

## Context

"A10" names two decisions in the Studio Next series. This ADR records the register's DQ-5 row, "Record arms only the chapter's track and starts at the end of the last item; Space stays one action; a failed precondition shows the capability's refusal reason". The other, the rebuild PRD's A10, is leaving the Booth while recording, in [ADR 0790](0790-leaving-the-booth-while-recording-asks-to-stop-the-recording-the-app-started-and-a-reading-only-session-keeps-running.md).

[ADR 0380](0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md) makes arming "a separate click from Play": the host sends `ReadAloudArmOnly` only from an "Arm `<chapter>` only" button, and `RecordStart` refuses with `not_armed`, `other_armed` or `several_armed` when the track was never armed. [ADR 0249](0249-read-aloud-asks-reaper-once-whether-the-chapters-linked-track-is-the-one-track-armed.md) compares the REAPER state with the chapter's one linked track and answers one of those statuses. [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) decision 3 records only when exactly one track is armed, the named one.

In the mock, `recordStart` in `docs/research/mockups/studio-next/src/state/daw.ts` checks `recordCheck(chapterId)`; a refusal comes back as the capability's reason. Otherwise it arms only the chapter's track, remembers the earlier arms and records from `recordStartAt`, the end of the last item on the track, or from the punch time when the narrator punches. `recordStop` puts the earlier arms back. `src/pages/Booth.tsx` shows `recordRefusal(chapterId)` as the reason on the Record control, and `startTake` in `src/state/commands/booth.ts` toasts it. `tests/booth-daw.test.tsx` and `tests/d2-booth.test.tsx` cover this. The [Booth PRD](../prds/studio-next-booth.prd.md) ("Proposed Solution" item 2) states the same.

## Decision

1. **Record is one action that arms and starts.** It arms only the chapter's track and starts recording; there is no separate "arm only" click. [ADR 0380](0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md)'s separate arming click is superseded and is removed with the old Booth.
2. **A take starts at the end of the last item on the chapter's track.** The exception is a punch the narrator asked for. Nothing already recorded is overwritten by a plain Record. A punch inside the recorded part asks first where the DAW would lose the audio it covers (per the Booth PRD, "Roll and punch").
3. **The arms the narrator had are put back when the recording ends.** This is [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) decision 2, which stands.
4. **A failed precondition shows the capability's refusal reason on the Record control.** One selector over the DAW's capability, the project and the chapter's track state returns nothing or a refusal. The control shows that reason and does not word its own. The names `not_armed`, `other_armed` and `several_armed` are no longer reasons a narrator meets, because Record arms the track itself; the refusals that remain come from the capability.
5. **Space stays one action.** Space does what the Record or Play control it is bound to does; it does not become a chord of arm, then play.

What of [ADR 0380](0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md) is not named above (the `record_in_reaper` setting and its project scope, the bindings' callers through `dawport`, stopping a recording on quit) is left to the Booth slice (SNO) to keep or remove with the old Booth. This ADR does not decide it. How the host sequences the arm and the start is also left to SNO. [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) decision 3 ("exactly one track is armed") and [ADR 0249](0249-read-aloud-asks-reaper-once-whether-the-chapters-linked-track-is-the-one-track-armed.md)'s comparison differ from the mock's Record only in that sequence.

## Consequences

- The narrator cannot start a take on the wrong or on several tracks, and no longer needs a separate click to make a track ready.
- The refusal wording comes from the capability, so it stays right for a DAW that is not REAPER.
- [ADR 0380](0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md) and the parts of [ADR 0232](0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) and [ADR 0249](0249-read-aloud-asks-reaper-once-whether-the-chapters-linked-track-is-the-one-track-armed.md) that differ stay in force for the old Booth until the owner accepts this ADR and the Booth slice lands. Their Status lines are not edited here.
- To change the rule, write a new ADR that supersedes this one.
