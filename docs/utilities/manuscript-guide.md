# Manuscript Guide

**Status: Implemented.** Planned work is [#1453](https://github.com/countrymanprime/narration-studio/issues/1453).

## Current capability and problem

The host's build (`src/studio/desktop/internal/guide/build.go`) reads the project-owned canonical manuscript JSON, detects candidate characters, places, and organizations, and writes editable JSON with pronunciation, evidence, conservative descriptions, and personality notes. The Python sidecar runs only the language model (`entities`) and the pronunciation sources (`pronunciation`). The native Go/Wails host imports DOCX, Markdown, plain text (`.txt`) and EPUB (`.epub`) once before analysis, all through the same hand-written parsers (no third-party EPUB library) and the same canonical `Draft`; new PDF import is fail-closed pending corpus parity. The REAPER bridge supports building, reviewing, editing/locking fields, and optional local Piper previews.

## Entity properties

Every entry carries `properties`: an ordered list of `{"key", "value"}` facts, the labelled lines of a character block ("Codename", "Abilities", "Dossier") that have nowhere else to live. They are text only (no typed or nested values), every category has them, and they are shown in the Story Bible detail, edited in edit mode, and shown in the entry summary opened from the Manuscript.

- **Shape.** An ordered list, not an object: the host decodes the file to a map and writes it back, which sorts an object's keys and would lose the narrator's order. A key is required and unique whatever its case (`Codename` and `codename` are one key); a value may be empty. Both are trimmed.
- **Additive.** A Story Bible file written before properties existed has none, and every reader treats that as an empty list. `schema_version` stays 2.
- **Editing.** An edit of `properties` replaces the whole list in one write, like every other field: a locked entry refuses it, a bad list changes nothing, and it counts as a review (`review_state` becomes `reviewed`). The Save button sends it only when the list changed.
- **Creating with properties.** `guide.Service.CreateFull` sets them with the entry, for the import of a manuscript's cast blocks. The list must be valid (a name on every property, no name twice); an invalid list creates nothing. The caller merges repeated labels before it asks.
- **Rebuilding.** A build never produces properties, so the rebuild merge (`mergeLocked`, `internal/guide/build_merge.go`) carries the prior list onto a regenerated entry, and a locked or manual entry is kept whole. A merge unions by key: the target's value wins and the source adds the keys the target lacks.

## Review flags and speaker colour

Every entry carries `review: {"entry", "aliases"}`: whether the entry itself still needs the narrator's look, and which alias texts do. A file written before it has none; its `entry` reads from `review_state == "needs review"` and no name is flagged. An entry may also carry `speaker_color`, 1 to 7 (the `--speaker-N` hues of `docs/design/colour-and-contrast.md#per-speaker-colours`), which wins over the stable pick; absent means automatic.

- **Mark reviewed** (`GuideMarkReviewed`, with or without an alias index) clears the entry and every name, or one name. When the entry flag is off and no name is left, `review_state` becomes `reviewed`.
- **Flag review** (`GuideFlagReview`) sets the flag: the undo of Mark reviewed, and what an accepted automatic suggestion sets. Flagging the entry sets `review_state` to `needs review`; a flag already set changes nothing.
- **Speaker colour** (`GuideSetSpeakerColor`) stores 1 to 7, and 0 removes it. Only an entry whose type speaks takes one (see Story Bible types).
- All three refuse a locked entry (`src/studio/desktop/internal/guide/mutate.go`). A merge keeps the target flagged if either was, with both entries' name flags that the target now has, and keeps the target's colour, else the source's; a split gives a flagged name's flag to the new entry; removing an alias drops its flag; a rebuild keeps both fields.

## Dialogue cues

The host writes the dialogue cues (`dialogue_cues`) itself (`src/studio/desktop/internal/guide/cues.go`, `guide.Service.RefreshCues`): one per double-quoted span, against the entries already filed under a speaking type. A cue's speaker is only ever an entry of a speaking type, never a Needs Review name (owner, 2026-10-24). It comes from, in order: a speech tag naming one (`tag`); the other of exactly two speakers taking turns in a scene (`continuation`); and the first such name within 70 characters after the quote, up to the next one, else the last before it (`proximity`, the Studio Next mock's rule). A proximity speaker never starts a continuation. The rules source's speaker suggestions (`internal/guide/rules.go`) offer only a tag naming an entry of a speaking type. Every one is a suggestion until the narrator corrects the cue.

- A refresh keeps every other key of the file, in its order, and every narrator correction, and says how many cues it found and how many have a speaker. Given chapters, it recomputes only theirs and keeps the rest, in manuscript order. With no file yet, or one that is not JSON, it starts an empty Story Bible, which the host reports as stale until a build. It holds the host's edit lock while it runs.
- It runs at the end of every scan and after every manuscript import; for the chapters an entry's names appear in (`guide.Service.SpeakerChapters`) after an edit of its type, name or aliases, a new entry, a merge or a delete, when the entry spoke before or speaks after; for every chapter when a type starts or stops speaking (`src/studio/desktop/extraction_cues.go`); and right after every build (`guide.Service.Build`), under the same edit lock: the build keeps the file's old cues where they were, and the refresh then leaves the file the sidecar's build wrote while it found the cues itself. A refresh that fails fails the build, with the new entries already written. All but the scan's and the build's run in the background and are logged to the run log.
- The sidecar's `cues` command and its cue code were deleted in step 3 of [Go versus Python for the sidecars](../research/sidecar-go-vs-python.md). The cases it recorded before then are frozen in `tests/fixtures/guide-cues`: `TestRefreshCuesMatchesTheSidecar` holds the host to the file it wrote, byte for byte, and to its refusals, and `TestBuildThenRefreshIsTodaysBuild` with `TestEveryRecordedBuildWritesTheFileThatKeepsTheCues` holds a build and the refresh after it to the file the old build wrote. The file is read as Python's `json.loads` reads it and written as `write_json` wrote it, with CRLF line ends on Windows as Python's text mode wrote them. `TestTheCuesGolden` writes `cues-golden.json`, which `TestCuesMatchTheGolden` reads back through `DialogueCues`.

## Story Bible types

The file may carry `types`, the narrator's ordered list of `{name, colour, speaks}` ([Settings](../guides/using-the-app/settings.md)). Without it the types are the defaults: Character (speaks), Place, Organization, Lore, Item and Event, in the hues they have always had. An entry's `category` is a type's name, or `Needs Review` or `Draft`.

- **Add**, **rename**, **colour** (green, blue, violet, amber, teal or rose), **can speak** and **remove** (`GuideTypeAdd`, `GuideTypeRename`, `GuideTypeSetColour`, `GuideTypeSetSpeaks`, `GuideTypeRemove`, in `src/studio/desktop/internal/guide/types.go`) each write the whole list. A rename moves every entry of the type; a type in use and the last type cannot be removed.
- Only an entry whose type speaks takes a speaker colour, and a build's dialogue cues resolve only to such entries. A rebuild keeps the list and files a new entry under the type its built-in category was renamed to (`builtin`), or under Needs Review when that type was removed.

## Merge and its undo

- **Merge** (`GuideMerge`) folds the source into the target: the source's name and aliases become aliases of the target, each with its own pronunciation and occurrences; relationships move to the target and every other entry's relationship to the source points at the target's id; Appears in is the union of both. The source is deleted and its names are recorded in `absorbed_names`, so a rebuild folds them back into the target. It answers an undo id.
- The file keeps an undo record for each of the last ten merges (`merge_undo`): both entries as they were, every other entry's relationships the merge changed, and the absorbed names it set. A rebuild writes a file without them.
- **Unmerge** (`GuideUnmerge`, with that undo id) puts both entries, those relationships and those absorbed names back as they were. It refuses, writing nothing, when the target or one of those entries changed after the merge, when an entry has the source's id again, or when the file no longer holds the record. Two merges into one target are undone newest first. The host checks the id is 16 lowercase hexadecimal characters (`guide.Service.Unmerge`) and runs merge, unmerge and split itself (`src/studio/desktop/internal/guide/merge.go`). An undo record holds SHA-256 fingerprints of how the merge left each entry, taken over Python's `json.dumps(value, sort_keys=True, ensure_ascii=False)`; the host's encoder (`pythonjson.go`) writes the same bytes, so the host can undo a merge an older sidecar recorded.

## Delete Story Bible data

`GuideDeleteAll` (More actions on the Story Bible page) deletes the project's Story Bible data and nothing else: it counts the scan's suggestions, deletes the `ManuscriptGuide` folder with `suggestions.json` in it (`guide.Service.DeleteAll`, `src/studio/desktop/internal/guide/deleteall.go`) and the `story-bible` findings (`findings.Store.RemoveAnalyzer`), and answers `{entries, suggestions}`, the counts before the delete. It refuses unless confirmed and while a build or a scan runs. Voice samples and references stay: they name an entry by id, and an entry's id is a hash of its name (`entityID`), so an entry added again under the same name has them again. There is no undo.

## Pronunciation: generate and replace

Alongside the automatic CMU-then-eSpeak fallback a build asks for (`pronunciation()`), a narrator can set a pronunciation
explicitly from edit mode. The host (`guide.Service.Pronounce`, `src/studio/desktop/internal/guide/pronounce.go`) refuses a locked
entry, an unknown id and an alias index out of range, then asks the sidecar's `pronunciation --source cmu|espeak|wiktextract
--words-file <file>` for the name exactly as the file holds it. That runs exactly the named source (`pronounce_source`) and prints its
value, or `{"miss": reason}` when the source has nothing for the name, instead of quietly falling back or reporting "not generated";
the host shows the reason. The host marks the value `chosen: true`, so a rebuild (`mergeLocked`) keeps it instead of overwriting it
with a freshly generated one, keeps the note, keeps the narrator's own pronunciation it replaces as the `alternate`, and writes the
file under its edit lock. An auto-generated value (no `chosen` key) is still replaced by the fresh build as before.

The sidecar's `pronounce` command, which did all of this and wrote the file, was deleted (#2251). The runs it recorded before then are
frozen in `tests/fixtures/guide-pronounce`: `TestPronounceMatchesTheSidecar` holds the host to the file it wrote, byte for byte, and to
its refusals in its words, and `TestPronounceWritesWindowsLineEnds` replays them with Windows line ends.

The Go host exposes it as `GuidePronounce(id, aliasIndex *int, source string)` / the `GuidePronounce` binding
(`hostAPIVersion` 13). The UI gates the play button on a pronunciation existing (the preview always speaks the name as
spelled and ignores the IPA, so this is a UI policy, not a technical limit); in edit mode each name's source tag asks the
chosen source for a candidate and then calls `GuidePronounce` with that source (SN-B22).

The Wiktextract source reads the index the narrator installed in Settings from the path given as `--wiktextract-index`; without
the flag it answers "Wiktionary pronunciations are not installed yet." The host passes the flag only while the index is installed
and verifies (`wiktextract.Manager.Installed`, asked through the resolver `app.go` gives the service with
`guide.Service.SetWiktextractIndex`, each time a lookup starts): to `pronunciation --source wiktextract` and
`candidate --source wiktextract`, and to every lookup that tries the sources in turn (a build's `entities` or
`pronunciation --words-file`, and the `pronunciation --word=` of a create or an alias edit). A named source other than Wiktextract
never gets it. The host never passes `--espeak-library`: no build ships a `libespeak-ng` for it to name, so `phonemizer` looks for the
system's own ([CI and releases](../operations/ci-and-releases.md), "Known gap"). Pinned by
`src/studio/desktop/internal/guide/wiktextract_index_test.go` and `src/studio/desktop/guidepronounce_test.go`.

`candidate --word=<text> --source cmu|espeak|wiktextract` prints one JSON line, `{"ok":true,"say":...}` or `{"ok":false,"reason":...}`, and changes nothing; a word over 80 characters, or with a newline or NUL, is refused. The host calls it through `guide.Service.Candidate`.

`pronunciation --word=<text> [--word=<text> ...] [--default-source cmu|espeak|wiktextract]` prints one JSON line per word, in order, and changes nothing: the whole value of `pronunciation()`, the preferred source first and then the rest in their usual order, as `{"ipa": ..., "source": ..., "confidence": ...}`, or `{"ipa": "", "source": "not generated", "confidence": "unknown"}` for a word nothing knows. A blank word, or one with a NUL, is refused; there is no length limit. The host calls it through `guide.Service.pronunciations` when it creates an entry or adds an alias, with the names the entry did not have. With `--source`, each word is asked of that source alone, as above, and a words file may hold an empty name.

A narrator can also keep their own pronunciation: `GuidePronounceUser` sets one with source `manual` (a file written earlier says
`user`; it reads as `manual`) that never asks a dictionary, and keeps the dictionary's answer beside it as `alternate`;
`GuidePronunciationUseAlternate` swaps the two back, losslessly and without a lookup. Since
[How you say each name](../guides/using-the-app/story-bible.md#how-you-say-each-name)
the host's `Entities()` ignores a stored `status` and a rebuild no longer carries it; a note and the alternate are kept, and
the Story Bible shows an old note read-only. A pronunciation's `source` is the registry name (`cmu`, `wiktextract`,
`espeak`) or `manual`. The host applies both itself (see who writes the file, below). The sidecar has no command that sets a status (SN-B81 removed `pronunciation-status`).

## Rules suggestions

The rules tier of the extraction port (SN-X32) runs in the host, not in this sidecar: `guide.RuleSuggestions`
(`src/studio/desktop/internal/guide/rules.go` and `rules_text.go`) reads the manuscript and the Story Bible, writes nothing, and
gives one JSON line per suggestion: an `entry` for a name the build's rules accept that no entry answers to, or one held only
as Needs Review; an `alias` for a spelling the rules group with a known entry that the entry lacks; a `speaker` for a quote a
speech tag resolves to an entry of a speaking type, unless the Story Bible already attributes that cue or the narrator
corrected it. A locked entry gets nothing, nor does a name a merge absorbed. Each quote is a slice of the paragraph it names.
Each confidence comes from `RuleConfidence`, which is provisional until SN-X8: `speech-tag` is 0.96 (the
[cue evaluation](../research/character-continuity-cue-extraction-eval/RESULTS.md)), and the other rules give `null` with the
note "The rules give no score for this." The names come from the name finder in `rules_scan.go` (`scanGroups`), which the
build also reads without a language model (`scanCandidates`); it replaced the sidecar's `rule_candidates` after #2251 found it
offering "I'm", "Mr" and "Because I": it cuts a capitalised run
at pronouns, contractions, function words and shouted words, never offers a bare honorific, keeps particles (de la, van der),
merges Mr Darcy, Mr. Darcy and Darcy's, keeps Mr. and Mrs. Bennet apart, needs evidence for each name (an honorific, a speech
verb beside it, or mentions capitalised mid-sentence in more than one paragraph) and lists the strongest first. Its word lists
are English. `testdata/scan-corpus.json` holds the expected names for each excerpt, and `testdata/scan-names.json` pins the names
for every frozen case (`build-rules.json` and `build-cues.json` the builds without a model). The speaker lines, every refusal,
and every build with the model's spans still match the sidecar's deleted copy case for case
(`tests/fixtures/guide-rules`, recorded from the sidecar's `suggest --source rules` before it was deleted on 2026-10-25).

`src/studio/desktop/internal/extractionport/rules` is the scan's rules row. It caps the lines (8 MB in all, 64 KB a line,
8 KB a field), refuses an unknown field or a kind other than entry, alias or speaker, drops a suggestion whose quote
`extraction.VerifyEvidence` does not find in its paragraph, and stops when the run is cancelled. The line format is pinned
by `rules/testdata/suggest-lines.json`, which `TestTheSuggestLinesMatchTheContractFile` writes. `go run ./cmd/guide-rules
--manuscript M --guide G` (from `src/studio/desktop`) prints the same lines; the extraction calibration tool runs it.

## GLiNER suggestions

`suggest --source gliner --manuscript M --guide G --install DIR` runs the optional GLiNER download
(`core/extraction_gliner.py`). It loads the model only from `DIR`, the tool's install folder, with the Hugging Face hub
turned off ([CI and releases](../operations/ci-and-releases.md)). GLiNER builds its `microsoft/deberta-v3-small` encoder by
that name; the adapter answers it with the folder's own `config.json`, and the tokenizer is read from the folder's
`tokenizer_config.json` and `spm.model`, so the install folder needs those three beside the weights. It
prints one `entry` line per name it finds: the type from `LABELS` (Character, Place, Item, Organization), no aliases,
the model's own score or `null`, and the sentence the name is in as its quote. Spans under `SCORE_FLOOR` (0.5) are
dropped, and a name found twice is offered once. A missing or damaged install exits 1 with a sentence. The host runs it
through `src/studio/desktop/internal/extractionport/gliner` with the same caps and checks as the rules row, plus an entry-only,
no-alias line format, pinned by `gliner/testdata/suggest-lines.json`. `self-check --gliner-install DIR` adds a `gliner`
line: the installed version, or "not installed", which passes.

## BookNLP suggestions

`suggest --source booknlp --manuscript M --guide G --install DIR [--spacy-model S]` runs the optional BookNLP download
(`core/extraction_booknlp.py`) on the weights in `DIR`, the large ones when the folder has them, with the Hugging Face hub
turned off and only the entity, quote and coreference pipelines ([CI and releases](../operations/ci-and-releases.md)).
It prints an `entry` per character with a name (its other proper names as aliases, no score), an `alias` flagged
`duplicate` with a note when two of BookNLP's groups share a name, a `speaker` per attributed quote with the confidence
`SPEAKER_CONFIDENCE` gives a tagged or an implicit attribution on those weights (an implicit one is always under 0.75),
and a `Gender` property (Female or Male) with BookNLP's own probability, or `null` when it gives none. Each quote is cut
from its paragraph by the model's offsets. The host runs it through `src/studio/desktop/internal/extractionport/booknlp`,
which picks the large install over the small one and checks the line format pinned by
`booknlp/testdata/suggest-lines.json`. `self-check --booknlp-install DIR` (repeatable, best first) adds a `booknlp`
line: the version and weights of the first folder that is there, or "not installed", which passes.

BookNLP builds each model on a Google BERT encoder named in its weight file. The weight files hold every encoder parameter, so the
adapter builds each encoder from the install folder's `<encoder>.config.json` and the shared `bert_uncased.vocab.txt` alone
(`_local_encoders`) and never asks the hub for the encoder weights. On chapter VI of Alice the output is byte-identical either way.
What BookNLP prints while it loads and runs goes to stderr: stdout carries only suggestion lines. The install folder holds, besides the
weights and encoder files, the unpacked wheels the freeze does not carry: `booknlp`, `torch`, `transformers`, `huggingface-hub`,
`tokenizers`, `safetensors`, `regex`, `filelock`, `fsspec`, `sympy`, `mpmath`, `networkx`, and `setuptools` 80 for the
`pkg_resources` BookNLP imports. The guide's freeze carries the standard library and the submodules those packages import that the
guide does not, with `httpx` and the packages it imports, which `huggingface-hub` needs at import (`FREEZE_IMPORTS`, `FREEZE_METADATA`, read by `scripts/release/prepare-resources.py`), and every `self-check` has
a `tool-runtime` line that imports them, which the packaged smoke test requires.

## Workflow

Run the guide after manuscript selection; review uncertain candidates; lock narrator-authored pronunciation and notes; consult the entries during recording.

## Inputs and outputs

- Inputs: Word manuscript, the selected catalog-managed spaCy language model (downloaded after a confirmation; without one the build offers a rules-only run), optional eSpeak, the selected catalog-managed Piper voice, and existing guide JSON.
- The spaCy model: `config/spacy-assets.json` catalogs the official `en_core_web_sm` and `en_core_web_lg` 3.8.0 wheels (MIT; their training-data notices are in [model provenance](../architecture/model-provenance.md)). The install unpacks the wheel and keeps no wheel, and nothing runs `pip`. `guidegate.go` (`spacyForBuild`) gives the sidecar's `--spacy-model` the folder the selected model (by default `sm`) was unpacked to, which `spacy.load` reads by path; a selected model that is not installed stops the build at the first-use gate (Download, rules-only for this run, or Cancel). The frozen sidecar loads a model by folder with no freeze change, since PyInstaller finds `import spacy` inside the `entities` command, which prints each paragraph's entity spans for the host and nothing else; a model that cannot be loaded is logged and answered `{"available": false}`, and the host builds with the rules. `internal/spacy/catalog_test.go` fails when the locked spaCy no longer satisfies a model's `spacyVersion`. On `tests/fixtures/alice.md` (26,420 words, 2026-09-21) rules-only gave 48 entries, `sm` 110 and `lg` 84. The models also tag common words ("Adventures", "Ahem"), so more entries is not more accuracy, and whether a model beats rules-only on a narrator's own book has not been measured.
- Outputs: `<project>/ManuscriptGuide/manuscript_guide.json`, optional audio previews, and shared `entity` and `pronunciation` findings for entries that need review or a pronunciation with low or unknown confidence (`src/studio/desktop/internal/guide/findings_adapter.go`), which [Proof](../guides/using-the-app/proof.md) lists and decides.
- Narrator actions: edit, lock, merge/reject candidates, and approve pronunciations.
- Who writes the file: the host builds it (`build.go`, `build_entities.go` and `build_merge.go`: the extraction after the model, the grouping, the entries' evidence, descriptions, notes and scenes, the types, the rebuild merge over the saved file and the vocabulary), asking the sidecar for the language model's spans (`entities`, skipped for a rules-only build) and the pronunciation of every name it keeps in one process (`pronunciation --words-file`); it reads the saved file again under its edit lock once the model work is done, so an edit made meanwhile is merged, not overwritten. No sidecar command writes the file. The host writes the dialogue cues (above) and makes every other change itself and writes the file in the sidecar's format, without starting the sidecar. It applies an edit or a lock (`src/studio/desktop/internal/guide/edit.go`, `editInHost`), creates an entry (`create.go`, `createInHost`), marks entries and names reviewed or flagged, sets speaker colours, relates and unrelates entries, deletes them and records cue corrections (`mutate.go`), sets the narrator's own pronunciation and switches to the alternate (`mutate.go`), sets a named source's pronunciation (`pronounce.go`, above), makes the five type edits (`types.go`), merges, unmerges and splits (`merge.go`), and finds an entry's name and aliases in the manuscript again (`GuideRescan`, `rescan.go` with the search in `occurrences.go`; `Service.Status` says whether the file is current, with no binding yet). The sidecar's own copies of these commands were deleted in step 3 of [Go versus Python for the sidecars](../research/sidecar-go-vs-python.md). A create and an edit that changes the aliases need a pronunciation for each new name and its places in the manuscript; the host searches the manuscript itself and asks the sidecar only for the pronunciations (`pronunciation`, above), while holding its edit lock, so a Save made meanwhile waits for the answer. Between edits the host keeps the file as it parsed it, with the file's bytes; an edit re-reads the bytes and parses them again only when another writer changed them, whatever the file's size and time say (`heldDocument`). The host is held to what the sidecar's commands did by the cases they recorded before they were deleted, which are frozen (nothing rewrites them): `tests/fixtures/guide-edit/edit-parity.json` (`TestEditMatchesTheSidecarCases`), and in `src/studio/desktop/internal/guide/testdata/` `mutation-parity.json` (`TestMutationsMatchTheSidecarCases`, including when the sidecar wrote nothing), `type-parity.json` (`TestTypesMatchTheSidecarCases`), `pronunciation-parity.json` (`TestPronunciationsMatchTheSidecarCases`), `create-parity.json` (`TestCreatesMatchTheSidecarCases`: the sidecar's pronunciations were fixed, the host is given the same ones and searches the same manuscript, and must write the same file and ask for the same words and names in the same order), `merge-parity.json` (`TestMergesMatchTheSidecarCases`, each case replayed as a chain on the host's own writes and step by step on the sidecar's file), `rescan-parity.json` over a manuscript in the importer's shape, `rescan-manuscript.json` (`TestRescansMatchTheSidecarCases`, `TestStatusMatchesTheSidecarCases`), and `occurrence-parity.json` for the search they share (`TestFindOccurrencesMatchesTheSidecar`, with a sweep of every character Python's `re` folds), `tests/fixtures/guide-build` for the build (`TestBuildMatchesTheSidecar`), and `tests/fixtures/guide-pronounce` for a named source's pronunciation (`TestPronounceMatchesTheSidecar`). Two files are still written by the sidecar's tests, because they pin Python behaviour the files carry: `test_python_text_goldens.py` writes `merge-fingerprint-golden.json` (the fingerprint's bytes, Python's lower-casing and `entity_id`, read by `TestPythonJSONMatchesTheGolden`) and `guide/python-unicode.json`, `test_pronunciation_lookup.py` writes `pronunciation-lookup-golden.json` for the `pronunciation` command (`TestPronunciationLookupMatchesTheGolden`), and `test_pronounce.py` writes `pronunciation-source-golden.json` for its `--source` lines (`TestTheSourceAnswerMatchesTheGolden`). The search is a regular expression in Python (`\b`, the escaped name, `\b`, ignoring case), so the host searches by Python's tables, `python-unicode.json`, not Go's: the same text matches, and an excerpt is cut at the same code point. A rescan reads the manuscript as it is now and does not change the Story Bible's source hash, so a Story Bible built from an older manuscript stays stale until a build; a locked entry is rescanned, as the sidecar did. A type edit starts a Story Bible where there is none, as the sidecar did, but refuses a file that is there and is not a JSON object, which the sidecar would have written a new one over.

## Non-goals and review boundary

The tool does not invent character psychology, choose a voice, scrape external sources, or alter the manuscript. All inferred entities and traits remain review candidates.
