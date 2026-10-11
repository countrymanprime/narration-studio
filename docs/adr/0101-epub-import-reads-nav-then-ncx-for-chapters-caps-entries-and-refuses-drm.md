# 0101. EPUB import reads nav then NCX for chapters, caps entries, and refuses DRM

**Status:** Accepted
**Date:** 2026-09-22

## Context

An EPUB (`.epub`) manuscript importer is added alongside DOCX, Markdown and TXT
(`apps/desktop/internal/importer/epub.go`, `epub_toc.go`, `epub_xhtml.go`). The open questions about it already carried the
owner's recommended answers (an open question without an explicit owner decision adopts the recommendation), so this ADR records
the resulting decisions and the implementation judgement calls that recommendation still left open, rather than asking the owner
to re-decide something already settled - the same pattern ADR 0095 used for the TXT importer.

No real EPUB was available to check against (none was supplied, so the EPUB facts here are not verified against a real book). The
importer ships against a generated fixture (`tests/fixtures/alice.epub`,
`tests/fixtures/generate_alice.py`'s `write_epub`) built from the EPUB 3/EPUB 2 specifications as read, plus in-memory Go
fixtures (`epub_test.go`) for hostile and quirk shapes. The thresholds and fallbacks below should be revisited once a real,
owner-supplied EPUB is available.

## Decision

- **Chapters come from the table of contents first.** `epubWithProgress` reads the EPUB 3 nav document
  (`<nav epub:type="toc">`) when the package manifest has one, falling back to the EPUB 2 NCX (`toc.ncx`) when it does not or the
  nav yields no entries. A chapter is the run of blocks from one TOC target to the next, across spine files, as recommended. When neither TOC resolves to any block at all, each spine document whose own first block is an `h1` or
  `h2` starts a chapter instead, and a `Notices` line says so.
- **Every TOC depth starts a chapter.** `epubChapterStarts` does not filter by nesting depth: a nested `Part > Chapter`
  entry starts its own chapter the same way a top-level one does, matching DOCX's existing "every heading is a chapter" shape and
  the recommendation.
- **Emphasis is semantic tags only.** `collectInline` (`epub_xhtml.go`) maps `<i>`/`<em>` to italic,
  `<b>`/`<strong>` to bold and `<u>` to underline, and `<br>` to a line break within a block. CSS-class-driven emphasis
  (`<span class="italic">` styled from the book's own stylesheet) is out of scope, as recommended (it belongs with the later EPUB structure work); text under such a span imports as plain text with no span, uncounted for now.
- **Footnotes and non-linear items are not yet handled.** The importer reads every spine item regardless of `linear="no"`, and
  does not yet drop `epub:type="noteref"` references. That belongs with the `epub:type` classification pass (ADR 0102), which
  did not exist yet to hang it on.
- **Limits.** A file over 64 MB on disk, any single zip entry over 16 MB decompressed, or more than 128 MB of decompressed
  text across the whole archive, is refused (`epubMaxFileSize`, `epubMaxEntrySize`, `epubMaxTotalText` in `epub.go`) - a capped
  reader in the same spirit as `docxEntry`'s own gap ([threat model](../architecture/threat-model.md) row 6a, issue #239), applied to a format that is
  also a zip. Every `href` (manifest, nav, NCX) is resolved against the directory it was found in, cleaned, and rejected if it
  would resolve outside the archive (`resolveEPUBHref`); nothing is ever extracted to disk, so zip-slip itself does not apply,
  but a crafted `../../secret` href must still not be read. These three numbers are an implementation judgement call within the
  proposed shape, not a value the owner measured against a real file - documented here rather than left as
  magic numbers in `epub.go`, the same way ADR 0095 documents its own TXT wrap-detection thresholds.
- **DRM.** A `META-INF/encryption.xml` entry is accepted only when its algorithm is one of the
  two known font-obfuscation URIs (IDPF `http://www.idpf.org/2008/embedding`, Adobe `http://ns.adobe.com/pdf/enc#RC`); any other
  algorithm, or the presence of an Adobe `META-INF/rights.xml`, refuses the import with the proposed message ("This EPUB is
  copy-protected..."). No attempt is made to decrypt or work around either.
- **Chapterless fallback matches TXT's (not an open question, but a consistency decision).** An EPUB whose TOC and
  spine-heading fallback both find nothing becomes one `narration` chapter titled from the file name, with a notice - the same
  divergence from Word/Markdown's `opening`-only chapterless behavior that ADR 0095 records for TXT, required by the goal of no un-narratable import, which names EPUB explicitly, not just TXT.

## Consequences

- A well-formed EPUB 3 or EPUB 2 book with a real table of contents imports its chapters in the shape the author gave them,
  without a heading heuristic guessing at chapter boundaries the way DOCX and Markdown still do.
- The size limits and the semantic-emphasis-only scope are considered guesses, not measured ones (no real EPUB was available).
  A future change that tunes the limits or adds CSS-class emphasis should
  supersede this ADR rather than edit `epub.go`'s constants or `collectInline`'s tag set silently.
- Only the exposed formats list (`formats.go`) changes what the native picker, `BuildDraftProgress`'s error message and the UI
  union (`apps/ui/src/api/contracts/manuscript.ts`, `apps/ui/src/api/schemas/manuscript.ts`) accept; `manuscript.DetectSource`'s
  own extension list (the "found in your project folder" offer, ADR 0019) is unchanged by this ADR - offering `.epub`
  automatically is a separate decision ([ADR 0103](0103-txt-and-epub-are-accepted-import-formats-hand-rolled-drm-refused-and-offered-for-detection.md)).
- `golang.org/x/net` moves from an indirect to a direct dependency of `apps/desktop/go.mod` (its `html` package parses XHTML
  content documents and the nav document); it is BSD-3, already in the module graph as an indirect requirement, and compatible
  with the project's AGPL-3.0-or-later licence ([ADR 0039](0039-the-project-is-licensed-agpl-3-or-later.md)), so no new dependency licence check was needed.
