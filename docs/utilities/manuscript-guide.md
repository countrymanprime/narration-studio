# Manuscript Guide

**Status: Implemented.** Planned work is [#1453](https://github.com/countrymanprime/narration-utils/issues/1453).

## Current capability and problem

The current Python backend reads the project-owned canonical manuscript JSON, detects candidate characters, places, and organizations, and writes editable JSON with pronunciation, evidence, conservative descriptions, and personality notes. The native Go/Wails host imports DOCX, Markdown, plain text (`.txt`) and EPUB (`.epub`) once before analysis, all through the same hand-written parsers (no third-party EPUB library) and the same canonical `Draft`; new PDF import is fail-closed pending corpus parity. The REAPER bridge supports building, reviewing, editing/locking fields, and optional local Piper previews.

## Entity properties

Every entry carries `properties`: an ordered list of `{"key", "value"}` facts, the labelled lines of a character block ("Codename", "Abilities", "Dossier") that have nowhere else to live. They are text only (no typed or nested values), every category has them, and they are shown in the Story Bible detail, edited in edit mode, and shown in the entry summary opened from the Manuscript.

- **Shape.** An ordered list, not an object: the host decodes the file to a map and writes it back, which sorts an object's keys and would lose the narrator's order. A key is required and unique whatever its case (`Codename` and `codename` are one key); a value may be empty. Both are trimmed.
- **Additive.** A Story Bible file written before properties existed has none, and every reader treats that as an empty list. `schema_version` stays 2.
- **Editing.** `edit --field properties --value=<JSON list>` replaces the whole list in one run, like every other field: a locked entry refuses it (ADR 0007), a bad list changes nothing, and it counts as a review (`review_state` becomes `reviewed`). The Save button sends it only when the list changed.
- **Creating with properties.** `create --properties=<JSON list>` sets them in the same run as the entry, for the import of a manuscript's cast blocks (`guide.Service.CreateFull` in the host). The list must be valid (a name on every property, no name twice); an invalid list creates nothing. The caller merges repeated labels before it asks.
- **Rebuilding.** A build never produces properties, so `merge_locked` carries the prior list onto a regenerated entry, and a locked or manual entry is kept whole. `merge` unions by key: the target's value wins and the source adds the keys the target lacks.

## Review flags and speaker colour

Every entry carries `review: {"entry", "aliases"}`: whether the entry itself still needs the narrator's look, and which alias texts do. A file written before it has none; its `entry` reads from `review_state == "needs review"` and no name is flagged. An entry may also carry `speaker_color`, 1 to 7 (the `--speaker-N` hues of ADR 0367), which wins over the stable pick; absent means automatic.

- **`mark-reviewed --entity-id [--alias-index]`** clears the entry and every name, or one name. When the entry flag is off and no name is left, `review_state` becomes `reviewed`.
- **`review-flag --entity-id [--alias-index]`** sets the flag: the undo of `mark-reviewed`, and what an accepted automatic suggestion sets. Flagging the entry sets `review_state` to `needs review`; a flag already set changes nothing.
- **`speaker-color --entity-id --index N`** stores 1 to 7, and 0 removes it. Only a Character takes one, since only a character speaks.
- All three refuse a locked entry (ADR 0007). `merge` keeps the target flagged if either was, with both entries' name flags that the target now has, and keeps the target's colour, else the source's; `split` gives a flagged name's flag to the new entry; removing an alias drops its flag; a rebuild keeps both fields.

## Merge and its undo

- **`merge --source-id --target-id`** folds the source into the target: the source's name and aliases become aliases of the target, each with its own pronunciation and occurrences; relationships move to the target and every other entry's relationship to the source points at the target's id; Appears in is the union of both. The source is deleted and its names are recorded in `absorbed_names`, so a rebuild folds them back into the target. It prints `MERGED|<target id>|<undo id>`.
- The file keeps an undo record for each of the last ten merges (`merge_undo`): both entries as they were, every other entry's relationships the merge changed, and the absorbed names it set. A rebuild writes a file without them.
- **`unmerge --undo-id`** puts both entries, those relationships and those absorbed names back as they were, and prints `UNMERGED|<source id>|<target id>`. It refuses, writing nothing, when the target or one of those entries changed after the merge, when an entry has the source's id again, or when the file no longer holds the record. Two merges into one target are undone newest first. The host checks the id is 16 lowercase hexadecimal characters before it starts the sidecar (`guide.Service.Unmerge`, the `GuideUnmerge` binding).

## Pronunciation: generate and replace

Alongside the automatic CMU-then-eSpeak fallback used at build time (`pronunciation()`), a narrator can set a pronunciation
explicitly from edit mode: `pronounce --entity-id <id> [--alias-index <n>] --source cmu|espeak` (`pronounce_source`) tries
exactly the named engine and raises when it has nothing for the name, instead of quietly falling back or reporting "not
generated". The value is marked `chosen: true`, so a rebuild's `merge_locked` keeps it instead of overwriting it with a
freshly generated one; an auto-generated value (no `chosen` key) is still replaced by the fresh build as before. Blocked on
a locked entity (ADR 0007), same as every other edit.

The Go host exposes it as `GuidePronounce(id, aliasIndex *int, source string)` / the `GuidePronounce` binding
(`hostAPIVersion` 13). The UI gates the play button on a pronunciation existing (the preview always speaks the name as
spelled and ignores the IPA, so this is a UI policy, not a technical limit); in edit mode each name's source tag asks the
chosen source for a candidate and then calls `GuidePronounce` with that source (SN-B22).

`candidate --word=<text> --source cmu|espeak|wiktextract` prints one JSON line, `{"ok":true,"say":...}` or `{"ok":false,"reason":...}`, and changes nothing; a word over 80 characters, or with a newline or NUL, is refused. The host calls it through `guide.Service.Candidate`.

A narrator can also keep their own pronunciation
([ADR 0346](../adr/0346-a-pronunciation-carries-a-status-and-note-and-the-narrators-own-sits-beside-the-dictionarys-as-the-alternate.md)):
`pronounce-user --ipa=<text>` sets one with source `manual` (a file written earlier says `user`; it reads as `manual`) that never asks a dictionary, and keeps the dictionary's answer beside
it as `alternate`; `pronunciation-use-alternate` swaps the two back, losslessly and without a lookup. Since
[ADR 0792](../adr/0792-a-pronunciation-records-the-source-it-came-from-and-there-is-no-query-status-query-csv-or-open-queries-badge.md)
the host's `Entities()` ignores a stored `status` and a rebuild no longer carries it; a note and the alternate are kept, and
the Story Bible shows an old note read-only. A pronunciation's `source` is the registry name (`cmu`, `wiktextract`,
`espeak`) or `manual`. The host bindings are `GuidePronounceUser` and `GuidePronunciationUseAlternate`. The sidecar has no command that sets a status (SN-B81 removed `pronunciation-status`).

## Rules suggestions

`suggest --manuscript M --guide G` is the rules tier of the extraction port (SN-X32, `core/extraction_rules.py`). It reads
the manuscript and the Story Bible, writes nothing, and prints one JSON line per suggestion: an `entry` for a name the
build's rules accept that no entry answers to, or one held only as Needs Review; an `alias` for a spelling the rules
group with a known entry that the entry lacks; a `speaker` for a quote a speech tag resolves to a Character, unless the
Story Bible already attributes that cue or the narrator corrected it. A locked entry gets nothing (ADR 0007). Each quote
is a slice of the paragraph it names. Each confidence comes from `RULE_CONFIDENCE`, which is provisional until SN-X8:
`speech-tag` is 0.96 (the [cue evaluation](../research/character-continuity-cue-extraction-eval/RESULTS.md)), and the
other rules give `null` with the note "The rules give no score for this." The `build` is unchanged.

The host runs it through `apps/desktop/internal/extractionport/rules`, which caps the output (8 MB), each line (64 KB)
and each field (8 KB), refuses an unknown field or a kind other than entry, alias or speaker, drops a suggestion whose
quote `extraction.VerifyEvidence` does not find in its paragraph, and kills the sidecar when the run is cancelled. The
line format is pinned by `rules/testdata/suggest-lines.json`, which the sidecar's contract test writes.

## GLiNER suggestions

`suggest --source gliner --manuscript M --guide G --install DIR` runs the optional GLiNER download
(`core/extraction_gliner.py`). It loads the model only from `DIR`, the tool's install folder, with the Hugging Face hub
turned off ([ADR 0848](../adr/0848-optional-analysis-tools-load-their-code-and-weights-from-the-registrys-install-folder-never-from-the-freeze-or-the-network.md)),
and prints one `entry` line per name it finds: the type from `LABELS` (Character, Place, Item, Organization), no aliases,
the model's own score or `null`, and the sentence the name is in as its quote. Spans under `SCORE_FLOOR` (0.5) are
dropped, and a name found twice is offered once. A missing or damaged install exits 1 with a sentence. The host runs it
through `apps/desktop/internal/extractionport/gliner` with the same caps and checks as the rules, plus an entry-only,
no-alias line format, pinned by `gliner/testdata/suggest-lines.json`. `self-check --gliner-install DIR` adds a `gliner`
line: the installed version, or "not installed", which passes.

## BookNLP suggestions

`suggest --source booknlp --manuscript M --guide G --install DIR [--spacy-model S]` runs the optional BookNLP download
(`core/extraction_booknlp.py`) on the weights in `DIR`, the large ones when the folder has them, with the Hugging Face hub
turned off and only the entity, quote and coreference pipelines ([ADR 0848](../adr/0848-optional-analysis-tools-load-their-code-and-weights-from-the-registrys-install-folder-never-from-the-freeze-or-the-network.md)).
It prints an `entry` per character with a name (its other proper names as aliases, no score), an `alias` flagged
`duplicate` with a note when two of BookNLP's groups share a name, a `speaker` per attributed quote with the confidence
`SPEAKER_CONFIDENCE` gives a tagged or an implicit attribution on those weights (an implicit one is always under 0.75),
and a `Gender` property (Female or Male) with BookNLP's own probability, or `null` when it gives none. Each quote is cut
from its paragraph by the model's offsets. The host runs it through `apps/desktop/internal/extractionport/booknlp`,
which picks the large install over the small one and checks the line format pinned by
`booknlp/testdata/suggest-lines.json`. `self-check --booknlp-install DIR` (repeatable, best first) adds a `booknlp`
line: the version and weights of the first folder that is there, or "not installed", which passes.

## Workflow

Run the guide after manuscript selection; review uncertain candidates; lock narrator-authored pronunciation and notes; consult the entries during recording.

## Inputs and outputs

- Inputs: Word manuscript, the selected catalog-managed spaCy language model (downloaded after a confirmation; without one the build offers a rules-only run), optional eSpeak, the selected catalog-managed Piper voice, and existing guide JSON.
- Outputs: `<project>/ManuscriptGuide/manuscript_guide.json`, optional audio previews, and shared `entity` and `pronunciation` findings for entries that need review or a pronunciation with low or unknown confidence (`apps/desktop/internal/guide/findings_adapter.go`), which [Proof](../guides/using-the-app/proof.md) lists and decides.
- Narrator actions: edit, lock, merge/reject candidates, and approve pronunciations.

## Non-goals and review boundary

The tool does not invent character psychology, choose a voice, scrape external sources, or alter the manuscript. All inferred entities and traits remain review candidates.
