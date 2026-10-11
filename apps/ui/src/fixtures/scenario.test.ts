import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chaptersSchema, paragraphsSchema } from '../api/schemas/manuscript';
import { createMockApi } from '../api/mockApi';
import { parseWire } from '../api/wire/parseWire';
import { CHAPTER_SHAPES } from './chapters';
import { makeScenario, SCENARIO_SIZES } from './scenario';

const wire = (payload: string) => ({ boundary: 'scenario.test', payload });
const cases = CHAPTER_SHAPES.flatMap((shape) => SCENARIO_SIZES.map((chapters) => ({ shape, chapters })));

describe('scenario-builds-valid-wire', () => {
  it.each(cases)('$shape, $chapters chapters', ({ shape, chapters }) => {
    const scenario = makeScenario({ shape, chapters });
    expect(parseWire(chaptersSchema, scenario.chapters, wire('chapters'))).toHaveLength(chapters);
    expect(parseWire(paragraphsSchema, scenario.paragraphs, wire('paragraphs'))).toHaveLength(chapters * 2);
    expect(scenario.chapters.map((chapter) => chapter.id)).toEqual(Array.from({ length: chapters }, (_, i) => `chapter-${i + 1}`));
  });
});

describe('scenario-is-deterministic', () => {
  it.each(cases)('$shape, $chapters chapters', (options) => {
    expect(makeScenario(options)).toEqual(makeScenario(options));
  });
});

describe('scenario-seed-reaches-the-mock', () => {
  it('answers the built lists when seeded', async () => {
    const scenario = makeScenario({ shape: 'titleOnly', chapters: 12 });
    const api = createMockApi({}, scenario.seed);
    expect((await api.manuscriptChapters()).map((chapter) => chapter.id)).toEqual(scenario.chapters.map((chapter) => chapter.id));
    const last = scenario.chapters[11];
    expect(await api.manuscriptParagraphs(last.id)).toEqual(scenario.paragraphs.filter((paragraph) => paragraph.chapterId === last.id));
  });

  it('answers the Alice fixture without the seed', async () => {
    const chapters = await createMockApi().manuscriptChapters();
    expect(chapters.some((chapter) => chapter.id.startsWith('chapter-1') || chapter.title.length > 0)).toBe(true);
    expect(chapters.length).not.toBe(40);
  });
});

describe('helper-is-test-only', () => {
  it('is imported by no file outside *.test.* files', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    const importers = files.filter((f) => /renderScenario/.test(readFileSync(root + f, 'utf8')) && !f.endsWith('renderScenario.tsx'));
    expect(importers).toEqual([]);
  });
});
