# Replace audio from another narrator's file

Research, 2026-10-24. The owner asked for a tool in Editing that takes audio from a file someone else sent (another narrator, an editor) and puts a chosen stretch of it in place of a chosen stretch of the narrator's own track. This note covers how that would work, what the app already has to build on, what each DAW can do, and what to decide. The draft mock is in [mockups/replace-audio](mockups/replace-audio/README.md), also published privately at `claude.ai/artifact/PeugNwApEKpnogoAPKHt9F`. Refs #2251. Nothing here is built, and the mock is a draft pending the owner's review.

The sample data is the demo book's real audio: Kara Shallenberg's and Eric Leach's LibriVox readings of Chapter I (`tests/fixtures/audio/librivox-alice/`, both 22.05 kHz mono MP3). The word timings below come from the repository's committed alignment of those two files (`alignment/kara_01.words.json`, `alignment/leach_01.words.json`). The loudness and noise figures in the mock are invented for the drawing; nobody has measured them.

## The narrator's job

A file arrives. The narrator wants one stretch of it to replace one stretch of their own chapter. The common cases:

1. **A pickup recorded by someone else.** A duet or multi-cast book where the other narrator voices a character's line, or a stand-in reads a line the narrator cannot. The file holds a few lines, sometimes a whole chapter.
2. **A corrected passage from an editor.** The editor fixed a misread by splicing from elsewhere in the narrator's own audio, and sends back the passage, not the project.
3. **A reference read.** Less common: the narrator wants to hear how someone else read a line, not use it. The Takes strip's audition already covers hearing a file; replacing is the new part.

In each case the narrator has to say two things: which words of **their track** go, and which stretch of **that file** comes in. Everything else (where the edges fall, levels, the gap, undo) the app can propose.

The worked example used throughout, from the demo's Chapter 1, paragraph 2:

| | Words | Starts | Ends | Length |
| - | - | - | - | - |
| Mine (Kara Shallenberg, `kara_01`) | "when suddenly a White Rabbit with pink eyes ran close by her." | 0:54.30 | 0:58.58 | 4.28 s |
| Theirs (Eric Leach, `leach_01`) | the same 13 words | 2:44.20 | 2:47.20 | 3.00 s |

Their read is 1.28 s shorter. Their file also opens with LibriVox's preamble and the prefatory poem, which are not in the script, so their Chapter 1 starts at 2:18.70 where the narrator's starts at 0:22.36. "suddenly" is said four times in the chapter in both files. Both facts matter below.

## Finding the matching stretch

| Way | How | Works for | Fails when |
| - | - | - | - |
| **By hand** | Two waveforms, one per file, each with a range and two handles, as Editing's waveform range works today (drag, handles, Alt snaps to a word boundary, minimum 50 ms) | Anything, including audio with no words (a breath, a sigh) | The file is long and the narrator has to hunt for the line |
| **By the words (recommended default)** | Transcribe their file with the recogniser the recording check already runs, align its words to the script, then look up the narrator's selected words by their script position | Another narrator reading the same script; an editor's corrected passage | Their read departs from the script (an ad-lib, a different edition); the words are said more than once ("suddenly", four times) |
| **By the waveform** | Cross-correlate their audio against the narrator's selected stretch | An editor's file cut from the narrator's own recording, where the samples are the same | Another voice: two narrators' waveforms never correlate, so this does not help the owner's main case |

**Recommendation:** find by the words, show the result on two waveforms the narrator can adjust by hand, and drop waveform matching unless an editor workflow turns out to be common. The words route works on the sample data: the repository's alignment of Eric Leach's file places every word of paragraph 2 (match 1.0 in `leach_01.markers.json`) despite the 2:18 of preamble and poem before it.

**Repeated words.** Aligning their whole file to the script names each word by its line and position, not its spelling, so the four "suddenly"s are four different places. The lookup goes from the narrator's selected script words to the same script words in their file. Only a stretch their file reads twice (a retake left in) gives two places, and the app lists both, as the Read twice card does.

**Edges.** A found stretch ends where the recogniser says the word ends, which is often clipped. The app moves each edge into the nearest pause (the recording check's own cut points do this, `cuts_clean` in the markers files) and then to a zero crossing, as Delete does (`internal/zerocross`). The narrator can still drag either handle.

**Cost.** Transcribing a 12-minute file takes the same time as a recording check of a 12-minute chapter. A narrator who knows roughly where the line is can drag a rough range first, and only that stretch (plus a margin) is transcribed.

## What the app already has

| Piece | Where | What it gives this tool |
| - | - | - |
| Word timings of the narrator's chapter | The recording check, `internal/passagetakes/range.go` | The narrator's span in project seconds, from a selection of script words, exactly as Delete gets it |
| The waveform range | Editing, [Choosing a range on the waveform](../guides/using-the-app/editing.md#choosing-a-range-on-the-waveform) | Handles, Alt snap, minimum length, the sub-word preview |
| `cut_range` / `delete_range` | [REAPER: Range cut](../reference/daw/reaper.md#range-cut) | Split at both ends, move the middle to the muted **Cuts** track, close up or leave a gap, seam fades, room tone fill, one undo block. Run in REAPER 7.82 on Linux (row C3) |
| `stack_takes` | [REAPER: Stacking takes](../reference/daw/reaper.md#stacking-takes) | Creating a take from a file with `PCM_Source_CreateFromFile`, `AddTakeToMediaItem`, `SetMediaItemTake_Source`, `D_STARTOFFS`, provenance in `P_EXT`. Run in REAPER 7.82 (row C6) |
| Take provenance keys | [REAPER: Takes](../reference/daw/reaper.md#takes) | `<prefix>take_source_file` and `<prefix>take_source_range` already name a take's source file and range |
| `file_preview` | [capabilities](../reference/daw/capabilities.md#file_preview) | Playing a stretch of a file outside the project through REAPER (needs SWS; not run in REAPER) |
| `undo_last` | [capabilities](../reference/daw/capabilities.md#undo_last) | The app's Undo reaching REAPER's undo for the app's own action only |
| Room tone | `delete_range` room tone, `internal/roomtone` | A "Room tone" region fills a gap; the Booth keeps each microphone's floor |
| Level measurement | `internal/measure` `AnalyzeRange`, `internal/levelnormalize`, `internal/takecompare` | Loudness of a range and the gain to match a target; the takes' "recorded 4.2 dB apart" note |
| Edit log | `internal/editlog` (`cuts.json`, `wordfx.json`, `stacks.json` under `editing/`) | Where an edit is recorded so word times after it stay right; a replacement is a new kind of entry |
| Copying audio into the project | Voice samples (`internal/voicesample`) | The precedent for copying a clip into the project folder, saying so, and capping its size |
| Pre-roll | Booth, [REAPER: pre-roll](../reference/daw/reaper.md#what-reaper-782-on-linux-was-seen-to-do) | How much of the narrator's own audio plays before the seam when previewing |

## How each DAW would make the edit

### REAPER

One new bridge command, `replace_range`, built from what `delete_range` and `stack_takes` already do:

1. Before the undo block, open a source on the copied file with `PCM_Source_CreateFromFile`, as `delete_range` does for room tone. The path is the copy inside the project (see [Provenance](#rights-and-provenance)), sent by the host, not read from the project; that is new (threat model below).
2. Inside one undo block, `<app name>: replace audio`:
   - split the narrator's item at the end and then the start of their span (`SplitMediaItem`), and move the middle piece to the muted Cuts track (`MoveMediaItemToTrack`), exactly as `delete_range`;
   - add a new item on the narrator's track (`AddMediaItemToTrack`) at the span's start (`D_POSITION`), with a take (`AddTakeToMediaItem`, `SetMediaItemTake_Source`) playing from the start of their stretch (`D_STARTOFFS`) for its length (`D_LENGTH`);
   - put the seam fades on the four new edges (`D_FADEOUTLEN` on the left piece and the new item, `D_FADEINLEN` on the new item and the right piece). A crossfade proper needs the items to overlap by the fade length; `delete_range` does not overlap them, so its seams are a fade-out and a fade-in that meet. Which of the two sounds better at a voice change is unverified and is the owner's ear test;
   - set the gain match as the new item's take volume (`D_VOL`, which renders at the expected level: row "Render", -6.00 dB read as 0.501187);
   - stamp provenance in the new take's `P_EXT`: the existing `take_source_file` and `take_source_range`, plus a replacement id that names the record in `replacements.json`;
   - mode **close**: move the later items on the track by the length difference (`D_POSITION`), as `delete_range` close does. In the example everything after 0:58.58 moves 1.28 s earlier. Mode **keep timing**: move nothing, and fill a shorter replacement's remainder with room tone (as `delete_range` gap does), or refuse a longer one.
3. Report the new item's GUID, the moved piece's GUID and 1 undo step.

**Undo.** One REAPER Undo takes the whole edit back, the same as a cut (row "Undo of a cut", seen in REAPER 7.82). The app's own Undo uses `undo_last` with a new kind, `replace_range`, mapped to the block's label. After a save and reopen REAPER's undo history is gone (row "Reopening": `Main_openProject` clears it), so the app also offers **Put my audio back**, a second command that reverses a replacement from its record: delete the new item, move the piece back from Cuts by its GUID, move the later items back. That is `unstack_takes`'s pattern and works after a reload.

**What is not run in REAPER.** Inserting a new item from a file that is not already in the project; an MP3 or a sample rate different from the project's as a source (REAPER resamples a source on playback by its own documentation; not run here); overlapping crossfades; whether regions and markers after a close-up move (`delete_range` moves items only, and the record does not say what happens to the chapter's regions after it). Each needs a row in [the verification pass](../operations/reaper-verification-pass.md) before the command leaves Experimental.

**Not this way:** fixed lanes. The app never sets `I_FREEMODE` or converts takes to lanes, because lanes copy `P_EXT` and break line identity (row "Lanes and line ids"). Putting their audio in a lane would also leave both reads audible on a track with lanes set to play together.

**A take instead of an item.** Their stretch could be a second take of the narrator's middle piece, so the Takes strip switches between them. `stack_takes` refuses a read longer than the first because `AddTakeToMediaItem` leaves `D_LENGTH` as it was, and replacements are rarely the same length. A take is the better shape for "try their read, keep mine for now"; it needs the item length to follow the active take, which no command does yet. Recommended as a later step, not the first.

### Audacity 3

Audacity has no takes or items, and the app edits it through the pipe in steps with a backup first ([Audacity 3](../reference/daw/audacity-3.md)). A replacement would be: back up the narrator's span (as `cut_range` requires), `Import2` their copied file (one undo point) onto a new track, select their stretch and `Copy`, select the narrator's span and `Delete` (close) or `SplitDelete` (keep timing), `Paste` at the span's start, then `RemoveTracks` the imported track. Clips after the span move only while "Editing a clip can move other clips" is on, which the cut already turns on for itself and puts back. That is several undo points, so the way back is the backup, as with a cut. None of it is run; gain match is `Amplify` on the pasted range, which adds no undo point of its own.

### Audacity 4

No scripting interface ([Audacity 4](../reference/daw/audacity-4.md)), so the app cannot make the edit. It could still find the stretch, preview it with its own player and **export the spliced passage as a new WAV** for the narrator to bring in by hand. That is the fallback below.

### Built-in recorder

The recorder keeps an edit list per take (`Recordings/edits.json`); a cut is an entry in it. A replacement would be a new entry kind that plays a stretch of another file in place of a range. The app plays the recorder's audio itself, so this is host code only, no DAW.

### Fallback: the app renders the splice

When the DAW cannot make the edit, the host can write a new WAV: the narrator's audio up to the span, their stretch (resampled to the narrator's rate, gain applied), the narrator's audio after it, with the fades at the seams. It never overwrites the narrator's recording. This is destructive in the sense that the result is a flattened file, so it is the fallback, not the default. The same renderer gives **Hear the result** a short preview file (pre-roll, their stretch, post-roll) for every DAW before anything changes, which the REAPER path needs too: REAPER cannot play an edit it has not made, and `file_preview` plays one file at a time.

WAV in, WAV out is Go code. An MP3 or other compressed file needs a decoder: the downloaded FFmpeg already decodes an MP3 the narrator picked for measuring (threat model row 1g), so the renderer would reuse that path and refuse a compressed file while FFmpeg is not installed.

## Audio concerns

| Concern | What happens | What the app does |
| - | - | - |
| **Sample rate and bit depth** | Their 44.1 kHz 16-bit MP3 into a 48 kHz 24-bit project. REAPER resamples on playback (by its documentation, not run here); a render fallback must resample itself | Show both formats. Allow a different rate with a note; refuse a file the decoder cannot read |
| **Channels** | A stereo file into a mono track, or the reverse | Note it; REAPER plays it by the track's channel setting; the render fallback mixes stereo down to mono |
| **Loudness** | Two narrators, two mics, two gain settings. The Takes view already says "recorded 4.2 dB apart" for the narrator's own takes | Measure both spans (`AnalyzeRange`) and propose the gain that matches theirs to the narrator's surrounding 5 s, on by default, applied as take volume so it can be changed later |
| **Room tone and noise floor** | The noise between words changes at the seam even when the voice level matches. This is the most audible tell | Measure the floor in the pauses of both. Above about 3 dB apart (a guess to tune by ear), say so in plain words. The app does not denoise; it can suggest the narrator's own noise reduction, and keep the seams in pauses so the floor changes once, not mid-word |
| **Crossfade length** | Too short clicks; too long lets two rooms overlap | Default 10 ms at a pause (the cut's default); offer 5 to 50 ms. At a seam inside a breath or a word, warn and suggest moving the edge |
| **Clicks and breaths** | A seam on a non-zero sample clicks; a breath cut in half sounds wrong | Zero-crossing edges (`internal/zerocross`) and edges in pauses. Whose breath stays is the narrator's choice: the handles move the edge before or after it |
| **Pace and length** | Eric Leach's read is 30% shorter (3.00 s for 4.28 s) | Close the gap by default (later audio moves up); keep timing only when the replacement is no longer than the original |
| **Voice** | Another narrator is another voice. That is the point for a duet; it is a problem for a stand-in | Nothing to fix in audio. The mock says whose audio it is on the words after the edit |
| **Drift after the edit** | Every word after the seam moves by the length difference | The edit log records the replacement, as it records cuts, so word times after it are adjusted without a new recording check; the replaced words take their timings from the alignment of their file |

## Keeping it reversible

- The narrator's own audio is never deleted: the replaced piece goes to the muted Cuts track (REAPER) or the backup (Audacity 3), and the recording file is not touched.
- Their file is never changed. The app copies it into the project and reads the copy.
- One undo step in REAPER, and the app's Undo through `undo_last` while the edit is REAPER's last.
- **Put my audio back** from the record after a reload, after other edits, or from a list of the chapter's replacements in the drawer.
- The words show a mark while replaced, like the effects marker, with whose audio it is.

## Rights and provenance

- **Ask whose audio it is.** A required name field ("Eric Leach"), stored with the replacement. The app does not judge rights; a narrator who uses another person's audio in a delivered book needs their permission, and platforms such as ACX ask the narrator to warrant it. The dialog says that once, in a line, without legal advice.
- **Keep the source untouched.** Read only. The app records its original name, size, SHA-256 and the time it was chosen.
- **Copy it into the project, and say so.** The project should not depend on a file in Downloads that the narrator will clean up. The copy goes into the project's own folder (`<app>/imported-audio/`), never outside it, with a file name the host builds (the original name is kept in the record, not used as a path). The dialog says where and how big. A cap per file (proposal: 500 MiB) and per project, like voice samples' 200 MiB.
- **Nothing leaves the computer.** Transcription is local, as the recording check is.
- **Delivery.** Replaced words are listed in the chapter's record, so a delivery report could list whose audio is in the book. Not proposed for the first version.

## Where it lives in Editing

| Entry point | When | Notes |
| - | - | - |
| Selection toolbar and the word menu: **Replace audio…** | Words selected | The main way in. The selection is "mine" |
| Jump menu (Ctrl+K): **Replace audio from a file…** | Any time | Opens the same dialog with the cursor's line selected |
| Takes strip under a line: **Use a file…** | A line's takes open | The take route above, later |
| Pickups page: a line marked **Needs pickup** | Later | "Use a file" as another way to resolve a pickup |
| The drawer: **Replacements** tab | Any replacement in the chapter | List, play, **Put my audio back** |

The dialog follows Delete's layout: one dialog, steps inside it, the confirm button names the action ("Replace 13 words"). The steps: choose the file, find the stretch, listen and match, confirm. Done is a message with Undo, as for a cut.

## What is a bridge command and what is host code

| Part | Where | New or reused |
| - | - | - |
| Pick the file (OS dialog or drop), copy it, hash it, read its format | Host | New binding; the drop is row 6aa's path |
| Transcribe and align their file | Host and the transcription sidecar | Reused (the recording check), with a new manifest entry for a file that is not a chapter |
| Find the narrator's span in project seconds | Host | Reused (`internal/passagetakes/range.go`) |
| Measure loudness and noise floor of both spans | Host | Reused (`internal/measure`), new decision for the floor |
| Hear mine | REAPER (`navigate` / play) or the app | Reused |
| Hear theirs | REAPER `file_preview`, or the app's player | Reused (needs SWS in REAPER) |
| Hear the result | Host renders a short preview WAV, played as a file | New renderer; the same code is the fallback |
| Make the edit | REAPER `replace_range`, one undo block | New command |
| Undo the last edit | REAPER `undo_last`, kind `replace_range` | New kind |
| Put my audio back | REAPER `restore_replacement` | New command |
| Record it | Host, `editing/replacements.json` | New file |
| Audacity 3 steps | Host, through the pipe | New step list |

## Wire contracts and trust boundaries

**Wire contracts** ([wire contracts](../architecture/wire-contracts.md)): a new binding result for the file facts (name, length, format, rate, channels, size, hash), one for the found stretch and the plan (both spans, edges, gain, floor difference, mode), the `replace_range` and `restore_replacement` results and their REAPER events (`RANGE_REPLACED`, `REPLACEMENT_RESTORED`, `REPLACE_STALE`) in `internal/bridge/wire.go`, and the persisted `editing/replacements.json`. Each needs a Zod schema, a golden payload and a row in `wireContracts.test.ts` (`wire-contract-change`). `replacements.json` also gets a row in [data files](../reference/data-files.md).

**Trust boundaries** ([threat model](../architecture/threat-model.md)). A file from someone else is untrusted input, and it crosses four boundaries:

1. **The host parses it.** A WAV header by Go's bounded reader (row 6d); a compressed file by the downloaded FFmpeg (row 1g's precedent, which today covers only an MP3 picked for measuring). Size cap before reading.
2. **The transcription sidecar reads it** (row 4e's manifest pattern: the host names the file, the sidecar reads only that).
3. **The bridge opens a host-sent path as audio and adds it to the project.** `preview_file_range` already opens a host-sent path (row 5r) but never adds it to the project; `delete_range` adds items only from a path read from the project. `replace_range` would be the first command that puts a path the host sent into the project. Mitigation: the host sends only the copy inside the project folder, by an id it resolves itself (as `WorkspacePreviewTake` takes a take id, never a path), and the Lua checks the path is under the project folder.
4. **The copy is written into the project.** File name built by the host (row 6q's rule), no overwrite, the cap, and the shared path fixtures (`internal/pathfixtures`) for a project with spaces, Unicode, a long path, a network path and read-only.

A new row (5u, or the next free number) in the threat model and, since a file from someone else is new attacker-controlled input, a line in `SECURITY.md`'s scope.

## State matrix

| State | What the narrator sees |
| - | - |
| No words selected | **Replace audio…** is off on the toolbar; from the jump menu the dialog opens on the cursor's line |
| File chosen, reading it | Its name, a spinner, Cancel |
| Not an audio file, or a format the decoder cannot read | "This file is not audio the app can read (a .docx). Choose a WAV, FLAC or MP3 file." |
| A compressed file with FFmpeg not installed | "Reading MP3 files needs the audio encoder. Install it in Settings > Models & downloads, or choose a WAV file." |
| Too big | "This file is 1.4 GB. Files up to 500 MB can be brought into the project." |
| A network path or a file that went away | Refused with the reason; **Choose another file** |
| The file changed after it was chosen | "The file changed since you chose it. Choose it again." (hash) |
| Finding the words | Progress through their file, Cancel; a **Find it myself** link to skip to the waveforms |
| Found once | Both waveforms set; the match ("13 of 13 words") |
| Found more than once | A list of the places, each with a play button; nothing chosen until the narrator picks |
| Found in part | "Found 9 of 13 words. Their read differs at 'pink eyes'." Range set over what was found; adjust by hand |
| Not found | "These words are not in their file as read." **Find it myself** |
| Edge inside a word | The line under the waveform names the word, as Editing does today |
| Span shorter than 50 ms, or longer than 5 minutes (proposal) | Refused with the limit |
| Mine across two items | "Choose words inside one take", as voice samples and the cut say |
| Mine includes words already cut or replaced | Refused; name the edit |
| Keep timing with a longer replacement | "Their read is 1.3 s longer than yours. Close the gap instead, or shorten their stretch." |
| Loudness differs | The proposed gain, on by default, with the numbers |
| Room tone differs | The difference in plain words, no automatic fix |
| SWS missing (Hear theirs in REAPER) | The existing sentence; the app plays it itself instead, without REAPER's FX |
| DAW not connected, recording, wrong project, older script | The existing sentences for a cut; nothing changes |
| Item changed in REAPER since the plan (stale GUID) | "The chapter changed in REAPER. Check it again." Nothing changes |
| Audacity 4 | "Audacity 4 cannot be edited by the app yet. **Export the spliced passage** to bring in by hand." |
| Done | "Replaced 13 words with Eric Leach's audio in REAPER." **Undo** |
| Undo after something else in REAPER | `undo_last`'s refusal; **Put my audio back** from the drawer still works |
| Double-click on Replace | One edit (the button turns off while the call runs) |
| Leaving the page mid-dialog | Nothing changed; the copied file stays in the project and is listed as unused |
| File names in right-to-left or with emoji | Shown as text; the copy's name is the host's own |
| The other side never answers | The cut's timeout and message; the edit is not recorded until the event arrives |

## Options

| | What | For | Against |
| - | - | - | - |
| **A** | REAPER `replace_range` as a new item over the Cuts track, close or keep timing, plus the host renderer for Hear the result | Reuses the run-verified cut and take code; one undo; nothing deleted | One new bridge command and one restore command; the first command to add a host-sent file to the project |
| **B** | Their stretch as a take of the narrator's piece | The Takes strip compares them; switching back is one click | Item length does not follow a take today; replacements are rarely the same length |
| **C** | The app renders a spliced file and swaps the item's source | Works the same for every DAW | Flattens the edit; loses REAPER's non-destructive item; bigger files |
| **D** | Export only: the app finds and previews, the narrator edits in the DAW | No DAW command at all | Leaves the hard part (exact edges, fades, gain) to the narrator |

**Recommendation: A**, for REAPER, Experimental, with the finder, the match notes and Hear the result for every DAW. **D** for Audacity 4 and as the fallback anywhere a DAW refuses. **B** later, if the narrator walkthrough shows people want to compare reads before choosing. **C** only for the built-in recorder if its edit list cannot take a new entry kind.

## Build plan

Each step is one pull request and lands in this order:

1. Pick and copy the file, read its format, the record file and its contract (host, Zod, data-files row, threat-model row).
2. The dialog with two waveforms and by-hand ranges, Hear mine and Hear theirs.
3. Find by the words (transcription of their file, the lookup, repeated places).
4. Loudness and floor measurement, the match notes.
5. The preview renderer and Hear the result.
6. `replace_range`, `undo_last` kind, `restore_replacement` in REAPER: harness tests first (`reaper-command-add`), then a scripted run in the real-REAPER CI for the item, the source, the fades, the move and one Undo.
7. The edit log entry and word times after the seam.
8. Audacity 3 steps; the export fallback for Audacity 4.

Each updates [the Editing guide](../guides/using-the-app/editing.md) and its screenshots.

## Risks

- **It will sound like a splice.** Two rooms and two voices are audible however good the edges are. The tool can make the edit clean; it cannot make the recordings match. The match notes should say so rather than imply a fix.
- **The words route depends on the recogniser.** A file of a different edition or with ad-libs aligns poorly. By-hand ranges stay one click away.
- **A new trust boundary.** A file from someone else goes into the project and is parsed by FFmpeg and REAPER's decoders.
- **Regions and markers after a close-up** may not move with the audio; unverified for the cut as well.
- **Scope.** Eight pull requests for the full tool. The first useful version is steps 1, 2, 5 and 6: by hand, REAPER only.

## Questions for the owner

1. **Close the gap by default?** When their read is shorter or longer, should later audio move (recommended), or keep its time with room tone filling a shorter read?
2. **Copy their file into the project?** Recommended: yes, into the project's own folder, saying where and how big, so the project keeps working after Downloads is cleaned. The alternative is to use the file where it is and warn if it moves.
3. **Ask whose audio it is?** Recommended: a required name, stored with the edit, shown on the words. Should the app also say once that using someone's audio needs their permission?
4. **Turn their level to match yours automatically?** Recommended: on by default, shown with the numbers, changeable later.
5. **Is the main case another narrator (a duet or a stand-in) or an editor's corrected file?** For another narrator, finding by the words is right. For an editor's file cut from your own audio, matching by the waveform would be more exact, and is more work.
6. **First version REAPER only, by hand?** Recommended: yes (steps 1, 2, 5 and 6), then finding by the words, then Audacity.
7. **Should a replaced line also be a take you can switch back to (option B), or is Undo and "Put my audio back" enough?**

## Not checked

- Nothing here ran in REAPER or Audacity. The REAPER behaviour cited is from the recorded rows named; everything new is marked unverified above.
- The loudness and noise figures in the mock are invented. The word times are real.
- No narrator walkthrough.
- The mock uses system fonts in the repository copy.
