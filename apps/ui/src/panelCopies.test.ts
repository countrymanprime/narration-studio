// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

// ADR 0640: a card is a `Panel`, a card inside a card an
// `InsetCard`, an eyebrow a `SectionLabel` and a page title a `Heading`, so each looks one way. This scan counts the copies
// written outside `components/primitives/`, per file, and a file's count may only go down: a ceiling higher than the real
// count fails, so the entry is lowered (or deleted at zero) in the same change, and a file with no entry may have none.
//
// The entries left are the page-specific components and the shell. Each lowers its own when it composes the primitives.
const COPIES = {
  // A hand-drawn card: the frame Panel draws (`PANEL_FRAME_CLASS`).
  card: /rounded-lg border/g,
  // A hand-drawn inset card.
  inset: /rounded-md border(?! border-transparent)/g,
  // The eyebrow's class string, or the global class that draws it.
  eyebrow: /tracking-\[0\.08em\][^"'`]*uppercase|uppercase[^"'`]*tracking-\[0\.08em\]|\bsection-label\b/g,
  // A page title that is not a Heading.
  h1: /<h1[\s>]/g,
} as const;
type Copy = keyof typeof COPIES;

const CEILING: Record<Copy, Record<string, number>> = {
  card: {
    // The companion panel's own card is at 0 (ADR 0659: full-bleed sections, not cards).
    // Not cards. A warning on a tinted fill, which neither Panel nor InsetCard draws.
    'src/components/booth/UnresolvedCreditsWarning.tsx': 1,
    // A card that is a button (the .rpp picker's rows, the recent projects): a Panel is a section, not a control.
    'src/components/engine/EnginePanel.tsx': 1,
    'src/components/project/ProjectPicker.tsx': 1,
    // The chapter card's sticky header rounds its own top corners (`rounded-lg border-b-0`); the card is PANEL_FRAME_CLASS.
    'src/components/manuscript/ReaderCard.tsx': 1,
    // The waveform's frame, with its own tight padding round the drawing.
    'src/components/proof/WaveformStrip.tsx': 1,
    // The bookmarks tab's list frame (SN-B62), to move onto Panel with #1119.
    'src/components/script/bookmarks/ui/BookmarksTab.tsx': 1,
    // The Script rail's Story Bible panel frame and entry card and the Notes thread card (SN-B752), to move onto Panel and InsetCard with #1119.
    'src/components/script/page/rail/bible/BiblePanel.tsx': 1,
    'src/components/script/page/rail/bible/EntryCard.tsx': 1,
    'src/components/script/page/rail/threads/NoteCard.tsx': 1,
  },
  inset: {
    // The disagree choice's card, which is a button (the source and the sentence it names).
    'src/components/booth/ResumePrompt.tsx': 1,
    // The editing ribbon's inset (SN-E7) and the bookmarks tab's row card (SN-B62), to move onto InsetCard with #1119.
    'src/components/editing/ribbon/Ribbon.tsx': 1,
    'src/components/script/bookmarks/ui/BookmarksTab.tsx': 1,
    // The Story Bible panel's entry inset (SN-B752), to move onto InsetCard with #1119.
    'src/components/script/page/rail/bible/BiblePanel.tsx': 1,
  },
  eyebrow: {
    // The shell's nav group headings and the header's Project label, and the three `.section-label` selectors of the collapsed rail's
    // class string (they style the label, they do not draw one).
    'src/components/layout/AppShell.tsx': 6,
    // Page components not yet on the primitives: the Booth, Master and Script.
    'src/components/booth/CompanionShell.tsx': 1,
    'src/components/master/BookConsistency.tsx': 1,
  },
  h1: {
    // The Booth's page title is visually hidden (`sr-only`): the reading surface is the page, and a Heading would show.
    'src/components/booth/page/BoothNextPage.tsx': 1,
    // The Script page's title is visually hidden too: the mock draws none, the reader is the page.
    'src/components/script/page/ScriptPage.tsx': 1,
  },
};

const SRC = join(__dirname);
const PRIMITIVES = join(SRC, 'components', 'primitives');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return path === PRIMITIVES ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

function counts(): Record<Copy, Record<string, number>> {
  const found: Record<Copy, Record<string, number>> = { card: {}, inset: {}, eyebrow: {}, h1: {} };
  for (const path of sourceFiles(join(SRC, 'components'))) {
    const text = readFileSync(path, 'utf8');
    const file = ['src', ...relative(SRC, path).split(sep)].join('/');
    for (const copy of Object.keys(COPIES) as Copy[]) {
      const n = text.match(COPIES[copy])?.length ?? 0;
      if (n > 0) found[copy][file] = n;
    }
  }
  return found;
}

describe('panel, inset card, eyebrow and page-title copies outside the primitives (ADR 0640)', () => {
  const found = counts();
  test.each(Object.keys(COPIES) as Copy[])('no file has more %s copies than its ceiling, and no ceiling is higher than its count', (copy) => {
    expect(found[copy]).toEqual(CEILING[copy]);
  });
});
