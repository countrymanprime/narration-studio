# Owner checklist for the first stable release

Everything between the current release candidates and the first stable release that only the owner can do: a repository setting, a real Windows machine, a narrator's own book, or the Promote click. It replaces the checklist that lived in [#231](https://github.com/countrymanprime/narration-studio/issues/231) (the release-readiness stack, S16). Each item names where its steps are written, so this page holds the order and the status, not a second copy of the steps. Status was read on 2026-11-03.

`<asset prefix>` and `<executable>` stand for values in `config/brand.json`.

## Already done

| Item | State |
| --- | --- |
| GitHub Pages | Publishes from `main`; the owner lifted the hold (D75) on 2026-10-21 ([CI and releases](ci-and-releases.md)) |
| Setup program, notices, attestation | Built and attested by every `Prerelease` run (the newest candidates are `v0.3.48x-rc`). No stable release exists yet: `releases/latest` answers 404 |
| Dependabot scanning the composite actions | Configured ([#233](https://github.com/countrymanprime/narration-studio/issues/233)) |
| Third-party notices inside the setup program | Built in ([#250](https://github.com/countrymanprime/narration-studio/issues/250)); the install is checked in section 3 |

## 1. Repository settings

- [ ] **Require the `CI passed` check before merge.** Decide the documentation-only case first; the exact rule is in the "Turning on required checks" section of [Tracking work on GitHub](github-workflow.md) ([#544](https://github.com/countrymanprime/narration-studio/issues/544)).
- [ ] **Require actions to be pinned to a full-length commit SHA** (Settings > Actions > General). Every action is already pinned; the setting is a backstop ([item 1 of the supply-chain checklist](github-workflow.md#owner-checklist-for-the-release-supply-chain-work)).
- [ ] **Restrict the `production` environment to `main` and `v*` tags** (optional; it has no restriction today).
- [ ] **Leave off:** immutable releases ([#186](https://github.com/countrymanprime/narration-studio/issues/186)).

## 2. A release candidate

- [ ] Take the newest candidate and run `gh attestation verify <asset prefix>-<version>-windows-x64-setup.exe --repo countrymanprime/narration-studio`; compare the `.sha256` ([CI and releases](ci-and-releases.md#the-windows-setup-program)).

## 3. A clean Windows machine

One sitting. These are checks 9.2 to 9.4 of the [Windows QA checklist](windows-qa-checklist.md); report results on [#992](https://github.com/countrymanprime/narration-studio/issues/992).

- [ ] **Install** the setup program (9.2): the unsigned SmartScreen prompt, the Start Menu entries, the optional desktop shortcut, `THIRD-PARTY-NOTICES.txt` beside the program, launch with nothing downloaded.
- [ ] **Upgrade** over an older install (9.3) and **update in the app** (9.4): Settings > About & updates says the app can install updates.
- [ ] **Uninstall**: the program and the notices file go; settings (`%APPDATA%`), downloaded assets (`%LOCALAPPDATA%`) and project folders stay.
- [ ] **Smoke run:** `<executable>.exe --smoke` on that machine.

## 4. First use on the real app

- [ ] Piper preview: prompt, 114 MB download, progress, verify, playback; cancel mid-download; drop the network mid-download and press Download again (it resumes from the kept `.part`).
- [ ] Transcript Compare and the Teleprompter: the Whisper model prompt and download.
- [ ] Story Bible on a clean cache: the three-way question, the spaCy download, a build with the model, a second build that does not ask. Judge the model output against rules-only on your own book.
- [ ] Settings > Local assets: Verify, Remove, and Repair on a model you damaged by hand.
- [ ] A disk too full: the refusal names both sizes.
- [ ] A screen-reader pass (NVDA in WebView2) over the download dialogs, the three-button question and Local assets.

## 5. Promote

- [ ] Run **Promote pre-release** on a candidate that passed sections 2 to 4 ([CI and releases](ci-and-releases.md#version-lifecycle)). Check the stable tag, the three assets, the checksums and the attestations ([#188](https://github.com/countrymanprime/narration-studio/issues/188)).
- [ ] Windows code signing stays out of the first stable by decision (D7).
