# 0006. The app is local-first and the narrator consents

**Status:** Accepted
**Significance:** A quality attribute that shapes every feature. Analysis, updates, downloads and DAW changes all follow it; weakening it changes the threat model and what narrators were promised.
**Date:** 2026-09-19

## Context

The manuscripts and recordings belong to authors and narrators and are often unpublished and under contract. The app also edits their DAW projects and downloads large models.

**Considered options:** cloud analysis (audio and manuscript leave the machine); automatic background updates and model downloads (surprise bandwidth, disk use and behaviour change); analyzers that fix things themselves (silent edits to audio and text).

## Decision

- **Analysis is local.** No audio or manuscript is sent to a cloud service. The one online lookup (a dictionary key the narrator supplies) is a Go-only port with its own rule. Logs never carry content.
- **Analyzers report findings; the narrator decides.** A finding carries evidence, a confidence and at most one suggested action, and cannot execute it. Every change to the audio, the manuscript or the DAW project is triggered by the narrator (or by a consent they gave once), names its target by id, and is one undo step.
- **Nothing installs, downloads or changes the project without a click or a one-time consent.** Models, voices and optional tools come from the hashed asset registry with a real-bytes job and a prompt. The app's own update is checked at most once a day (a metadata request, off by switch) and installs only after a click.
- A result from synthetic data is labelled provisional; a value that was not measured says so.

## Consequences

- Features that would be easier with a server (shared state, remote models, telemetry) are out of reach; a feature that needs one is a new ADR that supersedes this one and updates the threat model.
- Every automatic behaviour needs a consent step, which adds UI.
- Security-relevant surfaces (download, update, sidecar arguments, the DAW bridge, files from others) are rows in `docs/architecture/threat-model.md`.
