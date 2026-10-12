// A host for the chapter list and card stories and tests: five chapters in the shapes the heading styles take (credits, a
// one-line title, a numbered chapter with a second line), the prep states the page keeps and one open query. Setting a prep state
// is remembered, as the real host does, so a press reads back.

import { createMockApi } from '../../../../api/mockApi';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { PrepState } from '../../../../api/contracts/scriptPrep';
import type { NarrationApi } from '../../../../types';

const numbered = (n: number): string => `Chapter ${n}`;
const chapter = (id: string, index: number, title: string, wordCount: number, extra: Partial<ManuscriptChapter> = {}): ManuscriptChapter => ({
  id,
  title,
  index,
  wordCount,
  status: 'not_started',
  contentKind: 'narration',
  ...extra,
});

export const CREDITS = chapter('credits', 0, 'Opening Credits', 120, { contentKind: 'opening' });
const PROLOGUE = chapter('prologue', 1, 'Prologue', 940);
export const ONE = chapter('c1', 2, numbered(1), 3182, { subtitle: 'The Lamp-Lit Road' });
export const TWO = chapter('c2', 3, numbered(2), 2044, { subtitle: 'The Salt Marsh' });
const THREE = chapter('c3', 4, numbered(3), 1860, { subtitle: 'A Night at the Mill' });
export const CHAPTERS: ManuscriptChapter[] = [CREDITS, PROLOGUE, ONE, TWO, THREE];

const TYPES: MarkType[] = [{ key: 'ask', name: 'Query for author', colour: 'warn', style: 'highlight', asks: true }];
const query = (chapterId: string, status: 'open' | 'resolved'): Mark => ({
  id: `q-${chapterId}-${status}`,
  chapterId,
  paragraphId: `${chapterId}-p1`,
  paragraph: 0,
  start: 0,
  end: 4,
  quote: 'Alic',
  type: 'ask',
  text: 'How is this said?',
  status,
  thread: [],
  createdAt: '2026-10-11T10:00:00Z',
  stale: false,
});

/** The host: each chapter's prep state (default Prologue in progress, Chapter 1 prepped), and the chapters with an open query. */
export function chapterHost(
  prep: Record<string, PrepState> = { prologue: 'progress', c1: 'prepped' },
  asking: readonly string[] = ['c2'],
  overrides: Partial<NarrationApi> = {},
): NarrationApi {
  const states = new Map<string, PrepState>(Object.entries(prep));
  return createMockApi({
    manuscriptChapters: async () => CHAPTERS,
    scriptPrepList: async () => ({ chapters: CHAPTERS.map((row) => ({ chapterId: row.id, state: states.get(row.id) ?? 'none' })), words: [] }),
    scriptPrepSetChapter: async (chapterId, state) => {
      states.set(chapterId, state);
      return { chapterId, state };
    },
    marksList: async () => ({ types: TYPES, marks: [...asking.map((id) => query(id, 'open')), query('c3', 'resolved')] }),
    ...overrides,
  });
}
