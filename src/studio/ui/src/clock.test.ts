import { describe, expect, it } from 'vitest';
import { clock, clockTenths } from './clock';

describe('clock', () => {
  it('writes m:ss, and h:mm:ss from an hour', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(7)).toBe('0:07');
    expect(clock(425)).toBe('7:05');
    expect(clock(3599)).toBe('59:59');
    expect(clock(3600)).toBe('1:00:00');
    expect(clock(3725)).toBe('1:02:05');
    expect(clock(100 * 3600)).toBe('100:00:00');
  });
  it('floors, so a chapter reads the same length on every page', () => {
    expect(clock(708.4)).toBe('11:48');
    expect(clock(59.99)).toBe('0:59');
  });
  it('reads zero for negative, NaN and infinite input', () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(clock(bad)).toBe('0:00');
  });
  it('pads the minutes for the REC badge and the recording timer', () => {
    expect(clock(402, { minuteDigits: 2 })).toBe('06:42');
    expect(clock(3725, { minuteDigits: 2 })).toBe('1:02:05');
  });
  it('keeps the hours for an elapsed-time chip', () => {
    expect(clock(0, { hours: 'always' })).toBe('0:00:00');
    expect(clock(425, { hours: 'always' })).toBe('0:07:05');
  });
});

describe('clock, full', () => {
  it('writes hh:mm:ss.fff with a dot before the milliseconds', () => {
    expect(clock(0, { full: true })).toBe('00:00:00.000');
    expect(clock(7.25, { full: true })).toBe('00:00:07.250');
    expect(clock(65.3, { full: true })).toBe('00:01:05.300');
    expect(clock(425, { full: true })).toBe('00:07:05.000');
    expect(clock(3725.004, { full: true })).toBe('01:02:05.004');
    expect(clock(86399.999, { full: true })).toBe('23:59:59.999');
  });
  it('keeps every hour digit from a hundred hours', () => {
    expect(clock(100 * 3600 + 0.5, { full: true })).toBe('100:00:00.500');
  });
  it('floors to the millisecond, like every other reading, so it never shows a time that has not happened yet', () => {
    expect(clock(59.9996, { full: true })).toBe('00:00:59.999');
    expect(clock(3599.9999, { full: true })).toBe('00:59:59.999');
    expect(clock(0.0004, { full: true })).toBe('00:00:00.000');
    expect(clock(0.9999, { full: true })).toBe('00:00:00.999');
  });
  it('does not read a whole number of milliseconds one short for the double', () => {
    for (const ms of [65300, 5540, 12400, 31900, 8282, 3725004, 599999])
      expect(clock(ms / 1000, { full: true }).slice(-3)).toBe(String(ms % 1000).padStart(3, '0'));
  });
  it('agrees with the floored form: its minutes and seconds are the ones m:ss shows (59.6 s reads 0:59 and 00:00:59.600)', () => {
    for (const t of [0, 0.4, 59.6, 59.9996, 60, 61.2, 599.9996, 3599.9996, 3600, 3725.4, 86399.9996]) {
      const [h, m, s] = clock(t, { full: true }).split('.')[0].split(':').map(Number);
      expect(clock(t, { hours: 'always' }), `${t} s`).toBe(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }
    expect(clock(59.6)).toBe('0:59');
  });
  it('reads zero for negative, NaN and infinite input', () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(clock(bad, { full: true })).toBe('00:00:00.000');
  });
  it('caps a huge length instead of overflowing', () => {
    const capped = clock(1e9, { full: true });
    expect(capped).toBe('277777:46:40.000');
    for (const huge of [1e12, 1e300, Number.MAX_VALUE]) expect(clock(huge, { full: true })).toBe(capped);
  });
  it('overrides the other options and leaves the default forms alone', () => {
    expect(clock(402, { full: true, minuteDigits: 1, hours: 'always' })).toBe('00:06:42.000');
    expect(clock(425)).toBe('7:05');
    expect(clock(425, { hours: 'always' })).toBe('0:07:05');
  });
});

describe('clock, marked', () => {
  it('writes hours and minutes with their units, always', () => {
    expect(clock(0, { marked: true })).toBe('0h 00m');
    expect(clock(612, { marked: true })).toBe('0h 10m');
    expect(clock(5 * 3600 + 40 * 60, { marked: true })).toBe('5h 40m');
    expect(clock(100.5 * 3600, { marked: true })).toBe('100h 30m');
  });
  it('floors to the whole minute, like the default: 61 s to 119 s read 0h 01m, 120 s reads 0h 02m', () => {
    for (const [seconds, text] of [
      [61, '0h 01m'],
      [89, '0h 01m'],
      [90, '0h 01m'],
      [119, '0h 01m'],
      [119.9, '0h 01m'],
      [120, '0h 02m'],
    ] as const)
      expect(clock(seconds, { marked: true }), `${seconds} s`).toBe(text);
    expect(clock(59.6)).toBe('0:59');
  });
  it('reads "<0h 01m" under a minute, never "0h 01m" (and 0 reads 0h 00m)', () => {
    for (const seconds of [0.4, 1, 29, 59, 59.6, 59.9996]) expect(clock(seconds, { marked: true }), `${seconds} s`).toBe('<0h 01m');
    expect(clock(0, { marked: true })).toBe('0h 00m');
    expect(clock(60, { marked: true })).toBe('0h 01m');
  });
  it('does not read a whole number of minutes in hours one short for the double', () => {
    for (const minutes of [1, 7, 35, 59, 61, 275, 6042])
      expect(clock((minutes / 60) * 3600, { marked: true })).toBe(`${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`);
  });
  it('is capped at a billion seconds, like the full form', () => {
    expect(clock(1e21, { marked: true })).toBe(clock(1e9, { marked: true }));
    expect(clock(1e21, { marked: true })).toBe('277777h 46m');
  });
  it('reads zero for a value that is not a time', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(clock(bad, { marked: true })).toBe('0h 00m');
  });
});

describe('clockTenths', () => {
  it('writes m:ss.s', () => {
    expect(clockTenths(0)).toBe('0:00.0');
    expect(clockTenths(65.3)).toBe('1:05.3');
    expect(clockTenths(-1)).toBe('0:00.0');
    expect(clockTenths(Number.NaN)).toBe('0:00.0');
    expect(clockTenths(59.96)).toBe('1:00.0');
    expect(clockTenths(134.6, { minuteDigits: 2 })).toBe('02:14.6');
    expect(clockTenths(3600)).toBe('1:00:00.0');
    expect(clockTenths(3599.95)).toBe('1:00:00.0');
    expect(clockTenths(86400)).toBe('24:00:00.0');
    expect(clockTenths(3725.4, { decimals: 2 })).toBe('1:02:05.40');
    expect(clockTenths(5.54, { decimals: 2 })).toBe('0:05.54');
    expect(clockTenths(59.999, { decimals: 2 })).toBe('1:00.00');
    expect(clockTenths(1500.255, { decimals: 2 })).toBe('25:00.26');
  });
});
