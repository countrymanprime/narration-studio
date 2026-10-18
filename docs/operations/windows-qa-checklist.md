# Windows QA checklist

The checks the recent Studio Next pull requests could not run: they ran against the mock host in a Linux container, with no REAPER, no microphone, no Windows folder window and no packaged app. Work through them on a Windows machine with the installed app. The order is the order a narrator's day goes wrong first: recording, linking a project, delivery, then the rest.

Every check names the pull request (or open issue) that asked for it. Nothing here is a new requirement. Where a pull request stated what to see, that is written below; where it only said to look, the check says so and you note what you see.

**Needs** tags on each check:

- **REAPER**: a real REAPER with the project linked.
- **Audio**: a real microphone, interface or foot pedal.
- **Folder window**: the real Windows folder or file chooser.
- **Packaged app**: the installed app, not `dev:mock`. Where this is not tagged, the check can run in either.

Tick a box only after you have seen the result. Report a failure on the control issue [#992](https://github.com/countrymanprime/narration-utils/issues/992) with the check's number.

Related: [the REAPER verification pass](reaper-verification-pass.md) for the bridge commands, [the Booth acceptance matrix](booth-acceptance.md) for the rows these checks close, and [the Audacity verification pass](audacity-verification-pass.md).

## 1. Recording in the Booth

### Built-in recorder (no DAW)

Windows only, Experimental. Source: [#1793](https://github.com/countrymanprime/narration-utils/pull/1793). The host tests used a fake recording engine, so none of the real capture has been run.

- [ ] **1.1 A chapter-length take.** Needs: Audio. Record a chapter-length take in the Booth with no DAW, then Stop. See: the take in the project's `Recordings` folder; it plays and has no dropouts.
- [ ] **1.2 Unplug the microphone mid-take.** Needs: Audio. See: the Booth ends the take and says why; the audio before the unplug is kept; Record works again after you replug.
- [ ] **1.3 Microphone blocked in Windows.** Needs: Audio. Block the app in Windows microphone privacy settings, then press Record. See: Record says so and records nothing.
- [ ] **1.4 Two microphones, none chosen.** Needs: Audio. See: Record asks you to choose; after you choose one in Levels, Record uses it; after closing and reopening the app it remembers the choice.
- [ ] **1.5 Disk fills during a take.** Needs: Audio. Use a small volume. See: the take ends with the audio kept.
- [ ] **1.6 Reload or close mid-take.** Needs: Audio, Packaged app. Reload once, and quit once. See: after a reload the take is taken back and Stop ends it; after quitting the take is finished.
- [ ] **1.7 Experimental off mid-take.** Needs: Audio. See: Stop still ends the take.
- [ ] **1.8 Device names.** Needs: Audio. Not in the pull request's list but named as unverified: confirm the list in Levels and the names the recorder uses are the same, including a device with unusual characters in its name.

### Booth with REAPER

Source: [#1756](https://github.com/countrymanprime/narration-utils/pull/1756) unless named.

- [ ] **1.9 First real take after linking.** Needs: REAPER. Link a project created outside the starting folder, run the launcher ("Open in REAPER and connect"), and wait. See: the notice clears and Record enables within seconds. Then record a take: it goes into the right project.
- [ ] **1.10 A different project open in REAPER.** Needs: REAPER. See: Record refuses and says so. Per [#1762](https://github.com/countrymanprime/narration-utils/pull/1762), the notice offers **Link the open project** and **Check again**; try both.
- [ ] **1.11 Foot pedal.** Needs: Audio. Hold and repeat the pedal's Space, including right after closing Levels and right after the "Stop recording?" question. See: the pedal starts and stops a take each time.
- [ ] **1.12 Pedal key.** Needs: Audio. Note whether your pedal sends Space or Enter. Only Space is a Booth key.
- [ ] **1.13 Microphone unplugged in a REAPER take.** Needs: REAPER, Audio. Unplug a real microphone in Levels mid-take. See: the footer says the text cannot follow, and the take goes on.
- [ ] **1.14 Kill REAPER mid-take.** Needs: REAPER. See: the Booth says the take is over in REAPER; Record comes back when REAPER does. [#1762](https://github.com/countrymanprime/narration-utils/pull/1762) adds: after you restart REAPER, the Booth explains once REAPER answers.
- [ ] **1.15 Start REAPER while the app is busy.** Needs: REAPER. Press "Open in REAPER and connect" while the app is importing or building. See: the message says the project was turned away, and the notice says what to do.
- [ ] **1.16 Speech model download during a take.** Needs: Packaged app. Start a take while the 464 MB speech model is downloading. Note how long Space is held back by its "cannot be cancelled" step.
- [ ] **1.17 Mouse Back button mid-take.** Needs: Packaged app. Press the mouse's Back button during a take, then open the Booth again. See: Stop is there.

### Levels

Source: [#1762](https://github.com/countrymanprime/narration-utils/pull/1762). The monitor level is Experimental and talks to REAPER's send API, which has not run in a real REAPER.

- [ ] **1.18 REAPER send calls.** Needs: REAPER. `GetTrackNumSends(master, 1)` returns the hardware-output count, and `D_VOL` reads, writes and returns true.
- [ ] **1.19 Which output moves.** Needs: REAPER, Audio. The first hardware output is the one that moves. See: 70 is 0 dB, 100 is +6 dB, 35 is -30 dB, and 0 is silence.
- [ ] **1.20 Master fader and undo.** Needs: REAPER. See: the master fader never moves and no undo point is created.
- [ ] **1.21 Muted or deleted output.** Needs: REAPER. Mute or delete the hardware output, then change the level. See: the refusal sentence appears.

## 2. Linking a project and the first screens

- [ ] **2.1 Back from dirty Settings.** Needs: Packaged app. Change a setting without saving, then use the mouse Back button, and again the keyboard Back. See: the "Unsaved settings" question appears. The unrequested-pop path is unverified in WebView2. Source: [#1790](https://github.com/countrymanprime/narration-utils/pull/1790).
- [ ] **2.2 Top bar at the minimum window.** Needs: Packaged app. Shrink the window to the 960 px minimum with a timer running. Look for overlap or clipped timer digits. Source: [#1790](https://github.com/countrymanprime/narration-utils/pull/1790).
- [ ] **2.3 Replace manuscript.** Needs: Packaged app. On a real project, click "Replace and reset" once. See: one click replaces the manuscript. Source: [#1790](https://github.com/countrymanprime/narration-utils/pull/1790).
- [ ] **2.4 Project picker on Windows.** Needs: Packaged app, Folder window. Open the picker. Paths should show with Windows backslashes (`C:\...`), not the forward slashes the mock shows. Also try creating a project with a reserved or illegal name (`CON`, `a/b`) and an existing folder, and **Change location…**. The audit could not try these against the real host. Source: open issue [#1778](https://github.com/countrymanprime/narration-utils/issues/1778).
- [ ] **2.5 Audacity-mode picker.** Needs: Packaged app. Start the app from the Start Menu entry "Narration Studio for Audacity" and look at the picker. The audit could not try it. Source: open issue [#1778](https://github.com/countrymanprime/narration-utils/issues/1778).
- [ ] **2.6 Start-up console error.** Needs: Packaged app. The audits saw one failed request for `/favicon.ico` on first load; `index.html` now declares `/favicon.png` and the start-up spec checks it. Note whether the packaged app still logs a failed request. Source: open issues [#1773](https://github.com/countrymanprime/narration-utils/issues/1773), [#1774](https://github.com/countrymanprime/narration-utils/issues/1774), [#1778](https://github.com/countrymanprime/narration-utils/issues/1778).
- [ ] **2.7 Cross-page links in the packaged shell.** Needs: Packaged app. Follow a few hand-offs (Production to Booth, Proof to Script, Delivery to Master & QC), use Back and Forward, and press F5 on each. The matrix ran in Chromium only. Source: [#1759](https://github.com/countrymanprime/narration-utils/pull/1759), whose own list of untried items is "no packaged Windows desktop shell".

## 3. Delivery and Master & QC

### Delivery

Source: [#1766](https://github.com/countrymanprime/narration-utils/pull/1766).

- [ ] **3.1 Build a package.** Needs: Folder window, Packaged app. Press **Build ACX package** with everything passing (double-click it once). See: the Windows folder window opens once; choosing a folder builds and lists the files; **Open the folder** opens Explorer on it.
- [ ] **3.2 Close the folder window without choosing.** Needs: Folder window. See: Delivery says no package was built.
- [ ] **3.3 Awkward folders.** Needs: Folder window. Choose a folder on a network share (UNC), a folder whose path is over 260 characters, and a read-only folder. See: the build says why it cannot and leaves nothing behind.
- [ ] **3.4 Cancel, then rebuild.** Needs: Folder window. Cancel a build, then build again into the same folder. See: no "already exists" refusal.
- [ ] **3.5 Quit mid-build.** Needs: Packaged app. Quit during a build and reopen. See: Delivery shows what became of it.
- [ ] **3.6 Awkward chapter titles.** Needs: Folder window. Build with a chapter titled `CON` and one with a trailing dot: each builds a file. A 300-character title is refused with the chapter named.
- [ ] **3.7 Delivery to Master & QC.** Follow a Delivery chapter row into Master & QC for a measured and for an unmeasured chapter.
- [ ] **3.8 Items the audit left open.** Needs: Folder window. The audit could not try a real built package, file conflicts, or Delivery re-reading profiles after you edit them in Settings and return to the window. Look at each and note what you see. Source: open issue [#1774](https://github.com/countrymanprime/narration-utils/issues/1774).
- [ ] **3.9 Cancel on a quiet host.** Open issue [#1774](https://github.com/countrymanprime/narration-utils/issues/1774) item 2 says the mock answers Cancel at once while reads are quiet and that a real host needs checking. Cancel a long build and note whether the page claims the cancel before the host confirms it.

### Master & QC

Source: [#1761](https://github.com/countrymanprime/narration-utils/pull/1761) unless named.

- [ ] **3.10 Odd file locations.** Needs: Folder window. Pick a file on a network share (UNC) and one with a path over 260 characters. See: Check files measures it or says why.
- [ ] **3.11 Play and Open in REAPER.** Needs: REAPER, Audio. Right-click a row, then **Play the quietest 5 s** and **Open in REAPER** with REAPER running and the Experimental switches on. See: both work, and the toast names the DAW.
- [ ] **3.12 Quit REAPER with the page open.** Needs: REAPER. See: the two buttons go off with a reason within a few seconds, and **Check again** brings them back when REAPER returns.
- [ ] **3.13 Long measurement and restart.** Needs: Packaged app. Start a long measurement, quit the app and reopen. See: the page shows what happened to the run.
- [ ] **3.14 Chapter picker height.** Open the chapter picker with the window maximised and at a short height. See: the list stays on screen.
- [ ] **3.15 Count of chapters not ready.** With three real WAVs, run **Check files** and compare "not ready" with Delivery's. They should match. Source: [#1789](https://github.com/countrymanprime/narration-utils/pull/1789).
- [ ] **3.16 Real measurement.** Needs: Audio. The audit could not try a real WAV measurement, Cancel and re-check races on a real engine, a measurement where the host goes quiet, or the native file dialog. Run each and note what you see. Source: open issue [#1773](https://github.com/countrymanprime/narration-utils/issues/1773).
- [ ] **3.17 Play and Open with the wrong or no project.** Needs: REAPER. With the wrong project open in REAPER, and with none, press Play and Open. The mock always reports success; a real host should refuse. Note what happens. Source: open issue [#1773](https://github.com/countrymanprime/narration-utils/issues/1773) item 6.

## 4. Pickups

Source: [#1758](https://github.com/countrymanprime/narration-utils/pull/1758). Needs a real DAW for the first steps.

- [ ] **4.1 List and badge.** Needs: REAPER. Open Pickups with the DAW running. See: lines group by chapter and the badge on the rail matches.
- [ ] **4.2 Chapter keys.** Press Alt+Down and Alt+Up. See: the chapter steps.
- [ ] **4.3 Recorded but not in the DAW.** Needs: REAPER. Close the DAW and mark a line recorded. See: it says "Not in the DAW yet". Start the DAW and return to the window: the note clears.
- [ ] **4.4 Unreadable list.** Needs: Packaged app. Make the project folder unreadable (rename it) and open Pickups. See: the reason and **Check again**, not "No pickups queued".
- [ ] **4.5 Check recordings at a short window.** Shrink the window to about 1000x400 and open **Check recordings**. See: **Cancel** and **Check** stay on screen.
- [ ] **4.6 Add by hand.** Add a line with `5:99`, then with `5:12`, then the same line again. See: a sentence each time.
- [ ] **4.7 Large list.** The pull request tested 300 lines and noted 1500 lines in a real browser is untested and the table is not virtualised. Load a long list and note how slow it is.

## 5. Script

- [ ] **5.1 Record from here.** Needs: REAPER, Audio. On a selection, and from the right-click menu, start the Booth at the selected words. Record in Booth on the Opening and Closing credits cards opens the Booth on those credits. Source: [#1745](https://github.com/countrymanprime/narration-utils/pull/1745).
- [ ] **5.2 Credits prep survives a restart.** Needs: Packaged app. Set My prep on the credits, restart the app, and check the state and the chapter list's dot are kept (`narration-utils/script-prep.json`). Source: [#1745](https://github.com/countrymanprime/narration-utils/pull/1745).
- [ ] **5.3 Last chapter and Closing credits.** Press the last chapter in Script's list and the Closing credits row. See: the reader lands on it. Source: [#1789](https://github.com/countrymanprime/narration-utils/pull/1789).

## 6. Story Bible

- [ ] **6.1 Accept a suggestion on a real project.** Needs: Packaged app. Story Bible, then Needs verification, then Accept a "New entry" suggestion. See: the entry appears and Undo removes it. Source: [#1789](https://github.com/countrymanprime/narration-utils/pull/1789).
- [ ] **6.2 Real Scan and Import.** Needs: Packaged app, Folder window. Do a real Scan and an Import, accept a suggestion, and confirm an entry appears. Source: [#1757](https://github.com/countrymanprime/narration-utils/pull/1757).
- [ ] **6.3 Row menu, narrow window.** Right-click an entry row (and press Menu or Shift+F10). See: the menu is fully visible beside the left rail. Try **Delete entry** on the locked entry. With the window about 800 px wide and 700 px high, click an entry: it scrolls into view. Source: [#1757](https://github.com/countrymanprime/narration-utils/pull/1757).
- [ ] **6.4 Import limits.** Needs: Folder window. Import a CSV with a `=1+1` cell and a 3 MB file. See: both are explained in a sentence. Source: [#1757](https://github.com/countrymanprime/narration-utils/pull/1757).
- [ ] **6.5 Unknown entry link.** Open `/story-bible#nonsense`. See: a message with **Dismiss** and **Go to Production**, and no entry silently opened. Source: [#1757](https://github.com/countrymanprime/narration-utils/pull/1757).
- [ ] **6.6 Voice data toast.** Needs: Audio. Open Voice data and approve a reference clip. See: the "Reference approved." toast is visible above the panel. On a very small window, check the toast does not hide what you need. Also listen to the preview voice, which was never heard. Source: [#1757](https://github.com/countrymanprime/narration-utils/pull/1757).

## 7. Schedule

Source: [#1760](https://github.com/countrymanprime/narration-utils/pull/1760) unless named.

- [ ] **7.1 Real project values.** Needs: Packaged app. Open a real project's Schedule. See: due date, amount, payment type and milestones match the project manifest.
- [ ] **7.2 Persistence.** Change each of due date, amount, payment and a milestone, close and reopen the app. See: they persisted.
- [ ] **7.3 Manifest edited by hand.** Edit the project manifest while Schedule is open. See: within a minute, or on switching back, the page shows it.
- [ ] **7.4 Undo.** Undo from the header history after a due-date change. See: the field returns to the earlier date.
- [ ] **7.5 Across midnight.** Leave Schedule open across midnight. See: the day counts move on.
- [ ] **7.6 Huge rate.** Type a 20-digit rate. See: it is refused with a sentence, and the sentence is gone after a valid one. Source: [#1789](https://github.com/countrymanprime/narration-utils/pull/1789).
- [ ] **7.7 Open audit items.** The audit could not try the changed-elsewhere row, the "Couldn't read the schedule again" banner, or the Done toggle, note tooltip and Remove with Undo one by one. Source: open issue [#1775](https://github.com/countrymanprime/narration-utils/issues/1775).

## 8. Documents that were read, not run

These pull requests changed documents or checks only. They need a person's decision, not a Windows run.

- [ ] **8.1 Threat-model edits.** [#1796](https://github.com/countrymanprime/narration-utils/pull/1796) is merged and was marked `risk:high`. Read its threat-model row changes (1i, 5h, 5l, 9a, 5i) and the `SECURITY.md` clause, and accept or reject them.
- [ ] **8.2 Master & QC stepper keys.** Optionally check whether the Master & QC chapter stepper has Alt+Up and Alt+Down keys. [#1796](https://github.com/countrymanprime/narration-utils/pull/1796) found no binding and left the hint out of the guide.
- [ ] **8.3 Guide steps.** The guides were checked against component labels by reading, not by running the app. Follow a guide page against the installed app and note any step that does not match. Source: [#1796](https://github.com/countrymanprime/narration-utils/pull/1796).
- [ ] **8.4 Gaps and ratchet entries.** Rule on the gaps listed in [#1791](https://github.com/countrymanprime/narration-utils/pull/1791): waive them by comment or ask for fixes. Nothing is waived today.
- [ ] **8.5 Atlas images.** 29 refreshed atlas images in `docs/ui/images/` were not opened by anyone. The list is in [#1792](https://github.com/countrymanprime/narration-utils/pull/1792).

## 9. Release-gate checks

Owner-pending ([D65](../../.claude/skills/agent-train/SKILL.md#owner-standing-rules)): none of these blocks a merge or a launch. Each was written up by a note or issue that could not run it. The indented line under each check says what a manual workflow now runs on a clean GitHub-hosted runner ([the workflows](ci-and-releases.md#the-windows-release-gate-evidence-workflows)) and what stays with the owner; those runs are evidence, not a replacement for the owner's check. Report a result on [#992](https://github.com/countrymanprime/narration-utils/issues/992) with the check's number.

- [ ] **9.1 MP3 encode with the catalogued FFmpeg.** Needs: Packaged app. Install the encoder asset, then on Windows run `NARRATION_UTILS_FFMPEG=<path to ffmpeg.exe> go test ./internal/encodeport/...`, and encode a chapter to MP3 in the app. See: the test passes, the MP3 passes the ACX format and sample-rate checks, and it plays. Source: [FFmpeg encoder build](../research/ffmpeg-encoder-build.md#not-verified-pending-with-the-owner), which ran the encode only with the Linux build.
  - **Automated: [Windows encode check](../../.github/workflows/windows-encode-check.yml), last result [passed, run 39141964551](https://github.com/countrymanprime/narration-utils/actions/runs/39141964551).** The catalogued FFmpeg matched its pinned size and SHA-256 and all 7 MP3 encodes (44.1 and 48 kHz, 192 to 320 kbps, and 16 kHz with the rate left open) passed the ACX format and sample-rate checks. **Owner-only:** encode a chapter in the packaged app and play the MP3.
- [ ] **9.2 Install on a clean machine.** Needs: Packaged app. Run `narration-utils-<version>-windows-x64-setup.exe` on a Windows machine that has never had the app, then uninstall it. See: the install is per user with both shortcuts, the app starts, and the uninstaller removes it. Source: [the Windows setup program](ci-and-releases.md#the-windows-setup-program), where CI proves the compile and an install on a clean machine is the owner's check. The first stable rehearsal is the same milestone as [#188](https://github.com/countrymanprime/narration-utils/issues/188).
  - **Automated: [Windows release checks](../../.github/workflows/windows-release-checks.yml), last result [job passed, in run 39145815021 (whose 9.4 job failed)](https://github.com/countrymanprime/narration-utils/actions/runs/39145815021).** On a clean runner the silent install was per user (`HKCU` entry `NarrationUtils`, none under `HKLM`, folder `%LOCALAPPDATA%\Programs\Narration Studio`) with both Start Menu shortcuts and the desktop one, the app stayed up for 10 s, and the uninstaller removed the program, entry and shortcuts. **Owner-only:** a machine with SmartScreen and real desktop use; nothing else is known to be missing.
- [ ] **9.3 Upgrade over an existing install.** Needs: Packaged app. Install one published release, run the next setup program over it, and start the app. Note whether it keeps its settings, recent projects and shortcuts, and which version it reports. Source: [the Windows setup program](ci-and-releases.md#the-windows-setup-program), whose install check is by hand.
  - **Automated: [Windows release checks](../../.github/workflows/windows-release-checks.yml), last result [job passed, in run 39145815021 (whose 9.4 job failed)](https://github.com/countrymanprime/narration-utils/actions/runs/39145815021).** 0.3.251 then 0.3.252 over it: same folder, one uninstall entry (key stayed `NarrationUtils`; the check accepts `NarrationStudio` for [#1816](https://github.com/countrymanprime/narration-utils/issues/1816) phase 2), reported version 0.3.251 to 0.3.252, seeded `global-settings.json` and `recent-projects.json` byte for byte, shortcuts intact, app starts. **Owner-only:** none known beyond real settings from an older install.
- [ ] **9.4 In-app update.** Needs: Packaged app. From one published release candidate, take the update to the next. Then launch the app from REAPER. See: the app restarts on the new version and confirms it. Source: [in-app update](../architecture/in-app-update.md), whose last bullet lists the first release-to-release update and a launch from REAPER after an update as not proven by any test. The two-build rehearsal (`go test -tags rehearsal`) is the nearest scripted check.
  - **Partly automated: [Windows release checks](../../.github/workflows/windows-release-checks.yml), last result [failed, run 39145815021](https://github.com/countrymanprime/narration-utils/actions/runs/39145815021).** The rehearsal swapped a real 0.3.251 for 0.3.252 while 0.3.251 was running, but the new build did not confirm within 90 s (`.old` and the launch record stayed, `attempts` 0, the new process was running). Not yet known whether that is the runner (no interactive desktop for the window) or the update; the manual run of 2026-09-21 passed on a desktop. **Owner-only:** the first release-to-release update through the app, and a launch from REAPER after an update.
- [ ] **9.5 MIDI and HID device access.** Needs: Packaged app, Audio. With a MIDI controller and a HID device attached, note whether WebView2 shows the MIDI permission prompt and whether the HID `requestDevice()` chooser renders. A denied or unanswered prompt must leave the keyboard working. Source: [#1470](https://github.com/countrymanprime/narration-utils/issues/1470) (MIDI), [#1471](https://github.com/countrymanprime/narration-utils/issues/1471) (HID) and [the spike's pending items](../research/web-midi-hid-webview-spike.md#pending-with-the-owner).
  - **Owner-only (needs a MIDI controller, a HID device and WebView2 on a real desktop).** Do not script. The owner: attach both devices, open the app, trigger Web MIDI access and `requestDevice()`, note whether each prompt or chooser shows, then deny or ignore each and confirm the keyboard still works. Report the answers on #992.
- [ ] **9.6 Microphone capture and latency.** Needs: Audio. Run the WASAPI probe for 30 minutes with the microphone you narrate with, then listen to `device-0.wav`. See: the pass rules in the note (no overflows or dropped blocks, frames within 0.1 % of wall time, `lagMs.max` under 4,000); note `latencyMs` and `sampleRate`. Source: [native recording capture spike](../research/native-recording-capture-engine-spike.md#the-owners-check-pending-on-992-d65). The live-transcription listening run in [#1495](https://github.com/countrymanprime/narration-utils/issues/1495) (Booth live listening, #1476) is the other real-microphone check.
  - **Owner-only (needs the microphone you narrate with).** Do not script. The owner: run the WASAPI probe for 30 minutes, listen to `device-0.wav`, and report overflows or dropped blocks, frames against wall time, `lagMs.max`, `latencyMs` and `sampleRate`; the Booth live listening run in #1495 is the other real-microphone check.
- [ ] **9.7 REAPER play-state timing.** Needs: REAPER. Press Record, Pause, Stop and Play in REAPER's own transport and by keyboard, and watch the heartbeat in `events.log`; read `GetPlayPosition()` mid-recording. See: each press flips the heartbeat within a defer cycle (tens of milliseconds, not the 1.5 s interval), Pause during Record yields play state 6 or REAPER ignores it (note which), and the position moves while recording. Source: [REAPER transport timing](../research/reaper-transport-timing.md#pending-with-the-owner), which could not run REAPER.
  - **Partly automated: [Windows REAPER transport timing](../../.github/workflows/windows-reaper-transport.yml), last result [ran, no transport movement, run 39145817512](https://github.com/countrymanprime/narration-utils/actions/runs/39145817512).** REAPER 7.80 installed and ran in an isolated `-cfgfile` with the real bridge heartbeat live, but the runner has no audio device (REAPER reports "Error opening devices"), so Play, Record and Pause through the actions never left play state 0 and the position stayed 0. No timing or Pause-during-Record result exists. **Owner-only:** all of 9.7, on a machine with an audio device.

Pull requests with nothing to run on Windows: [#1742](https://github.com/countrymanprime/narration-utils/pull/1742) (guide images and the guide-impact check; its only owner step is making `Docs / Guide impact` a required check in the repository ruleset), [#1794](https://github.com/countrymanprime/narration-utils/pull/1794) (architecture documents), and [#1792](https://github.com/countrymanprime/narration-utils/pull/1792) apart from 8.5.
