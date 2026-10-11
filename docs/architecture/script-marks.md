# Script marks

**Status: host store, bindings, schemas and mock implemented (SN-B721, host API 97), and threads on a mark (SN-B722, host API 98). No page reads them yet: the Script page's marks UI is SN-B741 and SN-B742, and the Notes and Queries tabs are SN-B752.**

A mark is a range of one paragraph of the manuscript, marked with one of the narrator's mark types, with an optional note, or a question when the type asks. It is the Studio Next mock's `Annotation` of type `mark` (`docs/research/mockups/studio-next/src/domain/schemas.ts`); pronunciation flags (`pron`) are not marks and belong to SN-B73. The store is `apps/desktop/internal/marks`, the bindings `apps/desktop/bindings_marks.go`, and the UI contract `apps/ui/src/api/contracts/marks.ts`.

## The file

`<project>/narration-utils/marks.json`, schema version 1:

| Field | Holds |
| --- | --- |
| `schemaVersion` | `1`. A newer version is refused and the file is never overwritten |
| `migratedNotes` | `true` once the reader's old notes have been brought across (always `true` in a written file) |
| `types` | The narrator's mark types, in their order: `key`, `name`, `colour`, `style`, `asks` |
| `marks` | Each mark: `id`, `chapterId`, `paragraphId`, `start`, `end`, `quote`, `type` (a type's key), `text`, `status` (only on an asking mark: `open` or `resolved`), `thread` (the replies, below), `createdAt` |

It is narrator data, read through `persist`: a corrupt file, one over the byte cap, or one holding a type or mark that breaks the rules below is kept aside as `marks.json.corrupt-<time>` and a fresh list starts; the narrator is told. Every change is a read-modify-write under one lock per file, written to `marks.json.tmp` and renamed.

## The rules

- **A range is in one paragraph.** `start` and `end` are UTF-16 code units into the paragraph's text (a JS string index), `start < end`. The host refuses a chapter the manuscript lacks, a line not in that chapter, an empty or backward range, an end past the line, and an offset between the halves of a surrogate pair. It takes `quote` from the line itself, never from the page.
- **Text is bounded plain text.** A note or question is trimmed, at most 2000 UTF-16 units, with no control character but a line break or tab. A type that asks refuses an empty question, and its mark starts `open`.
- **Types are the narrator's.** A project starts with the mock's six (Word stress, Breath / pause, Pace, Emotion, Note, Query for author). A save replaces the whole list: 1 to 24 types, each with a name of at most 40 units on one line, one of six colours (`copper`, `info`, `ok`, `warn`, `bad`, `violet`) and one of six line styles (`highlight`, `underline`, `double`, `dotted`, `wavy`, `box`). A type with no key is new and the host names it. Removing a type that marks use is refused with the count unless the call says `removeUses`, which removes those marks too. A type that now asks opens its marks that have no status, as the mock's dialog does.
- **A thread is replies after the mark's own text.** The mark's `text` is the narrator's opening message; each reply is `{who, text, at}`: `who` is `you`, `author` or `proofer`, `text` is bounded plain text as above and never empty, and `at` is the host's UTC time it was written (RFC 3339, to the second). Any mark has a thread. Only a mark whose type asks has a status, so resolving or reopening any other mark is refused. A stored message with an unknown author, no text, padded text or a time that is not the host's makes the whole file corrupt.
- **Caps.** At most 10,000 marks; the file is at most 8 MiB, on read and on write.
- **Stale is reported, never moved.** Every read checks each mark against the current manuscript (the rule of [ADR 0382](../adr/0382-script-markup-is-a-chapter-keyed-sidecar-of-line-offsets-checked-on-read-and-drawn-without-changing-the-text.md) and [ADR 0820](../adr/0820-a-bookmark-is-a-spot-kept-in-a-project-sidecar-checked-on-read-and-cleared-when-the-manuscript-is-replaced.md)): `paragraph_missing` when the line is gone, `range_out_of_range` when the range no longer fits it, `text_changed` when the range fits but its words are not the quote. A stale mark keeps its stored range.
- **Reading order.** Marks come back by line, then start, end, creation time and id; a mark whose line is gone goes last.
- **Replacing the manuscript clears them.** A confirmed replace (`ManuscriptImportCommit` with `confirmedReset`) and Clear project data remove the file (`resetDerived` in `internal/manuscript/service.go`); a re-import without a reset keeps it.

## The old notes and the prep markup

The first read of a project with no `marks.json` brings the reader's notes (`narration-utils/manuscript-notes.json`) across once: one `note` mark per note, on its anchor range when it has one, else an empty range at the start of its line, its text made plain and cut to the cap. The file is then written with `migratedNotes: true`, so a later read does not import again. The old file is only read, never changed or deleted. The old prep markup (`prep/markup.json`: stress, pause, speaker tags) is not carried: the mock has no such markup. Both old stores keep working until the Script swap (SN-B8) deletes them.

## The bindings

| Binding | Takes | Answers |
| --- | --- | --- |
| `MarksList` | nothing | `{types, marks}` (`marks-list.json`) |
| `MarksAdd` | chapter id, line id, start, end, type key, text | the mark (`marks-add.json`) |
| `MarksRemove` | mark id | `{types, marks}` (`marks-remove.json`) |
| `MarksSaveTypes` | the full type list, `removeUses` | `{types, marks}` (`marks-types.json`) |
| `MarksReply` | mark id, who, text | the mark (`marks-thread.json`) |
| `MarksEditMessage` | mark id, message index, text | the mark |
| `MarksDeleteMessage` | mark id, message index | `{mark, message}`: the mark and the message removed (`marks-thread-deleted.json`) |
| `MarksRestoreMessage` | mark id, index from 0 to the thread's length, the message | the mark |
| `MarksSetStatus` | mark id, `open` or `resolved` | the mark |

Each thread call is one command the UI journals with its inverse, so the Notes and Queries tabs need no host change: a reply's inverse is deleting the last message, an edit's is an edit back to the old text, a delete's is `MarksRestoreMessage` at the same index with the message the delete answered, and resolve and reopen undo each other. An index outside the thread, or a mark id that is gone, is refused and nothing is written.

The goldens are written by `TestMarksContractGoldens` and `TestMarksThreadContractGoldens` and checked by the UI's `markSchema`, `markTypeSchema`, `marksSchema`, `threadMessageSchema` and `markThreadDeletedSchema`. The bindings take ids, offsets, keys and plain text, never a path. The trust boundary is row 6y of the [threat model](threat-model.md).
