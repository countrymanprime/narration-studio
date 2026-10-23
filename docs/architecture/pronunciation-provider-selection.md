# Pronunciation: sources, the chosen value, and its default

How a Story Bible entry's or alias's pronunciation is generated, chosen, made audible and defaulted.

## What "provider" means here

What "provider" means here rejected a
second local G2P engine and a hosted IPA API: "provider" is the pronunciation value the narrator already edits through
`edit()`/`GuideEdit`, and the preview should speak that value directly instead of re-guessing from the spelled name.
`phonemizer`, eSpeak NG and Piper were already GPL-3.0-or-later components in this AGPL-3.0-or-later project (an owner
decision, [model provenance](model-provenance.md)), so reusing them added no new licence question.

## Sources

`src/studio/sidecars/manuscript-guide/core/providers.py` registers three pronunciation sources into the shared
`narration_common.ports.pronunciation.SOURCES` registry, in the offline precedence order the automatic build-time
fallback tries them: **CMU dictionary** (quick, high-quality for names it knows), **Wiktextract** (broader headword
coverage than CMU, a real dictionary hit; [ADR 0002](../adr/0002-local-models-and-tools-come-first-so-the-app-is-free-to-use.md)),
then **eSpeak NG** (a letter-to-sound guess for anything neither dictionary has). Every source normalizes to IPA before
storage — `CmuSource.pronounce()` runs CMU's ARPABET through `arpabet_to_ipa()` — so the value a narrator sees and
chooses is always IPA regardless of which source produced it. `src/studio/desktop/internal/pronunciationport` is the Go
side's read-only mirror of the same three names, used to validate the narrator's explicit choice before the sidecar
starts (`Pronounce`'s `CheckPronounce`).

## Choosing and previewing a pronunciation

- **Generated automatically** at build time and whenever an alias is added, by `pronunciation(name, espeak_library,
  default_source)`: tries the sources in order (the narrator's default source first, if set — see below), stores
  `{ipa, source, confidence}`, and falls back to `{"ipa": "", "source": "not generated", "confidence": "unknown"}`
  rather than raising.
- **Chosen explicitly** through `GuideDetail.tsx`'s edit-mode Generate/Replace control, for the entity and
  independently for each alias: a `Menu` offering "From the CMU dictionary" / "From eSpeak NG" next to the
  Play button, calling `Host.GuidePronounce` (which asks `pronounce_source()` for exactly the named source and raises
  when it has nothing for the name, unlike the automatic fallback) and marking the result `chosen: true` so a rebuild
  never silently replaces it (`merge_locked`). The narrator's own typed pronunciation
  ([Manuscript Guide](../utilities/manuscript-guide.md))
  and the kept alternate work the same way for an alias as for the entity — `GuidePronounce`,
  `GuidePronounceUser`, `GuidePronunciationUseAlternate` and `GuidePronunciationSetStatus` each take an
  optional alias index.
- **Spoken by the preview:** Choosing and previewing a pronunciation
  changed `render_audio` to speak a **chosen** pronunciation as a Piper raw-phoneme block (`"[[ipa]]"`) instead of the
  spelled name; an unchosen (freshly auto-generated) pronunciation never changes what the preview says, since
  `merge_locked` keeps regenerating a guess on every rebuild and the preview must not flip on its own. The Go preview
  cache key folds in the chosen pronunciation's IPA, so choosing or changing one invalidates a stale cached render.

## The default source setting

The default source setting
added `ManuscriptGuide.default_pronunciation_source` (Settings > Voice & pronunciation): `""` (Automatic, the
original CMU-then-Wiktionary-then-eSpeak order) or one of the three source names. It only **reorders** the automatic
fallback to try the narrator's preferred source first — the rest of the chain still runs if that source has nothing
for a name — and never limits the entity/alias Generate/Replace control's own explicit per-name choice.
`src/studio/desktop/internal/guide/service.go` passes it to the sidecar's `build`, `create`, and an `edit` that adds an
alias; it is left off the command line entirely while unset, so an untouched project's command line is unchanged.

## Open, owner-only item

A real listening trial (does the phoneme block actually sound like the chosen pronunciation, for each source) needs a
human ear; it is filed as owner QA on issue #510 and blocks nothing.

## Tests

Python: `src/studio/sidecars/manuscript-guide/tests/test_providers.py` (the fallback order, a narrator's default source tried
first and ignored when unregistered, each source's conformance suite) and `test_pronunciation_preview.py` (chosen vs.
unchosen, the pronounce-then-rebuild-then-preview round trip). Go: `src/studio/desktop/internal/guide/service_test.go` (the
default-source argument reaches build/alias-edit/create and only those) and `preview_test.go` (the cache key). Vitest:
`GuideDetail.pronunciation.test.tsx` and `GuideDetail.aliasPronunciation.test.tsx`. Visual: `storybible/entry-pronunciation-missing`,
`entry-pronunciation-online` and `alias-pronunciation-editing`.
