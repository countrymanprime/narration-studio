# Owner rulings from the repo comparison

## Repo comparison: owner rulings (Story Bible and Script)

Rule: nothing from the repo is merged until every page is reviewed. Only things 100% confirmed as an improvement. Anything not called out stays on the maybe list.

### Agreed (to build later, after all pages are reviewed)

- Pronunciation: no query/confirmed workflow. Status is just auto-generated vs selected. Several sources; a default is taken, the narrator can switch to another supported source or enter it manually; an icon (and the source name) shows which was used; overridable.
- Merge on alias collision (Story Bible).
- Drop an unsaved new entry on Cancel (drafts).
- Sort the Story Bible list.
- Alias counts.
- Relationships stay two-way (ours).
- Speaker chips / swatches (per-speaker colour).
- Needs attention / review for imported items.
- Separate talk / act / know fields are fine; populating them needs manuscript parsing (later, LLM).
- Core-behaviour tests.
- Appears in: chapters only (count of chapters mentioned), no line/mention counts; add a button to go to that chapter.
- Script: keep threaded notes (not the queries / author replies), Ctrl+F as is, text settings, speaker picker, manual prep state and its headers, markup types, context menus, our custom markup.
- Possible chapter bookmarks (maybe; line bookmarks were removed earlier).

### Rejected

- Query / confirm for names and aliases.
- Stale-anchor detection (replacing a manuscript clears everything).
- Repo stress/breath/pause markup and slash annotations; keep our custom marks.
- Evidence excerpts.
- Per-chapter derived prep completeness / derived prep progress.
- Chapter results in Find (jump menu covers chapters).
- Speaker coverage strip (the speaker picker is best).
- Prep sheet export.

### Maybe list (not discussed; revisit)

- Additional properties / LLM-parsed info (leave off for now).
- Click-through counts everywhere.
- Live selectors (owner asked what this meant).
- Name-row component shared across lists (tied to the appears-in decision).
- Rail editing vs Story Bible-only editing; Series tab dropped (one book per app).

## Production page rulings

### Agreed (build later)

- Finish date: keep our fixed inputs.
- Deadline tone: use days left.
- Plan chart: keep, mostly depends on getting timing right.
- Pipeline cells open the stage.
- Next up ranking (adopt repo group order as tie-break).
- This week card (drop invented numbers; source them).
- Delivery date + contracted amount (agreed "I think").
- Recording check (stale / "as of last save").

### Need to see a mock first

- Finished-hour target: standard-value comparison (e.g. words per hour standard vs the narrator's own).
- Stage readiness (Confirm / Dismiss / Revert suggestion on the current-stage cell).
- Status report export.

### Deferred

- Time tracking: stage timer, hours log, PFH, effective rate, hours by stage. Later version, once we know how people use the app. (Pace/ratio inputs that were to come from the log stay as fixed inputs until then.)

## Schedule page rulings

### Agreed (build later) (Schedule page rulings)

- Schedule page: keep ours.
- Milestone note.
- Milestone measure / estimate.
- Done flag on milestones.
- Contracted amount, but payment type varies on ACX (per finished hour, or royalty share): there must be a "no PFH rate" case.

### Agreed with conditions

- 15-minute checkpoint: only as a template (not all platforms use it); when selected, we measure it.

### Need to see a mock first (Schedule page rulings)

- Pace inputs (what feeds the pace/ratio figures now that time tracking is deferred).

## Booth rulings (numbers follow repo-compare-workflow.md section 3)

### Agreed (build later) (Booth rulings)

1 voice following (real app tracks; mock keeps a stand-in), 2 auto-stop at end, 3 hand scroll, 4 click a word, 5 sentence phrase navigation (keep ours), 6 speaker chips, 7 suspected flags, 8 resume point (mostly real-app logic; mock the state), 10 built-in recorder, 12 levels, 13 foot pedal, 14 pickup session in Booth, 17 F11.

### Agreed with conditions (Booth rulings)

- 9 Record in the DAW: any supported DAW, not just REAPER. Applies to most DAW interactions, so wording and capabilities must be DAW-neutral (capability-gated per DAW).
- 11 Punch and roll: depending on the DAW it can be destructive, so it may need a confirmation. REAPER can create a take automatically and the bridge can be made to behave that way.
- 15 Credits in Booth: every spoken part of the book, including opening and closing credits, can be recorded in the Booth.
- 16 Leaving the Booth while recording: confirm ("Stop recording?"), or actually stop the DAW recording, so the take does not capture the narrator losing their place. Replaces today's silent stop on Esc / page leave.

## Proof rulings (numbers follow repo-compare-workflow.md section 4)

### Agreed (build later) (Proof rulings)

1 waveform (real peaks), 2 notes list (sort + sources line), 7 threads (anywhere; between collaborators or with yourself), 9 full chapter player (replay of the booth session with pickups visible in the script, word follow, speed), 11 add marker to the DAW (labels matter where there is little room), 14 native takes, 16 delivery checks as notes.
- 13 takes UI lives on Editing. Wants to see how multiple takes on the same spot show on Proof.

### Agreed with conditions / to see

- 3 Automatic detection of pickups and other issues is wanted (misreads, background noise, breaths...): the app suggests, the narrator acts or ignores; manual override always. (Pre-selected suggested decision word per category is consistent with this.)
- 4 Stale decision guard: agreed (re-scan changes the evidence -> don't silently apply the old decision).
- 5 Decision history (audit): fine.
- 6 Open vs closed: anything not fixed or dismissed/ignored/wontfix stays open (so Deferred and Needs-pickup-not-yet-redone are open). Proof % to count cleared, not just decided.
- 15 Recording check card: agreed, needs a mock.

### Unclear to owner / maybe

- 8 Play +-3 s (explained: plays 3 s before and after the note from the raw recording).
- 10 Go to / loop by item id (explained).
- 12 Proofer CSV import/export: purpose unclear; stays maybe.

## Pickups and speech check rulings (numbers follow repo-compare-workflow.md section 5.3)

### Agreed (build later) (Pickups and speech check rulings)

1 source of pickup list (keep ours: speech + audio + proof + by hand), 3 done state, 4 pickup to chapter, 6 auto-mark recorded, 9 confidence, 10 check results stored and stale.
- 7 Speech engine: Moonshine listens to the mic live, so it belongs in the Booth only (keeps the teleprompter following, spots a mess-up). Whisper (or a similar tool) runs after as the confirming pass a few seconds later and marks pickups. A standalone recording check uses Whisper or a similar tool. Picker data-driven by what the host reports.
- 8 Gap taxonomy: translate missing / extra words compared with misread from the repo into the mock; (unread start or end is unfinished recording, not a pickup).
- 11 Restarts / duplicate reads: keep our Editing takes section, translate the ability to split duplicate reads into takes, including making the edit in the DAW when possible.
- 12 Punch from here: Pickups only points to the Booth; the narrator decides in the Booth when to punch and how much to redo (background noise, vocal differences...). No cursor-move / punch on Pickups.

### Deferred (Pickups and speech check rulings)

- 2 Proofer CSV: if anything, a proofer packet sent to and imported by a companion app; later.

### Not clear to owner

- 5 Session assembly (explained: how a pickup session is put together from the list).

## Companion ruling

- Deferred entirely. The original idea was not how it was built. Revisit once device sync on a local network is worked out: possibly two apps talking to a shared, self-hosted server on the local network. Not needed yet. (Our mock's Companion page and the repo's always-on-top window are both parked; nothing to translate.)

## DAW state rulings (repo-compare-workflow.md section 7.2): "agreed"

Agreed (build later): capability model with reasons (DAW-neutral: reaper / builtin / audacity / others, per-capability availability and refusal reason; replaces string toasts with a result object), GUID identity + stale refusal, saved vs live project state ("as of last save"), one undo block per command with undoSteps, pickup markers as DAW truth, regions (later), take choose/add/lane by offered id, Zod contract + mock per DAW result/event.
Treated as still open (they carry a caveat the owner has not ruled on explicitly): app undo reaching the DAW (unverified, needs a spike), dropping removeTakes (delete) in favour of hide/mute, dropping Audacity clip-takes until a source is confirmed.

## Takes, restarts, punch and roll (repo-compare-workflow.md section 8): "agree, except where already answered"

Agreed (build later): 1 roll as one DAW command / one undo step, keeping the previous audio as a take (earlier ruling applies: DAW-neutral, may need a confirmation where the DAW would be destructive; REAPER can auto-create the take), 2 Booth writes the passage map at record time so Editing lists passages exactly (alignment only for takes recorded elsewhere), 3 evidence per take (words matched, longest pause, level vs neighbours) instead of a ranked "suggested take", 4 "Hide other takes" (mute, non-destructive, one undo) replaces "Remove other takes"; deleting is left to the DAW.
Already answered earlier (stands): duplicate reads can be split into takes incl. making the edit in the DAW when possible; Pickups only points to the Booth; the narrator picks where to punch.
Open: 3 vs the owner's wish for suggestions (pickups are suggested, takes are not pre-chosen: confirm that takes get evidence only, no suggested winner); 5 Audacity clip-takes (not drawn until a source/spike exists).

## Owner follow-up on takes and Audacity (supersedes the open items above)

- Suggested take: YES. The app suggests a take from what it can measure (background noise, clarity, RMS levels, etc.); the narrator decides. Because takes recorded at different levels are not comparable, the app also suggests the prep steps first (trim white space, breaths, normalise) and the confidence of the suggestion improves after them (confidence is stated honestly; null/low until takes are comparable). A suggestion is shown with its evidence, never auto-applied. (Replaces "evidence only, no winner" in the section 8 ruling.)
- Audacity: target 3 now. Audacity 4 is out, scripting not yet available there; revisit when it is (owner expects non-destructive takes in 4; not verified). For 3, non-destructive behaviour comes from cloning the original audio around a punch (about a minute or two before and after, not the whole track) into a backups table, so a punch can be rolled back later. Clip-takes for Audacity are therefore in, built on that backup mechanism.

## Conflicts table (repo-compare-workflow.md section 9): owner pass

1 non-destructive editing: answered (hide/mute, never delete; Audacity 3 via backups).
2 Audacity clip-takes: answered (clone around the punch into a backups table; Audacity 4 may support takes natively).
3 Moonshine: answered (live in Booth only; Whisper-class for confirm and standalone checks).
4 Foot pedal: answered (start/stop only).
5 Flag for edit in Booth: answered (no manual flag; automatic suspected flags only).
6 Wheel browse: answered (hand scroll keeps the reading position).
7 Cleanup in Editing: confirmed. Editing owns cleanup plus take prep (trim white space, breaths, normalise), take suggestion, backups.
8 Schedule milestones: answered (measure / estimate, template for 15-min checkpoint).
9 Proof %: answered (cleared vs decided; open until fixed or dismissed).
10 Esc exit: answered (confirm "Stop recording?" or stop the DAW recording).
11 Punch while recording: answered (confirm where destructive; take kept).
12 Companion: deferred.
13 App undo reaching the DAW: NOT explicitly ruled; recorded as needing a spike. (Owner believes it was covered; confirm.)
14 Record preconditions (NEW RULE): Space stays the one action. Workflow is 1 chapter = 1 track. Only the chapter's track is ever armed; recording always starts at the end of the last item on that track so nothing is overwritten, unless the narrator explicitly punches. Show the refusal reason on the Record control when a precondition fails.
15 Fixture numbers: partly ruled (This week numbers dropped/sourced). ROOM_TONE_LABEL, actualSeries and sessionMinutes still unruled: default is replace with derived values or "not measured yet".
16 Take suggestion: answered (suggest from measurements, narrator decides).

## Editing page: script-based audio editing (owner ruling)

- Build design E (script as the editor: takes as sub-lines under each passage, slim waveform ribbon under the active line, right-click menu with Delete words and audio / Add FX). Fold in G's floating selection toolbar and Clean up + FX drawer, and keep F's synchronized timeline strip (take lanes on a shared axis) as an optional strip at 1360+ wide. Designs A-D are declined. F's two-pane layout is not used.
- FX exception: FX may be applied to a selected range of words (split at the range, apply the DAW's own saved FX chain/plug-in to the resulting item). This is an exception to the repo ADR 0234 (chains only on tracks/master; single plug-ins on a passage). Chains come from the DAW's own saved chains (data-driven), confirmation with preview first, one undo step, capability-gated (REAPER native, built-in effects, Audacity macros/effects on selection with backups).

## Sketch review (production-sketches.html): owner rulings

- Finished-hour target: NOT a new strip/tile. Add an info affordance (icon) beside the existing estimated-time-left figure; on hover/click it shows standard (9,300 w/h) vs the narrator's own pace and the breakdown. Takes no space.
- Stage readiness: approved as sketched.
- Status report export: approved as sketched.
- Takes at a flagged spot (Proof): approved as sketched.
- Recording check card (Proof): approved as sketched.

## Maybe-list pass (owner)

- LLM-parsed Story Bible properties and talk/act/know fields: research what can do this (the repo has something similar; unknown quality; look for better options). Research only for now.
- Chapter bookmarks: YES (quick movement between spots; a bookmark can carry a note saying what the mark was for). Build in the mock.
- Click-through counts, live selectors: owner did not understand the terms; explained in chat (click-through = clicking a count in the chapter facts line opens the matching list; live selectors = counts computed on the fly rather than stored/rescanned). Stay parked.
- Shared name-row component; Words tab say-value editing in the rail: come back later.
- Script reader Replace manuscript icon: moved to Settings only (done).
- Proof full chapter player: skipped (Editing plays the whole chapter). Tone-match clip and print pickup script: not requested. Marker confirm on Proof: not wanted unless the owner says so (kept one-click). Undo reaching the DAW: owner QA step later.

## Small decisions (final)

- Stack-retries default: decided by the new script-based Editing design (E); check how E presents retries when it lands.
- Proof full chapter player: skip (Editing plays the whole chapter).
- Tone-match clip, print pickup script: left out for now.
- Proof marker confirm / accepted-only gate: left out (one-click Add marker stays).

## Story Bible extraction (owner direction)

- Assume extraction will exist with varying success. Anything with confidence under 75% must be verified by the narrator (Needs verification); 75%+ is accepted but remains reviewable.
- Research local LLMs (no external LLM required by default; do not mine user data).
- Provide import of a spreadsheet (CSV) or JSON blob so a user can run their manuscript through any LLM they choose and bring the result in.

## Extraction tools: distribution decision (owner)

- App is open source (AGPL-style), not sold; narrators earn money with it, but the tools are only used to identify character entries: weight licence of BookNLP not treated as a blocker.
- BookNLP and GLiNER are optional components the user chooses to download, on first use of Story Bible scanning or in Settings (consent screen: what, size, source host, licence note; progress; remove). Not bundled in the installer.
- Tier order: rules baseline -> optional download (GLiNER + BookNLP) -> local LLM later -> bring-your-own import (CSV/JSON) available throughout.
