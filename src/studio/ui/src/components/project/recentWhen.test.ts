import { describe, expect, it } from 'vitest';
import { recentWhen } from './recentWhen';

// Local-time stamps with no zone, so the day a stamp falls on does not depend on where the tests run.
const NOW = new Date('2026-10-18T12:00:00');

describe('recentWhen', () => {
  it('says Today for a time on the same day, whatever the hour', () => {
    expect(recentWhen('2026-10-18T00:05:00', NOW)).toBe('Today');
    expect(recentWhen('2026-10-18T23:59:00', NOW)).toBe('Today');
  });

  it('says Yesterday for the day before', () => {
    expect(recentWhen('2026-10-17T23:59:00', NOW)).toBe('Yesterday');
  });

  it('gives the day and short month for an earlier date this year', () => {
    expect(recentWhen('2026-09-23T09:00:00', NOW)).toBe('23 Sep');
    expect(recentWhen('2026-01-02T09:00:00', NOW)).toBe('2 Jan');
  });

  it('adds the year for a date in another year', () => {
    expect(recentWhen('2025-09-23T09:00:00', NOW)).toBe('23 Sep 2025');
  });

  it('draws nothing for a stamp it cannot read, and for one in the future it still gives the date', () => {
    expect(recentWhen('', NOW)).toBe('');
    expect(recentWhen('not a date', NOW)).toBe('');
    expect(recentWhen('2026-10-20T09:00:00', NOW)).toBe('20 Oct');
  });
});
