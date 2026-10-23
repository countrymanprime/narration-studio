# Story Bible entry list: draft mock

**Status:** draft, 2026-10-23, pending the owner's review. Not approved, so nothing builds to it yet. It belongs to [Story Bible entry list](../../story-bible-entry-list.md), which reviews PR #2242 and proposes this redesign of the Story Bible's left pane. Refs #2251.

The Studio Next mock stays the spec and is not edited ([Which mocks are the spec](../../../design/design-system.md#which-mocks-are-the-spec)). The owner's request recorded as SNB-D1 in #2242 already supersedes its left pane with a Name and Kind table. This draft starts from that table.

`index.html` is one static file: no build, no network, system fonts. Open it in a browser, or open the published copy (private to the owner): `claude.ai/artifact/QrJn3U34RaTizV6ti1ccsf`. It takes the Studio Next mock's tokens from `docs/research/mockups/studio-next/src/styles/app.css`, follows the system theme, and has a System, Light and Dark switch (`?theme=dark` also works). The sample data is invented: 527 entries, the count the rules-only scan found in an 88,000-word book ([story-bible-mutation-path.md](../../story-bible-mutation-path.md)).

Each part carries a tag: **New** (not in #2242), **Changed** (#2242 does it differently) or **Kept** (as #2242 builds it).

## Sections

| Section | What it shows |
| --- | --- |
| 1. The page, live | The left pane working on 527 entries: search, the Filter and Sort menus, Whole book / This chapter, the arrow keys, Enter, Space. The entry pane is a stub. |
| 2. States | Resting; search matching an alias; Filter menu; filters on; Sort menu; This chapter; choosing the chapter; keyboard focus; Needs verification; scan running; loading; empty book; no match; chapter with no entries; could not be read; narrow pane |
| 3. Ctrl+F | The page-scoped jump menu listing entries, and the keys |
| 4. Script rail | The same row in the Script page's Story Bible tab (#2259's `InThisChapter`) |
| 5. Against #2242 | Part-by-part comparison |

## Screenshots

`shots/` holds PNGs rendered from `index.html` by `shots.mjs`, which uses the Playwright in `apps/ui` and the container's Chromium:

```bash
node docs/research/mockups/story-bible-entry-list/shots.mjs
```

- `page-<width>-<theme>.png`: the whole page at 1440, 1024 and 390 px, light and dark.
- `state-<id>-<theme>.png`: nine state frames at 1440 px.
- `jump-<theme>.png` and `script-rail-<theme>.png`: sections 3 and 4.

## Lifecycle

Delete this folder in the pull request that builds the last part of the redesign, or when the owner rejects it.
