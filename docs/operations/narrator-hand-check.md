# Narrator hand check

One page for the owner to work through by hand in the installed Windows app. It covers what no test can: how the screen looks and sounds, and what REAPER and the microphone do. [The Windows QA checklist](windows-qa-checklist.md) is the full numbered list; this page is the short version for a first sitting. Use a copy of a book you know, with REAPER installed and a microphone plugged in.

Tick a box only after you have seen it. Report a failure on [#992](https://github.com/countrymanprime/narration-studio/issues/992) with the section number and what you saw instead. Every result below is pending until you run it.

## 1. Booth page breaks and Read to here

Booth guide: [page breaks](../guides/using-the-app/booth.md#pages-and-your-stopping-place).

- [ ] **1.1 Page marks.** Open a chapter of more than 250 words in the Booth. Expect a faint dashed line across the text and **Page 2**, **Page 3** down the right margin. Wrong: a mark that moves while you scroll, record or change the text size, or marks in a chapter of one page.
- [ ] **1.2 Words per page.** In Settings › Project change **Words per page**. Expect the marks to move to the new count. Wrong: the old marks stay.
- [ ] **1.3 Read to here.** Right-click a word, choose **Read to here**. Expect a chequered-flag ribbon, a message with **Undo**, and the same flag in the Script and the jump menu. Set a second place: the first flag moves. Press **Undo**: it goes back. Wrong: two flags in one chapter, or anything that stops or pauses a take when you reach the flag.

## 2. Hear buttons and the Story Bible lists

Story Bible guide: [hearing a name](../guides/using-the-app/story-bible.md#hearing-a-name).

- [ ] **2.1 Hear a name.** Open an entry with a pronunciation and press the play button beside its name, then beside an alias. Expect your computer to speak it; the first time the app asks before it downloads the voice. Wrong: silence with no message, or a broken file left behind after a failure.
- [ ] **2.2 No pronunciation.** Open an entry with none. Expect the button dimmed and a hint that says why. Wrong: a button that looks live and does nothing.
- [ ] **2.3 Sort and Filter menus.** In the entry list open **Sort**, choose **Most mentioned**, then **Book order**; open **Filter** and keep one kind. Expect the rows to reorder, a chip under the search for the filter, and the Filter button counting it. Wrong: a menu that hides behind the list or the window edge, or rows that do not change.

## 3. The Effects tab and Choose in REAPER

Editing guide: [Choose in REAPER](../guides/using-the-app/editing.md#effects-on-words). Needs REAPER linked.

- [ ] **3.1 Choose.** Select words from one take of one paragraph, open **Effects**, press **Choose in REAPER…**. Expect REAPER's FX window to open on the words, and the tab to list what you pick within a second or two. Close REAPER's window: the effect is added, named after the plug-ins. Wrong: nothing opens, or the tab shows an old answer.
- [ ] **3.2 Cancel.** Repeat, pick a plug-in, press **Cancel**. Expect the plug-in gone and the item joined back together in REAPER. Wrong: a split or an FX left behind. One Undo in REAPER should step back the split.
- [ ] **3.3 REAPER closed.** Quit REAPER and open **Effects**. Expect a plain reason and **Check again**. Wrong: a blank panel.

## 4. Speaker chips

Booth guide: [speaker picker](../guides/using-the-app/booth.md#voice-samples).

- [ ] **4.1 Chip colours.** In a chapter with dialogue, look beside the lines a character speaks. Expect a chip in the character's colour; a suggested speaker's chip dashed until you confirm it. Wrong: a chip on narration, or a colour that differs from the Story Bible.
- [ ] **4.2 Pick a speaker.** Press a chip. Expect the characters in this chapter first, then the rest. Choose one: the chip changes. Wrong: the list covers the text, or the choice does not stick after you reopen the chapter.
- [ ] **4.3 Hear the reference clip.** In the side panel press the speaker button on a character with a sample. Expect the clip to play and press again to stop; **Esc** also stops it. Wrong: two clips at once, or a character with no sample showing a live button.

## 5. DAW meters and pre-roll

Booth guide: [Levels and Punch](../guides/using-the-app/booth.md#recording). Needs REAPER and the microphone.

- [ ] **5.1 Meters.** Open the Booth Levels menu and speak. Expect REAPER's own input level to move under **Input level**, and the output level under the other slider, several times a second. Wrong: a flat bar while REAPER's meter moves, or an old level after you close REAPER (it should say how long ago it last heard REAPER).
- [ ] **5.2 Pre-roll line.** Read the **Punch** line, for example **Pre-roll off · 2 measures (4.0 s)**. In REAPER run "Pre-roll: Toggle pre-roll on record". Expect the line to change to on. Wrong: it keeps the old state.
- [ ] **5.3 A punch.** Record a punch with pre-roll on. Expect REAPER to play from before the punch point, then record at the word. Wrong: the take starts at the lead-in, or starts late and clips the first word.

## 6. Playback through REAPER, and the fallback

Editing guide: [playback](../guides/using-the-app/editing.md#playing-with-reaper).

- [ ] **6.1 Through REAPER.** With REAPER linked, press play on a line with an effect or a level change in REAPER. Expect to hear the effect or level. Wrong: the plain recording.
- [ ] **6.2 The fallback.** Quit REAPER and play the same line. Expect the app to play it itself and a message such as "REAPER is not answering. Played in the app instead." Wrong: silence, or no message.
- [ ] **6.3 During a take.** Start a recording and press play in Editing. Expect nothing to play. Wrong: playback over the take.

## 7. The microphone pass (#510)

The real-microphone steps are T31-4 to T31-7 in [the Audacity verification pass](audacity-verification-pass.md) and [checks 1.1 to 1.8 and 9.6](windows-qa-checklist.md). Record each as "as expected" or what happened on [#510](https://github.com/countrymanprime/narration-studio/issues/510).

- [ ] **7.1 A clap.** Record a short take with a clap. Expect it to play back with the clap where you made it. Wrong: dropouts, a long gap before the first sound, or a take on the wrong microphone.
- [ ] **7.2 Unplug mid-take.** Pull the microphone during a take. Expect the take to end with a reason and the audio before the unplug kept. Wrong: a lost take or a frozen Record button after you plug back in.
