# Manuscript Guide

Builds a narrator reference from a project-owned canonical manuscript. It lists candidate characters, places, and
organizations; stores editable pronunciations, IPA, descriptions, evidence, and conservative
personality notes; and can create local, catalog-managed Piper WAV previews. The workflow is documented in
[Manuscript Guide](../../docs/utilities/manuscript-guide.md) and the
[Story Bible guide](../../docs/guides/using-the-app/story-bible.md).

It does not depend on Transcript Compare. The two tools share one project-level input only:

```text
<project folder>\narration-utils\manuscript\manuscript.json
```

This tool never reads or writes Transcript Compare's settings or generated files.

## Layout

- `core/` — the DAW-agnostic Python backend (`manuscript_guide.py`, `providers.py`). No DAW APIs are
  used here; it is a plain CLI that the desktop host (`apps/desktop/internal/guide`) runs. Its
  dependencies are declared in the repo-root `pyproject.toml` and pinned in `uv.lock`.
- `tests/` — the pytest suite for the backend.
- A future Audacity driver has placeholder notes under `integrations/audacity/manuscript-guide/`.

## Settings

Settings (spaCy, eSpeak, and the TTS provider/voice selection) are layered: a repo-wide default, a per-user
**Global** value in `%APPDATA%\narration-utils\global-settings.json`, and an optional **This Project** override
in `<project folder>\narration-utils\settings.json`, in that order. Both files are plain JSON, not REAPER ExtState.

## Project files

The guide keeps its outputs in `<project>\ManuscriptGuide\`:

- `manuscript_guide.json` — canonical, editable guide data. Locked fields survive a rebuild.
- `audio\tts\` — cached Piper WAV previews, invalidated when the spoken text or voice version changes
- transient progress/index/status files

The extractor is deliberately conservative. It uses local spaCy when available, plus
name/context rules when it is not, and marks uncertain entries as needing review. Personality
notes are limited to direct trait words with their manuscript excerpt; no cloud provider or
unsupported AI interpretation is used. A preview asks for explicit download approval when the
reviewed voice is missing. eSpeak NG is optional and enables an IPA fallback for unknown names.
