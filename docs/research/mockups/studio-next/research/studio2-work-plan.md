# studio2: applying the approved repo-comparison items

Project: /tmp/claude-0/-home-user-narration-utils/af1a83ba-1a93-5f2f-9822-2dde169a851a/scratchpad/studio2 (a copy of studio at version 8; studio is the untouched restore point). Source of rulings: scratchpad/repo-compare-decisions.md (read it first, whole file). Detail on each item: repo-compare-bible-script.md, repo-compare-workflow.md, repo-compare-finishing.md (same folder), plus icon-audit.md for the icon vocabulary.

## Ground rules (owner, non-negotiable)

1. The mock must stay fully self-sufficient: no network, no real repo/DAW/engine hookup, still publishable as one HTML file (`npm run artifact`). Do NOT read or modify /home/user/narration-utils.
2. Mock plumbing only. Build the data model, selectors, commands, adapter interfaces and UI, but every "real" capability (speech engines, pronunciation lookup services, DAW calls, audio measurement, LLM parsing) sits behind a small adapter/provider interface with a mock implementation whose output comes from fixture data, never hard-coded inside logic or components. Think: a later real implementation replaces the mock provider without rebuilding screens. No hard-coded example data in logic or components (fixtures and mock-provider data files only). Existing rule: speakers derive from Story Bible aliases.
3. Only items the owner approved. Anything under "Deferred", "Maybe", "Need to see a mock first", "Rejected" or "Open" in the decisions file is OUT. If an item is ambiguous, implement the smallest faithful reading and list it in your report.
4. Keep every standing rule: custom primitives wrapping @base-ui/react (no raw controls; tests/no-raw-controls enforces), icon buttons with tooltips following scratchpad/icon-audit.md vocabulary (text only for primary CTAs/segmented/chips and the audit's explicit text conversions), no explanatory/assumption/draft notes on pages (use code comments), mock-only controls only in the Mock states panel, no horizontal scroll 860–1600, no double scrollbars, no invented content/capabilities, single book per app, Narrator not selectable as speaker, DAW-neutral wording (REAPER, built-in recorder, Audacity, others are capability-gated; do not hard-wire REAPER wording into shared UI).
5. Zod schema for anything new in the domain (types inferred), immer patches/undo through `act`, selectors return stable slices, registry pattern for keys/commands/context/search, wire the Mock states panel where a mock needs toggling.
6. TDD: write/adjust tests for each behaviour (core behaviours must be tested). Keep all existing tests passing; update a test only for an intentional change.
7. Verification before reporting: `npx tsc --noEmit`, `npx vitest run`, `SINGLE=1 OUT_DIR=dist-X npx vite build` then `APP_DIST=dist-X node e2e/overflow.mjs` must print "clean"; take screenshots of every page you changed at 1440x900 and 1250 (see e2e/shot.mjs, lib.mjs; scenarios via SCEN) into scratchpad/studio2-shots/<batch>/ and LOOK at them. Do not publish artifacts. Do not run vitest from any directory but studio2.
8. Report: per file what changed, each approved item -> done / partially / skipped with reason, test count, overflow result, and anything you assumed. Update studio2/ARCHITECTURE.md briefly for new modules.

## Batch A: Story Bible + Script

- Pronunciation sources (Story Bible entry names/aliases and the Script Words tab share the model): no query/confirmed workflow. A pronunciation has a `source` (e.g. auto-generated default, another supported source, manual entry) and the narrator can override. Provide a provider interface listing sources and returning a candidate pronunciation per word; the mock provider reads from fixture data. UI: the current value shows an icon for its source plus the source name; a control picks a different source (data-driven list) or enters manually; overriding is allowed and reversible. Remove any "query sent / confirmed / researched" status concepts for names/aliases (keep threaded notes on passages as they are).
- Merge on alias collision: when an alias is added that already belongs to another entry, offer "Merge into this entry" (combines aliases, relationships re-pointed id-keyed, appears-in union, undoable). No alias split.
- Drafts: a new entry created but not saved is dropped on Cancel (no empty entries left behind).
- Sort the Story Bible list (name, type, chapters-count) with a control following the primitives; remember choice in ui state.
- Alias counts (count of aliases shown per entry in the list/row).
- Speaker chips/swatches: per-speaker colour (derived from the entry, with a stable palette assignment in a selector; entry-level colour override in the editor optional if tiny) used by Script phrase chips, Booth chips and the speaker picker.
- Needs attention / review for imported items: entries/aliases that arrived from the manuscript import are flagged "Needs review" until the narrator reviews them (mark reviewed); filter + count; mock import data flags some fixture entries (fixture data, not logic).
- Appears in: chapters only. Show the chapters an entry appears in (count of chapters, not lines or mentions) with a button per chapter / "Go to chapter" that opens it in Script. Remove line/mention counts everywhere in Story Bible UI.
- Script: no other changes (all other Script items are "keep ours"). Do NOT add stale-anchor detection, query/confirm, repo markup, prep completeness, speaker coverage strip, find results for chapters, or prep sheet export.
- Tests: pronunciation source/override, merge, draft drop, sort, alias counts, speaker colour stability, needs-review flow, appears-in chapters.

## Batch B: Production + Schedule (and the placeholders)

- Deadline tone from days left (neutral > a week, warn <= a week while unfinished, danger past, success when finished); the projection can only worsen it and only from real inputs.
- Next up ranking: keep ours, adopt the repo's group order as the tie-break (in progress and not ready first, other in progress, ready to confirm, not started; least advanced stage first).
- This week card: remove every hard-coded figure ("6:00 / 8:00", "3:05 recorded"); derive from fixture/mock data through selectors; where there is no source show a "not measured yet" state. No time tracking (deferred).
- Delivery date + contracted amount: add payment type (per finished hour, royalty share, none/unspecified). The effective-rate style figure must not appear when there is no per-finished-hour rate (the "no PFH rate" case). Editable on Schedule/Production where the due date is edited today.
- Schedule: milestone note, milestone measure/estimate (estimate only when tied to a measure), done flag; make sure they exist and are tested. "15-minute checkpoint" as a milestone template offered in the add-milestone flow (a template list in data, not hard-coded; when chosen it is a measured milestone).
- Recording check on Production: result stored with "as of last save" and a stale state when the (mock) project/text changed; checks Pickups already has are shared data.
- Placeholders: replace ROOM_TONE_LABEL, `actualSeries`, the `sessionMinutes` formula and any remaining constant stand-ins with values derived from mock data via a provider, or "not measured yet" when there is no source. WPH/RATIO/PACE stay as fixed inputs (settings-like constants in one config module, not scattered), nothing derived from a time log.
- Out: finished-hour standard comparison, stage readiness suggestions, status report, pace inputs, time tracking, PFH/effective rate from a log.
- Tests for each.

## Batch C: DAW plumbing, Booth, Proof, Pickups, Editing

DAW state (DawAdapter, mock implementation only):
- Capability model: `DawCapabilities {daw, reachable, caps: {name: {level, available, reason?}}}` for daw in reaper | builtin | audacity (+ extensible); mock data per setup in one data module; replace string-returning methods with a `DawResult {ok, changed, message, undoSteps, refused?: reason}`; controls show the refusal reason from the capability, never their own wording. Saved-vs-live project state (`savedAt`, `unsavedChanges`, play state) feeding "as of last save". Stable item/take identity (guid-like ids) with a stale refusal path. Pickup markers (`PICKUP:`/`PICKUP_DONE:` semantics) as the DAW-side truth with the app done-state writing through and reconciling on open (mock).
Booth:
- Leaving the Booth while recording (Esc, navigation) asks to stop recording (confirm dialog) or stops the DAW recording and then leaves; no silent stop.
- Punch-and-roll: roll while recording keeps the previous audio as a take; where the active DAW capability says the roll is destructive (mock: audacity without backups), require a confirmation; with the Audacity backups mechanism (Editing section) it is non-destructive.
- Record preconditions: Space stays one action; one chapter = one track; only the chapter's track armed; recording always starts at the end of the last item on that track unless the narrator explicitly punches; when a precondition fails the Record control shows the refusal reason (from capability/DawResult).
- Credits in Booth: every spoken part of the book, including opening and closing credits, can be recorded (check the fixture/units: if credits are not in the manuscript units, add them as data-driven spoken sections of the chapter list/units).
- Resume point state (mock): remember the last-recorded position per chapter and offer "Resume at ¶ n"; automatic suspected flags (restart/skip) coming from the mock speech provider feeding Pickups with `src: 'speech'`, dismissible; no manual flag UI. Check F11 fullscreen toggle exists in Booth (add via the registry if missing). Foot pedal start/stop only (verify it is only start/stop).
Pickups + speech check:
- Confidence nullable with a reason (never fabricated); check results stored with model/basis and stale detection; gap taxonomy (missing, extra words, misread; an unread start/end is unfinished recording, not a pickup); the offline Check recordings dialog lists engines reported by the (mock) host provider, Moonshine is live-only in the Booth, offline engines are Whisper-class; pickup list points to the Booth only (no punch/cursor actions on Pickups).
Proof:
- Two counters: decided and cleared; Proof % cannot read 100 while pickups are open; a note is open until fixed or dismissed/waived (Deferred and Needs-pickup-not-redone are open).
- Decision history (append-only audit list per note) and the stale decision guard (note has an evidence key; if the mock re-check changes it, decisions on the old evidence are refused with what changed shown, typed note kept).
- Sort notes by confidence/severity and a Sources line; Add marker to the DAW goes through DawResult with a kind-prefixed label; full chapter player: DEFER (not now).
- Out for now: recording check card and takes-on-Proof (sketched, not yet ruled).
Editing (takes):
- "Hide other takes" (mute, one undo, non-destructive) replaces "Remove other takes"; never delete.
- Evidence per take (words matched, longest pause, level, noise floor/clarity as measured by the mock measurement provider) and a suggested take with an honest confidence (null/low while takes are not level-comparable). Suggest prep steps first (trim white space, trim breaths, normalise) and re-score after they are applied; suggestion never auto-applied; the narrator decides.
- Passage map written by the Booth at record time (pid, word, seconds, item/take ids) so Editing lists passages from the log; alignment fallback only for takes recorded elsewhere (mock flag on takes).
- Split duplicate reads into takes (including making the edit in the DAW when the capability is available).
- Audacity: clip-takes backed by a backups table: before a punch or edit, the original audio around the punch (about 1–2 minutes either side, window length is a setting) is cloned to a backups list with rollback/restore, with a retention setting; Audacity 3 only (Audacity 4 listed as a future capability, not implemented).
- Out: FX chains on master/track/take (research only, awaiting owner decisions).
Tests for each behaviour; update existing tests intentionally changed (Remove other takes, silent stop on leave, etc.).
