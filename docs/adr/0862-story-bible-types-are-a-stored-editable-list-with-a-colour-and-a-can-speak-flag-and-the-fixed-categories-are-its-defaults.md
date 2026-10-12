# 0862. Story Bible types are a stored, editable list with a colour and a Can speak flag, and the fixed categories are its defaults

**Status:** Proposed
**Significance:** A persistence strategy and an interface between parts: the Story Bible file gains a `types` list that the sidecar, the host and the UI all read, and which entries speak stops being a constant in three languages. Reversing it means migrating every file a narrator edited back to fixed categories.
**Date:** 2026-10-12
**Supersedes:** none

## Context

An entry's category was one of fixed names (`VALID_CATEGORIES` in `manuscript_guide.py`), drawn in a fixed hue per name (`CAT_DOT_BG` in the UI), and only `Character` spoke (`SPEAKING_CATEGORIES`, and `'Character'` literals in the UI). The Studio Next mock's Settings page (`BibleTypes`, `TypeRow`) lets the narrator rename, recolour, add and remove types and set Can speak per type, and the speakers and dialogue follow that flag. The parity audit (`docs/research/studio-next-parity-script-and-bible.md`, gaps G3 and G19) and issue #1529 ask for the data half of that.

**Considered options:** keep the list in the UI's project settings (lost: the sidecar decides which entries take a speaker colour and which names dialogue resolves to, so it must read the list itself); keep it in the host and pass it to every sidecar call (lost: one more argument on every edit, and a file read by the sidecar without the list would decide differently); a free hex colour per type (lost: the six kind hues already have contrast-checked text companions in both themes, ADR 0059, and a free colour would need its own check); store the list on first read (lost: reading would write, and an old file would change without an edit).

## Decision

1. **The list lives in the Story Bible file** as `types`: an ordered, non-empty list of `{name, colour, speaks}`. The sidecar (`guide_types` in `sidecars/manuscript-guide/core/manuscript_guide.py`) and the host (`guide.Service.Types`, `apps/desktop/internal/guide/types.go`) read it; a malformed list is refused, never guessed at.
2. **A file without `types` reads as the defaults**, the old categories in their old hues with only Character speaking: `Character` green, `Place` blue, `Organization` violet, `Lore` amber, `Item` teal, `Event` rose. Nothing is migrated and `schema_version` stays 2; the first type edit writes the whole list. The host's `DefaultTypes` is pinned to the sidecar's by a contract file.
3. **A colour is one of six names** (`green`, `blue`, `violet`, `amber`, `teal`, `rose`), each one of the kind hues of `styles.css` (`--character`, `--place`, `--org`, `--lore`, `--item`, `--event`); `apps/ui/src/storyBibleTypes.ts` maps them.
4. **Can speak decides who speaks**: only an entry whose type speaks takes a speaker colour (`speaker-color`), and the dialogue cues of a build resolve only to the names of such entries. A colour already stored on an entry whose type stops speaking is kept and unused.
5. **The edits are sidecar commands** (`type-add`, `type-rename`, `type-colour`, `type-speaks`, `type-remove`) behind the `GuideTypeAdd`, `GuideTypeRename`, `GuideTypeSetColour`, `GuideTypeSetSpeaks` and `GuideTypeRemove` bindings; `GuideTypes` reads the list. A name is one line of 1 to 40 characters, unique whatever its case, and never `Needs Review` or `Draft`, which stay the Story Bible's own states. A rename moves every entry of the type, a locked one too: the lock keeps the entry as written, and its type is the same type under a new name. A type an entry uses, and the last type, cannot be removed. A type command on a project with no Story Bible yet starts an empty one, as `create` does.
6. **A rebuild keeps the narrator's types.** Each default row keeps a `builtin` naming the category extraction produces for it, so a rebuild files a new Character under the name Character was renamed to; a freshly extracted entry whose type was removed becomes Needs Review.
7. **The UI asks one module** (`apps/ui/src/storyBibleTypes.ts`: `typeOf`, `canSpeak`, `typeColour`) which type an entry is, whether it speaks and its colour. A category no type has is faint and silent; Needs Review and Draft are drawn in the review hue.

## Consequences

- Settings (SN-M53), the list tint (SN-B94) and speaking (SN-B97) can follow the narrator's types without another wire change; nothing changes on screen until they do.
- An entry's category is now a name from the narrator's list, so code that compares a category to `'Character'` is wrong once a type is renamed; the consumers move to `storyBibleTypes.ts` in SN-B97. Extraction itself still produces the built-in names, mapped through `builtin` on a build.
- The palette is closed: a seventh colour needs a new kind hue with its contrast pair, and a new value in the sidecar, the host and the schema.
- Overriding this needs a new ADR that supersedes this one.
