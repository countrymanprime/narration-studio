[Using the app](README.md) › Production

# Production

Production is the page a project opens on, the first item in the navigation. It answers "am I on
pace?" for the book you have open: how much finished audio there is and how much recording,
editing and proofing is left, the open pickups, the due date and whether the pace reaches it, and
what to work on next. Its **Chapter pipeline** has one row per chapter and one column per stage.
The book's dates, payment and milestones are on [Schedule](schedule.md), the item after Production in
the navigation.
While the production log is being read, the page keeps its title and buttons and shows grey blocks where the chapter and word counts, due date, verdict, figures, cards and pipeline will be (it never says "0 chapters" or "No due date set" before it knows); if it cannot be read, the page says so with **Retry**.

![Production - the figures, the chapter pipeline and Next up, with a stage timer running in the page header](../../images/ui/production-home.webp)

The header names the book's chapters, words and due date ("12 chapters · 29,189 words · delivery
due 14 Oct (18 days)"), with the due date's tone as a word and a mark, not only a colour. The pill
under it is the verdict for the due date (on track, tight or behind); it opens
[Schedule](schedule.md). **Export status report** (the export icon) opens the
[status report](#status-report), and **Start session** opens the [Booth](booth.md) on the chapter
being recorded, or says why it cannot when the audio engine cannot record. When recording is
switched off, **Open DAW settings** beside the reason opens the section that turns it on.

With no manuscript imported yet, the page is the import: **Import manuscript** opens the file
picker (see [Importing the manuscript](#importing-the-manuscript)), and the calendar icon opens
[Schedule](schedule.md) to set a due date first. To replace a manuscript later, use
[Settings](settings.md).

![Production with no manuscript imported: the page is the import](../../images/ui/production-no-manuscript.webp)

The app connects to the REAPER you have open by itself. For the first ten seconds after it opens, an
engine that is not connected yet shows a quiet "Connecting to REAPER…" line. If it has not connected by
then, a line at the top says progress that comes from it may be out of date, with **Retry**,
**Connect REAPER** and **Use built-in recorder**. The line goes by itself as soon as the engine connects.
**Retry** checks again and says what it found; **Connect REAPER** runs the launcher in the REAPER you have
open (or starts REAPER on the linked project) and waits up to ten seconds for it to answer.

If the production overview cannot be read when the page opens, Production keeps its title and says "This page could not
be loaded" with the reason and a **Retry** button, which reads it again.

## The figures

The six figures are one card; each opens the page it counts.

- **Finished audio**: the measured length of every chapter with a confirmed track, out of the
  book's finished length estimated from its words.
- **Recording**, **Editing + proof**: the hours of work left at each stage, estimated from the
  words still to do. The info icon on **Recording** opens the target pace: the standard rate or
  your own, once enough chapters are measured.
- **Open pickups**: the open lines of the [Pickups](pickups.md) list, and the booth time to redo
  them once a pickup session has been timed. Each chapter's **Pickups** cell in the pipeline counts
  the same lines, so the cells add up to the tile.
- **Delivery check**: chapters that pass, fail or are not checked yet. It reads "Not measured
  yet" until the host reports a check per chapter.
- **Due**: the due date and what the pace says about it, or **Not set** ("Set it on the Schedule") before one is set. It opens [Schedule](schedule.md).

Under the figures, **Where the book stands** splits the book's finished hours by stage, estimated
from each chapter's own progress in five parts: **Delivered** (the chapters mastered for delivery), **Proofed**, **Edited**,
**Recorded** and **Not recorded yet**. A chapter still being recorded counts for the share of its audio measured so far, **This
week** says how much was recorded this week and in the last 24 hours (from the built-in recorder's
take log), and **Recording check** counts the chapters checked as of the last save, out of date,
and never checked; its icon opens **Check recordings** with the out-of-date and unchecked chapters
already chosen. **Recorded vs plan** draws the plan, what was recorded and where that pace ends; its calendar icon, **Open schedule**, opens [Schedule](schedule.md). In a window 1280 px wide or less the three small cards become two, with **Where the book stands** across both, and below 1180 px one; **Next up** and the chart sit side by side under the pipeline.
A figure with nothing honest to work from says "Not measured yet" and why, rather than 0.

## The stage timer

The stage timer stays as it was. **Start timer**, on the Next up item of the chapter being
recorded, starts timing that chapter's current stage. While a timer runs, this page's header counts its time and names the chapter ("0:42:07 · timer on Chapter 6")
beside **Stop timer**; the app's top bar has no timer. Only one timer runs at a time: stop it before you start
another. Time is logged only while you run a timer, never from REAPER activity, and starting or
stopping a timer never changes a chapter's status.

Once time is logged, three figures sit under the card: **Work time logged** (split by stage),
**Hours per finished hour** (hours logged divided by measured audio) and **Effective rate** (the
contracted amount divided by the hours logged). Each stays a dash until it has something to work
from.

## Next up

**Next up** lists what to do next, ranked by the hours of work it puts at risk: finishing the
chapter being recorded (with **Open Booth** and **Start timer**), a pickup session when the
Pickups list has open lines (naming the chapters they are in), and the first chapter whose
measured file fails the delivery check, with each failed check, its value and its limit
("noise floor −57.8 dBFS (limit ≤ −60 dBFS)") and **Inspect failed check**, which opens
[Master & QC](master-and-qc.md). It reads "Nothing needs you right now" when there is nothing to list.

## Chapter pipeline

The pipeline has one row per narration chapter. **Fin.** is the chapter's estimated finished
length; its Record cell's tip has the measured one. **Record**, **Edit** and **Proof** show a check
mark (✓) for a stage done, a half circle for the stage under way and a dash for one not started.
**Prep** is the chapter's prep state from [Script](script.md): a check mark when prepped, a half
circle while in progress and an empty circle when not started. **Pickups** counts the chapter's
open lines once it is recorded to the end (0 when none are open). **Master** and **QC** come from
the files measured on [Master & QC](master-and-qc.md): mastered, and PASS or FAIL. A cell with nothing to
read says "Not measured yet". A cell's colour is the colour of its status everywhere in the app: green for done or passing, blue for under way,
amber for open pickups, red for a failed check, grey for not started. A cell opens its stage for the chapter: Script, the Booth, the editing
check, Proof, Pickups or Master & QC. The table scrolls sideways in a narrow window.

The chip on the chapter's current-stage cell is its [readiness](#stage-readiness).

Right-click a row (or press the Menu key or Shift+F10 on one of its cells) for the chapter's menu:
**Open prep in Script**, **Open in Booth**, **Open Proof**, **Open Master & QC**, **Go to this
chapter in** your DAW (it selects the chapter's linked track there, and says why it is off when the
DAW cannot select a track or no track is linked yet), then the tools
the page kept: **Chapter track…** (see [A chapter's track](#a-chapters-track)), **Recording
check…** (see [Checking a chapter's recording](#checking-a-chapters-recording)), **Editing
check…**, and **Set status:** for each other status, which sets the chapter's status by hand.

The engine chip at the top right of every page says whether a REAPER project is linked and opens
the [audio engine panel](navigation.md#the-audio-engine-panel).

### A chapter's track

**Chapter track…** opens what the saved project knows about the chapter's track (its items, span,
recorded length, how the link was found and when, and whether you or chapter sync made it), and
**Another track…** and **Unlink**, the same link as in the [audio engine panel](navigation.md#linking-chapters-to-tracks).
A suggested track says it is not linked yet; a chapter two tracks look like says so and lists
them; a linked track no longer in the saved project says it may have been deleted or the project
saved elsewhere.

When the panel knows the chapter's track, it can play that track's recorded audio right there -
Play/Pause and skip 30 seconds back or forward - and **Select in REAPER** brings the track into
view in REAPER itself. Selecting is an experimental REAPER action ([Settings](settings.md)) and
changes nothing else: no undo point, and REAPER's own selection is all it touches.

![Production - a chapter's track slide-over on a confirmed link, with how the track was found](../../images/ui/production-track-panel.webp)

**Remove from recording…**, under **Chapter**, takes a mis-imported heading (a part title, an
epigraph, or front matter that was read in as a chapter) out of the pipeline, the totals, the reader
and the Booth. Choose **Not a chapter** to hide it from navigation too, or **Front matter** to keep
it in the manuscript's navigation without recording it. Nothing is deleted - its text stays in the
manuscript and its track link is cleared - and the last narration chapter can't be removed. A
removed chapter is listed under **Removed from recording**, below the pipeline, with **Restore** to
bring it back with its status and any notes intact.

### The credits

**Opening credits** and **Closing credits** are the first and last rows of the pipeline, before chapter 1 and
after the last chapter. They are not chapters, but the first opening and first closing template in
[Settings, Credits](settings.md#credits), each with its own status; a manuscript that brings its own opening-credits chapter
lists that chapter in the opening row's place. Prep is a tick once no token is left to fill in, Record,
Edit and Proof follow the row's status, and a stage nothing measures yet is a dash. Right-click a credits row for **Credits…**, which shows the template's name, words and estimated length (including
room tone), a warning for an unresolved token (`[Author]` never filled in), **Open in Script**, its
Recorded length (once its own track is linked - never an estimate), its status and a **Recording
check** button. A kind with no template has no row; add one in [Settings, Credits](settings.md#credits).
Checking credits works the same as [checking a chapter's recording](#checking-a-chapters-recording)
below, against the credits template's rendered text rather than a manuscript chapter.

![Production - the Opening credits row opened: its template, words and estimated length](../../images/ui/production-credits-panel.webp)

## Checking a chapter's recording

A row's **Recording check…** opens the chapter's recording check (to check several chapters at
once, use **Check recordings** on the Recording check card). Nothing runs until you ask: the panel
first shows the last result, or says the chapter was never checked, and names the saved project
file it reads ("Based on the saved REAPER project, file modified ..."). Save the project in REAPER
before checking, because the check reads the saved file, not the open session.

**Check recording** (or **Check again**) transcribes the audio items on the chapter's REAPER
track with the Whisper model chosen in Settings, then compares the words with the chapter's text
in order. The progress is real, from the transcription itself; **Cancel** stops it and keeps the
items already transcribed, so the next check is quicker, and **Continue in background** closes
the work dialog. The app tells you when
it ends, wherever you are. If the Whisper model is not installed yet, the app asks before
downloading it, as a chapter's Proof view does. A changed chapter can also be re-checked on its
own, in the background, once REAPER has been quiet for a few minutes and the app is not otherwise
busy (**Check changed chapters in the background**, in Settings, or for this project in Production's **Open Recording check rules**); pressing **Check recording**
yourself always pre-empts it.

A chapter's recording check panel has the same choices under **Check options**, closed until you open it, and its **Check recording** button runs exactly
what they show. **Chapters at once** is how many chapters may be checked together when this one starts, itself included: with the default of 1 the
button waits for a chapter being checked elsewhere, and says so, and above 1 it starts beside them.

![Production - a chapter's recording check with Check options open](../../images/ui/production-recording-check-options.webp)

On Production, **Jump to or run** (Ctrl+K) has **Open Recording check rules**: a dialog with what the check judges a chapter by, for this project: **Share of each paragraph that must be read**, **Longest run of missing words allowed**, **Longest misread still counted as read**, **Shortest match that counts as read** and **Check changed chapters in the background**. They are proposed values, chosen on synthetic recordings and not yet calibrated on real narration. A change is saved at once and the last check is read again; the first two only change how a stored check is judged, but the next two change which words count, so earlier checks read as out of date and those chapters need checking again. **Reset** hands a rule back to the computer-wide value or the default. Settings under **Set on a page** has the same five rules with a **Global** / **This project** switch.

![Production - the Recording check rules dialog opened from Jump to or run](../../images/ui/production-recording-check-rules.webp)

**Check recordings** (the card's icon) lets you set up the run before it starts. **Speech model** is the
first pass. **Look again with a larger model** adds a second pass: the **Larger model** transcribes again only
the passages that are missing and the words Whisper scored under the **Also look again at words scored under**
share. In the **Check recordings** dialog, three sliders set how a long chapter is read: **Chunk length** (10 to 120 s, in steps
of 5) cuts each recording into pieces, **Overlap between chunks** (0 to 10 s) is how much neighbouring pieces overlap, so a
word on an edge is whole in one of them, and **Parallel workers** (1 to 8) is how many Whisper copies work on the pieces at
once (each holds the whole model in memory). **Transcribe each recording whole** turns the chunks off and leaves one worker, and **Let the model choose
the workers** hands the count back to the computer. A setting the sliders do not reach, such as a 5 min chunk from Settings, shows its real figure
and is kept until you move the slider. A chapter's own **Check options** keeps the same choices as lists (**Chunk length**, **Parallel processes**,
**Crossover**). A line under the choices says what will run, in words. **Chapters at once** checks that many of the ticked chapters together, each with its own share of the
processors, and starts the next as each ends. The boxes start at the values in Settings, and the check runs exactly what the dialog
shows, so the same chapter is checked the same way wherever you start it, including in the background.

The dialog scrolls when the window is short, but **Audio to check** (the recorded time of the ticked chapters, or **Not measured**) and the buttons stay in view
under it. It gives no estimate of how long the check will take. The line by the buttons says what a check adds: skipped, changed or unclear lines become pickups.

![Proof - the Check recordings dialog before a run, with the options shared with every page](../../images/ui/proof-check-recordings-dialog.webp)

With Settings' **Two-pass check** turned on ([Settings](settings.md)), a check instead runs a fast
first pass, then re-checks only whatever it reports missing with a stronger model: the progress
names each pass ("First pass (tiny)", then "Re-checking 3 passages (large-v3-turbo)"), and the
finished result reads "Checked ... with the tiny Whisper model; 3 passages re-checked with the
large-v3-turbo Whisper model", with each re-checked pickup marked "Confirmed missing by ...". If
the re-check model is not installed yet, the app offers the download or **Check with tiny only**,
which finishes the check with the fast pass alone rather than blocking on the download.

![Production - a chapter's recording check, with text still to record](../../images/ui/production-recording-check.webp)

The result reads as a **chapter summary first**: "Passes the check", or "Not complete" naming the
one thing that fails first ("Not complete: paragraph 14: 9 words not read"), then an unread start
or end stated in plain words ("Recorded to paragraph N of M"), then the chapter's own figures
(text present, paragraphs fully read, audio checked, pace). Under that, **Pickups** lists only the
check's own interior gaps worth reading again on their own — a skipped block, a short read or
different text read — each with its paragraphs, word count, first and last missing words, where
the gap sits in the audio, and **Go to paragraph** to open the manuscript there. An unread start or
end is unfinished recording, not a pickup, so it never appears in that list. Below the check's own
gaps, **Repeated reads (Proof)** always shows the chapter's unreviewed take-review pickups —
repeated reads already recorded, waiting to be compared and kept or discarded — as a count with
**Open Proof**, or "none waiting" when there are none. Under that, **Pickup list** always shows
the open lines of the Pickups list as one project-wide count with **Open pickups**, which
opens [Pickups](pickups.md), not scoped to this chapter, since attributing markers to one chapter's track span is ambiguous when
chapter tracks share the timeline. It reads "open REAPER to count" instead of a number when REAPER
is not running. **Paragraph detail** stays folded by default. **Open in Editing** opens the
chapter on [Editing](editing.md). Misreads, false starts, retakes and a spoken chapter title
never count against you. The check changes nothing: it never edits the project or moves a
chapter's status.

![Production - a recording check with a skip and a short read listed as pickups](../../images/ui/production-recording-check-pickups.webp)

A result goes **out of date** when the saved project changes under it (an item added, removed,
trimmed, moved, muted or switched to another take, an audio file changed) or the chapter's text
changes. The panel says which, keeps the old counts labelled as from then, and offers
**Check again**; only the changed items are transcribed again.

When a chapter cannot be checked, the panel says why in plain words and where to fix it: a
chapter that is not linked to its REAPER track gets the track picker right there, a missing
project file points to the [audio engine panel](navigation.md#the-reaper-project), and a missing Transcript Compare tool points to
[Settings](settings.md).

## Stage readiness

The app says when a chapter looks ready for its next stage, from evidence it already has, and never
changes a status on its own. A chapter in Recording is ready for Editing when its current recording
check finds every paragraph of its text in the recording, in order (misreads allowed). A chapter in
Editing is checked against its [editing check](navigation.md#editing-check). Missing evidence never
counts as done: a chapter nobody has checked reads as not checked, not ready.

The chip on a chapter's current-stage cell says the verdict; it opens the chapter's readiness at the
side of the page: the verdict in a sentence, each check with its state and reason, and the saved
REAPER project it was read from. **Confirm** moves the chapter to the next stage and records what
the evidence was, with **Revert** to move it back; **Dismiss** hides the suggestion until the
evidence changes. **Check now** reads the evidence again; it never starts a check. The readiness is
read again when the page opens, after an import, when a recording check ends, after you change a
status by hand, and when you switch back to the app after saving in REAPER (at most every 30
seconds).

If the evidence changes after you confirmed and a check that was met no longer is, the chapter says
the evidence changed since you confirmed and offers **Revert**; nothing moves on its own. If the
evidence changed while you were looking at it, Confirm and Dismiss are refused with a message and the
readiness is read again. If it cannot be read at all, every chapter says **Couldn't check**, with
the reason and **Retry** above the table.

### Choose what a suggestion waits for

**Jump to or run** (Ctrl+K) has **Open Stage suggestion options**, a dialog for this project's say in the suggestions (Settings under **Set on a page** has the same values with a **Global** / **This project** switch): a switch, **Suggest stage advances**, turns them off or on, and each readiness signal (the recording check, the editing signals, the pickups, and each check on the rendered file) is **Required** before a stage is suggested or **Ignored**. A change is saved at once and the suggestions are read again. **Reset** on a signal hands it back to the computer-wide value or the default. A rendered-file check counts only while the project's delivery profile has a limit for it, The two editing signals marked not yet validated, clicks and breaths, are offered like any other.

![Production - the Stage suggestion options dialog opened from Jump to or run](../../images/ui/production-stage-suggestion-options.webp)

![Production - a chapter's readiness slide-over: the evidence behind a suggestion with Confirm and Dismiss](../../images/ui/production-stage-evidence.webp)

![Production - evidence changed since you confirmed: the check that is no longer met and Revert; nothing moved on its own](../../images/ui/production-stage-evidence-changed.webp)

## Schedule

**Schedule**, the item after Production in the navigation, holds the book's due date, how it pays, the recorded audio against the plan, the work left and its milestones: see [Schedule](schedule.md).

## Status report

**Export status report** opens the report dialog in two panes. The form is on the left: an **Include**
checkbox for each section, the format (HTML or JSON) and the path the file will be written to. A tall
live preview of the host's own report is on the right, under the project's name and the date it is "as of".

![The Export status report dialog: the Include checkboxes and format beside the live preview](../../images/ui/production-report-dialog.webp)

The sections are **Words and finished audio**, **Hours by stage**, **Deadline and milestones**,
**Open pickups and chapters held back** (the lines still to record again, counted by chapter from the [Pickups](pickups.md) list, and
the chapters whose stage is held back, with the reason), **Delivery check and chapter readiness** (the files of the last measurement
made in this session, judged against the project's delivery profile, and the count of chapters by verdict; with nothing measured yet it
says so, and never reads that as a pass) and, when the book pays per finished hour and has an amount, **Contracted amount and effective rate**. Every section but the last is
ticked when the dialog opens. Ticking or unticking one rebuilds the preview, and **Export** writes exactly the sections that are
ticked: a section you leave out is missing from both the HTML page and the JSON file. The JSON file records which sections were
ticked, so a reader can tell a section left out from one that is empty.

**Export** writes the HTML page and the JSON file into this project's `narration-utils/production/reports` folder, under a name built
from when you exported it, and an export never overwrites an earlier one.

The contracted amount and effective rate are left out unless you tick their box: a
status report is often handed to someone else — a publisher, a collaborator, a rights holder
checking on progress — who has no need to know what the book pays.

## Importing the manuscript

**Import manuscript** (or **Replace manuscript…** in Settings, Project) first opens step 1 of 2, **Choose your
manuscript**: drop a file on the zone or press **Choose a file…** to pick a .docx, .md or .txt file. A copy is
kept in your project, and the original is read-only. The app checks a dropped file before it reads it: one file at a time, in a format
it can import. If it cannot use the file, it says why under the zone; press **Choose a file…** instead.

![Replace manuscript, step 1 of 2: Choose your manuscript, with the drop zone and Choose a file…](../../images/ui/production-import-choose.webp)

Choosing the file opens step 2 of 2, **Check the chapter outline**. Each heading in the outline shows how many words it holds, and pressing its title shows how it begins in the preview beside the outline. The step previews the detected format,
paragraph count, and proposed chapters before anything changes. Each section is named the way the
manuscript writes its headings: a heading with a label shows the label in bold and the chapter's name
after it ("CHAPTER VIII. Croquet", "8. Croquet" or "Chapter 8: Croquet"), and any other heading shows its
subtitle after the title ("Chapter One — Down the Rabbit-Hole") when it had one, so you can check that
the importer split the title from the subtitle where you meant it to. A long name is cut short in the
row, and hovering it shows the whole line. If a heading's second line is not really a
subtitle, clear that row's **Subtitle** box: a title that was wrapped onto two lines is joined back
together ("The Girl Who Fell Through the Ice"), and in a plain-text file a line such as an epigraph
goes back into the chapter's text so it is narrated (the row says it "is read as text"). The
**Read a heading's second line as its subtitle** option in Import options does the same for every
row at once; a row you changed by hand keeps your choice.

![Import manuscript, step 2 of 2: Check the chapter outline, with each heading's words and a preview of how the selected one begins](../../images/ui/production-import-confirm.webp)

The message at the top says what was found: the format, the number of paragraphs and of narration
chapters, then how many front matter and reference sections, character suggestions and repairs the
importer made. Only narration chapters, the sections that become audiobook chapters, count as
chapters. When you are replacing a manuscript, the first line also says what will be cleared.
Below it the sections are grouped by what each will be: **Narration chapters**,
**Front matter** and **Reference material**. Change a row's kind and it moves to its new group at
once, the group it moved into opens, the kind menu keeps the keyboard focus in its new place, and
the counts follow. The small "i" next to Front matter and Reference material says what
that kind is left out of (the audiobook totals and Proof, and for reference material the chapter
list too) and that it stays readable in the manuscript. Groups that need a decision start open:
front matter, reference material, the character suggestions once you uncheck one, and up to three
repairs. More than eight narration chapters start closed, since a long list the importer got right
needs no decision. Open or close any group with its heading. The character suggestions have Select
all and Select none. If the importer had to repair a heading (a title and a subtitle that were run
together), the repairs are listed at the end.

The **Import options** group holds, for a Markdown file, the chapter heading level (choosing another
level reads the file again and drops the choices you made for the old sections), then the subtitle
option. The import dialog stays open with its activity log until you press Close. It does not build the Story Bible: open
[Story Bible](story-bible.md) and use **Scan the manuscript** or **Import entries**.

Every dialog in the app can be used from the keyboard. Focus starts inside the dialog (on its
message, outlined when you opened it with the keyboard), Tab and Shift+Tab stay inside it, and the
page behind is hidden from a screen reader until it closes. Escape declines a confirm, and focus
returns to the button that opened it. Clicking the dimmed background closes a dialog that only shows something (the keyboard shortcuts, a
read-only view, a picker that applies each choice at once) and never closes a confirm or a form, so a
stray click cannot discard a decision or typed input. A running job (such as an import) ignores Escape
until it has finished. The red confirm button marks an action that destroys data. A step that
cannot be cancelled (an import while it writes to the project) says
so at the top of its dialog, offers no button while it runs, and shows Close when it finishes.

If the project folder contains a file named `manuscript.docx` or `manuscript.md` and nothing has
been imported yet, the page asks whether to import it. It is only ever an offer — nothing is
imported until you agree, and declining keeps it quiet for the rest of the session. **Import
manuscript** is always available to pick a different file.

![Production - offer to import a manuscript file found in the project folder](../../images/ui/production-manuscript-offer.webp)

Once you confirm, importing runs in the background and reports what it is actually doing — copying
the source into the project, writing the manuscript, adding checked characters to the Story Bible —
in a live activity log, so the progress bar and log always match the real work.

![Production - a finished manuscript import with its real, step-by-step activity log](../../images/ui/production-import-activity.webp)

Once a manuscript is imported you can read it on the [Script](script.md) page.

The first time a project with an imported manuscript loads, and again right after an import
finishes, the page asks you to **Set up the credits** if the opening and closing credits still have
unresolved tokens. The dialog is prefilled from whatever the manuscript's own title page and
copyright line already say, with the source of each guess shown underneath; a field with nothing
detected starts empty. Save only writes the fields you confirm — nothing already set in
[Settings, Credits](settings.md#credits) is changed. **Not now** leaves it for this session;
**Don't ask for this project** stops it until you replace the manuscript. Either way, a banner
stays above the figures — and above the [Script](script.md) page's own Opening credits
card — with **Fill in** to reopen the same dialog for as long as a token stays unresolved.

---

[← Navigation](navigation.md) · [Index](README.md) · [Schedule →](schedule.md)
