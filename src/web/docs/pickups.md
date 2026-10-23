---
title: Pickups
lead: Gather every line to record again into one session for the Booth.
---

Pickups records nothing itself: each line opens in the [Booth](booth.md), where you record it.

## Where the lines come from

The list is built each time the page opens. The **From** column names the source:

- **Speech**: a gap the [recording check on Proof](proof.md#one-chapter) found in a chapter, from a chapter whose check is current.
- **Proof note**: a note you marked **Needs pickup** on [Proof](proof.md).
- **Audio**: a note about a sound (a mouth noise, a plosive, a breath) that you marked the same way.
- **You**: a line you added by hand.

## Review the list

1. Use the chapter stepper to show every chapter or one (Alt+Up and Alt+Down step it).
2. Press **Hear the original in context** on a line to play the recording there with 3 seconds either side.
3. Clear a line's box (or press Space on it) to leave it out of the next session.
4. Press **Check recordings** to run the recording check on chapters whose check is not current, so their gaps join the list.
5. Press **Add a pickup by hand**, then give the time in the recording (`05:12.0` or `5:12`) and the line to re-record.
6. Press **Remove from pickups** to hide a line from this list. Its note or check keeps its own record.

![Pickups on all chapters: the lines grouped by chapter and the Pickup session panel](../../../docs/images/ui/pickups-list.webp "The pickups list")

## Record a pickup session

The **Pickup session** panel counts the open lines in view that are not left out, and about how many minutes they take to record.

1. Press **Add N as markers in** your DAW to put a pickup marker at each line's place.
2. Press **Open N in Booth** to open the Booth on those lines, starting with the first line's chapter (see [Booth](booth.md)).
3. Or press **Copy the pickup script** to copy the lines as "chapter · time: line".
4. Press **Mark recorded** on a line once it is done, or **Open in Booth at this line** to record one line.

> **Note:** A line is recorded once its pickup marker in the DAW says so. Marking a line recorded renames its marker; while the DAW is not answering, the line reads **Not in the DAW yet** until the app can write the change.
