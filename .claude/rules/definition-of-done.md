---
paths:
  - "apps/ui/src/**"
  - "apps/desktop/**"
  - "integrations/reaper/**"
---

# Definition of done

"Done" has meant a happy path in a default position. The owner has found these in minutes: a context menu opened beside the sidebar was drawn under it; a project created outside the starting folder did not find the DAW project inside it; after linking a project and setting up the launcher, the Booth's setup notice never cleared and Record stayed off with no error and no way forward. Green CI only proves the tests that exist. These five rules say what has to exist.

Test everything, including what nobody expects: zero, negative, huge, empty, emoji and right-to-left text, a lizard asking for a beer, a pop tart in the floppy drive. If a state can happen, a test drives it or a reader can see why none does.

1. **Fix classes, not instances.** A bug the owner finds becomes a guard over its whole class.
   - **Overlays.** Every menu, popover, tooltip, dialog and slide-over is opened at each window edge and corner, beside the sidebar and the nav, over scrolled content, at narrow widths and while another overlay is open. Each must be the topmost element at its own points (`elementFromPoint`) and fully on screen.
   - **Paths.** Every feature that resolves a file runs one shared fixture set: a project outside the starting folder, nested, with spaces, with Unicode, very long, on a network path, in different case, with trailing dots or spaces, through a junction, read-only, missing.
2. **An independent narrator walkthrough comes before "done" and before merge.** A fresh agent is given the feature's purpose, never the diff. It drives the real app as a narrator would, tries to break it, and reports what it tried with screenshots. The coordinator does not merge without that report.
3. **Write the state matrix before the code.** For each control: empty, one, many, huge, loading, refused, failed, stale, long text, right-to-left and emoji text, rapid double-fire, reload mid-action, leave mid-action. For anything that talks to a DAW or other integration, also: the other side never answers, answers late, answers out of order, loses an event, repeats an event, has the wrong project open, has the wrong version, restarts mid-session. Each cell is tested, or marked "not tested" with a reason a reader can see.
4. **Say what was not tested.** A PR body has an "Exercised" and a "Not exercised" section. Anything unexercised is "unverified", never "done".
5. **A test is deleted only with a one-line statement of what behaviour changed.** A test that covers behaviour that still exists is ported, not dropped.

## Talking to an integration

Every control that depends on a DAW, a sidecar, a download or a file someone else can change follows these:

- No state without an exit. The narrator can always see what is missing and what to do.
- A reading that has gone quiet is shown as "can't tell, last heard N s ago", never as a stale fact.
- A visible **Check again** forces a fresh read.
- A setup notice shows what it is waiting for and when it last checked.
- A failed host call is visible somewhere. `silent` and `exempt` rows in `apps/ui/src/interactionFeedback/` carry a reason a reader can judge.
- State that can change is re-read on focus, on a timer while a notice is up, and on the events that carry it.
