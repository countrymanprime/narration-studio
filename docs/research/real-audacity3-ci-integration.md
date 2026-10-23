# Real-Audacity 3 integration testing in CI

**Researched 2026-10-18 to 2026-10-19. Status: a design and a prototype that ran in a real Audacity 3.7.7 on Linux (Ubuntu 24.04, Xvfb, a PulseAudio null sink). The Windows runner was not tried.** Question: how do the actions the app wants from a DAW get exercised against a real Audacity 3 on a CI runner, with public-domain audiobook audio (decision D71), so the facts in [Audacity 3.x: what the app relies on](../reference/daw/audacity-3.md) are checked by a machine instead of by the owner's hand? The sibling note for REAPER is [real-REAPER integration testing](real-reaper-ci-integration.md); this note reuses its fixture approach and its trigger and reporting rules.

## What was run here and what was not

- **Run:** the repository's own Go client (`src/studio/desktop/internal/audacitybridge`) and adapter (`src/studio/desktop/internal/dawport/audacity`) against Audacity 3.7.7 from the official Linux AppImage, extracted (no FUSE), in a cloud container. `scripts/research/real-audacity3-ci/run.sh` does the whole run and `src/studio/desktop/internal/dawport/audacity/real_linux_live_test.go` holds the assertions. Everything in [Findings](#findings) was observed in that run; times are from it.
- **The fixture:** `kara_01` from [`sources.json`](../../tests/fixtures/audio/librivox-alice/sources.json), downloaded with the fixture's own `sources.fetch` and checked against its pinned SHA-256 (`da919b10…`) before use. Kara Shallenberg's reading of *Alice's Adventures in Wonderland*, chapter I, LibriVox, public domain (the file's `license` line). The audio stays out of git. The committed alignment (`alignment/kara_01.markers.json`) supplies the chapter's length (796.286 s) and paragraph times, which the run compares with what Audacity reports.
- **Not run:** Windows (nothing here can run `Audacity.exe`), Audacity 4 (it has no pipe; see [Audacity 3 against 4](#audacity-3-against-4)), the owner's verification Parts B and C by eye, and any command not listed in the matrix as "proved here". The adapter's `Command.Path` and `Session.ExportChapter` cannot run on Linux; see [Findings](#findings), item 3.

## What already exists

| Piece | What it proves | Runs in CI? |
| --- | --- | --- |
| `audacitybridgetest` fake pipe server and `*_test.go` in `audacitybridge` and `dawport/audacity` | Framing, the command encoder's refusals, label identity, the order of commands in each edit made in steps, undo counts the adapter reports | Yes, in the PR gate |
| [Verification pass](../operations/audacity-verification-pass.md) Parts A and C, `pass_live_test.go` | The same adapter against a real Audacity, on Windows, in a scratch project with a generated tone | No: build tags `audacitylive` and `windows`, run by the owner. [#510](https://github.com/countrymanprime/narration-utils/issues/510) holds the result; none has run (2026-10-12) |
| Part B | What the narrator sees and hears | No, by eye and ear |

The gap is the one the REAPER note found: a command's facts are only ever checked by hand, and Part A's first step, A3, would have failed on the first run (Finding 1).

## Findings

Each item says what a real Audacity 3.7.7 did that the fake or the docs do not say.

1. **A real reply can start with an empty line, and the client reads that as "no project open".** `readReply` (`audacitybridge/reply.go`) returns `ErrNoProject` when the first line of a reply is empty, on the documented rule that a real answer never starts with one. Audacity 3.7.7 starts the reply to every command that has no text of its own with an empty line: `GetInfo`, `Import2`, `SelectTime`, `SelectNone`, `AddLabel`, `SetLabel`, `Undo`, `Play`, `Stop`, `SaveProject2` all answer `\nBatchCommand finished: OK\n\n` or a body after that blank line. `Message` and `Export2` write text first, so a ping and an export pass. Raw bytes of `GetInfo: Type=Tracks Format=JSON` on an empty project: `\n[  ]\nBatchCommand finished: OK\n\n`. The client then drops that reply as "no project", leaves the rest in the stream, and every later call reads the one before it: with the client as it was when this note was written, A2 to A9 of the prototype all fail with "no project open" or "GetInfo's JSON did not parse". The pass's A3 would fail the same way on Windows if Windows Audacity writes the same bytes; it runs the same command code, but that was not seen.
   - A lone `\n` was also seen once, as the answer to `Message` on a fresh profile with the Welcome dialog open and no project window. So a lone empty line is the signal for no project, and a leading empty line is not.
   - Fixed after this note was written: `readReply` drops an empty first line when more follows it and keeps a lone one as `ErrNoProject`. The test fake now frames replies as 3.7.7 does, so the adapter's tests exercise it. The rule rests on Audacity writing a reply in one write (observed on Linux, not on Windows); a reply that arrives in pieces after the empty line is not handled.
2. **`Session.ExportChapter` exports silence.** It sends `SelectTime` and `Export2` without selecting an audio track. `Export2` writes only the selected tracks. After `ImportFindings` (which makes the label track and leaves only it selected) the project reads `kara_01 selected:false` and `Narration Utils selected:true`, and the export is a WAV with a header and no samples (0 s, 482 bytes for a 1.5 s selection) that Audacity reports as `BatchCommand finished: OK`. With the audio track selected first (`SelectTracks`) the same range exports 17.760 s, RMS 0.086. A narrator who imports findings and then exports a chapter gets an empty file and no error. Prototype row A6 fails on this today and A9 pins the Audacity rule so a change in it is noticed. The pass's A13 would not catch it: `waitForFile` accepts any file over 44 bytes, and the empty export is larger. Fixed after this note was written: `ExportChapter` now selects the audio tracks first (`selectAudioForExport`), the fake models "Export2 writes only selected tracks", and prototype row A6 passes against 3.7.7 (17.760 s, RMS 0.086). The pass's A13 still needs to read the WAV's length and level.
3. **The adapter cannot reach a Linux Audacity as written.** `Command.Path` accepts only `C:/…` paths (D72), `PipeTransport` is Windows-only (`pipe_other.go`), and `ExportChapter` starts with `filepath.IsAbs`, which refuses `C:/…` on Linux. A symlink named `C:` in the folder Audacity was started from did not make it resolve `C:/tmp/…` ("did not recognize the type of the file"); why was not investigated. The prototype therefore carries a test-only FIFO transport, sends `Import2` and `Export2` as plain string commands, and mirrors `ExportChapter`'s sequence step for step. A Linux CI that runs the shipped `Import`, `Export`, `ExportChapter` and `Part C` needs a platform seam for the path rule and a FIFO transport in the package. Both are small and both are adapter changes, so they are a phase of their own.
4. **The FIFOs on Linux, and a first-start trap.** The module makes `/tmp/audacity_script_pipe.to.<uid>` and `.from.<uid>`, opens `to` for reading, then `from` for writing, and after every client disconnect removes and recreates both. A client opens `to` for writing first. Terminate is `\n` (the Windows client's `\r\n\0` is not needed; `Options{LineEnd: "\n"}` is enough). On a profile Audacity has never seen, the first start records `mod-script-pipe=4` (failed) whatever the seeded config said. Four attempts to get a working pipe from one start on a fresh profile, with the module seeded as enabled (and once with its path and timestamp seeded too), all failed: the first command got no answer in 60 s or got a lone blank line, and a write-open of the `to` FIFO failed for 133 s. Stopping the first start, setting the status to `1` and starting again gave a working pipe 2 s after launch every time `run.sh` did it (about a dozen starts). Why the first start fails was not found.
5. **Modal dialogs hold the pipe, and none of them is rare.** A scripting command that needs the UI waits behind any modal dialog, with no reply, so the client's 5 s timeout fires and it reconnects. Seen:
   - the first-run "App updates & usage info" dialog: `Import2` hung more than 120 s. `[Update] UpdateNoticeShown=1` and `DefaultUpdatesChecking=0` in `audacity.cfg` stop it; Audacity drops those keys on a profile that lacks `PrefsVersion`, so they are written after the first start;
   - "Welcome to Audacity!" (`[GUI] ShowSplashScreen=0`);
   - "Error Writing to File" after `SaveProject2` into a folder that does not exist: no reply for the whole wait, and "Error Opening Project" after `OpenProject2` of a project that is already open;
   - "Too few tracks are selected for recording at this sample rate" after `Record1stChoice` with the imported 22.05 kHz track selected in a 44.1 kHz project. This is the one a narrator can hit: LibriVox's 22.05 kHz MP3 and a default project rate disagree, and `Session.Roll` (`PunchAndRoll`) was not run against that state here;
   - "Automatic Crash Recovery" after an earlier kill: visible, and commands still ran.
   - Dismissing from outside works with `xdotool` (a click on "Don't send" closed the error dialog and the next command answered at once). `Return` pressed the focused "Problem details" toggle, not the default button.
   - After the dialog was closed, the first command on a new connection was answered at once.
6. **`GetInfo: Type=Selection` exists.** It was added in Audacity 3.6 (`CHANGELOG.txt`, the 3.6 section) and 3.7.7 answers `{ "Start":10, "End":20 }`. The spec note lists only `Commands … Boxes` ([research](audacity-4-scripting-spec.md)), and the adapter has no selection read. With a cursor at 5 s and `Play` running, `Selection` stayed `{5, 5}` and `Message` answered at once: there is no play position and no play-state read in scripting, so `PlayPosition` stays `ErrNotAvailable` (`steps.go`) however many Audacity versions are pinned.
7. **Recording needs a clock.** ALSA's `null` PCM hands out samples as fast as they are read: 3 s of wall time recorded 10,767 s and made a "Dropouts" label track. A PulseAudio null sink is paced like a card. With `module-null-sink` as the default sink and `libasound2-plugins`' `pcm.!default { type pulse }` in `~/.asoundrc`, `Record1stChoice` then `Stop` recorded 4.4 to 6.0 s of a clip played into the sink with `paplay` (RMS 0.060 to 0.070, 2 channels, 44.1 kHz); the monitor alone records silence. Audacity reaches Pulse here only through ALSA's `pulse` plugin.
8. **Other facts a fake cannot give.** `Import2` of the 13.3-minute 64 kbps MP3 took 0.5 to 1.4 s and the clip was 796.286 s, equal to the alignment's `duration_s`. `Export2` resamples to the project rate (22.05 kHz source, 44.1 kHz WAV). WAV and MP3 exports both worked (`Exported to MP3 format`, LAME is bundled). `Undo` takes back a label edit. Round trips on the pipe: `Message` 16 to 60 ms, `GetInfo` 10 to 80 ms, `Export2` of 17.8 s 90 to 200 ms. The window title becomes the project's name after `SaveProject2` (`ch01` after saving `ch01.aup3`); scripting has no read for a project's name or path, so the title is the only identity, and only through the window system. `SetProject` with a size crashed Audacity once (a crash report dialog appeared) and was not investigated.

## Action-by-action matrix

"Fake" is what the existing tests prove. "Real only" is what only Audacity can show. The CI column is for a Linux runner with Xvfb and a PulseAudio null sink unless it says Windows. A fixture id is from `sources.json`. Rows marked **proved here** have an assertion in the prototype.

| Action | Adapter call | Fake proves | Real only | In CI | LibriVox |
| --- | --- | --- | --- | --- | --- |
| Reach Audacity, version | `Client.Ping` (`Message` echo), `Client.Reachable` | Framing, timeout, reconnect | The module loads, the pipe exists only once enabled, the first-start trap, replies that start with a blank line (Finding 1) | **Yes**, proved here (A1) | none |
| Open or identify the project | `Session.Project` (`GetInfo` Tracks, Labels), `Client.OpenProject` | JSON parsing, `ErrNoProject` | No name or path in scripting; the window title carries the project's name; `OpenProject2` of an open project shows a modal | Tracks and Labels **yes** (A2). Identity by window title with `xdotool`: yes, as a side channel the adapter does not have | `kara_01` saved as `.aup3` (71 MB: keep it in the work folder) |
| Import audio | `Client.Import` (`Import2`) | Command text, extension refusal | MP3 decode, clip length, import time | **Yes**, proved here (A3), through a string command (Finding 3) | `kara_01` |
| Chapter and line markers | `Session.ImportFindings`, `AddMarker`, `FindingLabels` | Order of `SelectNone`, `SelectTime`, `AddLabel`, `GetInfo`, `SetLabel`; idempotence | Label times to six digits, the label track Audacity makes, the text round trip of the hardest accepted text (pass A5) | **Yes**, proved here (A4). A5's text can run unchanged | the first paragraphs of `kara_01`, times from the alignment markers |
| Read the selection | none (a raw `GetInfo: Type=Selection`) | n/a | 3.6 or later; the reply shape | **Yes**, proved here (A5) | `kara_01` |
| Read the play position or play state | none (`PlayPosition` is `ErrNotAvailable`) | n/a | There is no such command; `Selection` does not move while playing | **No**, on any runner | none |
| Go to, navigate, loop, stop | `GoToFinding`, `Navigate`, `Loop`, `StopLoop` | Commands sent | The selection after `SelectTime`; `PlayAtSpeedLooped` runs | Selection **yes** (A5). That the loop is audible: the sink's input exists (`pactl list sink-inputs`), but pitch and looping are Part B | `kara_01` |
| Record and stop | none today (`record` is not available; `Roll` is `PunchAndRoll` after a backup) | Roll's command order | A device, the sample-rate modal (Finding 5), what ends up in the track | **Yes**, proved here with a raw `Record1stChoice` and `Stop` against the null sink while a clip plays into it. `Roll` itself: yes, to write | the clip from `kara_01`, played with `paplay` |
| Takes (none in Audacity), stack, cut, effect on words | `takes`, `stack_takes`, `cut_range`, `fx_range` through `BackupAround` and steps | Commands, order, `undoSteps` | Where `Paste` puts audio, whether `Delete` closes a gap, how many undo points a macro adds (Part C, C1 to C7) | **Yes**, once the seam of Finding 3 exists: `pass_live_test.go` is a Go test over the same calls | `kara_01` in place of the tone: cut points in the pauses the alignment names; the result's length and non-silence asserted |
| Undo | none (`undo_last` is not available) | n/a | `Undo` takes back the last edit; the count each edit adds | **Yes**, proved here for a label edit (A8) | none |
| Export a range to WAV | `Session.ExportChapter`, `Client.Export` | Name, extension, fresh path | Only selected tracks are written (Finding 2); the file's length and level | **Yes**, proved here (A6 fails on the adapter's sequence, A6b passes with the track selected) | `kara_01`: paragraph 1, 17.76 s |
| Export to MP3 | `Client.Export` with `.mp3` | Extension | LAME is present and the file is written | **Yes**, proved here (A7) | `kara_01` |
| Backups | `BackupAround`, `RestoreBackup` | Commands | Clone and restore equal when hashed (the pass's backups table, not run anywhere) | **Yes** with the seam: export both and compare PCM hashes | `kara_01` |
| Events | `Subscribe` is a no-op (`unavailableReview`); nothing polls | n/a | Audacity pushes nothing (see below) | Polling design **yes** to prototype; not built | none |
| Cleanup and effects by macro | `ApplyMacro`, `macro_render` | Name check | A saved macro runs (`Macros` live in the profile) | **Yes**: ship a macro file in the profile the run builds | `kara_01` |

### Events: how the adapter would poll

Audacity has no push events: the module answers one command at a time on the main thread. Today nothing in the adapter polls; `Client.Reachable` is only the outcome of the last request. A poller that gives the review page what REAPER's heartbeat gives it would, on a 1 s timer and only while no other request is running (the client serialises requests on one pipe):

- `Message` echo as the heartbeat, and `ErrTimeout` or a dropped connection as "can't tell, last heard N s ago" ([Definition of done](../../.claude/rules/definition-of-done.md), "Talking to an integration");
- `GetInfo` Tracks and Labels, diffed against the last answer, for changes the narrator made by hand (10 to 80 ms each in this run); `GetInfo: Type=Selection` for the cursor and selection;
- a lone empty line as "no project open" (Finding 1) and a timeout as "a dialog may be open", with the dialog list from the window system unavailable to the adapter.

A prototype of the poller can run in the same job: change a label with `SetLabel`, assert the next poll sees it, assert a `Selection` change is seen, assert the modal case (Finding 5) produces the timeout state.

## Recommended CI design

- **Triggers.** `workflow_dispatch` first, then a nightly `schedule` and a run before each release. Not every pull request: a run needs a 111 MB download from github.com and a LibriVox file from archive.org, and an Audacity release can change a command for reasons unrelated to a change. A change under `audacitybridge` or `dawport/audacity` can run it by hand.
- **Runner.** `ubuntu-24.04` (pin the label, not `latest`) as the first target: Xvfb and PulseAudio are packages, and a null sink gives a paced input. `windows-latest` is the product's platform and the reference for the named-pipe transport and `Command.Path`; it has no audio device (the REAPER run recorded "Error opening devices", [QA checklist 9.7](../operations/windows-qa-checklist.md)), so recording rows are Linux-only unless a virtual device driver is installed there. A Windows job is phase 4.
- **Install.** Audacity 3.7.7 AppImage, `https://github.com/audacity/audacity/releases/download/Audacity-3.7.7/audacity-linux-3.7.7-x64-22.04.AppImage`, SHA-256 `45c4445fb6670cc5fe40d31c7cea979724d2605bca53b554c32520acbf901ef0`, 111,180,280 bytes. Extract with `--appimage-extract`; do not run it as an AppImage (no FUSE). For Windows: `audacity-win-3.7.7-64bit.zip`, SHA-256 `1d345a48a698c57363475b7b3a0b113f796c2a49c6254d5f41dae53b9f4017d8`, 27,285,342 bytes, holding `Audacity.exe` and `modules/mod-script-pipe.dll`. The hash is the only identity either file has; bump the version and hash together from the release page, and note it in the report. Packages: `xvfb pulseaudio pulseaudio-utils libasound2-plugins xdotool ffmpeg imagemagick`.
- **Caching.** Cache the AppImage and the LibriVox MP3 by SHA-256 (`actions/cache`); the extracted tree is quick to rebuild.
- **Audio device.** A PulseAudio null sink, `~/.asoundrc` routing ALSA's default to it, and `paplay` to put the fixture on the sink as the loopback signal. Not ALSA's `null` (Finding 7).
- **Profile.** A fresh `HOME` per launch, `audacity.cfg` written by `run.sh`, two starts to enable the module (Finding 4), `UpdateNoticeShown=1`, `ShowSplashScreen=0`, a temp directory inside the work folder. Audacity run with no window manager under `Xvfb -ac`.
- **Dialogs.** Every command runs under a timeout; on a timeout the harness takes a screenshot (`import -window root`) as an artifact, lists the windows with `xdotool`, and fails the row with the window titles in the message. A known dialog is answered by a click on its button (never `Return`), and the row records that it appeared. An unexpected dialog is a failure.
- **Fixtures.** `scripts/research/real-audacity3-ci/fetch_fixture.py` calls the fixture's `sources.fetch`, so the pin lives in one file and the SHA-256 is checked on every download (the REAPER note's driver does the same).
- **Timeouts.** Job 20 minutes; Audacity start 30 s; each command 20 s in the test client (the shipped 5 s is for the narrator). A hung Audacity is killed with `pkill -x audacity`; the run's `trap` also removes the FIFOs.
- **Artifacts.** `go test -v` output, screenshots at the end of each test and on failure, `audacity.log`, `pulse.log`, the exported WAV and MP3, 14 days.
- **Reporting.** One `--- PASS`, `--- FAIL` or `--- SKIP` per action, in the job summary; any failure fails the job; a skipped row names what it needs. A row that disagrees with the fake is a fake bug: correct `audacitybridgetest` to what Audacity did and add a test, as [the pass](../operations/audacity-verification-pass.md#what-happens-with-the-results) says.
- **What a green run is worth.** Evidence in a dated note. It is not a promotion: every Audacity capability stays Experimental until the owner's pass.

## Audacity 3 against 4

The repo tracks them separately ([Audacity 4](../reference/daw/audacity-4.md)); only 3 can be run.

| | Audacity 3.7.x | Audacity 4.0.x |
| --- | --- | --- |
| Scripting | `mod-script-pipe`, one command per read, FIFOs on Linux and named pipes on Windows | None. `release-4.0.1`'s `CHANGELOG.txt`, read 2026-10-19, still lists "Macro Manager and the scripting pipe" under features not available |
| `GetInfo: Type=Selection` | Yes, since 3.6 | n/a |
| Macros | `ApplyMacro` by name | Macro Manager is also unavailable in 4.0 |
| Packaging for CI | A Linux AppImage and a Windows zip with the pipe module in them | Not tried; there is nothing to drive |
| What a CI job can say | The adapter's commands against 3.7.7 | Only that a 4.x build still has no pipe: one cheap check, `ErrNotReachable` after a start, that turns red when the pipe appears |

What changes the row for Audacity 4 is a published script host ([the 4.x spec research](audacity-4-scripting-spec.md)): a new `Transport` and perhaps a new command dialect behind the same `Client`. Re-check 4.1's issue tracker and release notes before relying on this table for a newer release.

## Licence

Audacity is GPLv3: `share/doc/audacity/LICENSE.txt` in the AppImage says "released under the GNU General Public License version 3 (GPLv3)" with some files under GPLv2-or-later. Installing and running it on a CI runner, and driving it through its scripting pipe from our process, distributes nothing. The repository ships no Audacity file, so the licence puts no constraint on the nightly job. Two points to keep: the job must not publish the AppImage or an extracted tree as an artifact (that would be redistribution, with source-offer duties), and the tests' outputs (WAV, MP3, screenshots) contain no Audacity code. The LAME encoder is bundled in the AppImage and was not examined for its own terms. This note is not legal advice; the owner reads the licence file before the schedule is turned on.

## Phased plan

| Phase | Work | Needs |
| --- | --- | --- |
| 0 | Owner reads this note and the two bugs (Findings 1 and 2); approves the `risk:high` workflow pull request | Owner |
| 1 | Land the prototype as a manual `workflow_dispatch` job on `ubuntu-24.04` ([the workflow pull request](https://github.com/countrymanprime/narration-utils/tree/claude/real-audacity3-ci-workflow)); read its first report; fix what it finds in the prototype | Phase 0 |
| 2 | Findings 1 and 2 are fixed in the adapter, each with a test first (`reply_test.go`, `session_test.go`); run the prototype without any patch | Done |
| 3 | Seam for Finding 3 (path rule by platform, a FIFO `Transport` in the package, `ExportChapter` free of `filepath.IsAbs`); run Parts A and C of `pass_live_test.go` unchanged on Linux, with the pass's A5 hard text and C1 to C7, `kara_01` in place of the tone | Phase 2 |
| 4 | Add the poller prototype (Events above), a Windows job (`audacity-win-3.7.7-64bit.zip`, named pipes, no audio), the window-title identity check, and the Audacity 4 "still no pipe" check | Phase 3 |
| 5 | Nightly `schedule` and a pre-release run; on failure open or update one issue; record each result in `docs/reference/daw/audacity-3.md` with the Audacity version, runner image and run link | Licence read |

## Not proven

- Windows Audacity's reply bytes: Finding 1 is a fact about 3.7.7 on Linux. The code that writes them is shared, and the fake treats the first blank line as "no project" on both.
- That the two-start enable (Finding 4) works the same on a GitHub-hosted runner. It worked every time in the container (about a dozen starts); the one-start failure was seen in all four attempts there.
- `Session.Roll` against an imported 22.05 kHz track in a 44.1 kHz project (the modal in Finding 5 came from `Record1stChoice`), `ApplyMacro`, `BackupAround` and `RestoreBackup`, and everything in Part C. None was run.
- That the 3.7.7 AppImage's `22.04` build runs on the runner image used in the first dispatch; it ran on Ubuntu 24.04 here.
- `SetProject` crashing Audacity once: not reproduced or isolated.
- What the AppImage's bundled encoders and libraries are licensed under.
