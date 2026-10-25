import { describe, expect, it } from 'vitest';
import { calendarDay } from './calendarDay';

describe('calendarDay', () => {
  it('writes the day as "Jan 1, 2026" in local time, not as a locale or ISO date', () => {
    // Built in local time, so the day is the same in every time zone the suite runs in.
    expect(calendarDay(new Date(2026, 0, 1, 9, 30).toISOString())).toBe('Jan 1, 2026');
    expect(calendarDay(new Date(2026, 8, 21, 23, 59).toISOString())).toBe('Sep 21, 2026');
  });

  it('leaves a value that is not a date as it came', () => {
    expect(calendarDay('soon')).toBe('soon');
  });
});
