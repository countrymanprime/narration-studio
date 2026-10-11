import { describe, expect, it } from 'vitest';
import { formatClock, formatLength, formatPfh, formatRate, stageHoursHint } from './productionFormat';

describe('production figures', () => {
  it('writes hours and seconds as h:mm, rounding to the minute', () => {
    expect(formatClock(11 + 20 / 60, 'hours')).toBe('11:20');
    expect(formatClock(0.999, 'hours')).toBe('1:00');
    expect(formatClock(6720, 'seconds')).toBe('1:52');
    expect(formatClock(0, 'seconds')).toBe('0:00');
    expect(formatLength(708.4)).toBe('11:48');
  });

  it('shows an undefined PFH or rate as a dash, never 0 (ADR 0320)', () => {
    expect(formatPfh(null)).toBe('—');
    expect(formatPfh(6.123)).toBe('6.1');
    expect(formatRate(null)).toBe('—');
    expect(formatRate(1066.67)).toBe('1,067');
    expect(formatRate(0)).toBe('0');
  });

  it('names the logged hours by stage in pipeline order, leaving out a stage with none', () => {
    expect(stageHoursHint({ proofing: 1.75, recording: 5 + 40 / 60 })).toBe('record 5:40 · proof 1:45');
    expect(stageHoursHint({})).toBe('');
  });
});
