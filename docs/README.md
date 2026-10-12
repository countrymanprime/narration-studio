# Narration Utilities Documentation

This folder documents a local-first audiobook narration toolkit: how it is built (architecture, design and decision records), how it is used (guides and workflows), and what is planned next. Planned work is specified as PRDs under [prds/](prds/README.md). The roadmap and the PRDs describe intent, not a claim that the planned utilities already exist. A curated part of this folder (the user guide, the roadmap, the component atlas, the tool pages, selected architecture and every ADR) is published as a website, generated from these files on every build ([how](operations/ci-and-releases.md#the-public-docs-site)); to publish another page, list it in `tools/docs-site/include.txt`.

## Status legend

- **Implemented**: usable code exists in the code folders (`apps/`, `sidecars/`, `libs/`, `integrations/`).
- **Planned—foundation**: required before dependent utilities can start.
- **Planned**: intentionally specified future work.
- **Deferred**: valuable work held outside the current milestone sequence.

## Current inventory

| Utility | Status | What it does now |
| --- | --- | --- |
| [Manuscript Guide](utilities/manuscript-guide.md) | Implemented | Extracts editable characters, places, organizations, pronunciations, evidence, and narration notes from a Word manuscript. |
| [Transcript Compare](utilities/transcript-compare.md) | Implemented | Locally transcribes a REAPER chapter track, compares it to the manuscript, and adds take markers for discrepancies. |
| [Recording Check](utilities/recording-coverage.md) | Implemented | Checks a chapter's saved REAPER track against its text, in order, and lists what is missing; feeds the measured recorded length and the `recording` stage signal. |
| [Proof](guides/using-the-app/proof.md) | Implemented | One queue of the findings from Transcript Compare, the Story Bible and take review: filter, sort, see the evidence, accept, dismiss or defer with a note, and go to, loop or mark a finding in REAPER ([findings contract](architecture/findings-contract.md)); and, per chapter, listening to the recording against its script and comparing it to the manuscript. |
| [Take review](utilities/take-review.md) | Implemented; checks on a real chapter and in REAPER pending with the owner | Finds pickups, restarts and duplicate reads on a chapter track (plus a pickup track or stretch of the timeline), lists each group's reads on Proof to go to, loop and audition, adds a chosen read as a take in one undo step, and compares a group's takes side by side per category, never ranked. |
| [Master & QC](guides/using-the-app/master-and-qc.md) | Implemented (first cut) | Checks rendered chapter WAV files as a job with real progress and Cancel (integrated loudness, RMS, sample and true peak, noise floor, length, digital silence), shows a value it could not measure as "Not measurable", and marks values outside the narrator's own limits; no distributor's numbers are built in. |
| [Tracks](utilities/tracks.md) | Implemented | Reads a project's REAPER `.rpp` file to list its tracks, their chapter links and the REAPER tools in the audio engine panel, with no running REAPER needed; a chapter's audio plays in its Proof chapter view. |
| [Booth](guides/using-the-app/booth.md) | Implemented (first cut) | Follows a chapter read aloud: pick a microphone from a list and a local engine (Whisper or Moonshine on Windows), and the current word highlights as it is heard; suspected misreads, skips, extra words and restarts are kept as reviewable findings. Open work: the real-time A/B evaluation that sets the default engine, following live REAPER state, and punch-in from a word. [The design record](architecture/manuscript-teleprompter.md) has the shipped event contract and tracker behavior. |
| [REAPER shared helpers](architecture/daw-integration.md) | Implemented | Provides ExtState, path, and hidden-process helpers for ReaScripts. |
| [DAW reference](reference/daw/README.md) | Implemented | What REAPER and Audacity can each do for the app: a capability catalog with the result each returns, a matrix generated from the adapters' declarations, and a page per engine and version. |
| [The REAPER bridge and its test harness](architecture/reaper-bridge.md) | Implemented | The file protocol between the app and REAPER's Lua bridge, every command and event, and the Lua 5.4 harness (a fake `reaper` table plus mutation checks) that tests it without REAPER. |
| [Going to and looping a finding in REAPER](architecture/reaper-navigation.md) | Implemented; checks in REAPER pending with the owner | Navigating to a finding by item GUID with the stale rule, looping its context and restoring the narrator's time selection and repeat on Stop, adding one approved take marker for an accepted finding, the verification record and the owner's checklist. |
| [First-use dependency provisioning and Local assets](architecture/first-use-dependency-provisioning.md) | Implemented | Voices (Piper), transcription models (Whisper) and the Story Bible language model (spaCy) are catalog-managed downloads that start only after the narrator confirms; Settings > Local assets lists, verifies, repairs and removes them. Nothing downloads at startup and no model is bundled. |
| [Windows release, setup program and in-app update](operations/ci-and-releases.md#the-windows-setup-program) | Implemented (Windows, the only supported platform: [ADR 0412](adr/0412-windows-is-the-only-supported-platform-for-now.md)) | A per-user NSIS setup program and an update zip on each GitHub release, both unsigned, with build provenance; the app checks for a newer release once a day at most (two hours after a failed check) and replaces itself only after a confirmed click ([in-app update](architecture/in-app-update.md)). |
| [Threat model](architecture/threat-model.md) | Implemented (a reviewed table) | Every trust boundary of the app (downloads, the update, the webview, sidecars, the REAPER bridge, opened files, the release pipeline) with its STRIDE threats, the mitigation in code and the risk that is left, lined up with [SECURITY.md](../SECURITY.md). |
| Audacity adapter | Implemented; verification in Audacity pending with the owner | Drives Audacity 3.x over its scripting pipe from the desktop host (`apps/desktop/internal/dawport/audacity`); built from the published spec and tested against a fake pipe server. The owner's check is [the Audacity verification pass](operations/audacity-verification-pass.md). `integrations/audacity/` holds placeholder notes only. |

## Reading order

1. Start with the [roadmap](roadmap.md).
1. For a screenshot walkthrough of the app itself, see [Using the app](guides/using-the-app/README.md).
1. Before changing anything in `apps/ui/src/components/primitives/`, `apps/ui/src/styles.css`, or a behavior an ADR names, read the [ADR index](adr/README.md) and the [design system reference](design/design-system.md) — see the `design-spec-guard` skill.
1. Read the [findings contract](architecture/findings-contract.md) before adding any analyzer or dashboard action, and the [stage recommendations signal contract](architecture/stage-recommendations.md) before building a signal that suggests a chapter's next stage.
1. Use the workflow documents to understand how utilities combine: [manuscript/editorial](workflows/manuscript-and-editorial-review.md), [recording/comping](workflows/recording-and-comping.md), [character continuity](workflows/character-continuity.md), [technical QC/handoff](workflows/technical-qc-and-handoff.md), and [chapter stage progression](workflows/chapter-stage-progression.md).
1. Before adding or changing anything that talks to a DAW, find the capability in the [DAW reference](reference/daw/README.md) and see which engines declare it, what it returns and where it was checked; the `daw-capabilities` skill loads it.
1. Planned utilities and known defects are specified as PRDs in [prds/](prds/README.md), which indexes them; [utilities/](utilities/) keeps the docs for implemented tools ([Manuscript Guide](utilities/manuscript-guide.md), [Transcript Compare](utilities/transcript-compare.md), [Recording Check](utilities/recording-coverage.md), [Tracks](utilities/tracks.md), [Take review](utilities/take-review.md)).
1. Before adding a local model, executable, or model pack, follow the licence classes and evaluation protocol in [model provenance](architecture/model-provenance.md#adding-a-model-tool-or-data-pack), and record the artifact in [model provenance](architecture/model-provenance.md) (a generated table: a catalog entry without a review row fails `pnpm check`).
1. Before adding a downloadable model, voice or tool pack, or changing how one is installed, verified or removed, use the
   [first-use dependency provisioning](architecture/first-use-dependency-provisioning.md) rules and their implementation notes.
1. For developer checks, GitHub Actions, release promotion, and the required
   one-time repository settings, use [CI and releases](operations/ci-and-releases.md);
   for coverage, property tests, fuzzing, dead-code and import checks, use
   [Verification and code-health tooling](operations/verification-tooling.md);
   for the checks that keep documentation current and free of filler, use
   [Documentation gates](operations/documentation-gates.md).
1. For issues, labels, milestones, and the project board, use
   [Tracking work on GitHub](operations/github-workflow.md).
   Before switching on a REAPER bridge command that ships behind the Experimental REAPER actions switch, run
   [the REAPER verification pass](operations/reaper-verification-pass.md); the calls each command makes are in
   [the ReaScript calls behind the planned commands](research/reaper-api-for-planned-commands.md).
1. Before changing what crosses a trust boundary (a download, the update, a sidecar's arguments, the REAPER bridge, a
   file from outside the app), read the [threat model](architecture/threat-model.md) and update its row in the same pull
   request. A file the app writes and reads back for the same user is a data file: its row is in
   [data files](reference/data-files.md).

## Which document

| If you are recording ... | Put it in | Not in |
| --- | --- | --- |
| A choice that changes the structure, a dependency, an interface between parts, a platform, a persistence strategy or a quality attribute, and is costly to reverse | an ADR ([adr/](adr/README.md)) | |
| A CI gate, test strategy or release-pipeline choice every contributor must follow | an ADR, plus the how-to in [operations/](operations/) | |
| What a page, dialog or control does, its copy, its shortcut | while it is being built: the PRD; once built: the [user guide](guides/using-the-app/README.md) page, and a test | an ADR |
| A token value, size, colour or component look | [the design system](design/design-system.md) | an ADR |
| A threshold, default, field, error code or one function's rule | a doc comment and a test beside the code; a reference page if another component or a user depends on it | an ADR |
| A file the app writes and reads back: path, contents, version, limits, when it is cleared | [data files](reference/data-files.md) | the threat model, `SECURITY.md`, an ADR |
| A file the app writes that names a path the host opens, a command it runs or a URL it fetches | [data files](reference/data-files.md), plus a [threat model](architecture/threat-model.md) row | |
| A new way untrusted data reaches the app (the network, a download, a file from someone else, a new parser, a new process or channel, device input) or a new outbound request | a [threat model](architecture/threat-model.md) row; a `SECURITY.md` scope line only if a reporter needs it | |
| What leaves the machine, and what is kept and for how long | [what the app sends off the machine](architecture/threat-model.md#what-the-app-sends-off-the-machine) in the threat model; the retention column in [data files](reference/data-files.md) | |
| How to report a vulnerability, supported versions, scope | [SECURITY.md](../SECURITY.md) | feature behaviour |
| A planned feature: problem, users, requirements, scope, open product questions | a PRD ([prds/](prds/README.md)), deleted once built | an ADR, an architecture doc |
| Who does which piece of work, and in what order | the tracking issue on GitHub ([github-workflow](operations/github-workflow.md)) | a PRD, a research note |
| A dated investigation, spike or trial: question, method, findings | [research/](research/) | a living spec, a runbook, an audit for one pull request |
| An audit or checklist for one pull request | a comment on the pull request or its issue | a file |
| How to run, release or verify something by hand | [operations/](operations/) | an architecture doc |
| How to add a binding, an engine or a command | a doc comment or README beside the code | an architecture doc |
| How the parts fit and why: structure, runtime flows, cross-cutting concepts | [architecture/](architecture/) | PRD sections, UI behaviour, how-tos |
| Instructions that only automated coding tools read | `CLAUDE.md` and `.claude/`, linking the docs here for facts | `docs/` |
| What changed in a release | the release notes, generated from the Conventional Commit titles (`scripts/release/generate-notes.mjs`) | a document's Status line |

[The docs placement audit](research/docs-placement-audit.md#1-industry-standards-by-document-type) has the practice behind each row.

## Terms

- **Finding**: a confidence-ranked observation backed by evidence; it is not an edit.
- **Suggested action**: a reversible, narrator-approved operation associated with a finding.
- **Reference region**: a REAPER region explicitly approved as representative of a character voice.
- **Candidate take**: an alternate read collected for comparison; it is never automatically made active.
- **Project sidecar**: local metadata stored beside a project, not embedded in source audio.

All planned utilities are Windows-first, REAPER-first, local-first, and US-English-first. Every result remains subject to narrator review.
