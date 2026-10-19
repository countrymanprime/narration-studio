# Colour and contrast

**Status: living document, describes the current state.** The decision is Colour and contrast (with its later updates); this file is what to do with it. The tokens themselves live in `apps/ui/src/styles.css` ([design-system.md](design-system.md) has the rest of the token list).

## The rule

Every colour pair the app draws meets WCAG 2.x AA in **both themes**, on **every surface it can sit on**:

- **text** is 4.5:1 or more (SC 1.4.3): everything a person reads, including placeholders, labels, counts and empty states;
- **marks** (what is seen and not read: icons, status dots, meter segments, the highlight underline) are 3:1 or more (SC 1.4.11).

Not covered: the contrast of the hairline `--border` (1.38:1 on `--surface`; `docs/design/colour-and-contrast.md` leaves it undecided; the stronger control border `--line-strong` is held to 3:1), disabled controls (WCAG exempts them), and a colour a user chooses in Settings.

## The tokens

| Token | Light | Dark | Contrast, worst to best surface (light) | (dark) |
| --- | --- | --- | --- | --- |
| `--text` | `#23201B` | `#EDE8DE` | 11.40 to 15.55 | 10.72 to 15.32 |
| `--text-muted` | `#5C564B` | `#B0A797` | 5.11 to 6.97 | 5.50 to 7.86 |
| `--non-text` | `#766F60` | `#968D7D` | 3.50 to 4.78 | 3.99 to 5.70 |
| `--accent-strong` | `#8F3F0F` | `#F0A06A` | 5.11 to 6.97 | 6.20 to 8.86 |
| `--danger-text` | `--danger` | `--danger` | 5.95 or more | 6.81 or more |
| `--warn-text` | `--warn` | `--warn` | 5.06 or more | 7.97 or more |
| `--info-text` | `--info` | `--info` | 6.03 or more | 7.82 or more |
| `--ok-text` | `--ok` | `--ok` | 5.45 or more | 7.36 or more |
| `--experimental-text` | `--experimental` darkened 15% toward `--text` | `--experimental` | 5.29 or more | 6.18 or more |

The surfaces are `--bg`, `--surface`, `--surface-2`, `--surface-3` and `--row-alt` (a reader row, a touch darker than `--surface`). The status companions are measured on the page surfaces (`--bg`, `--surface`, `--surface-2`) and on the soft fills they sit on (the four `--<tone>-soft` fills, `--accent-soft`, `--place-soft`, `--review-soft`); the other tokens on all five. There are two text levels, not three: `--text-faint` was deleted, because it carried real labels at 2.2 to 3.7:1. The step between prose and a label is carried by size, weight, case and typeface. `--non-text` is never the colour of text.

## Derived and status tokens

- **Meter zones (`LevelMeter`):** `--meter-floor`, `--meter-body`, `--meter-hot` and `--meter-over` are named for their role, not new hues. Each aliases a theme token (`--non-text`, `--ok`, `--warn`, `--danger`), declared once like `--row-alt`, so it needs no dark override. Each still has its own `PAIRS` row (a mark, 3:1 on `--surface`), so a change that breaks the alias fails on the meter, not only on the token it borrows from ([Base UI wrappers](design-system.md#base-ui-wrappers)).
- **The 14% badge tint:** `--badge-experimental-fill` (`StatusBadge`'s experimental tone, which has no soft token) is a 14% tint of the tone colour (`color-mix(in srgb, var(--<tone>) 14%, transparent)`), checked as a text pair (4.5:1) against that tone's `-text` colour on `--surface`. `--badge-danger-fill` went with the old Booth's control bar, its last user (SN-O10), as `apps/ui/src/styles.css` asks. 14%, not the entity badges' 18%: at 18%, `--danger-text` on a `--danger` tint measures 4.29:1 in the dark theme.
- **The `experimental` tone:** a fifth status meaning, beside `--ok`, `--warn`, `--info` and `--danger`, for a capability the host reports as experimental ([The DAW port](../architecture/daw-integration.md#the-daw-port)). `--experimental` (`#1f7a7a` light, `#4fbdbd` dark) is a teal, distinct from every kind and status hue (in particular `--org`'s purple and the blues of `--item` and `--info`). `--experimental-text` follows the recipe of the other status text colours: darkened toward `--text` in light, the raw colour in dark.
- **The booth follows the theme (`FocusShell`, `CompactShell`):** there is no booth palette. The theme is one global setting, and no page or surface forces light or dark. The booth-only size tokens are `--font-size-booth-script` and `--line-height-booth-script`, declared once in `:root`; its colour tokens, `--reading-bg` and `--rec-fill`/`--rec-text`, have a value in each theme block (see [Fills and surfaces](#fills-and-surfaces)). `paletteContrast.test.ts` runs every pair over `['light', 'dark']`, and `forcedThemeRules` (`src/tokenContrast.ts`) fails any rule outside the two theme blocks that sets `color-scheme` or redeclares a theme colour. A booth-only colour gets a value in both theme blocks and a `PAIRS` row, never a scoped block.

## Per-speaker colours

Each speaker in the Script reader's attribution chip and the Booth's "Voices in scene" tags has its own colour.

- **`--speaker-1` through `--speaker-7`** each alias one of the kind colours, in this order: `character`, `place`, `org`, `review`, `lore`, `item`, `event` (and their `-text` companions the same way), so each needs no dark override or contrast tuning of its own; a `speaker-N` row in `PAIRS` still protects the speaker use.
- **`apps/ui/src/components/primitives/speakerColor.ts`** hashes a speaker id (a canonical name, or an entity id where one is available) to one of the seven, deterministically. An optional second argument, the entry's `speaker_color` (1 to 7, set in the Story Bible entry's "Speaker colour" field), wins over the hash; a value outside 1 to 7 is ignored, and `SpeakerTag` passes it through as `colorOverride`. An eighth or later distinct speaker wraps back to `--speaker-1` (`--character`), the colour an unresolved speaker (no id) falls back to.
- **Two call sites, one derivation:** `primitives/SpeakerTag.tsx` (the Script reader's chip) reads `speakerColorToken` directly; `primitives/Highlight.tsx`'s `colorToken` prop overrides a mark's kind colour with it, so the Booth's "Voices in scene" tags stay a `Highlight kind="Character"` mark (data attribute, activation, keyboard support) with only their colour source changed.
- **Known limitation:** hashing by name, not a persistent id, means two speakers who share a display name draw identically, and with seven buckets a modest cast often collides. `docs/design/colour-and-contrast.md#per-speaker-colours` accepts this rather than adding hues that would need their own contrast tuning.

## Line, button and focus tokens

The Studio Next mock (`docs/research/mockups/studio-next/src/styles/app.css`) is the spec for token values ([Which mocks are the spec](design-system.md#which-mocks-are-the-spec)); `mockFidelityTokens.test.ts` reads the mock file and compares. `:focus-visible` is a 2 px `--focus` outline at a 2 px offset. Four values differ from the mock because the mock's fail the guard: `--line-strong` (the mock's measure 1.93:1 and 1.96:1 on `--surface`), light `--accent-soft` (warn text on the mock's value was 4.49:1, so it is `#F2DECA`), and the derived `--<kind>-text` mix (43%, not 45%, because the mock's lighter dark violet drove review and event text nested in an organization tint to 4.43:1). The mock sets status text in the status colour itself, and each passes 4.5:1 on its own soft fill, so `--danger-text`, `--warn-text`, `--info-text` and `--ok-text` alias the status colour.

| Token | Light | Dark | Pair and worst ratio (light / dark) |
| --- | --- | --- | --- |
| `--line-strong` | `#969083` | `#6d6659` | on `--surface`: 3.04 / 3.05 |
| `--btn-line` | `#2B2723` | `#7A7060` | on `--surface`: 14.20 / 3.56 |
| `--focus` | `#1F5FBF` | `#7FB0FF` | on the page, card and raised surfaces: 5.20 / 7.08 |

## Fills and surfaces

These are the colours the mocks draw that the base palette does not name ([styles.css](../../apps/ui/src/styles.css)): the `-soft` fills (drawn by `StatusBadge` and `Pill`), `--row-selected` (`Table`, `StageGrid`), `--reading-bg` and `--rec-fill`/`--rec-text` (the Booth), `--toast-bg`/`--toast-text` (`Toast`), `--waveform` (Proof's waveform card) and `--ok-zone` (Master's book-consistency band). A colour a new mock needs is a new token with its own `paletteContrast.test.ts` rows, never a value written into a component.

| Token | Light | Dark | Pair and worst ratio (light / dark) |
| --- | --- | --- | --- |
| `--ok-soft` | `#D9EAD9` | `#1E3324` | `--ok-text` on it: 5.08 / 6.29 |
| `--warn-soft` | `#F5E6BF` | `#3A2D10` | `--warn-text` on it: 4.78 / 6.78 |
| `--info-soft` | `#D8E5F2` | `#1B2F42` | `--info-text` on it: 5.52 / 6.78 |
| `--danger-soft` | `#F4D6D2` | `#40201D` | `--danger-text` on it: 5.11 / 6.27 |
| `--row-selected` | `--accent` 8% over `--surface` | the same recipe | a surface: `--text` 13.92 / 12.75, `--text-muted` 6.24 / 6.54, `--danger-text` 5.98 / 6.71 |
| `--reading-bg` | `--surface` | `#0e0d09` | a reading surface: `--text-muted` 6.97 / 8.17 |
| `--rec-fill` / `--rec-text` | `--review-soft` / `--danger-text` | `#5e1d16` / `#f9b8af` | 5.43 / 7.52 |
| `--toast-bg` / `--toast-text` | `--text` / `--bg` | the same | 13.86 / 15.32 |
| `--waveform` | `--accent` 76% over `--surface` | the same recipe | a mark on the card: 3.30 / 3.95 |
| `--ok-zone` | `--ok` 16% over `--surface-2` | the same recipe | the `--accent` tick on it, a mark: 3.05 / 4.40 |

- **The status soft fills are opaque,** so a pill draws the same colour on a card and in a selected row; each is measured over both. `StatusBadge` draws them for ok, warn, info and danger ([Design system reference](design-system.md)).
- **`--row-selected` and `--reading-bg` are surfaces.** `--row-selected` is in `SURFACES` and `PAGE_SURFACES`, and `--reading-bg` is in `READING_SURFACES`, so every pair drawn there is measured there.
- **Two values differ from the mock** so that a mark keeps 3:1. `--waveform` is 76%; the mock measures 65 to 77%. `--ok-zone` is 16%; the mock's 18% left the band's accent ticks at 2.98:1.

## Choosing a colour for something new

| It is | Use |
| --- | --- |
| Body text, values, titles | `--text` |
| A label, count, helper text, placeholder, empty state, timestamp | `--text-muted` (a placeholder gets it from `styles.css`) |
| An icon, dot, decorative glyph, an unset colour | `--non-text` (and list it in `NON_TEXT_USES` in `paletteContrast.test.ts` with what it draws) |
| The current item on an accent tint (tabs) | `--accent-strong` |
| The current navigation item (the bar highlight) | `--text` on `--surface-2`, with a 3 px `--accent` bar; its count stays `--text-muted` |
| Error, warning or info text, on the page or on a soft fill | `--danger-text`, `--warn-text`, `--info-text`; `--danger`, `--warn` and `--info` stay for borders, dots and fills |
| A requirement met (Master & QC's rule results) | `--ok-text`; `--ok` stays for borders, dots and fills |
| An entity's text on a tint of its own colour (highlights, badges) | `--<kind>-text` |
| Anything else | A token from `styles.css` with a pair declared in `paletteContrast.test.ts`; never a Tailwind palette colour (`text-red-400`) or a literal colour |

## Category colours

`--character`, `--place`, `--org`, `--review`, `--lore`, `--item`, `--event` and `--note` are the kind colours, each with a light value in `:root` and a dark value in `:root[data-theme='dark']`. The dark ones sit at about the same lightness (0.69 in OKLCH), so the eight read as one family. As a mark (the underline, the dots) each holds 4.09:1 or more in light and 5.03:1 or more in dark.

`Highlight` and the entity badges draw their text in `--<kind>-text`, which is 43% of the kind colour and 57% of `--text` (one definition for both themes; it follows an override of the kind colour). The tint (20% for a highlight, 18% for a badge) and the 1.5px underline stay the pure kind colour. A note keeps `--text` on its tint (`docs/design/design-system.md#primitive-components`). Highlights nest where annotations overlap, so the tints add up: the guard checks every kind over every other kind's tint (two stacked tints, 4.59:1 in dark at worst); a third stacked tint is not covered (issue #139).

In the shipped app only the note colour is a user setting (`color_note`, written inline on `<html>`, where it beats the theme blocks, so the dark `--note` is a fallback: issue #138). The entity colours are not settings, and the mock backend must offer no colour setting the host does not (`mockFixtures.test.ts`): it once did, and every dark screenshot then showed the light colours.

## What enforces it

- `apps/ui/src/paletteContrast.test.ts` reads both theme blocks of `styles.css` (`tokenContrast.ts` evaluates `var()`, `color-mix`, `transparent` and `rgba` and composites tints the way the browser paints them) and holds every declared pair to its floor over every surface it sits on. Its ratchet, `KNOWN_FAILURES`, is empty; an entry is a known failure and gets the review of an atlas debt entry. It also checks the order text over muted over non-text, that every colour a source file draws text with has a declared pair (so a new one cannot ship unmeasured), that no text uses a palette or literal colour, that `--non-text` is used only where an icon, dot or glyph is listed, that placeholders are `--text-muted`, and stacked highlights.
- `apps/ui/src/retiredTokens.test.ts` fails on any mention of `--text-faint` in the UI package.
- The component tests `Highlight.test.tsx` and `NavButton.test.tsx` tie the components to the recipes the guard measures (the guard reads tokens, not component source).
- The component atlas (`pnpm --dir apps/ui atlas`) runs axe on every story in both themes; its debt list (`tests/atlas/a11y-debt.ts`) is empty and capped at 0.

Enforced beyond the token test: axe runs on every app state in the visual suite ([CI and releases](../operations/ci-and-releases.md)), and none of its declared debt is `color-contrast`; the suite runs the light theme by default, so the dark palette is guarded by the token test and by a manual `UI_THEME=dark UI_AXE=1` run. Not enforced by a test: border contrast.

## Checking a colour change

1. `pnpm --dir apps/ui exec vitest run src/paletteContrast.test.ts` (fast, names the pair, the surface and the ratio).
2. `pnpm check`, and `pnpm --dir apps/ui atlas` when a primitive or `styles.css` changed.
3. The visual suite in both themes (`UI_THEME=dark` runs the whole suite in dark; the run ends with a known validation failure on `theme-dark` and `reader-dark`, which match their default states there), at every viewport, and look at the PNGs: `screenshots/app/<page>/<state>/<viewport>.png`.
4. For a wide change, an axe `color-contrast` pass over every state in both themes catches what the declared pairs miss (it found nested highlights and placeholders while the palette stack was built).
5. Regenerate the documentation images once, after the last visual change (`doc-screenshot-sync`).

## One colour and one form per kind

**Status: accepted by the owner 2026-10-18; not built yet.** The sections above describe the app as built. This one is the target, from the research note the research note "finding-colours-and-chips" ("One colour and one form per kind of highlighted thing", PR #2006) (evidence, not kept current). Where it differs from the sections above, this section wins once the page PR lands; each PR updates the text it replaces.

**The rule.** Colour and form follow what a thing is, never the page it is on or which palette wins. The same kind is highlighted the same way on every page, and drawn the same way every time it is a chip. Related kinds share a colour family and are told apart by shape and label, never by colour alone. Every text mark has a shape cue, and each shape means one kind app-wide. No new hue is added.

### The semantic map

| Kind | Family colour | Text mark | Chip |
| --- | --- | --- | --- |
| Misread / mispronounced | `--danger` | danger-soft fill, wavy underline | `tag`, danger |
| Missing / skipped | `--danger` | dashed box, no fill, muted text | `tag`, danger |
| Extra words | `--danger` | italic, danger-soft fill, left insertion bar (the bar alone where zero-width) | `tag`, danger |
| Repeat / restart | `--danger` | double underline | `tag`, danger |
| Long silence / pacing | `--danger` | none in text; waveform pin and chip | `tag`, danger |
| Breath, click / mouth, plosive, noise | `--warn` | none in text; waveform pin and chip | `tag`, warning |
| Low confidence | `--warn` | 1px solid thin underline, no fill | `tag`, warning |
| Pronunciation differs | `--info` | dotted underline | `tag`, info |
| Take diff | not said in the take = missing; said but not in the script = extra | those shapes | none |
| Entity of a type | the type colour, through one resolver | type tint and 2px solid underline, text `--<kind>-text` | `pill` with swatch in lists; type `tag` in headers |
| Needs Review / Draft entry | `--warn` | faint mark, no hue | `pill`, warning |
| Unknown or deleted type | `--non-text` | solid faint underline | neutral `pill` |
| Speaker | the entry's own colour | none | tint and hue text; suggested = dashed border; unknown = dashed neutral border |
| Narrator mark type | the narrator's colour and style | one recipe on every page | per page |
| Note, query | note `--note`, query `--warn` | end marker follows the mark colour | none |
| Find hit | `--search` | 20% tint, 1.5px line; the current hit adds a 2px ring | none |
| Selection, cursor, playing word | `--info-soft`, `--focus` ring, `--accent` fill | one playing-word recipe on Booth and Editing | none |
| Bookmark | `--accent` | ribbon, as built | none |

Read the family as: red is the words (or the pacing) are wrong, amber is the audio or the recogniser is in doubt, blue is pronunciation.

Statuses and decisions use one tone per concept, `soft` look, shared across pages: needs pickup `accent`; fix in edit `info`; waive, keep, fixed, accepted, pass, ready, done, kept take `success`; defer, not started, not checked, waiting, muted `neutral`; in progress, active take, downloading, verifying `info`; changed, to verify, stale, at risk, needs review `warning`; failed, fail, behind, late `danger`; open pickup `warning` (CD10); suggested take `accent`; take identity has no hue (CD11).

Chip forms, one per role:

| Role | Form |
| --- | --- |
| Kind of finding, type of entry | `tag` (16px, uppercase) |
| Status, decision, verdict, resolution | `pill` (22px) |
| Pipeline, schedule, package cells | `cell` |
| Legend entry, dense list marker, count chip | `Dot` and label; the legend draws the same text mark as the document |
| Toggle filter | `Pill` toggle, as built |

### Accepted decisions (CD1 to CD13, 2026-10-18)

The `CD` numbers are this document's. They are not the agent-train D-numbers.

| # | Decision |
| --- | --- |
| CD1 | Misread, missing, extra and repeat are all in the red (`--danger`) family. |
| CD2 | Extra words are red italic with an insertion bar. This replaces Proof's green `ins` and the check card's info dot. |
| CD3 | Repeat / restart is a red double underline. |
| CD4 | Long silence / pacing is red, with the mistakes. This is an owner override of the note's amber recommendation. Breath, click, noise and plosive stay amber audio-doubt pins. |
| CD5 | The shape set is accepted: wavy, dashed box, bar, double, thin solid, dotted. Each page PR confirms it with a screenshot pass in both themes. |
| CD6 | Speaker colour comes from the entry's own colour, with no id hash. An unknown speaker is neutral dashed. |
| CD7 | Needs Review / Draft entries use `--warn`, which frees `--review` from the entity role. |
| CD8 | Narrator marks draw their style on Booth and Editing as well as the reader; end markers follow the mark colour. |
| CD9 | The find hit keeps its own `--search` hue. |
| CD10 | An open pickup is a warning. |
| CD11 | Take identity has no hue; the suggested take is `accent`. |
| CD12 | Delete the unused `--bookmark` token. |
| CD13 | One helper computes the entity tint (the existing 18% badge recipe); no new `-soft` tokens. |

### Mock lines this supersedes

The Studio Next mock stays frozen ([Which mocks are the spec](design-system.md#which-mocks-are-the-spec)). These are the places the decisions depart from it, per [UI spec and screenshots](../../.claude/rules/ui-spec-and-screenshots.md).

| Mock draws | Replaced by | Why |
| --- | --- | --- |
| Long silence in copper (`--accent`) | red, CD4 | Silence is a recording mistake the narrator fixes, so it sits with the mistakes; copper stays for decisions and positions. |
| Find hit reusing the info and warn hues | `--search`, CD9 | A hit must never read as a Location or a Query. |
| Proof's green `ins`; the check card's info dot (extra words) | red italic with an insertion bar, CD2 | The mock draws extra words four ways; one kind gets one look, in the "words are wrong" family. |
| Repeat in copper (Proof) or violet (Editing) | red double underline, CD3 | Same kind, one colour. |
| Unknown speaker in red dashed | neutral dashed, CD6 | An unknown speaker is not an error. |
| Take identity in violet | no hue, CD11 | The violet has no app token and would collide with Organization. |
| Note and query end markers in fixed violet and warn | the mark's own colour, CD8 | The marker is part of the mark. |
| Open pickup in three tones | `warning`, CD10 | It is one concept: a thing still to do. |

### Per-speaker colours change

CD6 supersedes the hash in [Per-speaker colours](#per-speaker-colours): `speakerColorToken` and `--speaker-1` to `--speaker-7` go when the Script and Booth PRs land, and a speaker draws its entry's colour. Until then that section describes the app.

### Build plan

Each PR is small; PRs 2 to 7 touch disjoint files and can run in parallel after PR 1. Each of 2 to 7 updates its pages' guides and screenshots ([UI PRs update the how-to guide](../../CONTRIBUTING.md#ui-prs-update-the-how-to-guide)).

| PR | Contents |
| --- | --- |
| 0 | This section. |
| 1 | a new `kinds` folder in the UI source (kind map, entity colour resolver, status tones), `KindMark`, `KindChip`, a guard test with a `PENDING` list of files still to migrate, `PAIRS` rows for the new combinations, fixes for undefined tokens (`--line`, `--warning-soft`, `--surface-muted`, `--radius-panel`), dead-code removal, `--bookmark` (CD12). |
| 2 | Proof: check card, finding rows, notes table, pins. |
| 3 | Editing: word marks, legend, flag card, ribbon, found list, strip, takes. |
| 4 | Booth: reader flags, key, text marks, speaker chip, Reference chip. |
| 5 | Script: names, speaker chips, rail kinds, marks, find hit, word layer. |
| 6 | Pickups and Story Bible: type column, entry list, detail header, entity summary, Settings types panel. |
| 7 | Statuses: Production, Schedule, Master/QC, Delivery, Settings tools and models, capability and engine chips. |
