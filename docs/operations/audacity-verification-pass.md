# The Audacity verification pass

The Audacity adapter was built from Audacity's published scripting spec and tested against a fake pipe server. It was first tested against a running Audacity on 2026-10-19, on Linux, by the hosted-runner tests ([results](../research/audacity-3-real-edits-results.md), [CI design](../research/real-audacity3-ci-integration.md)); those found and fixed several commands that did not work as built ([The DAW port](../architecture/daw-integration.md#the-daw-port), [the spec note](../research/audacity-4-scripting-spec.md)). It has not run on Windows or with a real microphone. This pass is the owner's check of what only a real Audacity can show. It works the way the REAPER checks do ([The DAW port](../architecture/daw-integration.md#the-daw-port)). Until it passes, every Audacity capability stays **Experimental**, and it is tracked on [#510](https://github.com/countrymanprime/narration-utils/issues/510).

- **Part A** runs unattended in about a minute and writes a results file.
- **Part B** is five short checks by eye and ear.
- **Part C** runs unattended right after Part A, in the same results file: each edit Audacity makes in steps after a backup.

Paste all three into #510.

## Before you start

- **A Windows machine** with this repository checked out and bootstrapped. Part A is a Go test, so it needs the Go toolchain that `scripts/cloud/session-start.sh` or the bootstrap installs.
- **An Audacity with a scripting pipe.** Write down the version from Help > About Audacity; the results file asks for it.
  - **Audacity 4.0.x has no scripting pipe.** Part A will stop at A1 with "not reachable", and that is the expected result on 4.0 ([The DAW port](../architecture/daw-integration.md#the-daw-port)). If a later Audacity 4 release notes mention a scripting pipe or script host, run the pass on it and say so on #510.
  - **Audacity 3.x:** Edit > Preferences > Modules, set **mod-script-pipe** to **Enabled**, then restart Audacity. Reopen Preferences > Modules and check that it now says Enabled.
- **A scratch project, never a real one.** In Audacity, File > New, so that one empty project window is open and no other Audacity window is. Part A refuses to run on a project that already has tracks or labels.
- **A scratch folder**, for example `C:\Temp\nu-audacity-pass`. Part A writes a test tone, one exported WAV, a label file and its results there.

## Part A (unattended)

In PowerShell, from the repository root:

```powershell
cd apps\desktop
$env:NU_AUDACITY_PASS = "1"
$env:NU_AUDACITY_PASS_DIR = "C:\Temp\nu-audacity-pass"
$env:NU_AUDACITY_VERSION = "3.7.x"   # what Help > About Audacity says
New-Item -ItemType Directory -Force $env:NU_AUDACITY_PASS_DIR | Out-Null
go test -tags audacitylive -run TestAudacityVerificationPass -v -count=1 ./internal/dawport/audacity/
```

It writes `audacity-pass-results.md` into the scratch folder and prints the same table. Leave Audacity alone while it runs, about 15 seconds.

### Expected results

| Step | What it does in Audacity | Expected |
| --- | --- | --- |
| A1 | `Message` echo | PASS. On Audacity 4.0, or with scripting off, FAIL "not reachable", and the run stops |
| A2 | 20 echoes | PASS, with the median and maximum round-trip time recorded. Anything under the 5 s timeout passes; note if the median is over 100 ms |
| A3 | `GetInfo` Tracks and Labels on the empty project | PASS, "0 tracks, 0 labels" |
| A4 | `Import2` a 12 s tone the test writes; `GetInfo` Clips | PASS: one clip |
| A5 | One label whose text has `’ ‘ — “ ” ∖ é % & < > { } ' =`; read it back | PASS: the text comes back unchanged. This is the escaping check |
| A6 | Import three findings as labels, then the same three again | PASS: 3 added, then 0 added and 3 skipped, all on one label track named "Narration Studio" |
| A7 | Mark `pass-2` reviewed | PASS: its label reads `[nu:pass-2 reviewed] …`, and the label count is unchanged |
| A8 | Go to `pass-3`'s label | PASS (Part B checks the selection) |
| A9 | Cursor to 3 s | PASS |
| A10 | Loop 3 to 7.5 s for 2 s (`PlayAtSpeedLooped`) | PASS (Part B checks that it looped at normal speed) |
| A11 | `Stop` | PASS: playback stops |
| A12 | Add the marker label "pass marker" at 10 s, twice | PASS: added once |
| A13 | `Export2` 1 to 6 s to `narration-utils\audacity\pass-chapter-01.wav` in the scratch folder | PASS: the file appears with audio in it |
| A14 | Write the reviewed labels to `narration-utils\audacity\reviewed-labels-01.txt` | PASS: one line, for `pass-2` |
| A15 | Ask for a `.CL` export (Audacity's external-program exporter) | PASS: refused by the app, nothing sent |

## Part B (by eye and ear, about five minutes)

Leave the scratch project open after Part A. Each run overwrites `audacity-pass-results.md`, so copy it aside first.

| Step | Do | Expected |
| --- | --- | --- |
| B1 | Look at the label track | One track, "Narration Studio", with five labels: `pass-0` to `pass-3` and "pass marker". `pass-2` reads "reviewed". No label shows `\` or a stray `"` |
| B2 | Run Part A again without closing the project | It stops at A3: "the open project is not empty". Nothing in the project changed |
| B3 | If Audacity can stay running with no project window (on Windows, closing the last window usually quits it; skip B3 then), run Part A | A1 fails quickly with "Audacity has no project open", not after a 5 s timeout ([audacity/audacity#11471](https://github.com/audacity/audacity/issues/11471)) |
| B4 | Open a new, empty project and a modal dialog (Edit > Preferences), then run Part A | Either A1 fails after about 5 s with "Audacity did not answer in time", or Audacity answers under the dialog. Record which. Then close the dialog and run Part A again on a new empty project: it passes. This is the reconnect check |
| B5 | Quit Audacity, then run Part A | A1 fails at once with "Audacity is not reachable" |

During B4's second run, watch the screen as it runs A8 to A10. You should see the selection jump to 8.25 to 9 s, the cursor move to 3 s, and a loop play between 3 and 7.5 s at normal pitch. Note anything else, such as Audacity asking to save or the tone playing sped up.

## Part C (unattended, after Part A)

Part A's run goes on to Part C on the same scratch project and the same 12 s tone, with the backups table in the scratch folder and a 2 s backup window. To include C3, set `$env:NU_AUDACITY_PASS_MACRO` to the name of one of your own macros (Tools > Macro Manager) before running; without it C3 is `SKIP`. C6 records 2 s from the default input device.

| Step | What it does in Audacity | Expected |
| --- | --- | --- |
| C1 | Cut 2 to 3 s, closing up: backup, then one `Delete` (a `SplitDelete` first leaves the gap in place) | PASS: the tone ends at 11 s; a muted backup track |
| C2 | Cut 4 to 4.5 s, leaving a gap: backup, `SplitDelete` | PASS: the tone still ends at 11 s, silent from 4 to 4.5 s |
| C3 | Your macro on 5 to 6 s: backup, `Split`, then the macro's menu command `Macro_<name>` (no `ApplyMacro` command exists) | PASS, or SKIP with no macro named. A macro name may hold letters, digits, spaces, hyphens and underscores; any other character is refused |
| C4 | Stack the read at 8 to 9 s on 6 s: backup, a take track, `Paste`, `Split`, `Delete` (with "Editing a clip can move other clips" on for the edit), mute the take track | PASS: the tone ends at 9 s; a muted track `Narration Studio take pass-take-2 from 8.000 s, backup {ID}` holds 6 to 7 s, and the chapter track is not muted |
| C5 | Un-stack it: backup, `Paste` from the stack's backup track, `RemoveTracks` | PASS: the tone ends at 11 s again; the take track is gone |
| C6 | Roll at 10 s: `Stop`, backup, `PunchAndRoll`, then `Stop` after 2 s | PASS: Audacity records from 10 s |
| C7 | A cut on a track that is not there | PASS: refused as stale, nothing sent |

By ear, after the run: the tone is silent from 4 to 4.5 s (C2's gap), and the audio after 10 s is C6's recording. Record in #510 how many entries each step added to Edit > Undo History: the app reports C1 1, C2 1, C3 2, C4 4, C5 2 and C6 0 at the call (the roll's entry is added when the recording stops, so 1 once it has), and a different count is fixed in `steps*.go`. These are the counts a real Audacity 3.7.7 gave on a Linux runner ([results](../research/audacity-3-real-edits-results.md)); Edit > Undo History on Windows is where they are checked by eye.

## Backups (not in Part A yet; run on a Linux Audacity)

A real Audacity 3.7.7 on Linux ran the first, second and fourth checks below and the last one through the adapter ([results](../research/audacity-3-real-edits-results.md), A3-T17): the restore was sample-for-sample the original, the pasted backup started at the window start, a stereo source got a stereo backup, and a deleted backup track was refused as stale. They have not run on Windows, and Part A does not run them. The `backups` role ([Audacity 3.x: what the app relies on](../reference/daw/audacity-3.md)) sends the commands spike 1g sends ([run sheet](daw-spike-run-sheet.md#1g-audacity-backups-snd-s7)), so the 1g result answers the first three checks below. Part A does not run `BackupAround` or `RestoreBackup` on their own (`pass_live_test.go`, 2026-10-12): the bindings merged in SN-D82 ([#1567](https://github.com/countrymanprime/narration-utils/pull/1567)) without a pass step, and Part C runs a backup only as the first step of each edit. Until a step is added, each check below is an unchecked line on the QA pass ([#1495](https://github.com/countrymanprime/narration-utils/issues/1495)), and none has run.

| Check | Expected |
| --- | --- |
| Clone a two-minute window either side of 150 s of a 300 s tone, damage the original, restore, compare | The restored export hashes equal to the original; a track named `Narration Studio backup {ID}`, muted, holds 30 to 270 s |
| `Paste` into the new empty track with the cursor at the window's start | The pasted audio starts at that time, not at 0 |
| The undo history after a backup and after a restore | Recorded as found; the role reports `undoSteps` 0 and 1 |
| A stereo track | The backup track is stereo and the restore matches |
| Delete the backup track, then restore | Refused: "The backup's track is no longer in the Audacity project, so nothing was restored." Nothing changes |

## A3-T31: the owner's pass on Windows (with a real microphone)

What a hosted runner cannot show: a real input device, how it sounds, how the Windows build starts for the first time, and what Edit > Undo History says. Everything the hosted runs measured is in [the results note](../research/audacity-3-real-edits-results.md); this list checks the same things on your machine and the ones that need a person. Do it after the hosted results are in. Record each line in #510 as "as expected" or what happened instead, and any difference goes to the fake (`audacitybridgetest`) and to the results note.

**Set up once**

1. Windows machine, Audacity 3.7.x from the official zip or installer. Write down Help > About Audacity's version.
2. A scratch project, a scratch folder (`C:\Temp\nu-audacity-pass`) and a microphone you can tap or clap into. Set Edit > Preferences > Devices to it, Quality > Default Sample Rate to 44100 Hz.
3. In Tools > Macro Manager make a macro named `Narration-Test` with two steps: Amplify (ratio 0.5), then Normalize (peak -3 dB). Make a second named `Narration Spaced Name` with one Normalize step (peak -6 dB).
4. Open Edit > Undo History and leave it open: it is where the counts below are read.

**The first run (before enabling anything)**

| # | Do | Expected |
| --- | --- | --- |
| T31-1 | Start Audacity with no profile (rename `%APPDATA%\audacity` first, and put it back after) | Write down every dialog in the order it appears (the welcome box, the update and usage notice). A hosted Linux run saw an "App updates & usage info" box and a welcome box, and `UpdateNoticeShown=1` and `ShowSplashScreen=0` in `audacity.cfg` stop them |
| T31-2 | Edit > Preferences > Modules: set `mod-script-pipe` to Enabled, restart, reopen Modules | It says Enabled. Write down whether it said New or Failed after the first restart: on a fresh Linux profile the first start marked it failed and a second start worked |
| T31-3 | Tracks > Sync-Lock Tracks, and Preferences > Tracks Behaviors > "Editing a clip can move other clips" | Write down whether each is on or off on a fresh install. Linux: Sync-Lock off, the preference not stored and behaving as off |

**Recording (needs the microphone)**

| # | Do | Expected |
| --- | --- | --- |
| T31-4 | Part A and Part C of this page, unchanged | As their tables above. C6 records 2 s from the microphone |
| T31-5 | File > Import a 22.05 kHz WAV (the pass folder has none: export one from any clip at 22050 Hz), select its track, click the red Record button | The box "Too few tracks are selected for recording at this sample rate" opens. It has no title bar. Click OK; the next scripted command is answered at once |
| T31-6 | New project, 44.1 kHz. Select nothing, set the cursor at 1 s, click Record, clap at about 3 s of the wall clock, then run `Message: Text=x` from the pass tool while it records | Recording stops at the `Message`: any batch command (`Message`, `GetInfo`, `SelectTime`, `SetLabel`, an effect) ends a recording, while `AddLabelPlaying` does not. Write down whether Windows does the same, and how long after the click the first sound is on the track (Linux null sink: 1.5 to 2.1 s) |
| T31-7 | Record 10 s with a tap every 2 s. At the 5th second run `AddLabelPlaying` from the pass tool, then click Stop | The label sits at the tap nearest the 5th second to within 0.25 s. Measure label time against the tap in the waveform and write both |
| T31-8 | Roll at 10 s (Part C, C6) and listen | The audio before 10 s minus the pre-roll is untouched, the audio from 10 s is your new take, and there is no click at the join. Edit > Undo History gained one entry once you pressed Stop |
| T31-9 | Click Stop in Audacity's own window during a recording the app started, then ask the app (Booth) whether it is still recording | The app cannot tell: no scripted read answers without ending a recording. Write what the Booth shows |

**Undo counts (read in Edit > Undo History after each, then Undo)**

| # | Do | Expected entries |
| --- | --- | --- |
| T31-10 | Part C C1, C2, C3, C4, C5 and C6, one at a time, reading the history after each | C1 1, C2 1, C3 2, C4 4, C5 2, C6 1 after Stop. Write each count you see |
| T31-11 | Run an Amplify from the pass tool (`Amplify: Ratio=0.5`) and look at the history | No new entry. A single Undo then takes back the edit before it as well. Write what you see: the app reports 0 undo points for lowered stretches and repaired clicks |
| T31-12 | With the history at its beginning, run `Undo` from the pass tool | A box "Nothing to undo" opens and holds the pipe; click OK. (Linux: the same box, and twice a crash report window after the box had been left open.) Write whether Windows crashes |

**Windows paths and bytes**

| # | Do | Expected |
| --- | --- | --- |
| T31-13 | Import and export (`Export2`) with `C:/Temp/nu audacity pass/é-ß.wav` and with a path of 240 characters | Both work, or the long one is refused before sending; write which |
| T31-14 | Look at the hosted Windows job's summary (A3-T30, `real-audacity3-windows.yml`, dispatched by hand) | Replies that start with an empty line, `Failed!` for an unknown command, `C:/` and backslash paths accepted. Any row that differs from the Linux run is a bug in the fake |
| T31-15 | Run a macro from the pass tool with no track selected | A box saying "Normalize" requires one or more tracks to be selected opens and holds the pipe; click OK |
| T31-16 | Run Click Removal from the pass tool on a selection with no click in it | A box "Algorithm not effective on this audio. Nothing changed." opens and holds the pipe; click OK |

**Language**

| # | Do | Expected |
| --- | --- | --- |
| T31-17 | Edit > Preferences > Interface > Language: Deutsch, restart, run Part A | Passes. The menus are German, replies still end `BatchCommand finished: OK`, and the label track the app makes is named `Narration Studio` (the default name `Textmarken 1` is German) |

**Windows only, by ear**

| # | Do | Expected |
| --- | --- | --- |
| T31-18 | Part B's loop check (A10) and the view following the cursor | The loop plays at normal pitch between 3 and 7.5 s; write whether the window scrolls to the cursor |
| T31-19 | Set the playback slider (the speaker slider in the toolbar) to two values while a tone plays | The loudness changes and the export of the same tone does not. This decides `monitor_level` (hosted tests could not reach the slider) |

## What to paste into #510

Comment on #510, headed "Audacity 4 pass results", with:

- the results table from `audacity-pass-results.md` (Parts A and C);
- one line per B step: as expected, or what happened instead;
- the undo counts from Part C;
- the Audacity version, and whether mod-script-pipe was enabled;
- for A3-T31, each of its rows (T31-1 to T31-19) as "as expected" or what happened.

## What happens with the results

- **Everything passes:** a follow-up PR promotes `navigate` and `markers` from Experimental to Supported in `apps/desktop/internal/dawport/audacity/audacity.go`, records the pass in `docs/research/`, and updates [The DAW port](../architecture/daw-integration.md#the-daw-port) to Accepted.
- **A step fails or behaves differently:** fix the client or adapter. Correct the fake (`apps/desktop/internal/audacitybridge/audacitybridgetest`) to match what Audacity really did, and add a test, as `docs/architecture/daw-integration.md#the-daw-port` does for REAPER. Then run the pass again.
- **A1 fails on Audacity 4:** nothing to fix. The owner's version decision on #510 (`docs/architecture/daw-integration.md#the-daw-port`) decides whether to support Audacity 3.x now or wait for Audacity 4's script host.
