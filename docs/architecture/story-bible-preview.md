# Story Bible preview (hearing a name)

The play button beside a Story Bible name, or beside one of its aliases, speaks it with the local Piper preview voice. This page is how that path works and how it fails. The messages the narrator sees, and what to do about each, are in the [Story Bible guide](../guides/using-the-app/story-bible.md#hearing-a-name).

## The path

1. `GuideDetail.tsx` calls `usePreviewAudio`, which calls `api.guidePreview(entityId, aliasIndex)` (`Host.GuidePreview`, `apps/desktop/bindings.go`).
2. The host reads the selected voice (`Piper.tts_voice_id`), asks the asset registry's voice manager for its model and config paths, and returns **`asset_required`** (the voice, its state, download size, disk needed and where it will be stored) when the voice is not installed or does not verify. The UI shows the first-use question and, after a download, plays the preview that was asked for ([ADR 0077](../adr/0077-every-asset-install-is-one-job-with-real-bytes-a-second-start-joins-it-and-one-hook-follows-it.md), [first-use provisioning](first-use-dependency-provisioning.md)).
3. `guide.Service.Preview` resolves the spoken text, builds the cache file name and returns a cached WAV when there is a real one. Otherwise it runs the sidecar's `render-audio` command with a two-minute deadline (`previewTimeout`) and returns the WAV as base64 (ADR 0012's route for short clips).
4. The sidecar (`render_audio` in `sidecars/manuscript-guide/core/manuscript_guide.py`) synthesizes with the Piper API, never a checkout executable, and writes the WAV.

## What keeps a failure from hurting the next try

- **The cache never trusts an empty file.** A file no larger than a WAV header counts as a miss and is replaced, and a failed run removes its output. The sidecar renders to `<name>.<pid>.part` and renames on success, so a partial file cannot exist under the final name.
- **The cache key holds the voice.** The hash input is the tag `previewCacheTag` (`narration-utils-tts-preview-v3`), the voice id, provider and version, the chosen pronunciation and the text. Changing the voice changes the path, and the tag is bumped whenever the key's inputs change so files rendered under an older key are never trusted.
- **The real error is reported.** The wave writer is closed by hand, so its own "# channels not specified" cannot replace the synthesis error, and a name that phonemizes to no audio says so: `"<name>" could not be spoken: <reason>`.
- **UTF-8 pipes.** The sidecar writes UTF-8 to stdout and stderr (`use_utf8_stdio`), the encoding the host reads, so a project folder outside the Windows code page does not fail the first run.
- **The two-minute deadline** stops a hung process (a cold start of the frozen sidecar is the slow case) with `the preview took longer than 2m0s and was stopped`. The other sidecar commands are long-running by design and are not bounded.
- **The voice is not hashed on every click.** State comes from the manifest and the voice is read in full once per session ([ADR 0078](../adr/0078-asset-state-comes-from-the-manifest-an-asset-is-read-in-full-once-per-session-and-a-failed-download-resumes.md)), not hashed from the whole 114 MB model per preview.
- **The frozen sidecar carries what Piper needs.** `scripts/release/prepare-resources.py` collects Piper's `espeak-ng-data` and the `cmudict` data for the guide sidecar, and the packaged `--smoke` run proves the frozen guide can load them (a real spoken word is a local check with the seed command and `--piper-model`; CI does not download the voice, see [CI and releases](../operations/ci-and-releases.md)).

## Messages

Each failure is one toast message: the cause in a sentence with the raw reason inside it, since the toast has no details area. The UI drops an `Error:` prefix and capitalizes the first letter. The messages and what the narrator does about each are in the [Story Bible guide](../guides/using-the-app/story-bible.md#hearing-a-name).

## Tests

Python: `sidecars/manuscript-guide/tests/test_manuscript_guide.py` (a synthesis error is reported and not masked, an unspeakable name says so, a failed render leaves no file, UTF-8 to a legacy code page pipe). Go: `apps/desktop/internal/guide/preview_test.go` (a zero-byte cache file is replaced, an empty result is rejected and not kept, the cache is keyed on the voice, the deadline) and `apps/desktop/guidepreview_test.go` (each failure class and `asset_required` through the binding). UI: `GuideDetail.test.tsx` and `usePreviewAudio.test.tsx` (the failure message, Play usable again, the install flow). The mock has `?mockPreviewError=<text>` to see a failure without a host.
