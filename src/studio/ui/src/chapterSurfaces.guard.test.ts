// The class guard for "the credits are chapters" (owner rule): every file that reads the chapter list is either covered by a test that
// shows the opening and closing credits in it, or exempt with the reason it is about a chapter's text only. A new chapter surface that is
// in neither list fails here, so a page cannot ship that lists the chapters and leaves the credits out (issue 2572).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from './api/mockApi';
import { isCreditsChapter, isNarrationChapter } from './chapterKinds';

const SRC = fileURLToPath(new URL('.', import.meta.url));

/** Source file -> the test files that put both credits in what that file draws or counts. */
const COVERED: Record<string, readonly string[]> = {
  'components/editing/EditingPage.tsx': ['components/editing/EditingPage.test.tsx'],
  'components/proof/ProofPage.tsx': ['components/proof/ProofPage.test.tsx'],
  'components/proof/ProofChapterPage.tsx': ['components/proof/ProofChapterPage.test.tsx'],
  'components/booth/page/useBoothData.ts': ['components/booth/page/BoothNextPage.test.tsx'],
  'components/booth/companion/CompanionPage.tsx': ['components/booth/companion/CompanionPage.test.tsx'],
  'components/pickups/PickupsPage.tsx': ['components/pickups/PickupsPage.test.tsx'],
  'components/production/useChapterTools.tsx': ['components/production/ProductionPage.test.tsx'],
  'components/masterqc/page/MasterPage.tsx': ['components/masterqc/page/Page.test.tsx'],
  'components/engine/useChapterLinks.ts': ['components/engine/ChapterLinksTable.test.tsx'],
  // The pipeline's cells take the list from the store (ensure/load) and fall back to the port with no store; the credits pairing is checked in ProductionPage.test.tsx.
  'components/production/usePipelineSources.ts': ['components/production/ProductionPage.test.tsx'],
  // The page's rows, header, pace and Next up are the shared list with the overview's numbers (composeOverview.ts, #4058): the credits are rows like any chapter.
  'components/production/ProductionPage.tsx': ['components/production/ProductionPage.test.tsx'],
  'studio/useChapters.ts': ['components/chapterTracks/useChapterNameOf.test.tsx'],
  'components/layout/useNavCounts.ts': ['components/layout/useNavCounts.test.tsx'],
  'components/recordingcheck/CheckRecordingsDialog.tsx': ['components/recordingcheck/CheckRecordingsDialog.test.tsx'],
  'studio/slots.ts': ['components/layout/useGoToCommands.test.tsx', 'components/layout/AddressGate.test.tsx', 'components/delivery/page/DeliveryPage.test.tsx'],
};

/** Source file -> why the credits are left out of what it reads (a chapter's own text, or nothing to list). */
const EXEMPT: Record<string, string> = {
  'components/production/target/TargetInfoButton.tsx':
    "counts the narration chapters' words for the pace figure; the credits are narration chapters and count like any other (ProductionPage.test)",
  'components/chapterTracks/useChapterNameOf.ts': 'names one chapter by its id; the credits are named like any chapter (useChapterNameOf.test)',
  'components/chapterTracks/useChapterLinkActions.ts':
    "reads the chapters only to name the chapter that lost a track; the credits are linked and named like any chapter, and a name the list lacks falls back to the host's kept title",
  'components/settings/RetailSamplePanel.tsx': "the retail sample is picked from the book's text; the credits have none (CreditsPanel tests)",
  'components/proof/PreviewPanel.tsx': "resolves a preview candidate's paragraph ids to an index; the credits have no paragraphs",
  'components/storybible/Guide.tsx': 'Appears in and evidence links name entities in the text; the credits have none (withoutCredits)',
  'components/booth/companion/useRecordedThrough.ts':
    "reads one chapter's recordedThrough by its id; the Companion lists no chapters (CompanionPage shows the chapter asked for)",
  'components/settings/controls/VoicesBody.tsx':
    'hands the whole chapter list, the credits included, to the Voices card unchanged; the card names a chapter by the folder it is linked to, and nothing is filtered or counted here',
  'components/script/page/data/useScriptData.ts':
    'the Script page draws the credits as their own cards (ScriptPage tests: each once); its paragraphs exclude them',
  'components/script/page/data/sampleScript.ts': "the Script page's stories read a fixed sample; the credits cards are the page's, as in useScriptData.ts",
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'api' || name === 'interactionFeedback' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories|contract)\.|testPage|Fixtures|fixtures/.test(name) ? [path] : [];
  });
}

describe('every surface that reads the chapter list shows the credits', () => {
  const readers = sources(SRC)
    .filter((path) => /manuscriptChapters\(\)|studio\/useChapters'/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(SRC, path).split(sep).join('/'))
    .sort();

  it('lists each reader as covered or exempt, and nothing that no longer reads the list', () => {
    const declared = [...Object.keys(COVERED), ...Object.keys(EXEMPT)].sort();
    // A reader that is in neither table is a new surface: add a test that shows the credits in it, or exempt it with a reason.
    expect(readers.filter((file) => !declared.includes(file))).toEqual([]);
    // `studio/slots.ts` reads the list through the port, so it is declared but not matched by the text above.
    expect(declared.filter((file) => !readers.includes(file) && file !== 'studio/slots.ts')).toEqual([]);
  });

  // One list for every page (#3658, #3998): the host's chapter list is read by the store's slot, and by the two hooks' fallbacks for a component rendered with
  // no store. A page that calls the port itself has its own copy of the list, its own refresh rules and no project record.
  it('reads the host list nowhere but the store and the fallbacks of its two hooks', () => {
    const ALLOWED = ['studio/slots.ts', 'studio/useChapters.ts', 'components/script/page/data/sampleScript.ts'];
    expect(readers.filter((file) => !ALLOWED.includes(file) && readFileSync(join(SRC, file), 'utf8').includes('manuscriptChapters()'))).toEqual([]);
  });

  it.each(Object.entries(COVERED))('%s: its test names the credits', (_file, tests) => {
    for (const test of tests) {
      expect(readFileSync(join(SRC, test), 'utf8'), test).toMatch(/credits-opening|isCredits|withCredits|CHAPTERS_WITH_CREDITS/);
    }
  });

  it('the mock host answers the list the pages read: opening first, closing last, both narration', async () => {
    const chapters = await createMockApi().manuscriptChapters();
    expect(chapters[0]?.id).toBe('credits-opening');
    expect(chapters[chapters.length - 1]?.id).toBe('credits-closing');
    expect(chapters.filter(isCreditsChapter)).toHaveLength(2);
    expect(chapters.filter(isCreditsChapter).every(isNarrationChapter)).toBe(true);
  });
});
