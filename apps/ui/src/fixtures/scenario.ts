import type { ManuscriptChapter, ManuscriptParagraph } from '../types';
import { type ChapterShape, makeChapters, makeParagraphs } from './chapters';

// The scenario book (ADR 0770): a chapter list and its paragraphs in one of the three heading shapes, as a seed for the
// mock API, never a book held in the browser. Pure and deterministic. The mock's other domains (production plan, stages,
// findings) still read the Alice chapters, so a scenario changes the manuscript domain only; a page swap that needs more
// adds the seed field it reads.
export const SCENARIO_SIZES = [12, 40] as const;

export interface MakeScenarioOptions {
  shape: ChapterShape;
  chapters: number;
}

export interface Scenario {
  shape: ChapterShape;
  chapters: ManuscriptChapter[];
  paragraphs: ManuscriptParagraph[];
  /** Pass to `createMockApi({}, scenario.seed)`. */
  seed: { chapters: ManuscriptChapter[]; paragraphs: ManuscriptParagraph[] };
}

export function makeScenario({ shape, chapters: count }: MakeScenarioOptions): Scenario {
  const chapters = makeChapters({ shape, count });
  const paragraphs = makeParagraphs(chapters);
  return { shape, chapters, paragraphs, seed: { chapters, paragraphs } };
}
