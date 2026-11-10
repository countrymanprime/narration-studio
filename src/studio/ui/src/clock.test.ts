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
