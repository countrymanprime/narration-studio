import { describe, expect, it } from 'vitest';
import { formatClock, formatPfh, formatRate, hoursText, stageHoursHint } from './productionFormat';
import { clock } from '../../clock';

describe('production figures', () => {
  it('writes hours and seconds as h:mm, rounding to the minute', () => {
    expect(formatClock(11 + 20 / 60, 'hours')).toBe('11h 20m');
    expect(formatClock(0.999, 'hours')).toBe('1h 00m');
    expect(formatClock(6720, 'seconds')).toBe('1h 52m');
    expect(formatClock(0, 'seconds')).toBe('0h 00m');
    expect(clock(708.4)).toBe('11:48');
  });

  it('shows an undefined PFH or rate as a dash, never 0', () => {
    expect(formatPfh(null)).toBe('—');
    expect(formatPfh(6.123)).toBe('6.1');
    expect(formatRate(null)).toBe('—');
    expect(formatRate(1066.67)).toBe('1,067');
    expect(formatRate(0)).toBe('0');
  });

  it('names the logged hours by stage in pipeline order, leaving out a stage with none', () => {
    expect(stageHoursHint({ proofing: 1.75, recording: 5 + 40 / 60 })).toBe('record 5h 40m · proof 1h 45m');
    expect(stageHoursHint({})).toBe('');
  });
});

// #3443: every hours column of the Production board is marked, so "0h 10m" is not read as ten seconds beside a length written "10:12".
describe('hours and minutes, marked', () => {
  it.each([
    [0, '0h 00m'],
    [10 / 60, '0h 10m'],
    [59.6 / 3600, '0h 01m'],
    [5 + 40 / 60, '5h 40m'],
    [11.999, '12h 00m'],
    [100.5, '100h 30m'],
    [-3, '0h 00m'],
  ])('%s hours reads %s', (hours, text) => expect(hoursText(hours)).toBe(text));
  it('keeps a length in seconds floored m:ss, so the two cannot be mistaken for each other (59.6 s reads 0:59)', () => {
    expect(clock(59.6)).toBe('0:59');
    expect(clock(612)).toBe('10:12');
    expect(formatClock(612, 'seconds')).toBe('0h 10m');
  });
});
