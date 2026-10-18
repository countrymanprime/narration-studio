[Using the app](README.md) › Settings

# Settings

Settings is a page of eight categories, one shown at a time. The list sits at the left in three groups: **Shared
tools** (Recording & DAW, Speech to text, Voice & pronunciation, Models & downloads, Delivery), **This project**
(Project) and **This computer** (Appearance & keys, App & updates). **Set on a page** stands apart under
**Elsewhere**. In a narrow window the list folds into one **Category** button that names the current category and opens the
list.

![Settings - Recording & DAW, with the category list at the left and the search and filters above](../../images/ui/settings-recording.webp)

**Ctrl+,** opens Settings from any page. When a link from another page brings you here (the Booth's DAW settings,
a "fix credits" link, Master's silence cleanup), Settings opens on the setting, lights it up for a moment and
offers **Back to** the page you came from.

## Every setting says whose it is and who uses it

Each row has a name, a line on what it does, and under it:

- **This computer**, **This project** or **All projects**. A setting for **All projects** is one value for the
  computer that a project may override: under the control it says **This project uses the computer setting.** with
  **Override for this project**; once overridden the row says **overridden here**, shows **This project uses** with its
  own control, and **Use computer setting** goes back. A **This project** setting belongs to the open project only.
- **Used by** and the pages that read it. Each name goes to that page; the setting is changed here, once.
- **Also set in** where a quick control for the same value sits (the rail's theme button, the Script's Words tab).

A change applies at once, with no Save button. The row says **Saved** beside its control. A row that differs from its
default shows **Changed**, a bar at its edge and a reset button that puts it back; a category with changed rows shows
how many in the list and **Reset <category> to defaults**. A change that costs something asks first: changing the
transcription model says earlier checks are marked out of date and run again. A value the host refuses keeps
the previous value and says why under the row; the page then notes that changes may not be kept until one succeeds.

Rarely changed settings sit under **Advanced** at the foot of a category, closed until you open it; the button
says how many it holds.

![Settings - a project overriding a setting that is otherwise for all projects](../../images/ui/settings-override.webp)

## Find a setting

**Search settings** matches the name, the description and words you might use instead (typing "whisper" finds the
transcription model; "breath" finds silence cleanup). Results are grouped under their category with **Show the
whole category**, and include matches from the Advanced sections. **Changed** lists everything that differs from
the default, wherever it is; **In this project** lists the settings this project owns or overrides. Each says so
when nothing is there. **Escape** clears the search.

![Settings - searching for "whisper"](../../images/ui/settings-search.webp)

## Recording & DAW

**Record with** chooses where this project's takes are recorded: **REAPER**, **Audacity** or the **Built-in
recorder** (see [Choose REAPER](#choose-reaper)). The choice is saved with the project. A refused choice (no project open,
a take running, or the built-in recorder not available) says why under the radios, and the choice stays where it was.
Under it, **Connection** says what the app can reach right now, with **Test connection**.

Also here: **Microphone** (a list of the computer's inputs, with **Refresh the list**; the Booth uses the same
one), and, for REAPER only, **Start the launcher script with REAPER**, and under Advanced **REAPER program**,
**Experimental REAPER actions** and **Capabilities**. These are settings of this computer; a project has no override for them.

![Settings - Recording & DAW: the capabilities and the REAPER path under Advanced](../../images/ui/settings-daw.webp)

### Choose REAPER

Each radio says whether that program was found on this computer, or what stops it (for example
**Experimental: switched off in Settings.**, with the switch under Advanced, below). A project folder holding a REAPER
project file (`.rpp`) starts on REAPER; pick another radio to change it.

### Link your REAPER project

Under the radios is the project's REAPER file. With one `.rpp` in the project folder it reads **REAPER not
linked** and offers **Link** with the file's name; **Choose a project file** opens a file dialog for any other
`.rpp`.

![Settings - Recording: REAPER chosen and not linked yet, with Link Alice.rpp and Choose a project file](../../images/ui/settings-recording-link.webp)

The file can be in the project folder, in a subfolder of it, or anywhere else, such as a folder or drive you keep
for REAPER. A file inside the project folder keeps working when you move the whole project. For a file elsewhere,
a note says where the file and the project are. Only a file that is not an `.rpp`, or no longer exists, is
refused. Linking also chooses REAPER. Once linked, the card reads **REAPER linked** with the file's name and
**Start REAPER**.

![Settings - the REAPER project file linked, with Start REAPER](../../images/ui/settings-recording-linked.webp)

### DAW Integration

When REAPER is not installed, the card offers **Get REAPER**, which opens its download page in your browser; the
app never downloads or installs it for you. **Check again** looks again. A running REAPER has been heard from in
the last 5 seconds, and the card says whether its open project matches the linked one.

- **REAPER program** (Advanced): the full path to `reaper.exe`, for a REAPER the app does not find by itself. A
  value that is not a path to `reaper` or `reaper.exe` is refused where you type it, and the old one stays.
- **Start the launcher script with REAPER** (off by default): REAPER runs the Narration Utils launcher when the app
  starts it.
- **Experimental REAPER actions** (Advanced, off by default): the DAW actions not yet verified in REAPER stay refused
  while it is off, unless you set that action to **On** in the table; while it is on, every one left on **Auto** is allowed.
- **Capabilities** (Advanced): a table of what the app can ask the recording tool to do, each with **Auto**, **On** or
  **Off** and a **Now** column: the level (**Supported**, **Experimental**, **Not yet available** or **Unsupported**),
  the tool's own reason when it is unavailable, and a warning on any action that replaces audio that cannot be brought back.
- The **REAPER launcher** path with **Copy path**, to load once in REAPER as an action (**Actions > Show action list >
  New action > Load ReaScript**) and load again after each update, since the path changes. The Booth shows the same
  steps when Record is waiting for REAPER ([Booth](booth.md#recording)).

The Audacity backups and the favourite effects are set on [Editing](editing.md) (see [Set on a page](#set-on-a-page)).

## Speech to text

**Transcription model** is the one default for comparing and checking recordings: Production's recording check,
[Proof](proof.md), [Pickups](pickups.md) and [Editing](editing.md) all use it. It is for all projects, and a project may override it.
Changing it asks first. Choosing a model that is not on this computer shows **Not on this computer** with **Download** in the row.

**Live reading in the Booth** holds the **Live engine** (Whisper, or Moonshine on Windows) and the **Live model** (`tiny`
or `small`) the [Booth](booth.md) follows your voice with. Under Advanced, **Recording check** holds the **Two-pass check**, its **First-pass model** and
**Re-check model**, **Parallel processes** and **Chunk length** ([how it works](../../utilities/recording-coverage.md#the-model-cascade)).

![Settings - Speech to text, asking before the transcription model changes](../../images/ui/settings-speech-confirm.webp)

## Voice & pronunciation

- **Preview voice** is the voice that says a name or word when you ask for a [preview](story-bible.md#hearing-a-name). It does not narrate anything.
- **Show definitions from** chooses where the Script page's **Words** tab shows definitions: the web page (the default), the local dictionary or the online
  service. The choice is the same one as the Words tab's **Definitions from** menu. The local dictionary shows **Installed** or **Not installed** with a button to download or remove it; the online service
  shows **Online**, **Offline**, or **No key saved**.
- **Pronunciation source for new names** is what a new name tries first (Automatic, CMU, Wiktionary or eSpeak); it never limits generating or replacing a pronunciation by hand for an entry.
- **Merriam-Webster key** (Advanced): an optional free key of your own (**Get a free key**, **Save key**, **Test key**, **Remove key**) that Look up online uses when no dictionary on this computer knows a name. It is kept apart from the other settings and never shown again after you save it; only the word you look up is sent.

## Models and downloads

One list of everything Narration Studio can keep on this computer: Whisper models, Moonshine models, the preview voice, the Story Bible language models, the dictionary, the wiktionary pronunciations and the MP3 encoder. Nothing downloads by itself, and
removing one never touches your projects. Above the list, the disk the installed ones use and the folder they are kept in.
Which one is *used* is chosen in the category that uses it; here you only get, check and remove them.

![Settings - Models & downloads: the disk used and each download with its state, size, what uses it and its actions](../../images/ui/settings-models.webp)

Each row says what it is, its type and size, its **Status**, **Used by** (pages) and **In use** (the settings that choose it). The status is one of:

- **Not installed**: **Download** starts the download. A bar shows the real bytes so far and **Cancel** stops it while bytes are arriving; the checks after the last byte cannot be cancelled. A download that is already running when you open the page (started by a Story Bible build, a preview or a comparison) is shown too, and leaving the page does not stop it.
- **Downloading** and **Checking the download**: the download itself, then the check of every file against its approved size and checksum.
- **Installed · checked**: **Remove** deletes that one asset after you confirm. The confirm names the settings that use it; they switch to the smallest other model you have, and checks made with it are marked out of date. When it is the only installed choice for a setting, the removal is refused and says so.
- **Needs repair**: some files are missing or no longer match, so the app will not use the asset. **Repair** downloads it again; **Remove** deletes it.
- **Download failed**: the reason (no connection, not enough disk space) is in the row, with **Try again** and **Dismiss**.
- **Not available yet**: the app lists the asset but does not offer it in this version. The row says why and has no buttons.

With nothing downloaded, the page offers **Download the recommended set** (the Small transcription model and the preview voice). Below the list, **Story Bible analysis tools** lists the optional tools that make the Story Bible scan better (GLiNER, BookNLP small and large, and a local language model), each with what it does, its size, where it downloads from and the memory it needs, and the **Offer better analysis when scanning** box. None is offered in this version; once one is, **Download** asks first.

## Delivery

- **Delivery profile** picks the profile this project is judged against, on [Master & QC](master-and-qc.md) and [Delivery](delivery.md), the same choice as Delivery's own menu, with the limits of the chosen profile listed under it.
- **Default profile for new projects** is what a project that has not chosen its own is judged against (ACX until you change it).
- **Custom profiles** (Advanced) lists your profiles and the built-in ones to copy. **Duplicate** makes a custom copy and opens it in the editor, where you can rename it, turn a rule off, and change the lowest and highest of a rule that has a range (a length is in minutes); a rule with a fixed value can only be turned off, and a copy cannot add a kind of rule the app does not check. **Edit** and **Delete** work on a custom profile; a project that chose a deleted profile goes back to the default.

![Settings - a copy of ACX open in the delivery profile editor](../../images/ui/settings-delivery-profile.webp)

## Project

![Settings - Project: the manuscript, the Story Bible rows, the marks and the narrator](../../images/ui/settings-project.webp)

- **Manuscript** says when the manuscript was imported and how many words it has (or **No manuscript yet**), with **Replace manuscript…** (or **Import manuscript** when there is none). The replace confirm names what it clears.
- **Build the Story Bible after import** and **Language model for the Story Bible** are for all projects, and a project may override them.
- **Entry types** lists the kinds of [Story Bible](story-bible.md) entry, each with its name, colour, a **Can speak** box (entries of that type can be picked as the speaker of a quoted line, and the next Story Bible build attributes dialogue to them) and how many entries it has. A type you add with **New type** does not speak until you tick the box. Rename a type in its box and every entry of it moves with it; change its colour; or remove one: the remove button stays off while entries use the type, and the last type cannot go. A taken or reserved name is refused, and says why under the list.
- **Marks** lists your mark types, each with its colour, and **tracks a reply** on a type that asks for one. **Edit marks…** opens the same **Define how you mark up** dialog as the Script page.
- **Narrator name** fills the narrator's name in the credits, for all projects, and a project may override it. Under Advanced, **Room tone per credits file** (0 to 10 seconds, 0 by default) is the silence the [Production](production.md#the-credits) credits estimate adds to the opening and to the closing credits file, head and tail together (ACX asks for 1 to 5 seconds at each end of every file).
- **Credits**: see [Credits](#credits).
- **Clear derived data** (Advanced) removes the imported manuscript and its stored source, the Story Bible, proofing artifacts, reader notes and bookmarks, and saved comparison results for the current project, after you confirm. Its settings remain.

![Settings - the Replace manuscript confirm for an imported file, with its title, word count and what is kept](../../images/ui/settings-manuscript.webp)

![Settings - Clear derived data asks first](../../images/ui/settings-project-data.webp)

## Credits

**Credits**, under Project, shows whether the opening and closing credits can be read as they stand, and the retail sample, with **Edit credits…**. The editor opens in place and holds the audiobook's opening and closing credits, an optional chapter announcement, and the retail sample. The templates are shared by every project; the filled-in values belong to this project.

- **Templates**: pick a template to edit its **Name**, **Kind** (Opening, Closing or Chapter announcement)
  and **Body**, then **Save template**. **New** starts a blank one, **Duplicate** copies the selected one
  and **Delete** removes it.
- **Tokens**: bracketed tokens in the body, such as `[Title]`, `[Author]` and `[Narrator]`, are filled
  from the project values. Wrap a part in braces to drop it, punctuation and all, when a token in it has no
  value: `[Title]{: [Subtitle]}` reads just the title for a book with no subtitle.
- **Chapter announcement**: what you read at the head of every chapter. `[Chapter]` is the chapter's
  heading as the manuscript names it ("Chapter 1") and `[Chapter Title]` its subtitle ("Down the
  Rabbit-Hole"), so `[Chapter]{: [Chapter Title]}.` reads "Chapter 1: Down the Rabbit-Hole." and just
  "Prologue." for a chapter with no subtitle. You record it inside each chapter file, so keep it to the chapter
  heading and subtitle: Proof expects the spoken chapter title there, and any other words are reported
  as extra.
- **Preview** shows the body with the values filled in, its word count, and any token that has no value
  yet, highlighted and listed as unresolved. A chapter announcement is previewed for the first chapter
  ("Shown for Chapter 1, one of 12 chapters"); it needs an imported manuscript.
- **Project values**: Title, Subtitle, Author, Series, Book number, Copyright, Year, Copyright holder,
  Publisher, and a Narrator that overrides the narrator name set under Project for this project only. A value
  is saved as you type. Where the manuscript suggests a title or author, **Use suggestion** fills it in.
- **Clear credits** empties every project value at once, after asking. The templates in your library stay,
  so the credits show their tokens in brackets again until you fill them in.

The first opening and closing templates appear in the [Script](script.md) reader and as the
credits rows on [Production](production.md#the-credits).

![Settings, Project, Credits: a chapter announcement previewed for Chapter 1](../../images/ui/settings-credits-chapter-announcement.webp)

### Retail sample

**Retail sample** is the stretch of the book you pick for the retailer's sample: up to 5 minutes, from
anywhere in the book. Choose the chapter and line it **starts in** and **ends in** (the line numbers the
[Script](script.md) reader shows) and **Save sample**. The panel says where it runs and how long it
is at about 155 words a minute; a range longer than 5 minutes is refused with its length, and the sample
you had is kept. **Clear sample** removes it. The sample is a marker in the Script page's reader only: it adds
no time to the estimate, since it is read again from the finished chapter. It is kept with the project, so
replacing the manuscript keeps it; if its lines are gone, the panel says so and you pick it again.

![Settings, Credits, the retail sample on Chapter 3, lines 1 to 3](../../images/ui/settings-credits-retail-sample.webp)

## Appearance & keys

- **Theme** sets **Match my system**, **Light** or **Dark**. The **Dark theme** / **Light theme** item at the foot of the sidebar switches it too. It is kept in this window, so the page calls it **This computer**.
- **Reader text** sets how the [Script](script.md) reader draws the text: **Font**, **Size**, **Line spacing** and **Column width**, over a quote drawn in them. These are the Script's own text settings, so a change here shows there and the other way round. The Booth keeps its own text size and uses the font chosen here.
- **Note colour** is the colour that marks reader notes in the text; a project may override it.
- **Zoom** scales the whole window (100% to 200%, the steps the header's zoom buttons and **Ctrl+plus**, **Ctrl+minus** and **Ctrl+0** use); it follows those and sets the same level.
- **Shortcuts** lists every command you can run without the mouse, grouped by where it works, with a **Find a shortcut** box. **Change** opens a recorder under the command: press the key or pedal (a USB footswitch that types a key works like a keyboard), then **Replace**, **Add as another key**, **Unbind** or **Reset to default**. A key another command already uses is named, and **Replace** takes it from that command. A changed command shows **Changed** and its own **Reset**; **Reset all to defaults** undoes every change. Each change saves at once.

![Settings - Reader text: font, size, line spacing and column width over the preview quote](../../images/ui/settings-reader-text.webp)

![Production in the Dark theme](../../images/ui/theme-dark.webp)

![Settings - Shortcuts: every command by scope, with its key or pedal](../../images/ui/settings-keyboard.webp)

![Settings - Shortcuts recording a new key for Record or stop](../../images/ui/settings-keyboard-recording.webp)

## App & updates

**Check for updates on startup**, **Update channel**, **Tell me when a long task finishes** (a Windows notification when a long job ends while the app is not in front; on by default) and, under Advanced, **Debug logging**, which writes the reasons behind the app's decisions to the run log: turn it on when asked to send a log. **This version** follows them (see [About and updates](#about-and-updates)).

### About and updates

Under the rows of **App & updates**, **This version** shows which version of Narration Studio you are running and looks
after updates.

![Settings - App & updates with a newer version found](../../images/ui/settings-about-updates.webp)

- **Check for updates on startup** (a row above, on by default): once a day, when the app starts, it asks GitHub which releases exist. That
  request sends nothing about you, your projects or your computer, and it never downloads anything by itself. Switch it off
  if you would rather look yourself with **Check now**. When that check finds a newer version, a message also pops up
  ("Version 0.2.7 is available. See Settings, About & updates.").
- **Update channel** (a row above): *Candidates and stable* (the default; every release so far is a release candidate) or *Stable only*.
- **Download update** asks first, then downloads the new version with a progress bar showing the megabytes received, and
  checks it against the release's checksum. You can cancel while it downloads; the checks and unpacking after it cannot be
  cancelled, and the dialog says so.
- **Install and restart** asks again, then closes Narration Studio and starts it again on the new version with the same
  project. It will not install while an import, a Story Bible build, a download, a comparison or a teleprompter session is
  running: finish or stop it and try again. If the new version does not start, the previous one comes back by itself.
- If Narration Studio is installed somewhere it is not allowed to change (for example under Program Files) it says so and
  offers **Show the downloaded file**, so you can replace the program yourself. It never asks for administrator rights.
- **Release notes** opens the release page in your browser.

Narration Studio runs on Windows only, for now, so updates are for Windows.
Releases are not yet signed, so Windows SmartScreen or your antivirus may ask about a new version the first time.

If Narration Studio will not start after an update and the program file is missing from its folder, rename
`narration-utils.exe.old` back to `narration-utils.exe`.

## Set on a page

Some settings only change what one page does, so they belong on that page, next to what they change: the recording check's rules (Production), silence cleanup (Master & QC), the preview suggestion and compare defaults (Proof), stage suggestions (Production), punch pre-roll (Booth), favourite effects and the Audacity backups (Editing). **Set on a page** lists them, each with where it will be and an **Open** button for that page. Until a page has its own control, **Change it here for now** opens the panel that always edited it, with its **Global** / **This project** switch, **Save** and **Discard changes**; leaving Settings with unsaved changes there asks whether to save or discard them. Search finds them too.

![Settings - Set on a page, with the recording check rules opened](../../images/ui/settings-pages.webp)

## When something is wrong

- While the settings are read, the pane shows placeholders and says **Reading your settings…**.
- If the settings file cannot be read, the page says **Your settings could not be read** and disables the controls until **Try again** works.
- If a change cannot be saved, the page says **Changes cannot be saved right now** and the row says why; the previous value is still in use.
- If the list of downloads cannot be read, Models & downloads says so with **Try again**; your downloads are not touched.

---

[← Delivery](delivery.md) · [Index](README.md)
