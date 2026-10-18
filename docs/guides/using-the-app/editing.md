[Using the app](README.md) › Editing

# Editing

Editing is where you hear a chapter against its script and edit it. The chapter's script is the editor: each word
shows how it was heard, each line has its takes under it, and what you select is what you play, delete or put an
effect on. Open it from **Editing** in the sidebar's Edit group, from a linked chapter's **Open in Editing** in the
[audio engine panel](navigation.md#linking-chapters-to-tracks), from a recording check's **Open in Editing** on
[Production](production.md#checking-a-chapters-recording), or from **Manage takes in Editing** on a note in
[Proof](proof.md#a-note-and-your-decision). Its address is `/editing/<chapter>`; `/editing` opens the first chapter.

With no manuscript imported yet, the page says so and offers **Import manuscript**, which goes to
[Production](production.md#importing-the-manuscript).

## The page

The header has the chapter step (the previous and next chapter buttons, Alt+↑ and Alt+↓, and the chapter list), a
legend of the marks in the text with how many of each, the recogniser that heard the words (**Flagged by**), the
**Timeline** button (on a window 1360 px wide or more) and the button that opens the drawer. At 1280 px and below the
legend uses short labels with no counts.
While the chapters and the chapter's lines are being read, the header stays and the script is drawn as grey blocks; if the chapters cannot be read, the page says so.

Words carry what the last [recording check](production.md#checking-a-chapters-recording) heard:

- **Not in the script** (Extra): words heard that the script does not have, between the words they followed;
- **In the script, not read** (Not read): words of the script nothing was heard for;
- **Misread**: a word heard differently, with what was heard;
- **Low confidence**: a word the recogniser was unsure of.

Each line starts with its time in the chapter. A line with more than one take has a takes chip under it: how many
takes, the one that plays, and whether one was chosen yet. Tab visits one chip, the one on the line the cursor is on (the
first before there is a cursor), so the script is not forty stops; **T** opens the takes of the cursor's line, and a click
opens any other.

![Editing - Chapter 1 linked to its track: the chapter step and the legend, the script with each line's takes chip and time, the bar and the key hints](../../images/ui/editing-default.webp)

The bar at the foot plays the chapter in the app, from its recorded audio with each item's trims, so it works with the
DAW closed. It shows the time, and what is selected with its start, end and length. The key hints under it come from
your keyboard settings ([Settings](settings.md)), so a key you rebound shows its new key.

The word playing is lit, and the text scrolls to keep it in sight until you scroll by hand; the next play scrolls it
again. When you play the project in the DAW instead, the lit word follows the DAW's play position, as long as the DAW
reports one and the app is not playing its own audio. When the DAW stops, its last word stays lit until you move the
cursor.

A chapter has to be linked to a track (see [Linking chapters to tracks](navigation.md#linking-chapters-to-tracks)) for
its words to carry the times they were heard at. A chapter with no audio to edit says so in a banner over the script
and shows the script plain, with no word marked "not read": it names the cause (no track linked, the linked track is
not in the saved project, or the track is empty) and opens the audio engine panel, where **Link chapters…** is. With
the built-in recorder there is no track to link, so the banner points at recording the chapter in the Booth. A chapter
that was never checked has no heard words: the page shows its script plain, with a **Not transcribed yet** note and a
**Check recording** button beside it that opens the chapter's recording check. Close the check and the page reads the chapter again, so
what it found shows without a reload. The check never starts on its own. The check's **Check options** (a closed section in its panel) are the same
choices as [Check recordings](production.md#checking-a-chapters-recording) offers.

## Selecting words

Click a word to place the cursor there. Shift+click another, drag across the text or press Shift+← and Shift+→ to
select a run of words. Hold ← or → (with Shift to select) and the cursor keeps travelling along the text; Up and Down hold
the same way, a phrase at a time. Every other key does its job once, however long you hold it. A toolbar floats under the selection with **Play**, **Add FX**, **Voice sample**, **Mute**, **Takes of this
line** (on a line with more than one take) and **Delete**; the bar offers the same actions, with **Delete words and
audio** in full on a wide window. **Delete**, **Mute** and **Add FX** stay on the bar but are off while the DAW cannot make
the change (they are Experimental and start switched off in [Settings](settings.md)); a line above the bar then says so
and why, and the same sentence is in each button's hint. The line's audio shows under it while the cursor is on it. Right-click a word for its
menu: play the selection, copy, delete or mute the words, add or remove an effect, **Mark as voice sample…**, mark them for a pickup, add a note,
show or keep the line's takes, and **Split into takes** on a line whose one take reads it twice.

With a screen reader, the script is one read-only text box. Each time the cursor stops, the screen reader says the word it is on
(with ", not in the script" for a word that was only said), or "3 words selected, 0:23 to 0:24" for a selection, and "Selection cleared"
when Esc lets the selection go. It waits for a quarter of a second without a key before it speaks, so holding ← or → says where the
cursor stopped, not every word it passed. A flagged word says what its card says instead. When a dialog opened from the text closes
(**Add note…**, **Mark as voice sample…**, and the delete, mute and effects dialogs), by Esc, **Cancel** or **Save**, focus is back on the text
and the selection is as you left it.

A flagged word opens its card: what the script says and what was heard, and the choice to keep the word as read, which
clears the mark (with Undo in the message that confirms it).

![Editing - four words selected: the floating toolbar under them, the bar naming the selection with its times, and the line's audio](../../images/ui/editing-selection.webp)

## Deleting words and their audio

**Delete words and audio** (Delete) asks first. The question names the words, where the cut starts and ends (moved to
the nearest zero crossings), the track, and what happens to the gap: close it, so later audio on the track moves up, or
leave room tone of the same length so the timing does not move. You also choose the crossfade at the join, how much audio to keep at each
edge of the cut, and whether the cut audio is kept on a muted track named Cuts. The DAW makes the cut as one undo step; the recording file is not
touched. **Mute** keeps the audio and silences the words.

![Editing - Delete on four selected words: the question names the words, the cut and what the DAW will do](../../images/ui/editing-delete-dialog.webp)

## Effects on words

**Add FX** (F) lists your FX chains from the DAW. Choose one and the question shows how the item will be split around
the words, where the splits fall, the fades at the joins and what the DAW does: it splits the item at both ends and puts
the chain on the middle piece only. Nothing else moves, and one undo step in the DAW takes it off. The words with an
effect are underlined and end with an effects marker: click it to select the words or remove the effect. The word
menu offers **Remove** with the chain's name too, and the drawer's Effects tab lists them.

![Editing - Add FX on four selected words: the DAW's effect chains](../../images/ui/editing-fx-menu.webp)

The Effects tab shows how much of the chapter effects cover against a cap, 10% unless you change it in the tab's **Cap**
field (a whole percent from 1 to 100, kept for the project). Over the cap the tab warns, and Add effect asks again
before it goes ahead.

![Editing - an FX chain chosen for four words: how the item is split around the words](../../images/ui/editing-fx-dialog.webp)

## Marking a voice sample

Select the words where a character's voice came out right and press **V** (or **Voice sample** on the toolbar, or **Mark as
voice sample…** in the word menu). The dialog offers the characters who speak in this chapter first, with the speaker of the
first word chosen, then every other character, then **Narration**. Under the character it counts that character's samples ("3 of
20 samples"); a character with 20 has to lose one first. **Play range** plays the words from the recording. Give the sample a
label and a note if you like ("Furious, to the court", "pitch up, no breaths"), and leave **Make primary** on if this should be
the one that plays first for that character; it is on by default for a character's first sample. **Enter** saves, **Ctrl+Enter**
saves from the note, and **Esc** closes. So with the right character already chosen, marking a sample is **V**, then **Enter**.

![Editing - Voice sample on four selected words: the character, the words with Play range, the label and note, and Save sample](../../images/ui/editing-voice-sample-dialog.webp)

Saving copies the raw recording of those words, as it was before editing, with a short margin either side cut at a quiet point,
into `narration-utils/voice-samples/` in the project folder. Nothing leaves your computer, and the clip does not change if you
later cut, re-record or move the chapter. A message says "Saved voice sample for" the character, with **Undo** for ten seconds, which removes
the sample again. Marking the same words again for the same character says it is already a sample instead of making a second.

The dialog says why it cannot save, in one sentence, and saves nothing: the words are not in the recording, they run across two
takes ("Choose words inside one take"), the recording changed since the chapter was checked ("Check it again, then mark the
sample"), some of the words are cut ("Restore the cut words or choose words without them"), the clip would be under half a
second or over 30 seconds, the recording is not a WAV file, the audio file is missing, the saved REAPER project cannot be read,
the character has 20 samples, or samples already use the 200 MiB a project may hold. Play, rename and manage a saved sample under
**Voice samples** on the character's entry in the [Story Bible](story-bible.md#voice-samples); playing one from the Booth is not built yet.

## Takes

Click a line's takes chip (T steps to the next take) to open its takes under it. The suggested take comes first, with
why it is suggested and the steps that would make the comparison surer: **Trim white space**, **Trim breaths** and
**Normalise**, each asking before it changes anything in the DAW. Then each take, with its waveform, what share of the
script it read as written, and its pause, level, noise, clarity and breaths. Play a take to hear it; **Keep take**
(Enter) makes it the one that plays, and **Hide others** (H) hides the other takes from the lanes. **Show in the DAW**
moves the DAW to the line, on a DAW that can move to a place in the project.

![Editing - Normalise from a suggestion's steps: the question says what it will change in the DAW](../../images/ui/editing-suggestion-step.webp)

**How retries are kept** decides, for the line or the whole chapter, whether a line read again later in the chapter is
stacked as a take of the first read or left where it was. With Stack, **Stack retries as takes** shows the plan before
the DAW moves anything.

![Editing - a line's takes opened under it: the suggested take with the steps that would make it surer and each take's evidence](../../images/ui/editing-takes.webp)

## The drawer

The drawer button (Ctrl+Shift+C) opens the drawer beside the text, or over it on a narrower window. **Esc** closes it,
from the text once nothing is selected or from the drawer itself, which hands the focus back to the button.

### Cleaning up

**Clean up** lists what was found in the chapter (words not in the script, not read, misread and of low confidence,
each with **Review** to step through them) and the clean-up findings by kind: gaps, breaths, clicks, plosives and noise.
Pick a strength, **Preview** to hear the first three findings with two seconds either side, and apply the change to
the findings you selected. Clean-up actions that are still
experimental stay off until you turn them on in [Settings](settings.md).

![Editing - the drawer on Clean up: what was found in the chapter and the findings by kind](../../images/ui/editing-drawer-cleanup.webp)

### Effects, Backups and Timeline

**Effects** lists the effects on words in this chapter and adds one. Under **Add an effect** the DAW's own chains and plug-ins are listed, each with a **Favourite** button. A favourite is listed first here, in the Add FX menu and in the question that asks before an effect goes on; the buttons edit the global list, the same one as **Favourite effects** under **Set on a page** in [Settings](settings.md#set-on-a-page), which can also set it for one project. A name with a comma in it cannot be a favourite. **Backups** shows only with a DAW that keeps
backups of its project; with one that edits the audio itself, the app backs the words up before each delete, effect or
stack, and refuses the edit if the backup fails. The Backups tab is also where this project's backup settings can be changed (**Keep backups**, the window either side of an edit, and **Keep backups for (days)**). It is a shortcut to the same settings as the Audacity backups under **Set on a page** in [Settings](settings.md#set-on-a-page), which also sets them for every project (Global); the tab edits this project only. **Timeline** shows the line the cursor is on as the chapter's audio
and one lane per take on one time axis. On a window 1360 px wide or more it is a strip under the text, which the header's
**Timeline** button (S) shows and hides; on a narrower window it is a tab of the drawer.

![Editing - the Clean up and effects panel on Effects: no effects yet, and Add effect waiting for a selection](../../images/ui/editing-drawer-effects.webp)

![Editing - the Effects tab with a DAW that lists its chains: each has a Favourite button, and the favourites are listed first](../../images/ui/editing-drawer-effects-chains.webp)

![Editing - the Timeline strip under the text: the waveform and takes of the line the cursor is on](../../images/ui/editing-drawer-timeline.webp)

## When the DAW is not connected

A banner at the top says the DAW is not answering, or that the chosen DAW is not supported here yet, with **Check again**
beside it, which asks the DAW again. It names only that cause: a setting that keeps Delete, Mute and Add FX off is the line above
the bar, never the banner. You can still read, select and play; the
actions that change the DAW (delete, mute, effects, keeping a take) wait until it is back.

![Editing - the banner when the DAW is not answering, with Check again](../../images/ui/editing-daw-off.webp)

## When the chapter has no audio

With no track linked to the chapter there is nothing to edit yet. A banner at the top says why and opens the audio
engine panel, the legend reads **No audio to edit**, and the script shows no word as not read.

![Editing with no track linked - the banner saying why there is no audio to edit, and the legend](../../images/ui/editing-unlinked.webp)

---

[← Booth](booth.md) · [Index](README.md) · [Proof →](proof.md)
