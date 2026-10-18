[Using the app](README.md) › Story Bible

# Story Bible

Story Bible tracks every character, place, and organization extracted from the manuscript,
with pronunciation, aliases, and narration notes. Each entry is a row of two lines: its name, then its kind in the kind's colour (an entry whose kind the host could not tell is marked **Review**) with how many names it has (its own and each alias) and how many chapters it appears in. The kind chips over the list filter it, the search box finds an entry by any of its names, the menu beside it sorts by name, type or chapters, and the Up and Down keys move through the rows. Right-click a row (or press the Menu key on it) for **Open**, **Find in the manuscript**, **Mark reviewed** (when the entry needs it) and **Delete entry**; Delete asks first, and a locked entry says it has to be unlocked. The buttons under the title scan the manuscript (while a scan runs the same button becomes **Cancel scan**, and its progress shows under the filters, so nothing else moves), import entries, open Voice data, build or refresh the Story Bible, and add an entry; the **Entries** and **Series** tabs sit below them. With no manuscript imported the page asks for one, and its **Import manuscript** opens the import on this page. If the list of kinds or the chapters cannot be read, a line under the filters says so with **Check again**, and an entry that cannot tell whether its type speaks says the same; the rest of the page keeps working.

![Story Bible - a search for "hatter" narrowing the list by name and alias](../../images/ui/storybible-search.webp)

![Story Bible filtered to the Character kind](../../images/ui/storybible-characters.webp)

Selecting an entry opens its detail panel, read-only at first: its names and how you say each, its
description, for a type that can speak **How they talk**, **How they act** and **What they know**, its
properties, its **Relationships** to other entries, and **Appears in**, the chapters it is in, each with a
button that opens it in the [Script](script.md). The kind beside the name is a plain label until you press Edit, when it becomes a menu that changes it, and the
magnifier button opens the Script's Find on the name. Press Edit (the pencil) to change the entry, then Save
(or Cancel). Read-only, the entry shows no add-a-name box and no add-a-relationship row; Edit brings them in. Locked entries can't be edited until
unlocked. Rebuilding is deliberately strict: it favors missing a name over listing ordinary
words, so add unusual names by hand with the + button.

![Story Bible entity detail panel](../../images/ui/storybible-entity.webp)

Pressing Edit switches the entry to edit mode, where Save, Cancel and a red Delete appear on the far
side of the header, set apart from Save so it can't be mis-clicked. Lock only appears in the read
view: an entry can never be locked while it is being edited, so unlocking always returns you to a
read-only entry, never back into an edit in progress. Locked entries show only Unlock; a brand-new
entry starts unlocked and can be locked once it has been saved.

Each entry also has **Properties**: a list of labelled facts, such as "Codename: Wren" or "Abilities: flight",
that you keep in the order you give them. In edit mode each property is a row with a name and a value, buttons to
move it up or down or remove it, and an Add button below. A value needs a name, and no two properties may share
one (capital letters do not make a name different); Save says which row to fix. A row you add and leave blank is
dropped. Properties are kept when you rebuild the Story Bible, and the summary of an entry that opens from the
Script lists them too.

![Story Bible - an entry in edit mode, with Save and Cancel shown](../../images/ui/storybible-entry-editing.webp)

Entries the build isn't sure what kind they are get the **Needs Review** kind, in the review colour;
choose the right kind from the menu beside the name. An entry or a name the build flagged shows a
**Review** pill in the list and **Needs review** with a **Mark reviewed** button in its header. The
**Needs review** chip under the kind chips shows only these entries and the ones with suggestions waiting.
An entry with suggestions still to verify shows **Mark reviewed** switched off, with the reason, until each is verified or rejected.

![Story Bible - an entry of the Needs Review kind, with its relationships and the chapters it appears in](../../images/ui/storybible-needs-review.webp)

In edit mode, typing into the alias field opens a dropdown of existing entries whose name or alias matches,
so a name mentioned under a different spelling can be merged into the entry it already
belongs to instead of creating a duplicate.

![Story Bible alias field with a matching-entries dropdown open](../../images/ui/storybible-alias-dropdown.webp)

## Building with a language model

The first time you press Build / refresh, the app asks before it downloads anything. The Story Bible finds
people, places and organizations best with a language model (a small English model by default, chosen under
Settings, Story Bible). The question says what it is, its version and publisher, how much is downloaded and how
much disk it needs, where it will be kept, and its licence. You choose one of three:

- **Download model** downloads it with a progress bar you can cancel, checks it, and then builds. The next build
  does not ask again.
- **Build with rules-only** builds this once without a model. The result is lower quality (it finds fewer names
  and mistakes more ordinary words for names) and the build says so when it finishes. The model stays not
  downloaded, and the next build asks again.
- **Cancel** changes nothing: no build and no download.

If a download fails, the message says why (no connection, not enough disk space, or a file that did not match
the approved one) and you can try again. A download that was cut off carries on from where it stopped. Choosing a
model in Settings never downloads it, and Settings lists every approved model whether or not it is installed.

## Hearing a name

The play button beside a name, or beside one of its aliases, speaks it with the local preview
voice. It only works once a pronunciation exists: with none, the button is dimmed and a hint
(reachable by keyboard, not just the mouse) says so. The first time you press play, the app asks
before it downloads the voice. If the preview fails, the message says why, and pressing play
again tries again; a failed run never leaves a broken recording behind.

| The message says | What happened, and what to do |
| --- | --- |
| "… could not be spoken: the voice produced no audio for it." | The name is only punctuation or symbols. Give it a pronunciation the voice can say. |
| "The preview voice could not be loaded (…)." | The voice's files did not load. In [Settings, Models and downloads](settings.md#models-and-downloads), Repair it, or remove it and download it again. |
| "The preview could not be saved (…)." | The recording could not be written. Close anything that has the file open and try again. |
| "The preview took longer than 2m0s and was stopped" | The voice did not answer in time; the first preview after starting the app is the slow one. Try again, and restart the app if it keeps happening. |
| The question about downloading the voice | The voice is not installed yet. |

## How you say each name

An entry lists **the names the app links in the text, and how I say each**: its first name, then each alias, one row
each. Read-only, a row shows how you say the name and where that came from. In edit mode a row has a **How I say**
field and a source tag:

- Type in the field and press Enter (or leave it) to use your own; the tag then reads **Entered by me**.
- Press the tag to choose a source instead: the CMU dictionary, Wiktionary (when it is installed), eSpeak NG, or
  Merriam-Webster online. The source is asked for that name alone; one with nothing for it says so and the value stays.
- When you replace a dictionary's answer with your own, or the other way round, the one replaced is kept: the tag's
  menu offers **Use mine** or **Use the dictionary's** to switch back.

A rebuild keeps all of this. Which source a *fresh* pronunciation tries first (at build time, or when you add an alias)
follows **Settings > Voice & pronunciation > Pronunciation source for new names**. A note written on a pronunciation shows under its
name. A question for the author is a mark on the [Script](script.md#select-text) page.

## Looking a name up online (Merriam-Webster)

When no dictionary on your computer knows a name, you can ask Merriam-Webster's online dictionary,
on your own free key. Get one from **Settings > Voice & pronunciation > Merriam-Webster key > Get a free key** (it opens
Merriam-Webster's sign-up page in your browser), paste it into **Your key** and press **Save key**.
On Windows the key is kept encrypted for your Windows account; **Remove key** deletes it.

Then, in edit mode, open **Look up elsewhere** under a name: **Look up online** sends that one name, and nothing else
from your book, to Merriam-Webster, and shows its answer in Merriam-Webster's own respelling (for example \krō-ˈkā\).
**Use this** puts it in the name's field. Every answer is kept on your computer, so looking the same name up again sends
nothing and works offline ("from this computer's copy"). **Look up elsewhere** also has the name's recordings on
Wikimedia Commons.

![Story Bible - Look up online for a name: a dictionary's respelling with Use this](../../images/ui/storybible-pronunciation-online.webp)

| Message | What it means | What to do |
| --- | --- | --- |
| "Add your own free Merriam-Webster key in Settings > Voice & pronunciation first." | No key is saved. | Save your key in Settings > Voice & pronunciation. |
| "Merriam-Webster refused the key ..." | The key was mistyped, or is not for the Collegiate Dictionary. | Copy it again from your dictionaryapi.com account page and save it. |
| "An online lookup sends one word or name only ..." | The name is longer than three words or has symbols. | Look up a shorter alias, or one word of the name. |

## Suggestions: scan and import

**Scan the manuscript** (the wand button at the top) reads the book and suggests new entries and facts about the ones
you have: what a character says, does and knows, and details. The first time, when no analysis tool is installed, it
asks whether to use the basic scan now, download better analysis, or import from a file instead; nothing downloads
until you agree. **Import entries** opens a CSV or JSON file of entries you made elsewhere and shows what it would add
before it adds anything.

![Story Bible - the Import entries dialog (CSV or JSON)](../../images/ui/storybible-import.webp)

A suggestion the app is sure of is accepted on its own; one it is not sure of waits for you. **Needs verification**
beside the filters shows only the entries with suggestions waiting, and lists above them the suggestions that have no
entry yet. An entry with suggestions waiting shows a **Verify** pill in the list, its accepted facts, and a **Suggested**
list where you accept, edit or reject each one, with the quote it rests on (press the quote to go to the line in the
Script; a quote whose line the book no longer has is plain text that says so). An entry cannot be marked reviewed while it has suggestions waiting.

![Story Bible - Needs verification: the suggestions not in the Story Bible yet, each with its score](../../images/ui/storybible-verification.webp)

## Voice references and dialogue cue attribution

An entry whose type can speak (Character, unless you change it under **Story Bible types** in [Settings](settings.md)) has three more sections below
Personality notes: **Voice samples** ([below](#voice-samples)), **Reference clips** and **Dialogue cues**. None of them judges your reading - they only
track what you've marked or approved and who a line of dialogue is attributed to; there is no acoustic comparison or "drift" flag in the app yet.

**Reference clips** lists the REAPER regions you've approved as a voice reference for this
character. Choose a region from the picker (the regions of the saved REAPER project), add an
optional note such as "anchor take, chapter 1", and press **Approve as reference**. Approving the
same region again for the same character just updates its note in place. **Revoke** removes a
reference outright. If the region's name or time range changed in REAPER since you approved it, the
reference shows a **Changed since approval** badge - re-approve it once you're happy with the new
region, or revoke it. A reference clip has no play button; open the region by name in REAPER to hear it. To
hear how you voiced a character in the app, mark a [voice sample](#voice-samples) instead.

**Dialogue cues** lists the quoted lines the Story Bible build attributed to this character, plus
any line left unattributed (three or more speakers active in a scene, or no speaker tag at all, are
left `unknown` rather than guessed). Pick a different speaker, or **Unknown**, from the dropdown
beside a cue to correct it. A correction survives the next Story Bible rebuild - it is never
silently overwritten by a fresh, possibly-wrong, extraction.

The **Voice data** button at the top of the Story Bible opens a panel
for what isn't about one character: **Narration voice samples** and a reference for **plain narration**
(useful as a baseline separate from any character), the space the project's voice samples use, **Remove voice samples…**, and
**Remove voice data…**, which revokes every approved reference in the project - for every character and for narration - in one
action, after you confirm. Neither removal touches the manuscript, dialogue cues, or anything else in the Story Bible.

![Story Bible - the Voice data slide-over: choosing a region to approve as a reference, and Remove voice data](../../images/ui/storybible-voice-data.webp)

## Voice samples

A voice sample is a stretch of your own recording that you marked in [Editing](editing.md#marking-a-voice-sample) as how a character
sounded. Each character's entry lists its samples under **Voice samples**, above **Reference clips**: the primary one first (marked with a
star, and the one the Booth will play), then the newest. A row shows its label, its length, the chapter and the words it was marked on, and
your note. Press the play button to hear it, **Stop** to stop it (so does **Esc**); one sample plays at a time, and playing another stops the
first. **Open in Editing** goes to the sample's chapter.

![Story Bible - the Queen of Hearts entry with four voice samples: the primary, one whose passage changed, one whose audio file is missing](../../images/ui/storybible-voice-samples.webp)

The **⋯** menu on a row has **Rename…** (the label and the note) and **Make primary**, and both work on any entry, locked or not. **Move to a
character…** and **Delete…** appear only after you press **Edit** on the entry, so a stray click cannot remove a sample; unlock a locked
entry first. Delete asks first and says that the sample's audio is
removed and the recording it was copied from is not touched; afterwards the focus moves to the next sample. A character may have 20 samples,
and the section says so when it has them; moving a sample to a character that has 20 is refused.

A row says what is wrong with it:

| Shown | What it means | What to do |
| --- | --- | --- |
| **Passage changed** | The words in that chapter are not the words the sample was marked on. The sample still plays. | **Open in Editing** goes to the chapter and tells you the marked words may have moved. |
| **Chapter removed** | The chapter is no longer in the manuscript. The sample still plays. | Nothing; delete it when you no longer need it. |
| **Audio file missing** or **Audio file changed** | The sample's audio in the project's `narration-utils/voice-samples/` folder is gone or is not the file that was saved. It cannot play. | **Check again** reads the folder again. Then **Mark again in Editing** (offered while the words are as they were), or press **Edit** and delete it. |
| "Couldn't read the voice samples." | The host could not read the list. The last list that was read stays. | **Check again**. |

An entry with none says "No voice samples yet" with **Open Editing**. **Check again** beside the heading looks at every sample's file
again. The list also follows the project by itself: a sample marked in Editing, or deleted from another window, appears or goes without
you doing anything.

In **Voice data**, **Narration voice samples** work the same way, and **Move to a character…** and **Delete…** are always there. Under
**Samples for a character that is no longer in the Story Bible** are the samples of a character who was deleted, merged into another
entry, or whose type no longer speaks; they are kept until you move them to a character or delete them. **Remove voice samples…** deletes
every sample in the project, with its audio, after you confirm, and says how many it removed and how much space came back.

![Story Bible - the Voice data slide-over with Narration voice samples, the space the samples use, and the sample of a character who left the Story Bible](../../images/ui/storybible-voice-data-samples.webp)

## Series voice bible

If you're narrating a series, the **Series** tab (beside the **Entries** tab) shows a character's
approved reference clips across every book of the series, each labeled by the book it came from.
Name a series to start: type a name and press **Create series**. A series with only this one book
in it still shows - honestly - "no other books in this series yet"; add a sibling book's project
folder below (**Browse…**, or type its path) and press **Add** once it has approved references of
its own. **Remove** takes a book out of the series without touching that book's own project data.

There is no acoustic comparison here either - no drift evidence against another book, and no
audition. It's the same reference-clip bookkeeping as the Character entry's own Reference clips
section, just pooled across the books that share a character.

| Message | What it means | What to do |
| --- | --- | --- |
| "... could not be spoken: the voice produced no audio for it" | The name is only punctuation or symbols, so the voice has nothing to say. | Preview an alias that has letters in it, or ignore the preview for this name. |
| "The preview voice could not be loaded" | The downloaded voice is damaged or missing files. | In Settings, under TTS, choose "Remove local voice", then press play to download it again. |
| "The preview took longer than 2m0s and was stopped" | The helper that speaks the name did not finish. | Try again. If it keeps happening, restart the app. |
| "configure the Manuscript Guide executable" | The helper that builds the Story Bible was not found. | Reinstall the app. A build run from source needs its Manuscript Guide sidecar built first. |

---

[← Script](script.md) · [Index](README.md) · [Booth →](booth.md)
