---
title: Booth
lead: Record a chapter while the text follows your voice and the take starts and stops in your DAW or the built-in recorder.
---

The Booth shows the chapter's text large and follows your voice through it with a local speech engine. Nothing you say is sent anywhere. It needs an imported manuscript.

## Open the Booth

1. Open **Booth** in the navigation, or press **Record in Booth** on a chapter or credits card on [Script](script.md).
2. Pick the chapter with the chapter stepper on the top bar.
3. Check the chip on the top bar that names the recording setup. If it says your DAW is not linked or not running, click it to fix that in [Settings](settings.md#set-up-recording).
4. Choose the microphone in **Levels** in the footer if the footer asks for one.

![Booth ready to record: the chapter stepper, the text with the reading position, the side panel and Record in the footer](../../../docs/images/ui/booth-setup.webp "Ready to record")

## Connect REAPER

When Record cannot start, the footer says why. A box above the footer shows the steps for a reason you can fix from the Booth.

1. If the box says recording is experimental, press **Turn on Record**.
2. If it says **Connect REAPER to record**, load the launcher once in REAPER: choose **Actions > Show action list > New action > Load ReaScript** and pick the file the box shows (**Copy path** copies it).
3. With the chapter's project open in REAPER, run the launcher you loaded (its action starts with **Script:**). Or press **Open in REAPER and connect** to do both in one go.

> **Note:** Load the launcher again after you update the app, because the file moves with each update.

## Record a take

1. Press **Record** (or Space, or a foot pedal mapped to Space) to start a take. Record becomes **Stop** and a **REC** pill shows.
2. Read. The word you are on is marked with a caret, and the text scrolls to keep it in view.
3. Press **Stop** (or Space) to end the take.
4. To fix a line, press **R** to punch and roll from the word you are on.
5. Click a word to start from it. **↑** and **↓** move by phrase, **←** and **→** by word.

![Six seconds into a take: the text follows the voice](../../../docs/images/ui/booth-following.webp "The text following the voice")

With the built-in recorder, each take is saved as a new audio file in the project's `Recordings` folder. Assign it to its chapter in [Proof](proof.md).

## Hear a voice sample

1. Press a speaker chip to open the speaker picker, and press the play button on a character's row.
2. Or press **V** to play the primary sample of whoever speaks the phrase you are on. Press **V** again to stop it.

A sample does not play while a take is recording.

## Leave the Booth

Press Escape to go to Script. During a take, the Booth asks "Stop recording?" first; **Stop and leave** stops the recording and then leaves.
