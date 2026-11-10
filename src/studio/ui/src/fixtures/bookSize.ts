import type { ManuscriptChapter, ManuscriptParagraph } from '../types';
import { makeChapters } from './chapters';
import { sampleSpeakers } from './speakers';

// A book of a given length for the performance benchmark (`?mockBookHours=17`, scripts/dev/page-bench.mjs). Narration runs at about 9,000
// words an hour; a chapter is about 3,500 words and a paragraph about 90, which is what the imports of real novels produce. Pure and
// deterministic: no clock, no random value.

const WORDS_PER_HOUR = 9000;
const WORDS_PER_CHAPTER = 3500;
const WORDS_PER_PARAGRAPH = 90;

export function bookOfHours(hours: number): { chapters: ManuscriptChapter[]; paragraphs: ManuscriptParagraph[] } {
  const chapterCount = Math.max(1, Math.round((hours * WORDS_PER_HOUR) / WORDS_PER_CHAPTER));
  const perChapter = Math.round(WORDS_PER_CHAPTER / WORDS_PER_PARAGRAPH);
  const chapters = makeChapters({ shape: 'titleAndSubtitle', count: chapterCount }).map((chapter) => ({ ...chapter, wordCount: WORDS_PER_CHAPTER }));
  const paragraphs = chapters.flatMap((chapter, c) =>
    Array.from({ length: perChapter }, (_, local): ManuscriptParagraph => {
      const index = c * perChapter + local;
      const speaker = sampleSpeakers[index % sampleSpeakers.length];
      const words = Array.from({ length: WORDS_PER_PARAGRAPH }, (_w, w) => `word${(index * 7 + w) % 997}${(w + 1) % 12 === 0 ? '.' : ''}`);
      return {
        id: `p-${index + 1}`,
        chapterId: chapter.id,
        chapter: chapter.title,
        index: local,
        sourceLine: 10 + index,
        text: `“${words.join(' ')}” said ${speaker.name}.`,
        entityIds: [speaker.id],
      };
    }),
  );
  return { chapters, paragraphs };
}
