import { describe, expect, it } from 'vitest';
import { formatClock, formatPfh, formatRate, stageHoursHint } from './productionFormat';
import { hm, spokenHm } from '../schedule/dates';
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
  ])('%s hours reads %s', (hours, text) => expect(hm(hours)).toBe(text));
  it('keeps a length in seconds floored m:ss, so the two cannot be mistaken for each other (59.6 s reads 0:59)', () => {
    expect(clock(59.6)).toBe('0:59');
    expect(clock(612)).toBe('10:12');
    expect(formatClock(612, 'seconds')).toBe('0h 10m');
  });
});

// #3443: `hm` is the one hours formatter (Production and Schedule). It rounds to the nearest minute, as the Production figures always did, and reads zero for a value that is not a number.
describe('hm, the one hours formatter', () => {
  it('writes the Schedule figures with units too ("4h 35m", "0h 11m"), so a figure of hours is not read as minutes and seconds', () => {
    expect(hm(4 + 35 / 60)).toBe('4h 35m');
    expect(hm(11 / 60)).toBe('0h 11m');
  });
  it('rounds to the nearest minute: 59.6 s, 61 s and 89 s read 0h 01m, 90 s reads 0h 02m', () => {
    for (const [seconds, text] of [
      [59.6, '0h 01m'],
      [61, '0h 01m'],
      [89, '0h 01m'],
      [90, '0h 02m'],
      [29, '0h 00m'],
    ] as const)
      expect(hm(seconds / 3600), `${seconds} s`).toBe(text);
  });
  it('reads 0h 00m for negative, NaN and infinite input, never "NaNh"', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined as unknown as number]) expect(hm(bad)).toBe('0h 00m');
  });
});

describe('spokenHm, for an accessible name', () => {
  it.each([
    ['0h 10m', '10 minutes'],
    ['1h 00m', '1 hour'],
    ['1h 01m', '1 hour 1 minute'],
    ['5h 40m', '5 hours 40 minutes'],
    ['0h 00m', '0 minutes'],
    ['<0h 01m', 'less than a minute'],
    ['None yet', 'None yet'],
  ])('%s is spoken "%s"', (text, spoken) => expect(spokenHm(text)).toBe(spoken));
});
