# Release readiness for a v1.0.0 baseline (2026-11-06)

Owner request on [#3085](https://github.com/countrymanprime/narration-studio/issues/3085): how close the app is to a first stable release that can be shipped and then improved, and what stands in the way. This is a read-only evaluation of `main` at `366addf`, written on 2026-11-06. It changes no code.

## How this was done

- **The app in the mock.** The real UI was walked page by page as a first-time narrator, with Playwright at 1440×900 and 1024×700, against the mock host and the fake DAW. The walk covered the project picker, a new project, import, Script, Story Bible, Production, Booth (REAPER and built-in), Editing, Proof, Pickups, Master & QC, Delivery, and Settings with and without a project. The screenshots stay in the evaluator's session; they are not committed.
- **The code.** It was read for what is real and what is stubbed: Experimental DAW capabilities, the unwired-binding guard ([#2607](https://github.com/countrymanprime/narration-studio/issues/2607)), PRD phase tables, and the write and crash paths.
- **The real-hardware record.** Every box was counted in [the Windows QA checklist](../operations/windows-qa-checklist.md), [the narrator hand check](../operations/narrator-hand-check.md), [the owner release checklist](../operations/owner-release-checklist.md) and [the REAPER verification pass](../operations/reaper-verification-pass.md).
- **CI and releases.** Read from the Actions API: Main health, Prerelease, Promote, and the Windows and real-REAPER evidence workflows.
- **The open issues.** All 73 open issues were read and classified (pull requests excluded).

**What this evaluation could not verify.** Anything on Windows, in a real REAPER, with a microphone, from a clean install, or after a real download. The mock passing is not proof that the app works for a narrator.

## Verdict

**No-go for 1.0.0 today.** The app is about **60 %** of the way to a baseline 1.0.0, and **2 to 3 weeks** away at this train's pace.

The code is broadly built: every step of the narrator's journey exists and works in the mock. Three things block a release:

- **Nothing has run on real hardware.** No step has run on the owner's Windows machine with REAPER and a microphone. All 118 Windows QA rows, all 20 hand-check rows and all 17 owner-release rows are unticked.
- **The release pipeline cannot produce 1.0.0.** The versioning has no path to 1.0.0, and **Promote pre-release** has never run once.
- **Saves can fail on Windows.** Several data-safety holes in the save path, and a Booth status pill that shows "connected" when it is not, need fixing first.

The critical path is the owner's time at a Windows machine, not worker effort.

## Go / no-go by area

| Area | Built | Mock walk | Real hardware | Go? |
| --- | --- | --- | --- | --- |
| Install, uninstall (setup program, SmartScreen, notices) | Yes | n/a | Hosted Windows runner only, 2026-10-18 (QA 9.2) | **No-go** until a human installs on a clean machine |
| In-app update | Yes | Only "Check now" and "latest" reachable | Hosted runner swapped 0.3.252 for 0.3.253 on 2026-10-18 (QA 9.4); about 300 releases ago | **No-go** until re-proven on current builds |
| Project picker, new project, import | Yes | Works; the mock ignores the chosen file | .docx, .epub and .pdf parsing on a real book: not checked here | Go, pending the owner's book |
| Script | Yes (PRD phases still open) | Viewed only | n/a | Go |
| Story Bible (scan, entries, hear a name) | Yes; GLiNER and BookNLP optional | Works; filter, sort and hear could not be driven | Downloads (spaCy, Piper) never run by a human (owner checklist §4) | Go, pending §4 |
| Production and Schedule | Yes | Works; dense numbers | n/a | Go |
| Booth: record in REAPER | Yes; `record`, `punch` and `transport_sync` are **Experimental** | Works | Linux REAPER with a silent sound card only; **never on Windows with a microphone** | **No-go** |
| Booth: built-in recorder | Yes, Windows only, Experimental; no punch, no undo | Works | Fake engine only (QA 1.1 to 1.8) | **No-go** if offered; could ship labelled preview |
| Booth voice tracks (character child tracks) | Phases 0 to 2a, 3a, 4a built; 3b, 4b, 5a in review | Seen only | None | Post-1.0 or preview |
| Editing (play, select, delete, undo, effects) | Yes; no redo; flag-card actions not built | Works | `play_range` and FX in REAPER harness-only (QA 10.7) | **No-go** until playback through REAPER is heard once |
| Proof | Yes | Works; stacked toasts cover the buttons | Hear it in REAPER: not run (QA 10.2) | Go after one real check |
| Pickups | Yes | Works | `reopen_pickup` and `list_pickup_markers` never ran in REAPER (pass C8, C9) | Go after one real check |
| Master & QC | Yes; DAW mastering rows Experimental | Works | Loudness measure on real files: not run | Go after one real check |
| Delivery (MP3, package) | Yes | Build stays disabled in the mock (0 of 14 chapters pass) | MP3 encode passed on a hosted Windows runner (QA 9.1) | Go after one real package |
| Settings | Yes | Works; "Change it here for now" reads as unfinished | n/a | Go |
| Audacity | 17 capabilities Experimental; no recording | "Record is not available with Audacity yet" | Linux only | Ship as "preview" or hide |
| Release pipeline | Prerelease: 1,663 runs, about 550 candidates | n/a | **Promote: 0 runs**; no 1.0.0 version path | **No-go** |
| CI health | Full gate on every PR | n/a | Main health red in 38 of 83 runs since 2026-10-07 | Fix before tagging |

## Blockers (must fix before 1.0.0)

Ordered by what to start first. S is under half a day, M about a day, L several days.

| # | Blocker | Evidence | Effort | Who |
| --- | --- | --- | --- | --- |
| B1 | **There is no way to produce a 1.0.0 candidate.** Prerelease computes the version from commit types (`nx release version`; 0.3.552 on 2026-11-06), and Promote keeps the candidate's number, so today's first stable would be `v0.3.5xx`. A `workflow_dispatch` input that sets the version (for example `nx release version 1.0.0`) is needed, or a documented one-off. | `.github/workflows/prerelease.yml` lines 45-59; `.github/workflows/promote-release.yml` lines 52-65 | S | Worker, plus the owner's yes on the number |
| B2 | **Fix the "connected" pill.** The Booth shows a green **REAPER** pill when REAPER is not connected. In the mock with no linked project, Record starts as if it were recording into REAPER. Confirm on the real host whether a take can be "recorded" into nowhere; fix the pill to follow the real connection state. It overlaps [#2823](https://github.com/countrymanprime/narration-studio/issues/2823) and PR #3083. | Mock walk: `?mockReaperState=unavailable` and `?mockNoDaw=1`; [#2251](https://github.com/countrymanprime/narration-studio/issues/2251) item 3 | M | Worker |
| B3 | **Saves can fail on Windows** ([#3084](https://github.com/countrymanprime/narration-studio/issues/3084)). `os.Rename` over `global-settings.json` failed with "Access is denied" while another handle held the file. Antivirus and OneDrive do the same on narrators' machines. About 80 host writers use the same temp-file-then-rename with no retry and no fsync, including `project.json` (`internal/project/manifest.go:163-169`). Add a shared atomic-write helper with a Windows sharing-violation retry and an fsync, and move the writers onto it. | #3084; code audit | M | Worker |
| B4 | **The owner's first real sitting: install and one chapter end to end.** On a clean Windows machine: install (QA 9.2), first launch, then import your own book. Then link REAPER (10.1), record a chapter with your microphone, punch once, undo once (REAPER pass C17b and C19), edit and play through REAPER (10.7), proof, one pickup, master, and deliver one MP3. This is the [narrator hand check](../operations/narrator-hand-check.md) plus owner checklist §3 and §4. Every failure goes on [#1495](https://github.com/countrymanprime/narration-studio/issues/1495) as its own issue. | 0 ticked of 118 + 20 + 17 rows | L (one or two sittings) | **Owner only** |
| B5 | **The fixes from B4.** Expect several. Every REAPER recording command is Experimental and has only run on Linux with a silent sound card. | REAPER pass Part B, "not run" | M to L | Worker, owner re-checks |
| B6 | **Re-prove upgrade and in-app update on current builds.** Run `windows-release-checks.yml` on two current candidates. Then, on the owner's machine, take one update in the app from an older candidate and launch from REAPER afterwards (QA 9.3, 9.4, 11.8). A broken updater in 1.0.0 means every narrator updates by hand. | The last runs were 2026-10-18, 0.3.252 to 0.3.253 | S (worker dispatch) + S (owner) | Worker, then owner |
| B7 | **The first Promote, as a rehearsal.** Promote has never run. Do the `1.0.0-rc`: verify its attestation (owner checklist §2), then Promote it, and check the tag, the three assets, the checksums and the attestations (QA 11.5, 11.6). Also confirm that an install on the `stable` channel sees `v1.0.0`. | `promote-release.yml`: 0 runs | S | **Owner only** (the production environment approval) |
| B8 | **A green full gate on the candidate commit.** Main health was red in 38 of 83 runs since 2026-10-07, mostly the `rename rehearsal --full` job: a Vitest timeout in `ContextMenu.test.tsx` under load, [#3075](https://github.com/countrymanprime/narration-studio/issues/3075) to [#3078](https://github.com/countrymanprime/narration-studio/issues/3078). Fix the four flakes so a red run means something. Then tag a commit whose Main health is green. | Main health run history | S each, about M in total | Worker; the owner decides the `--full` scope in #3078 |
| B9 | **Decide what Experimental means in 1.0.0.** 26 REAPER capabilities, every Audacity capability and the built-in recorder are Experimental, and the UI shows them as "Available" with a check mark (`CapabilitiesBody.tsx:15`). Either the B4 sitting promotes the ones it confirmed and the rest are labelled "preview", or 1.0.0 states that REAPER recording is the only supported recording path. | `docs/reference/daw/matrix.md`; code audit | S (decision), S (labels) | Owner decides, worker applies |

Recommended order: B1, B2, B3 and B8 in parallel by workers (about 2 days). Then cut a candidate, run B6's hosted checks and do the owner's B4 sitting. B5 fixes come next, followed by a second short owner sitting, then B9's labels, the `1.0.0-rc`, and B7.

## Should fix before 1.0.0 (not blocking)

| Issue or finding | Why | Effort | Who |
| --- | --- | --- | --- |
| [#2878](https://github.com/countrymanprime/narration-studio/issues/2878) Booth record bar breaks | A double click on Stop starts a new take | M | Worker (owner for item 3) |
| [#3053](https://github.com/countrymanprime/narration-studio/issues/3053) Picking a used track silently unlinks the other chapter | Recordings can go to the wrong chapter | S | Worker |
| [#60](https://github.com/countrymanprime/narration-studio/issues/60) Project switch during Story Bible edits or import | Leaves an orphaned job on the old project | M | Worker |
| No Wails `PanicHandler` (`src/studio/desktop/main.go:41-48`); `recover()` only in 7 of about 55 goroutines | A panic outside a job may close the app with no trace. Check Wails v3's default behaviour first. | S | Worker |
| [#2251](https://github.com/countrymanprime/narration-studio/issues/2251), the owner's 41 findings from 2026-10-23 | No box was ever ticked, though many items shipped. Reconcile so the open ones are known (items 9, 32, 38 to 40 matter most). | M | Worker, owner confirms |
| [#2938](https://github.com/countrymanprime/narration-studio/issues/2938) Pickups slow at 300+; [#2924](https://github.com/countrymanprime/narration-studio/issues/2924) Engine panel 27 s at 1,000 chapters | A full book is slow | M each | Worker |
| [#2808](https://github.com/countrymanprime/narration-studio/issues/2808) A "treat as the same" pair cannot be seen or removed | Hides real errors | M | Worker |
| Keyboard and focus: [#2947](https://github.com/countrymanprime/narration-studio/issues/2947), [#2948](https://github.com/countrymanprime/narration-studio/issues/2948), [#2949](https://github.com/countrymanprime/narration-studio/issues/2949), [#2956](https://github.com/countrymanprime/narration-studio/issues/2956), [#2998](https://github.com/countrymanprime/narration-studio/issues/2998), [#2905](https://github.com/countrymanprime/narration-studio/issues/2905), [#157](https://github.com/countrymanprime/narration-studio/issues/157), [#159](https://github.com/countrymanprime/narration-studio/issues/159), [#139](https://github.com/countrymanprime/narration-studio/issues/139), [#138](https://github.com/countrymanprime/narration-studio/issues/138), [#2888](https://github.com/countrymanprime/narration-studio/issues/2888) | Focus traps, toasts over modals, contrast | S each, about 2 days in total | Worker |
| Double clicks and picker menus: [#3034](https://github.com/countrymanprime/narration-studio/issues/3034)/[#3036](https://github.com/countrymanprime/narration-studio/issues/3036) and [#3035](https://github.com/countrymanprime/narration-studio/issues/3035)/[#3037](https://github.com/countrymanprime/narration-studio/issues/3037) (duplicates), [#2989](https://github.com/countrymanprime/narration-studio/issues/2989), [#2987](https://github.com/countrymanprime/narration-studio/issues/2987) | Misleading UI | S each | Worker; #2987 needs the owner's call |
| [#3056](https://github.com/countrymanprime/narration-studio/issues/3056) Generated bindings drift; [#2907](https://github.com/countrymanprime/narration-studio/issues/2907) the Wiktextract pin is unfilled, so Install refuses | Pin it or hide the feature | S each | Worker |
| Mock walk: the nav drawer stays open over the page at 1024×700, and its foot is cut off | Hides Proof's decision panel | S | Worker |
| Mock walk: wording | "Change it here for now" in Settings; "the app could not read where the words sit…" on the first Play in Editing; developer wording in the diagnostics dialog; Production's two "Recorded" figures; stacked Undo toasts over Proof's buttons; "1 could not be measured" naming no file | S each | Worker |
| Repository settings (owner checklist §1): require `CI passed` ([#544](https://github.com/countrymanprime/narration-studio/issues/544), closed but the setting is not on); require SHA-pinned actions | Merging with a red run is what keeps main red | S | **Owner only** |
| Docs | `SECURITY.md` says "pre-1.0". The owner checklist sends results to the closed #992. `reaper-verification-pass.md` "Switching a command on", QA 1.7 and booth-acceptance rows 44 and 47 still describe the removed Experimental switch. The README install section is the narrator's first page and needs a read-through for 1.0.0. | S | Worker |
| Screen reader and 400 % zoom (QA 11.9 to 11.11, owner checklist §4) | Never checked in WebView2 | S | **Owner only** |

## After 1.0.0

Features and research: Booth voice tracks 3b onward; character voice samples phases 5 and 6 ([#1963](https://github.com/countrymanprime/narration-studio/issues/1963)); Follow REAPER; the recording-check cascade settings; Editing redo and the flag-card actions; built-in punch and undo; Audacity recording; [#1476](https://github.com/countrymanprime/narration-studio/issues/1476); [#1477](https://github.com/countrymanprime/narration-studio/issues/1477); [#3023](https://github.com/countrymanprime/narration-studio/issues/3023); [#3060](https://github.com/countrymanprime/narration-studio/issues/3060).

The cross-page consolidation issues: [#2823](https://github.com/countrymanprime/narration-studio/issues/2823) (beyond the pill fix in B2), [#2824](https://github.com/countrymanprime/narration-studio/issues/2824) to [#2833](https://github.com/countrymanprime/narration-studio/issues/2833), and [#3086](https://github.com/countrymanprime/narration-studio/issues/3086).

Release hardening:

- [#199](https://github.com/countrymanprime/narration-studio/issues/199): verify the attestation inside the updater. TLS, SHA-256 and the version checks are already there.
- [#230](https://github.com/countrymanprime/narration-studio/issues/230): code signing, deferred by D7.
- [#186](https://github.com/countrymanprime/narration-studio/issues/186) and [#187](https://github.com/countrymanprime/narration-studio/issues/187).

Tooling and process: [#153](https://github.com/countrymanprime/narration-studio/issues/153), [#176](https://github.com/countrymanprime/narration-studio/issues/176), [#2607](https://github.com/countrymanprime/narration-studio/issues/2607) (its unwired list is now empty), [#2970](https://github.com/countrymanprime/narration-studio/issues/2970), [#2974](https://github.com/countrymanprime/narration-studio/issues/2974), [#2980](https://github.com/countrymanprime/narration-studio/issues/2980), [#2992](https://github.com/countrymanprime/narration-studio/issues/2992), [#2995](https://github.com/countrymanprime/narration-studio/issues/2995), [#3032](https://github.com/countrymanprime/narration-studio/issues/3032), [#3061](https://github.com/countrymanprime/narration-studio/issues/3061), [#3065](https://github.com/countrymanprime/narration-studio/issues/3065), [#3072](https://github.com/countrymanprime/narration-studio/issues/3072).

Edge sizes: [#150](https://github.com/countrymanprime/narration-studio/issues/150), [#2950](https://github.com/countrymanprime/narration-studio/issues/2950), [#2955](https://github.com/countrymanprime/narration-studio/issues/2955), [#2957](https://github.com/countrymanprime/narration-studio/issues/2957), [#2961](https://github.com/countrymanprime/narration-studio/issues/2961).

PRD status tables: many "in review" cells are stale, because the pages they cover ship on `main`. Sweep them before using them as a gate. Data safety beyond B3: app-level backups of project files, and schema versions on `project.json` and `settings.json`.

## How the percentage was computed

Each dimension gets a weight and a score between 0 and 1, from the evidence above.

| Dimension | Weight | Score | Basis |
| --- | --- | --- | --- |
| Journey features built | 35 % | 0.90 | All 12 steps exist; the gaps (redo, built-in punch, Audacity recording) can wait |
| Verified in the mock and by automated tests | 15 % | 0.85 | Walk completed 9 of 12 steps; filter/sort/hear, the proof pass and the package build could not be driven |
| Verified on real hardware | 30 % | 0.10 | Linux REAPER CI and hosted Windows install, update and encode only; 0 owner rows |
| Release mechanics | 10 % | 0.60 | Prerelease, attestation and the setup program proven; Promote never run; no 1.0.0 path |
| Reliability and data safety | 10 % | 0.60 | Corrupt-file quarantine and version refusal are good; no retry, no fsync, main red half the time |
| **Total** | | **0.59** | About 60 % |

The low real-hardware score dominates the total. One good owner sitting (B4) would take the real-hardware score to about 0.6 and the total to about 75 %.

**Calendar.** This train merges dozens of pull requests a day, so worker effort is not the constraint:

- B1, B2, B3 and B8 take about 2 to 3 days.
- B4 depends on the owner's free time: one or two sittings.
- B5 is typically 3 to 5 days of fixes and a re-check.
- B6, B7 and B9 are a day.

That is **2 to 3 weeks** if the owner can sit at the Windows machine in the first week, which puts 1.0.0 in **late November 2026**. Each week the first sitting slips adds a week.

## Top five risks of shipping 1.0.0 as it is

1. **Recording on a narrator's own Windows machine has never been tried.** Record, punch, roll and undo in REAPER have run only on Linux with a sound card that records silence. The worst case is a lost or misplaced take, which costs a narrator a re-read.
2. **Saves that silently fail or empty a file.** A rename refused by antivirus or OneDrive loses a settings or project save (#3084). Without fsync, a power cut right after a save can leave an empty `project.json`.
3. **A broken first update strands every 1.0.0 user.** Promote, the stable channel and an update from the shipped version have never been proven together. If the updater fails, every narrator must reinstall by hand.
4. **Regressions reach the candidate unseen.** `CI passed` is not required to merge, and Main health is red half the time for test-timing reasons, so a real failure looks like the usual noise.
5. **First run on a clean machine.** The setup program is unsigned (SmartScreen's "Run anyway"), and the 114 MB voice and model downloads, resume after a dropped network, and the disk-full refusal have never been tried by a person. A narrator who gives up at install never reaches the app.
