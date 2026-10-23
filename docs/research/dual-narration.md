# Dual narration: two narrators, one book

Dated 2026-10-23. Research for item 37 of [#2251](https://github.com/countrymanprime/narration-studio/issues/2251). **Question:** how should the app handle a book that two narrators record, in three modes: alternating chapters; one designated narrator for the narration plus voices assigned by character gender; and per-character overrides (one character the second narrator does better)?

**Method:** read the code and guides on `main` at `063dc83`; searched the web for how ACX and other platforms treat more than one narrator. **Limits:** `help.acx.com` and `www.acx.com` could not be fetched from the build environment (DNS failure on 2026-10-23, as already recorded in [ACX delivery requirements](../reference/acx-delivery-requirements.md#sources)), so the ACX points in section 2 come from search-result summaries, not from the pages. Each is marked, and reading the pages is **pending the owner**. Nothing here is built or measured. The sizes in section 7 are the author's estimates.

**Verdict:** build alternating chapters first. It needs a narrator roster, a chapter-to-narrator rule and a "who is at the mic" switch, and it leaves the one-track-per-chapter model alone. Gender voices and per-character overrides put two narrators inside one chapter file, which means splicing; that is the expensive half and should wait for the owner's answers in section 6.

## 1. What the app models today

### Narrators: one name, no entity

| Where | What it holds | Source |
| - | - | - |
| Setting `General.narrator_name` | One text value, the default for the `[Narrator]` credits token | `src/studio/desktop/app.go` (setting list), `src/studio/desktop/creditsbindings.go` |
| Project credits values | `Values.Narrator`, a string that overrides the setting for one project | `src/studio/desktop/internal/credits/values.go` |
| Credit templates | Shipped bodies end "narrated by [Narrator]" / "Read by [Narrator]" | `src/studio/desktop/internal/credits/templates.go` |
| Project manifest | `project.json` has a name, a single linked DAW project, credits, deadline, one `Payment` and one `ContractedAmount`. No narrator list | `src/studio/desktop/internal/project/manifest.go` |

A narrator is a string used to fill a credit. Nothing in the host or the UI knows who recorded a chapter, a line or a take.

### Voices, characters and the Story Bible

- **Characters** are Story Bible entities (`ManuscriptGuide/manuscript_guide.json`, [data-files.md](../reference/data-files.md)). A type has a `speaks` flag; entries of a speaking type can have a speaker colour (`src/studio/desktop/internal/guide/types.go`, `SetTypeSpeaks`).
- **Gender** is not a field. It exists as a free `Gender` property (`Female` or `Male`) that BookNLP extraction offers (`src/studio/desktop/internal/extractionport/booknlp/booknlp.go`, `GenderKey`, `GenderValues`). The [BookNLP spike](studio-next-booknlp-spike.md) says it ships behind "not yet available", so for now a gender is whatever the narrator types into an entry's properties.
- **Dialogue cues** are the speaker data: each quoted span has `chapterId`, `paragraphId`, `quote_start`, `quote_end`, `speaker_entity_id`, `speaker_source` and `corrected` (`DialogueCue` in `src/studio/desktop/internal/guide/service.go`). A cue the narrator corrected survives a rebuild (`CorrectCue`). Three or more speakers in a scene, or no tag, stay `unknown` ([Story Bible guide](../guides/using-the-app/story-bible.md)).
- **Voice samples** are clips of "how a character sounds", keyed by character id, with the reserved id `narration` for plain narration (`NarrationCharacterID` in `src/studio/desktop/internal/voicesample/voicesample.go`; 20 per character; `voice-samples/samples.json`). The Booth speaker picker plays them ([Booth guide](../guides/using-the-app/booth.md#voice-samples)).
- **Approved references** are regions of the REAPER project approved as a character's reference, again with `narration` as a subject (`src/studio/desktop/internal/character/character.go`). Continuity baselines are built per subject (`src/studio/desktop/internal/continuity/analyze.go`, `SubjectStatus`).
- **Series voice bible** lists a character's approved clips across the books of a series, labelled by book (`src/studio/desktop/internal/series/voicebible.go`).

Voice here means a character's sound as the one narrator performed it. No "voice" belongs to a person.

### Chapters, tracks and the pipeline

- A chapter has an id and a status of five stages (`src/studio/desktop/internal/stages/`); notes live in `manuscript-notes.json` (`src/studio/desktop/internal/manuscript/reader.go`).
- A chapter links to exactly one REAPER track by `ChapterID` and `TrackGUID` (`src/studio/desktop/internal/chaptersync/plan.go`; [Production guide](../guides/using-the-app/production.md#a-chapters-track)).
- **Production** logs timer sessions by chapter and stage with no narrator field (`Session` in `src/studio/desktop/internal/production/production.go`).
- **Schedule** has one deadline, one payment type and one amount (`Plan` in `src/studio/desktop/internal/production/plan.go`). Work left is words ÷ 9,300 per finished hour, then fixed multiples, at one pace of 1.5 hours a day ([Schedule guide](../guides/using-the-app/schedule.md#how-it-is-worked-out)).
- **Booth** reads one chapter's text and records it as one take stream. Its "Voices in this scene" panel lists characters, not narrators ([Booth guide](../guides/using-the-app/booth.md)).
- **Recording check** (`src/studio/desktop/internal/coverage/`) compares a chapter's recording with the whole chapter's text, so a line another narrator read would count as missing.
- **Proof and Pickups** list findings and lines by chapter and paragraph (`src/studio/desktop/internal/pickuplist/pickuplist.go`, `Pickup`); none says who read the line.
- **Master & QC** measures each file against one delivery profile and draws **Book consistency**, the spread of the files' RMS (`docs/guides/using-the-app/master-and-qc.md`). Mastering aims at the middle of the profile's RMS window for every file (`src/studio/desktop/internal/mastering/targets.go`).
- **Delivery** packages one file per chapter plus credits and a retail sample (`src/studio/desktop/internal/packager/packager.go`); the profile's rules, such as `acx.rms` and `acx.room_tone_tail`, are per file ([ACX delivery requirements](../reference/acx-delivery-requirements.md#rules)).

### What assumes one narrator

1. The credit string (`credits.Values.Narrator`, `[Narrator]`).
2. One payment and amount per book, and one pace in the Schedule estimate.
3. Chapter to track is one to one.
4. `narration` is one reference subject, one sample subject and one continuity baseline.
5. The recording check expects every word of the chapter in the recording.
6. Booth progress, Production sessions, Pickups and Proof carry no narrator.
7. **Book consistency** and mastering treat the book as one voice and one room.

Not an assumption: `acx.consistency` (consistent sound and formatting) is "Listen", unverified wording ([ACX delivery requirements](../reference/acx-delivery-requirements.md#rules)). Per-file checks stay valid with two narrators.

## 2. How audiobook production handles more than one narrator

**Confidence:** search-result summaries only; the ACX pages are unread (pending the owner).

- **Two formats.** ACX's blog "It Takes Two: Dual & Duet Narrations are Spicing up Romance" (linked under Sources) is summarised in search as: *dual* narration trades off by chapter or point of view, which suits narrators who cannot share a space or schedule; *duet* narration splices lines recorded apart into one scene, is slower and costs more. The same summary says the narrators should swap sample chapters so a shared character sounds alike in both voices.
- **Contract shape.** ACX's help article (linked under Sources) is summarised as: an ACX contract supports one rights holder and one producer, so a second narrator is arranged off the site, or a producer or studio with a roster supplies the voices; with two narrators ACX recommends Pay-for-Production over royalty share. This reaches the Schedule: one `Payment` and one `ContractedAmount` cannot describe two payees.
- **Pay by share of the book.** One search result suggests splitting per-finished-hour pay by word count. It is a forum-grade source (a [KBoards thread](https://www.kboards.com/threads/audiobook-questions-edit-dual-narrators.253247/)); treat it as a common practice, not a rule.
- **Per-file rules do not change.** ACX's file rules apply to each uploaded file whatever the number of narrators: one chapter or section per file, a file of 120 minutes or less, RMS −23 to −18 dB, peak −3 dB, noise floor −60 dB RMS, room tone at head and tail ([repo's recorded rules](../reference/acx-delivery-requirements.md#sources); numbers from forum and guide sources there, the head figure conflicting). A chapter with two narrators in it is still one file and is judged as one.
- **Credits.** The repo records ACX's opening and closing credits as separate files ([ACX delivery requirements](../reference/acx-delivery-requirements.md#sources)). A search summary of the ACX help page says the opening credit must name title, author(s) and narrator(s); the plural is the only evidence for naming more than one. Pending the owner.
- **Retail metadata.** ONIX gives narrators the contributor role E07 "Read by" ([EDItEUR takeaways via Book Net Canada](https://www.booknetcanada.ca/blog/2020/5/21/ten-takeaways-about-audiobooks-amp-onix-from-editeur)); the source raises "multiple readers" without giving an encoding, so repeating E07 once per narrator is an inference. Spotify's audiobook model has a `narrators` list ([model docs](https://www.mintlify.com/jonathan343/spotify-sdk/api/models/audiobook)); Audiobookshelf stores narrators as a list; some pipelines flatten them into one comma-separated tag ([Plex forum thread](https://forums.plex.tv/discussion/277803/audiobook-agent-audible/p1)). The takeaway for the app: keep narrators as a list and join them only when a target needs one string.
- **Room tone and mastering per narrator.** No source found states a standard for matching two narrators' loudness or room sound. Two practical points from the search: ACX-style rules ask that room tone and vocal tone stay consistent through a recording ([ACX blog, part 2](https://www.acx.com/mp/blog/how-to-succeed-at-audiobook-production-part-2), as summarised), and mastering compression can lift a noise that the session hid (an anecdote on a faith-writing site, so weak evidence). What follows for the app is an inference: two rooms have two noise floors, and a hard cut from one room to the other inside a chapter is audible even when both files pass `acx.noise_floor`.
- **Who records what.** Dual (by chapter or point of view) is the common split, each narrator recording alone. Duet is recorded in isolation too, which a podcast critique says undermines the shared-scene feel ([Good Aural, episode 17](https://goodauraltheaudiobookpodcast.buzzsprout.com/2613101/episodes/19534949-episode-17-the-duet-narration-disconnect-what-multicast-audiobooks-are-missing)). So the realistic case is two people in two rooms, not two people at one desk. That decides whether the second narrator uses the app (section 6, question 1).

## 3. Data model proposal

### Principle: zero change for a one-narrator book

A project with no roster behaves exactly as today. The roster's absence means one implicit narrator whose name comes from `credits.Values.Narrator` or `General.narrator_name`. Every page change below applies only when the roster has two or more narrators.

### Two new project files

Both live in `<project>/narration-studio/`, beside the manifest, per [principle 11](../architecture/principles.md) (project data lives in files beside the project).

**`narrators.json`** (the roster; the narrator's own data):

```json
{
  "schemaVersion": 1,
  "narrators": [
    { "id": "n-ana", "name": "Ana Reyes", "colour": 2 },
    { "id": "n-ben", "name": "Ben Cole",  "colour": 5 }
  ],
  "defaultNarratorId": "n-ana"
}
```

Ids are opaque and stable (never the name). `colour` reuses the speaker-colour range 1 to 7 (`SpeakerColors` in `src/studio/desktop/internal/guide/service.go`) so a narrator reads the same way on every page. The first narrator added is the default. At most a small fixed number of narrators (proposal: 8, checked on write).

**`assignments.json`** (the rule set; it names chapter and entity ids, so it is derived-adjacent):

```json
{
  "schemaVersion": 1,
  "mode": "by_chapter | narrator_plus_voices | single",
  "chapters": { "<chapterId>": "n-ana" },
  "voices": { "female": "n-ben", "male": "n-ana" },
  "characters": { "<entityId>": { "narratorId": "n-ben", "name": "Mara" } }
}
```

- `mode` picks the base rule. `single` is also what no file means.
- `chapters` holds the narrator of each chapter (alternating is a bulk fill, "every other chapter", "by point of view" using a chapter note, or by hand).
- `voices` maps a `Gender` property value to a narrator. A value not listed has no rule.
- `characters` is the per-character override. It stores the entity's display name so a stale id (an entity merged away or renamed) is shown with its name and marked stale instead of vanishing.

### Precedence (resolved in Go, never in the UI)

The host resolves who reads each span ([principle 10](../architecture/principles.md): the host judges, the UI displays). First match wins:

| Rank | Rule | Applies to | Unresolved case |
| - | - | - | - |
| 1 | A span override the narrator set on one line (phase 3 and later; see question 6) | One span | Rule 2 |
| 2 | `characters[speakerEntityId]` | A dialogue span whose cue has a resolved speaker | Rule 3 |
| 3 | `voices[gender of the speaker]` when `mode = narrator_plus_voices` | A dialogue span with a resolved speaker whose `Gender` property is listed | Rule 4 |
| 4 | `chapters[chapterId]` when `mode = by_chapter`, else the designated narrator | Everything left, including narration | Rule 5 |
| 5 | `defaultNarratorId` | Anything with no rule | Always resolves |

A dialogue span with an `unknown` speaker never matches rules 2 and 3 and falls to 4. It is listed on the assignment screen as "speaker not known" and never guessed ([principle 6](../architecture/principles.md): precision over recall). The designated narrator in `narrator_plus_voices` is `defaultNarratorId`.

Rule 2 beating rule 4 in `by_chapter` mode means a guest character keeps their narrator even in the other narrator's chapter. That is the owner's third mode, so it is the default; question 5 asks whether it should be switchable.

The result is a list of **segments** per chapter: `{chapterId, paragraphId, quoteStart, quoteEnd | null, narratorId, rule}`. It is computed on every read from the Story Bible and the files above and **never stored**, so a speaker correction changes the answer with no migration.

### Interaction with speaker attribution (#2251 item 22)

Item 22 asks where attribution prompts are and makes the app attribute speakers. Modes 2 and 3 are only as good as that attribution:

- The resolver reads `dialogue_cues` through the existing `guide.Service.DialogueCues()`. It does not duplicate attribution or write cues; it reads `speaker_entity_id`, `speaker_source` and `corrected`.
- An unknown or suggested speaker is the risk. Recommendation: an assignment screen pre-flight that counts spans by rule and lists unknown-speaker spans, so the narrator attributes them (the Booth speaker picker and Script's **Speaker: …** menu already do this) before anyone records them.
- If the narrator corrects a speaker after recording, the span's resolved narrator can differ from who recorded it. The app does not move or discard audio ([principle 1](../architecture/principles.md): findings suggest). It raises a finding "recorded by Ana, now assigned to Ben" through the shared findings contract ([findings-contract.md](../architecture/findings-contract.md)) for Proof and Pickups to show.
- Item 22's build should expose the cue's confidence and `speaker_source` so the pre-flight can separate "narrator-confirmed" from "suggested". This note asks that item 22 not change the `DialogueCue` shape without the resolver in view.

### Who recorded what: identity, not position

Recorded audio's narrator is **the track it is on**, not a stored claim about a time range ([principle 7](../architecture/principles.md)). The chapter-to-track link ([`src/studio/desktop/internal/chaptersync/plan.go`](../../src/studio/desktop/internal/chaptersync/plan.go)) gains an optional `narratorId`. In `by_chapter` mode the chapter's single track belongs to that chapter's narrator and nothing else moves. In the splice modes a chapter has one track per narrator, and the delivered chapter file is those tracks joined in manuscript order. Tracks with no `narratorId` belong to the default narrator.

That joining is the hard part and is a DAW question, not a data one. The REAPER bridge records and edits by chapter track today; a two-track chapter needs new bridge commands and harness tests first ([`.claude/rules/reaper-bridge.md`](../../.claude/rules/reaper-bridge.md), `reaper-command-add`), and an in-REAPER check by the owner. Not designed here; it is phase 4.

### Additive fields on existing files

| File | Field | Why |
| - | - | - |
| `voice-samples/samples.json` | `narratorId` per sample | A character's sound differs by narrator; absent means the default narrator |
| `characters/references.json` | `narratorId` per reference | The continuity baseline is per (narrator, subject), so a switch of narrator is not flagged as drift |
| `production/sessions.json` (the sessions log) | `narratorId` per session | Pace and hours per narrator |
| chapter-to-track link | `narratorId` | Above |

Each is an additive optional field; an older file reads as the default narrator and nothing migrates. The `Session` struct has no such field today.

### Persisted-file and wire-contract rules

Per [`.claude/rules/wire-contracts.md`](../../.claude/rules/wire-contracts.md) and `wire-contract-change`, anything the host reads back from disk or sends to the UI needs the full set:

- A Zod schema in `src/studio/ui/src/api/schemas/`, a golden payload written by a Go test into `tests/fixtures/contracts/` (regenerated with `UPDATE_CONTRACTS=1`), a row in `src/studio/ui/src/api/wireContracts.test.ts`, a mock that passes the schema.
- A row each for `narrators.json` and `assignments.json` in [data-files.md](../reference/data-files.md): location, writer, reader, schema link, retention. Proposed retention: `narrators.json` is kept through a manuscript replace and **Clear project data** (it is the narrator's own data, like the voice samples' clips); `assignments.json` is cleared on replace by adding it to `resetDerived` in `src/studio/desktop/internal/manuscript/service.go`, because it names chapter and entity ids that a new manuscript does not share.
- Both files use `persist` (`persist.NarratorData`): a corrupt file is kept aside as `<name>.corrupt-<timestamp>`, a newer version is refused and never overwritten, writes go to a temporary name and are renamed.
- Limits to check on write and on read: a narrator name 1 to 80 characters on one line; ids matching a fixed pattern; every `narratorId` in `assignments.json` present in the roster (an unknown id reads as the default narrator and is shown as a stale rule, not dropped).
- Bindings (proposed names): `CastNarratorsList`, `CastNarratorSave`, `CastNarratorRemove`, `CastAssignmentsGet`, `CastAssignmentsSet`, `CastResolve(chapterId)`. Removing a narrator who has recorded takes is refused; the roster entry is retired instead.
- A hand edit of either file changes only who reads what; it names no path, command or URL, so neither is a trust boundary ([data-files.md](../reference/data-files.md)). A **handoff pack** for a remote narrator (phase 7) is: it brings someone else's file into the project, which needs a [threat-model](../architecture/threat-model.md) row.

## 4. How each page changes

| Page | Change | Mode needing it |
| - | - | - |
| **Production** | An **Assignments** section: the roster, the mode, a chapter column of narrator chips, a per-narrator word and hour total. The pipeline gets a **Narrator** column and a filter. Right-click a row: **Assign to…** | All |
| **Schedule** | Hours and words left per narrator, a verdict per narrator and for the book (the later finisher decides). The contract panel holds a pay line per narrator (share by words by default, hand-editable) instead of one amount | All |
| **Booth** | A **Who is recording** switch in the header, remembered per computer. Lines the current narrator does not read are dimmed and folded into a single bar "Ben reads this (4 lines)"; Space, auto-advance and the progress bar skip them; the speaker chip shows the narrator as a ring | by chapter: chapter list only; splice modes: all of it |
| **Booth: recording check** | The check compares the recording with the current narrator's spans only, so another narrator's lines are not "missing" | Splice modes |
| **Script, Story Bible** | A narrator column on **In this chapter**; an override picker in a character's entry; the `Gender` property gets a gender editor with the two values the voices rule reads | Modes 2, 3 |
| **Editing** | The chapter shows each span's narrator tint; samples marked here carry the narrator of the span | Splice modes |
| **Proof** | Notes and findings carry a narrator (derived); a narrator filter; "recorded by Ana, now assigned to Ben" findings (section 3) | Splice modes |
| **Pickups** | The list filters by narrator; a pickup session runs for one narrator at a time and lists only that narrator's lines; **Where the lines come from** is unchanged | All |
| **Master & QC** | The file list groups by narrator; **Book consistency** draws each narrator's files in their colour and reports the spread **between narrators** (mean RMS and noise floor per narrator) beside the spread overall. Mastering stays one target for the book so both land in the window | All |
| **Delivery** | Credits tokens `[Narrators]` (joined: "Ana Reyes and Ben Cole") and `[Narrator]` (still one, the default narrator) so existing templates keep working; the packager manifest lists narrators; per-narrator checks (below); report totals per narrator | All |
| **Settings** | `General.narrator_name` stays the default for a book with no roster. New: a **Narrators** category (project scope) for the roster. The mic, levels and room tone are per computer, so in the two-rooms case each narrator has their own | All |

**Per-narrator Delivery checks (new, advice, not an ACX rule):** noise-floor spread between narrators above a threshold (proposal 3 dB; needs the owner's call, nothing in the sources fixes it); RMS spread between narrators above 1.5 dB; room-tone length at head and tail per file (already per file). In the splice modes, a seam check: the noise floor within 3 dB across a hand-over inside a chapter. The thresholds are judged in Go and are provisional until measured on two real rooms ([principle 5](../architecture/principles.md): say what was measured).

**Credits:** the opening and closing credits are recorded by one narrator. Proposal: the credits belong to the default narrator unless the narrator picks another on the credits row.

## 5. UI sketch: the Assignments screen

A section of Production, opened from **Assign narrators** beside the pipeline. Words, not pixels; it would be mocked in the Studio Next style ([which mocks are the spec](../prds/studio-next-rebuild.prd.md#which-mocks-are-the-spec)) before any code.

```text
Narrators                                         [ + Add narrator ]
 ● Ana Reyes   default    41 chapters   62,300 words
 ● Ben Cole               20 chapters   27,100 words

How the book is divided
 (•) Alternating or chosen chapters   ( ) One narrator + voices by gender   ( ) One narrator only

Chapters   [ Alternate ] [ By point of view ] [ All to Ana ]       Show: all | Ben's
 #   Chapter            Narrator       Words    Guest parts
 1   The harbour        ● Ana          2,140    Mara → Ben
 2   Mara                ● Ben          1,980
 3   The ledger         ● Ana          2,310
 …

Voices (this mode)                               Spans
 Narration and unlisted        ● Ana             (rest)
 Female characters             ● Ben             412 spans, 9 characters
 Male characters               ● Ana             380 spans, 11 characters
 Gender not set (3 characters) → Ana, choose gender…

Character overrides                               [ + Add override ]
 Mara            ● Ben    (Ana's chapters too)    78 spans
 Captain Voss    ● Ana    (female voice rule)     31 spans

Before anyone records                              ⚠ 24 spans: speaker not known  [ Review ]
                                                    ⚠ 3 characters have no gender  [ Set ]
```

Behaviours: changing a rule shows its effect at once as counts (the resolver is a read); nothing re-records, moves or deletes audio. A chapter that already has takes by a narrator shows a lock mark and asks before the assignment changes ("Ana recorded 14 minutes of this chapter."), and the choice is undoable through the existing undo history. Colour is never the only carrier: the chip also has the narrator's initials (accessibility, [principle 14](../architecture/principles.md)).

## 6. Open questions for the owner

Each has a recommendation; the default applies if unanswered.

1. **Is the second narrator another person using this app, on their own computer?** Recommendation: design for it but build the single-machine path first. If yes, phase 7 (a handoff pack both ways) becomes required for splice modes; if the narrators share a machine, it is not.
2. **Is alternating chapters the first mode shipped?** Recommendation: yes. It needs no splicing.
3. **How fine is a gender or override assignment: a quote span, or the whole paragraph?** Recommendation: quote span as the data, with a setting "assign by paragraph" that moves a mixed paragraph to the dialogue speaker's narrator; the tag ("she said") stays with the narration narrator under the span rule. Spans make many short hand-overs, which is the cost that makes duet narration slow.
4. **Gender source.** The only source today is the entry's `Gender` property (Female or Male). Recommendation: read that property, add a gender editor on the entry, and treat everything else as "not set" (falls to the narration narrator). Non-binary or non-listed characters need an explicit override; the roster does not model voice type.
5. **Does a per-character override win inside the other narrator's chapter?** Recommendation: yes, default on, with a per-override switch "only in my chapters".
6. **Line-level override (rank 1)?** Recommendation: not in the first release; the character override covers the stated need.
7. **Pay.** Does the Schedule keep one contract amount with a per-narrator share, or one amount per narrator? Recommendation: one amount per narrator, split by words by default. ACX supports a single producer per contract (section 2), so the real contracts are separate.
8. **Which narrator reads the credits and the retail sample?** Recommendation: the default narrator, changeable.
9. **Seam threshold and the between-narrator spread limits.** Recommendation: ship the checks as advice with the section 4 numbers marked provisional until two real rooms are measured.
10. **ACX wording on narrator credits and consistency.** Pending the owner: read the two ACX pages and replace the summaries in section 2.

## 7. Phased delivery

Sizes are the author's estimates: **S** one pull request, **M** two or three, **L** four or more. Each phase ships behind "no roster means nothing changes".

| Phase | Delivers | Needs | Size |
| - | - | - | - |
| 0 | Owner answers to section 6; a mock of the Assignments screen | Owner | S |
| 1 | `narrators.json`, `assignments.json`, the resolver and its bindings, schemas, goldens and the data-files rows; the Production **Assignments** section; no recording change. Alternating chapters usable as a plan | Phase 0 | M |
| 2 | Narrator on Production sessions; Schedule per narrator; per-narrator pay lines; credits `[Narrators]` | 1 | M |
| 3 | Booth: **Who is recording**, narrator column, chapter list filter; **by chapter** mode complete for one-room, one-desk work | 1 | M |
| 4 | Splice modes: chapter-to-track link with `narratorId`, new bridge commands with harness tests, the Booth's dimmed and skipped spans, a recording check over one narrator's spans, the joined chapter file | 1, 3; owner's in-REAPER check | L |
| 5 | Attribution: Proof and Pickups filters and findings; narrator on voice samples, references and continuity baselines | 1; item 22 | M |
| 6 | Master & QC grouping and between-narrator spread; Delivery per-narrator checks and report | 1 | M |
| 7 | Handoff pack to and from a remote narrator, with its threat-model row | Question 1 | L |

Mode coverage: alternating chapters is complete after phases 1 to 3 and 5 to 6. Gender voices and per-character overrides need phase 4 as well and are only as good as item 22's attribution. The order 1, 2, 3, 6, 5, then 4 gets a working two-narrator book earliest.

## Sources

- Repository: files named inline, at `main` `063dc83` (2026-10-23).
- ACX, [Can I hire more than one narrator](https://help.acx.com/s/article/can-i-hire-more-than-one-narrator-for-my-audiobook) and [It Takes Two: Dual & Duet Narrations](https://www.acx.com/mp/blog/it-takes-two-dual-and-duet-narrations-are-spicing-up-romance): read through search summaries only (2026-10-23).
- ACX, [How to succeed at audiobook production, part 2](https://www.acx.com/mp/blog/how-to-succeed-at-audiobook-production-part-2): search summary only.
- [Ten takeaways about audiobooks and ONIX from EDItEUR](https://www.booknetcanada.ca/blog/2020/5/21/ten-takeaways-about-audiobooks-amp-onix-from-editeur), [Spotify audiobook model](https://www.mintlify.com/jonathan343/spotify-sdk/api/models/audiobook), [Plex forum thread](https://forums.plex.tv/discussion/277803/audiobook-agent-audible/p1).
- [KBoards: dual narrators](https://www.kboards.com/threads/audiobook-questions-edit-dual-narrators.253247/), [Good Aural, episode 17](https://goodauraltheaudiobookpodcast.buzzsprout.com/2613101/episodes/19534949-episode-17-the-duet-narration-disconnect-what-multicast-audiobooks-are-missing): forum and podcast sources, low confidence.
- Not found: a platform rule for matching two narrators' loudness or room tone, and Audible's or Findaway Voices' own multi-narrator metadata rules.
