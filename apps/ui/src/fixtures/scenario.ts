import type { ManuscriptChapter, ManuscriptParagraph } from '../types';
import type { DawMockSeed } from '../api/dawMock';
import { type ChapterShape, makeChapters, makeParagraphs } from './chapters';

// The scenario book (ADR 0770): a chapter list and its paragraphs in one of the three heading shapes, as a seed for the
// mock API, never a book held in the browser. Pure and deterministic. The mock's other domains (production plan, stages,
// findings) still read the Alice chapters, so a scenario changes the manuscript domain only; a page swap that needs more
// adds the seed field it reads.
export const SCENARIO_SIZES = [12, 40] as const;

/** The DAW setups a scenario can name (SN-S91): REAPER answering, REAPER declared but not answering, the built-in recorder. */
export const SCENARIO_DAW_SETUPS = ['reaper', 'reaper-off', 'builtin'] as const;
type ScenarioDawSetup = (typeof SCENARIO_DAW_SETUPS)[number];

const DAW_SEEDS: Readonly<Record<ScenarioDawSetup, DawMockSeed>> = {
  reaper: { daw: 'REAPER' },
  'reaper-off': { daw: 'REAPER', connected: false },
  builtin: { daw: 'Built-in' },
};

export interface MakeScenarioOptions {
  shape: ChapterShape;
  chapters: number;
  /** Defaults to `reaper`. */
  daw?: ScenarioDawSetup;
}

export interface Scenario {
  shape: ChapterShape;
  chapters: ManuscriptChapter[];
  paragraphs: ManuscriptParagraph[];
  daw: ScenarioDawSetup;
  /** Pass to `createMockApi({}, scenario.seed)`. */
  seed: { chapters: ManuscriptChapter[]; paragraphs: ManuscriptParagraph[]; daw: DawMockSeed };
}

export function makeScenario({ shape, chapters: count, daw = 'reaper' }: MakeScenarioOptions): Scenario {
  const chapters = makeChapters({ shape, count });
  const paragraphs = makeParagraphs(chapters);
  return { shape, chapters, paragraphs, daw, seed: { chapters, paragraphs, daw: DAW_SEEDS[daw] } };
}
