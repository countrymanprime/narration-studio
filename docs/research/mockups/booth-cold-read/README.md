# Booth cold read: mock

**Status:** draft, pending the owner's approval. Added 2026-10-24 for [#2251](https://github.com/countrymanprime/narration-studio/issues/2251) item 13, following the owner's answers on that issue and [the design note](../../2026-10-23-booth-page-breaks-and-cold-read.md#13-cold-read). The Studio Next mock does not cover a cold read ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)); this draft covers only what it adds to the Booth.

One static file, `index.html`: no build, no network, system fonts. It takes the Studio Next mock's tokens and follows the system theme (`data-theme="dark"` on the root forces dark). The sample text is invented.

## Frames

| Frame | What it shows |
| --- | --- |
| Off | The default: **Cold read** in the footer beside Levels, not pressed |
| On | The ghost (dashed outline, muted wash, hollow caret) where the voice is, the real cursor where the next take starts, the dashed REC-tone **Mic on · cold read** badge |
| Record pressed | The ghost gone, the view back on the real cursor, **REC**, and **Cold read** unavailable during the take |

## Lifecycle

This folder is deleted in the pull request that follows the owner's approval or changes, as the Studio Next mock's rule says ([Which mocks are the spec](../../../prds/studio-next-rebuild.prd.md#which-mocks-are-the-spec)).
