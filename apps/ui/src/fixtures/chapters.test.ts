import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chapterName } from '../chapterName';
import { chaptersSchema, paragraphsSchema } from '../api/schemas/manuscript';
import { parseWire } from '../api/wire/parseWire';
import { type ChapterShape, CHAPTER_SHAPES, makeChapters, makeParagraphs } from './chapters';
import { sampleSpeakerById } from './speakers';

const FIXTURE_PATH = fileURLToPath(new URL('../../../../tests/fixtures/chapter-names.json', import.meta.url));
interface FixtureCase {
  title: string;
  subtitle: string | null;
  full: string;
  short: string;
}
const fixtureCases: FixtureCase[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')).cases;

// What the importers produce, read off the input the same way for a fixture case and a built chapter.
function shapeOf(input: { title: string; subtitle?: string | null }): ChapterShape | 'other' {
  if (input.subtitle) return 'titleAndSubtitle';
  if (input.title.includes('\n')) return 'legacyNewline';
  return 'titleOnly';
}

const wire = { boundary: 'fixtures.test', payload: 'chapters' };

describe('make-chapters-builds-each-shape', () => {
  it.each(CHAPTER_SHAPES)('%s: the name has the structure chapter-names.json pins', (shape) => {
    const pinned = fixtureCases.filter((c) => shapeOf(c) === shape && c.subtitle !== '');
    expect(pinned.length).toBeGreaterThan(0);
    for (const chapter of makeChapters({ shape, count: 3 })) {
      expect(shapeOf(chapter)).toBe(shape);
      const [first] = chapter.title.split('\n');
      expect(chapterName(chapter, 'short')).toBe(first);
      const hasJoin = chapterName(chapter, 'full').includes(' — ');
      expect(hasJoin).toBe(pinned[0].full.includes(' — '));
    }
  });

  it('joins the three shapes the way the importers do', () => {
    const [both] = makeChapters({ shape: 'titleAndSubtitle', count: 1 });
    const [bare] = makeChapters({ shape: 'titleOnly', count: 1 });
    const [legacy] = makeChapters({ shape: 'legacyNewline', count: 1 });
    expect(chapterName(both)).toBe(`${both.title} — ${both.subtitle}`);
    expect(chapterName(bare)).toBe(bare.title);
    expect(bare.subtitle).toBeUndefined();
    const [legacyTitle, legacySubtitle] = legacy.title.split('\n');
    expect(legacy.subtitle).toBeUndefined();
    expect(chapterName(legacy)).toBe(`${legacyTitle} — ${legacySubtitle}`);
  });
});

describe('make-chapters-counts-and-ids', () => {
  it.each([0, 12, 40])('builds %i chapters in order with unique ids', (count) => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count });
    expect(chapters).toHaveLength(count);
    expect(new Set(chapters.map((c) => c.id)).size).toBe(count);
    expect(chapters.map((c) => c.index)).toEqual(chapters.map((_, i) => i));
    for (const chapter of chapters) {
      expect(chapter.wordCount).toBeGreaterThan(0);
      expect(chapter.status).toBeTruthy();
      expect(Object.keys(chapter).sort()).toEqual(['id', 'index', 'status', 'title', 'wordCount', ...(chapter.subtitle ? ['subtitle'] : [])].sort());
    }
  });
});

describe('built-chapters-pass-the-wire-schema', () => {
  it.each(CHAPTER_SHAPES.flatMap((shape) => [0, 12, 40].map((count) => [shape, count] as const)))('%s x %i', (shape, count) => {
    const chapters = makeChapters({ shape, count });
    expect(parseWire(chaptersSchema, chapters, wire)).toEqual(chapters);
  });

  it('builds paragraphs the schema accepts', () => {
    const paragraphs = makeParagraphs(makeChapters({ shape: 'titleOnly', count: 5 }));
    expect(parseWire(paragraphsSchema, paragraphs, wire)).toEqual(paragraphs);
  });
});

describe('builders-are-deterministic', () => {
  it('gives equal output for the same options', () => {
    const options = { shape: 'legacyNewline', count: 12 } as const;
    expect(makeChapters(options)).toEqual(makeChapters(options));
    expect(makeParagraphs(makeChapters(options))).toEqual(makeParagraphs(makeChapters(options)));
  });
});

describe('sample-speakers-are-data', () => {
  it('resolves every speaker in a built paragraph to the sample list', () => {
    const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 4 });
    const paragraphs = makeParagraphs(chapters, { perChapter: 3 });
    expect(paragraphs).toHaveLength(12);
    for (const paragraph of paragraphs) {
      expect(paragraph.entityIds).toHaveLength(1);
      const speaker = sampleSpeakerById(paragraph.entityIds[0]);
      expect(speaker).toBeDefined();
      expect(paragraph.text).toContain(speaker?.name);
      expect(chapters.some((c) => c.id === paragraph.chapterId)).toBe(true);
    }
  });
});
