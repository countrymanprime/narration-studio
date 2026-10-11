import type { ManuscriptChapter, ManuscriptParagraph } from '../types';
import { sampleSpeakers } from './speakers';

// Builders for the chapter lists a test, a story or a mock adapter needs (ADR 0770). They are pure and deterministic: no
// clock, no random value. A chapter's name is `title` and `subtitle` formatted by one rule (ADR 0191, chapterName.ts), so
// the shapes are the three the importers produce and tests/fixtures/chapter-names.json pins.
export const CHAPTER_SHAPES = ['titleAndSubtitle', 'titleOnly', 'legacyNewline'] as const;
export type ChapterShape = (typeof CHAPTER_SHAPES)[number];

export interface MakeChaptersOptions {
  shape: ChapterShape;
  count: number;
}

const STATUSES: ManuscriptChapter['status'][] = ['finalized', 'proofing', 'editing', 'recording', 'not_started'];
const SUBTITLES = [
  'Down the Rabbit-Hole',
  'The Pool of Tears',
  'A Caucus-Race and a Long Tale',
  'The Rabbit Sends in a Little Bill',
  'Advice from a Caterpillar',
  'Pig and Pepper',
];

export function makeChapters({ shape, count }: MakeChaptersOptions): ManuscriptChapter[] {
  return Array.from({ length: count }, (_, index) => {
    const title = `Chapter ${index + 1}`;
    const subtitle = SUBTITLES[index % SUBTITLES.length];
    const base = {
      id: `chapter-${index + 1}`,
      index,
      wordCount: 1200 + ((index * 37) % 800),
      status: STATUSES[index % STATUSES.length],
    };
    if (shape === 'titleAndSubtitle') return { ...base, title, subtitle };
    if (shape === 'legacyNewline') return { ...base, title: `${title}\n${subtitle}` };
    return { ...base, title };
  });
}

export interface MakeParagraphsOptions {
  perChapter?: number;
}

// One spoken line per paragraph, tagged with the speaker's id in `entityIds`, so a test can follow a speaker back to
// `sampleSpeakers`. Speakers rotate in list order.
export function makeParagraphs(chapters: readonly ManuscriptChapter[], { perChapter = 2 }: MakeParagraphsOptions = {}): ManuscriptParagraph[] {
  return chapters.flatMap((chapter, chapterIndex) =>
    Array.from({ length: perChapter }, (_, local) => {
      const index = chapterIndex * perChapter + local;
      const speaker = sampleSpeakers[index % sampleSpeakers.length];
      return {
        id: `p-${index + 1}`,
        chapterId: chapter.id,
        chapter: chapter.title,
        index,
        sourceLine: 10 + index * 5,
        text: `“Line ${index + 1},” said ${speaker.name}.`,
        entityIds: [speaker.id],
      };
    }),
  );
}
