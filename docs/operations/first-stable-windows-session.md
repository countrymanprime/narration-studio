# The Windows session before the first stable

This is the order for the owner's one sitting on a Windows machine before 1.0.0, followed by the first Promote. It takes the rows a baseline release needs from [the owner release checklist](owner-release-checklist.md), [the Windows QA checklist](windows-qa-checklist.md) and [the REAPER verification pass](reaper-verification-pass.md), and points at them for the detail. The owner decided on 2026-11-06 ([#3085](https://github.com/countrymanprime/narration-studio/issues/3085)) that Experimental capabilities ship in 1.0.0, labelled as such. This page treats a failed Experimental row as a bug to file, not as a stop, unless it loses or misplaces audio.

`<asset prefix>` and `<executable>` stand for values in `config/brand.json`. Every row below is **pending with the owner** until the session runs.

## Before the day

| What | Who |
| --- | --- |
| Choose the candidate: the newest `v0.3.x-rc` built after [#3084](https://github.com/countrymanprime/narration-studio/issues/3084) (save retries) has merged. Note its tag and the tag of the candidate before it. | Coordinator |
| Run **Windows release checks** (`windows-release-checks.yml`, `new-tag` = the candidate, `previous-tag` = the one before) and confirm it is green. This is the hosted half of QA 9.2 to 9.4. | Worker |
| A Windows machine that has never had the app; REAPER installed; the microphone you narrate with; a copy of a book you know; PowerShell 7, Python and a checkout of this repository (for step 4 only). | Owner |
| A folder `session-<date>` on the desktop for screenshots and files. | Owner |

**Capture throughout.** Take a screenshot of anything that differs from "Expect". For each failure, save the diagnostics bundle (Settings › App & updates › Diagnostics bundle › **File for a bug report**) into the session folder and note the step number. Afterwards, post one comment on [#1495](https://github.com/countrymanprime/narration-studio/issues/1495) listing every step as pass or fail, and open one issue per failure, starting its title with the step number.

## The session (about four hours)

| # | Do | Expect | Source |
| --- | --- | --- | --- |
| 1 | Download the **older** candidate's setup program and `.sha256`. Run `gh attestation verify <asset prefix>-<version>-windows-x64-setup.exe --repo countrymanprime/narration-studio` and compare the checksum. | The attestation verifies; the checksum matches | Owner checklist §2 |
| 2 | Install it. On SmartScreen choose **More info**, then **Run anyway**. | A per-user install; Start Menu entries (including the Audacity one); an optional desktop shortcut; `THIRD-PARTY-NOTICES.txt` beside the program, opening as text; the app starts with nothing downloaded | QA 9.2 |
| 3 | In the app: Settings › App & updates › **Check now**, then download and install the newer candidate. | It offers the newer candidate, asks twice, restarts on the new version, and Settings shows the new number | QA 9.4, 11.8 |
| 4 | From the repository root: `pwsh src/studio/integrations/reaper/spikes/run-pass-part-a.ps1`. | About two minutes and no input; the last line gives the pass count. Save `pass-part-a-results.md` into the session folder. | REAPER pass, Part A |
| 5 | Create a project and import your book (.docx or .txt). | The chapter count and titles match the book | QA §2 |
| 6 | Story Bible › build. Answer the three-way question with the model; let spaCy download. Press **Hear** on one name; cancel the Piper download once halfway, then download again. | A progress bar; a cancel leaves no broken file; the second download resumes; the name is spoken; a second build does not ask again | Owner checklist §4, hand check 2.1 |
| 7 | Link REAPER from the project: **Open in REAPER and connect**. | REAPER opens on the project; the Booth's REAPER chip turns green only once it answers; `Scripts\__startup.lua` keeps your own lines; the launcher is in REAPER's Actions list | QA 10.1, 1.9 |
| 8 | Booth, one chapter. Open the Levels menu and speak. | Page marks between paragraphs; the input meter follows your voice; the Punch line shows REAPER's pre-roll state | Hand check 1.1, 5.1, 5.2 |
| 9 | Record the whole chapter, stop, play the start back in REAPER. | One item on the chapter's track, in the right project; your voice, no dropouts, no gap at the start | QA 1.9, REAPER pass B2b |
| 10 | Punch from a word mid-chapter with pre-roll on; then press Undo in the app on that take. | REAPER plays in from before the word and records at it; one Undo removes the punch and the earlier read is whole again | Hand check 5.3, REAPER pass C17b, C19 |
| 11 | Quit REAPER mid-session; watch the Booth; start REAPER again with the launcher. | The chip stops being green; the app says when it last heard REAPER and offers **Check again**; it recovers without a restart | REAPER pass R1, QA 1.14 |
| 12 | Editing: play a line with an effect on it in REAPER; then quit REAPER and play it again. Open **Effects** › **Choose in REAPER…**, pick a plug-in, close the window. | First you hear the effect; then the app plays it itself with "REAPER is not answering. Played in the app instead."; the chosen plug-in is listed and applied to those words only | Hand check 6.1, 6.2, 3.1; QA 10.7 |
| 13 | Proof: **Check recordings** on the chapter, press **Hear it** on one finding, mark one **Needs pickup**. | The note loops with 3 s either side and stops on a second press; the pickup appears in Pickups | QA 10.2 |
| 14 | Pickups: record the pickup from **Open in Booth**, mark it recorded, close and reopen the project. | The pickup marker is in REAPER; after reopening, the pickup still shows recorded | REAPER pass C8, C9 |
| 15 | Master & QC: **Check files** on the chapter. Delivery: build an MP3 of it and play the file. | Loudness and peak figures for your file; the MP3 passes the ACX checks and plays | QA 9.1, §3 |
| 16 | Uninstall from Windows Settings. | The program and the notices file go; settings (`%APPDATA%`), downloads (`%LOCALAPPDATA%`) and the project folder stay | QA 9.2, owner checklist §3 |

**Stop the session** at a failure that loses, misplaces or silently fails to record audio (steps 9, 10, 14), or that loses a save. File it and stop; the rest waits for the fix. Anything else: file it and carry on.

## Left out on purpose

These rows are not needed for a baseline 1.0.0 and stay open on the QA checklist:

- the built-in recorder (QA 1.1 to 1.8), because it ships as Experimental
- Audacity (QA 11.15)
- MIDI and HID (9.5)
- the 30-minute capture probe (9.6)
- the listening rows C13, C14, C16, C18b and C21b
- duet replace
- the disk-full refusal
- the NVDA and 400 % zoom passes (11.9 to 11.11)

[The voice sample region check](../research/reaper-voice-sample-region-check.md) (V1 to V12) is also out: the app does not use those commands yet, and no script runs them. Run it on the same day only if a worker has scripted it into Part A before the session; it then adds about two minutes to step 4.

## Promote, after the session passes

Preconditions: every failure from the session that stopped it or touched audio is fixed and merged, and Main health is green on the commit to be tagged.

| # | Do | Check |
| --- | --- | --- |
| P1 | `gh workflow run prerelease.yml -f version=1.0.0` ([version lifecycle](ci-and-releases.md#version-lifecycle)). | The run is green; release `v1.0.0-rc` exists as a pre-release with the setup program, the zip, the notices file and a `.sha256` for each |
| P2 | On the session machine: install `v1.0.0-rc` over the candidate you tested, and run `<executable>.exe --smoke`. | The setup program verifies as in step 1; the install keeps your project; the smoke report ends with every check passed; Settings shows 1.0.0 |
| P3 | Run **Promote pre-release** (`promote-release.yml`) with `prerelease_tag` = `v1.0.0-rc` and approve the `production` environment. | The job's `Download and verify` step passes before any tag is made |
| P4 | Afterwards: open the release page, then `gh api repos/countrymanprime/narration-studio/releases/latest`. | `v1.0.0` is the latest release, not a pre-release; its three files and checksums are byte-identical to the candidate's; `gh attestation verify` passes on the stable setup program; the notes list the history |
| P5 | On the session machine, set Settings › App & updates › **Update channel** to stable and press **Check now**. | No update offered: the candidate and its promotion share 1.0.0. An install of an older `0.3.x` on the stable channel is offered `v1.0.0`; check it on the next update rather than now if no older install is at hand |

Code signing stays out of the first stable (D7). Immutable releases stay off ([#186](https://github.com/countrymanprime/narration-studio/issues/186)).

## What next

- [Owner release checklist](owner-release-checklist.md): the repository settings in §1, which this session does not cover
- [Windows QA checklist](windows-qa-checklist.md): every row left out above
- [The release-readiness report on #3085](https://github.com/countrymanprime/narration-studio/issues/3085#issuecomment-6689633760): why these rows were chosen
