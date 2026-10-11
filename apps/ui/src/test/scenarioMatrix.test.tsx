// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useApi } from '../api/ApiContext';
import { chapterName } from '../chapterName';
import { ScriptChapterList } from '../components/script/ScriptChapterList';
import type { ManuscriptChapter } from '../types';
import { CHAPTER_SHAPES } from '../fixtures/chapters';
import { renderScenario } from '../fixtures/renderScenario';
import { makeScenario, SCENARIO_SIZES } from '../fixtures/scenario';

afterEach(cleanup);

// The page lists what the manuscript port answers, as Script does.
function ChaptersFromPort() {
  const api = useApi();
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  useEffect(() => void api.manuscriptChapters().then(setChapters), [api]);
  return <ScriptChapterList chapters={chapters} toConfirm={new Map()} select={() => {}} />;
}

const cases = CHAPTER_SHAPES.flatMap((shape) => SCENARIO_SIZES.map((chapters) => ({ shape, chapters })));

describe('matrix-renders-one-page-in-every-scenario', () => {
  it.each(cases)('$shape, $chapters chapters', async ({ shape, chapters: count }) => {
    const scenario = makeScenario({ shape, chapters: count });
    renderScenario(scenario, <ChaptersFromPort />);
    const [first] = scenario.chapters;
    const last = scenario.chapters[count - 1];
    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(count));
    const titles = screen.getAllByRole('button').map((button) => button.getAttribute('title'));
    expect(titles[0]).toBe(chapterName(first, 'full'));
    expect(titles[count - 1]).toBe(chapterName(last, 'full'));
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('\n');
    if (shape === 'titleOnly') {
      for (const other of makeScenario({ shape: 'titleAndSubtitle', chapters: count }).chapters) {
        expect(text).not.toContain(other.subtitle);
      }
    }
    if (shape === 'legacyNewline') {
      const [, subtitle] = first.title.split('\n');
      expect(text).toContain(subtitle);
      expect(titles[0]).not.toContain('\n');
    }
  });
});
