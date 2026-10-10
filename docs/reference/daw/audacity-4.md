# Audacity 4.x: what the app can and cannot do

As of 2026-09-28 (the date of the research) Audacity 4 has no scripting interface the app can use, so the adapter reaches nothing there and reports Audacity as not reachable (the narrator's sentence says Audacity 4.0 has no scripting pipe). This page records why; the evidence is in [the Audacity 4 spec research](../../research/audacity-4-scripting-spec.md).

## What the sources say

- **The 4.0.0 release notes list the gap.** "Macro Manager and the scripting pipe" are named among the Audacity 3 features not available in 4.0, with the note that work is planned to add them in future releases.
- **No build contains a pipe.** Not 4.0.0, not the unreleased 4.0.1 branch, and not master as of 2026-09-25.
- **A 4.1 "script host" is planned with no written protocol**, so there is nothing to build a client from.
- **Sources read:** the `audacity/audacity` repository (release notes and source at three refs) and the `audacity/audacity-manual` repository. Audacity's own manual, forum, wiki and support sites were blocked from the research environment, and nothing was run in Audacity 4.

## What follows for the app

| Question | Answer |
| --- | --- |
| Which capabilities work on Audacity 4.0? | None. The matrix shows "Not reachable" in every row of its Audacity 4.x column |
| Does `macro_render` work? | No: its scripting pipe and Macro Manager are both on the not-available list |
| What does the app do on an Audacity 4 install? | The adapter reports not reachable; the narrator is told that Audacity 4.0 has no scripting pipe |
| What would change this? | A published 4.x scripting interface. It would be a new `Transport` for the same client, and possibly a new command dialect ([ADR 0355](../../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md)) |
| Can the launcher still start Audacity? | The Start Menu entry starts the app with `--daw Audacity`; nothing Audacity loads can start a program ([ADR 0145](../../adr/0145-the-audacity-launcher-is-an-installer-start-menu-entry-and-a-picker-switch-keeps-an-audacity-launch.md), [launcher feasibility](../../research/audacity-launcher-feasibility.md)) |

## Not verified

Whether a nightly or alpha build contains a scripting interface after 2026-09-25 has not been checked. Re-read the research page's "Not verified" list before relying on this one for a newer Audacity release, and update both.
