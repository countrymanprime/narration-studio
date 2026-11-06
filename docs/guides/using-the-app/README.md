# Using the app

How to use each page of the app, with screenshots of the app itself. It is for narrators, and for the editors,
proofers and authors who work on a book with them. New to the app? Start with the first page, Getting started; it
takes you from a fresh install to your first recorded take. Other readers: see [Where to start](#where-to-start)
below the list.

The screenshots come from the app running on sample data (a book of *Alice's Adventures in Wonderland*), so your own
book's names and numbers will differ. They are taken again whenever the app's pages change.

## Pages

Read them in order the first time, or jump straight to the page you need. They follow the sidebar's groups: Production (Production, Schedule), Prep (Script, Story Bible), Record (Booth), Edit (Editing), Review (Proof, Pickups) and Finish (Master & QC, Delivery), with Settings below them.

| Page | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | The project picker shown before a project is open. |
| [Navigation](navigation.md) | The sidebar, its icon-only and drawer layouts, and locked entries; the header's engine chip and the audio engine panel it opens: the linked REAPER project, its tracks and chapter links, chapter sync, and the REAPER tools (chapter stamps, chapter render setup, cleanup tools). |
| [Production](production.md) | The page a project opens on: importing the manuscript, hours logged by stage, PFH and effective rate from measured audio, the delivery date, which chapters to work on next, and the chapter pipeline whose cells open each chapter's track, recording check, stage suggestion and editing check. |
| [Schedule](schedule.md) | Will the book be done by its due date: the verdict, the recorded audio against the plan, how the book pays, the work left and how it is worked out, and the milestones. |
| [Script](script.md) | Prep: the chapter list with each chapter's prep state, the continuous reader with your marks, speakers and bookmarks, and the rail of words, Story Bible entries and notes. Bookmarks are in the jump menu and the right-click menu. |
| [Story Bible](story-bible.md) | Characters, places, and organizations with how you say each name, notes, and the suggestions a scan or an import offers. |
| [Booth](booth.md) | Where you record: a live read-along that follows you as you narrate a chapter, with companion mode beside your DAW. |
| [Editing](editing.md) | A chapter's script as the editor: what was heard set against each word, the takes of each line, deleting words with their audio, effects on words, the clean-up drawer and the timeline. |
| [Proof](proof.md) | Every check's notes in one list, all chapters or one, with the chapter's recording check and waveform, the evidence and Hear it on each note and your pickup, edit, fine as read or defer decision; and the chapter view, for comparing the recording to the manuscript. |
| [Pickups](pickups.md) | Every line to record again, from the recording check, your Proof notes and lines you add, grouped by chapter, with the pickup session that opens them in the Booth. |
| [Master & QC](master-and-qc.md) | Finish: checking rendered files against a platform's delivery profile, why a file fails, the book's consistency, the mastering chain, mastering and encoding to spec, building packages for several platforms, diagnostics, and exporting a report. |
| [Delivery](delivery.md) | Finish: choosing and editing the project's delivery profile, its rules and their sources, which chapters pass, building the platform's package, embedding chapter tags in the finished book MP3, and what Delivery says when a build stops or the host does not answer. |
| [Settings](settings.md) | Global and per-project settings, appearance, and clearing project data. |

## Where to start

Pick the line that sounds like you. Each path is a few pages in the order you will need them.

- **New to the app:** [Getting started](getting-started.md) takes you from a fresh install to your first take: the
  project, the manuscript import, choosing how you record, and the first take in the Booth. Then prepare the text on
  [Script](script.md) and the names in the [Story Bible](story-bible.md), and come back to the [Booth](booth.md) for
  the rest of recording.
- **An experienced narrator coming from REAPER:** [Booth: Recording](booth.md#recording) for where a take starts and
  stops, Undo, and punch and roll (**R**); [Settings: Recording & DAW](settings.md#recording--daw) for linking the
  REAPER project; [Navigation: the audio engine panel](navigation.md#the-audio-engine-panel) for tracks and chapter
  sync; [Editing: Takes](editing.md#takes) for retakes; then [Pickups](pickups.md).
- **An editor:** [Editing](editing.md) for a chapter's [takes](editing.md#takes) and
  [clean-up](editing.md#cleaning-up), [Proof](proof.md) for the notes on it, and [Pickups](pickups.md), where the lines
  to record again end up.
- **A proofer or QA checker:** [Proof](proof.md) for the notes and your decision on each, [Pickups](pickups.md), then
  [Master & QC](master-and-qc.md) for the files against a delivery profile and [Delivery](delivery.md), where the
  profile is chosen and the package built ([ACX delivery requirements](../../reference/acx-delivery-requirements.md)
  lists ACX's).
- **An author or rights holder:** the [status report](production.md#status-report) on Production is what a narrator
  can send you. What the app keeps, and where, is in [data files](../../reference/data-files.md); what leaves the
  narrator's computer is in
  [what the app sends off the machine](../../architecture/threat-model.md#what-the-app-sends-off-the-machine), a
  technical page whose first lines and table answer it; the downloads it asks for are in
  [Settings: Models and downloads](settings.md#models-and-downloads).

---

[Getting started →](getting-started.md)
