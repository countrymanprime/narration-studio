---
title: Proof
lead: Work through everything the app's checks found, as one list of notes, and decide what happens to each.
---

Proof collects the differences a check heard between the script and the recording, the [Story Bible](story-bible.md) entries and pronunciations that need a look, and the delivery rules your measured files did not meet. Your decision on each note is kept with the project.

## Choose all chapters or one

1. Use the chapter stepper beside the title to show **All chapters** or one chapter. The Left and Right keys step it, and Esc goes back to All chapters.
2. On **All chapters**, read **Open notes, by chapter**: one tile per chapter with its open notes. Choose a tile to open that chapter.
3. Watch the ring and counters on the right of the title, for example **12 of 14 cleared · 13 decided**. A note is cleared once it is waived; a deferred note, or one waiting for its pickup, is decided but still open.

![Proof on all chapters: the ring, the chapter strip of open notes, the notes grouped by chapter and the Inspector](../../../docs/images/ui/proof-default.webp "Proof on all chapters")

## One chapter

A chapter shows its **Recording check** card above its recording.

1. Read the card: whether the chapter's check is current, stale, running or not done yet, and how much is recorded against the script's estimate.
2. Press **Check recordings** to run the check. It is off, with the reason, when the chapter has no recording or no text, or your DAW is not reachable.
3. Press **Show the findings**. For each finding, press **Accept** to turn it into a note with the suggested decision, or **Ignore** to keep it out of your notes.
4. Press a pin on the waveform to select its note. Zoom, or drag the window's edges, to see more or less of the chapter.

![Proof on Chapter 1: the recording check card, the waveform and the chapter's notes](../../../docs/images/ui/proof-chapter-linked.webp "One chapter's recording check")

## Decide on each note

1. Narrow the notes with the chips (**All**, **To review**, **Open**, **Pickups**, **Decided**), or press **Find in notes** to find text in them. Ctrl+F opens the jump menu, which lists the notes that match what you type.
2. Select a note in the table, or its pin. The Inspector shows what the script says and what was heard, with the difference marked.
3. Choose a decision from the table below. It is saved at once and the next note is selected. A message offers **Undo**, and Ctrl+Z also takes it back.
4. Press **Reopen** to put a decided note back to review.

| Decision | Key |
| --- | --- |
| **Needs pickup** | P |
| **Fix in edit** | E |
| **Waive** (the line stays as it was read) | W |
| **Defer** | D |

> **Note:** Whether a note counts as a pickup or a fix in the edit comes from its kind. A misread or a skipped word is re-recorded; a repeat or a gap is fixed in the edit.

Notes marked **Needs pickup** join the list on [Pickups](pickups.md). Choosing between takes is on [Editing](editing.md).

## Delivery checks

When you check rendered files on [Master & QC](master-and-qc.md), each rule a file did not meet becomes a **Delivery check** note here, one per rule per file. Decide on it as on any other note; your decision changes neither the profile nor the measurement. After a new render, the check comes back to review with your note kept.
