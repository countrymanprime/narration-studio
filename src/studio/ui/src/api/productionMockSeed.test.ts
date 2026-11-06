import { describe, expect, it } from 'vitest';
import { reached } from '../chapterStatus';
import { createMockApi } from './mockApi';
import { WIRE_TICKED_CHAPTER_LINKS } from './mockFixtures';
import { PRODUCTION_SCENARIOS, scenarioFromToday } from './productionMock';

// The `?mockProduction=` scenarios are dated against the mock's day (2026-09-26). `scenarioFromToday` moves them to the real day so the
// seeds do not age into "behind" and "-14 days left".
describe('scenarioFromToday', () => {
  it('leaves the scenario alone on the mock day', () => {
    expect(scenarioFromToday('on-pace', new Date(2026, 8, 26, 23, 59))).toBe(PRODUCTION_SCENARIOS['on-pace']);
  });

  it.each([
    ['a month on', new Date(2026, 9, 26)],
    ['across a year end', new Date(2027, 0, 3)],
    ['a leap day', new Date(2028, 1, 29)],
    ['before the mock day', new Date(2026, 8, 1)],
  ])('keeps the days left and the logged days the same %s', async (_, now) => {
    for (const name of ['on-pace', 'at-risk'] as const) {
      const base = createMockApi({}, { production: PRODUCTION_SCENARIOS[name] });
      const moved = createMockApi({}, { production: scenarioFromToday(name, now) });
      const [a, b] = await Promise.all([base.productionOverview(), moved.productionOverview()]);
      expect(b.deadline?.daysLeft).toBe(a.deadline?.daysLeft);
      expect(b.deadline?.date).not.toBe(a.deadline?.date);
      expect(b.totals.hoursLogged).toBe(a.totals.hoursLogged);
      const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
      expect(scenarioFromToday(name, now).shiftDays ?? 0).toBe(days(a.deadline!.date, b.deadline!.date));
    }
  });
});

describe('the linked scenario', () => {
  it('measures every linked chapter with no stage moved on, and names why the rest have no length', async () => {
    const api = createMockApi({}, { production: PRODUCTION_SCENARIOS.linked });
    const { chapters, totals } = await api.productionOverview();
    const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    expect(chapters.every((chapter) => chapter.status === 'not_started')).toBe(true);
    expect(byId.get('chapter-1')?.recordedSeconds).toBe(790);
    expect(byId.get('chapter-7')?.recordedSeconds).toBe(0);
    expect(byId.get('chapter-9')).toMatchObject({ recordedSeconds: null, recordedUnavailable: 'unlinked' });
    expect(byId.get('chapter-10')).toMatchObject({ recordedSeconds: null, recordedUnavailable: 'multiple_tracks' });
    expect(byId.get('chapter-11')).toMatchObject({ recordedSeconds: null, recordedUnavailable: 'track_missing' });
    expect(byId.get('chapter-12')).toMatchObject({ recordedSeconds: null, recordedUnavailable: 'no_project' });
    expect(totals.recordedSeconds).toBe(790 + 725 + 640 + 512 + 311 + 45);
    expect(totals.measuredChapters).toBe(8);
  });
});

describe('the default mock project', () => {
  it('gives every chapter whose Record stage is ticked a linked track and a measured length (#2634)', async () => {
    const api = createMockApi({}, { chapterTrackMappings: WIRE_TICKED_CHAPTER_LINKS });
    const { chapters } = await api.productionOverview();
    const ticked = chapters.filter((chapter) => reached(chapter.status, 'editing'));
    expect(ticked.map((chapter) => chapter.id)).toEqual(['chapter-1', 'chapter-2', 'chapter-3', 'chapter-7', 'chapter-8', 'chapter-9', 'chapter-10']);
    for (const chapter of ticked) {
      expect(chapter.recordedUnavailable, chapter.id).toBeUndefined();
      expect(chapter.recordedSeconds, chapter.id).toBeGreaterThan(60);
    }
    const unticked = chapters.filter((chapter) => !reached(chapter.status, 'editing'));
    expect(unticked.every((chapter) => chapter.recordedUnavailable === 'unlinked')).toBe(true);
  });
});
