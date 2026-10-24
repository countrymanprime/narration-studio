# Replace audio: draft mock

**Status:** draft, 2026-10-24, pending the owner's review. Not approved, so nothing builds to it yet. It belongs to [Replace audio from another narrator's file](../../replace-audio.md). Refs #2251.

The Studio Next mock stays the spec for the Editing page and is not edited ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)). This draft adds a dialog and its entry points to the Editing page as built (`docs/images/ui/editing-*.webp`).

`index.html` is one static file: no build, no network, system fonts. Open it in a browser, or open the published copy (private to the owner): `claude.ai/artifact/PeugNwApEKpnogoAPKHt9F`, which loads IBM Plex and Barlow from Google Fonts. It takes the Studio Next mock's tokens from `docs/research/mockups/studio-next/src/styles/app.css`, follows the system theme, and has a System, Light and Dark switch (`?theme=dark` and `?step=find` also work on the local file).

The word times are real: Kara Shallenberg's and Eric Leach's LibriVox readings of Chapter 1, from `tests/fixtures/audio/librivox-alice/alignment/`. The waveforms are drawn from those times (bars where a word is said, a hairline in the pauses). The loudness, noise floor and track format figures are invented.

Each part carries a tag: **New** (this tool adds it) or **Kept** (Editing has it today).

## Sections

| Section | What it shows |
| --- | --- |
| 1. Click through | The Editing card with 13 words selected and **Replace audio…** on the toolbar, then the dialog's steps: their file (and whose audio it is), find the words (both waveforms and ranges), listen and match (hear the result, loudness, room tone, pace, timing, crossfade), confirm, done with Undo and the mark on the words |
| 2. When it cannot go ahead | Not audio; MP3 without the encoder; too big; file changed; found in several places; found in part; not found; across two takes; keep timing with a longer read; already edited; REAPER not connected; changed in REAPER; no SWS; Audacity 4; Undo after another edit |
| 3. Other ways in, and after | The word menu, the jump menu, the word mark, the drawer's Replacements tab, and the Takes strip option for later |
| 4. What each DAW does | REAPER, Audacity 3, Audacity 4 and the built-in recorder |

## Lifecycle

Delete this folder in the pull request that builds the last part of the tool, or when the owner rejects it.
