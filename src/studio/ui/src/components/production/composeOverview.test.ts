// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { ProductionChapterNumbers, ProductionOverview } from '../../api/contracts/production';
import { composeOverview } from './composeOverview';

const own = (id: string, hoursLogged: number): ProductionChapterNumbers => ({
  id,
  hoursLogged,
  pfh: 2,
  readiness: null,
});
const listed = (id: string, title: string, index: number, extra: Partial<ManuscriptChapter> = {}): ManuscriptChapter => ({
  id,
  title,
  index,
  wordCount: 120,
  status: 'recording',
  contentKind: 'narration',
  ...extra,
});
const overview = (chapters: ProductionChapterNumbers[]): ProductionOverview =>
  ({
    chapters,
    totals: {},
    deadline: null,
    running: null,
  }) as unknown as ProductionOverview;

describe('composeOverview (#4058): one list of chapters on every page', () => {
  it('takes names, order, status and words from the shared list, and the numbers from the overview by id', () => {
    const composed = composeOverview(overview([own('c2', 3), own('c1', 5)]), [listed('c1', 'Renamed one', 0), listed('c2', 'Two', 1)]);
    expect(composed.chapters.map((c) => [c.id, c.title, c.status, c.wordCount, c.hoursLogged, c.pfh])).toEqual([
      ['c1', 'Renamed one', 'recording', 120, 5, 2],
      ['c2', 'Two', 'recording', 120, 3, 2],
    ]);
  });

  it('a chapter the list has and the overview has not is a row with no numbers', () => {
    const composed = composeOverview(overview([]), [listed('c9', 'New', 0)]);
    expect(composed.chapters).toEqual([expect.objectContaining({ id: 'c9', hoursLogged: 0, pfh: null, readiness: null })]);
  });

  it('a chapter the overview has and the list has not is not drawn', () => {
    expect(composeOverview(overview([own('gone', 1)]), []).chapters).toEqual([]);
  });

  it('recorded audio and credits kind come from the list', () => {
    const composed = composeOverview(overview([own('c1', 0)]), [listed('c1', 'x', 0, { recordedSeconds: 42, contentKind: undefined })]);
    expect(composed.chapters[0]).toMatchObject({ recordedSeconds: 42, contentKind: '' });
  });
});
