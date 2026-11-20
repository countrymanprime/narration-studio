import { describe, expect, it } from 'vitest';
import { describeNumberRange, numberProblem, snapToStep, wholeNumberRange } from './numberSetting';

const PEAK = { min: -60, max: 0, step: 0.1, unit: 'dBTP' };
const COUNT = { min: 0, max: null, step: 1, unit: 'words' };
const FREE = { min: null, max: null, step: null, unit: '' };

describe('numberProblem', () => {
  it('accepts a plain decimal in range and on step, and empty text (not set)', () => {
    for (const text of ['-3.5', '-60', '0', '-0.1', '-2.3', '']) expect(numberProblem(PEAK, text)).toBeUndefined();
    expect(numberProblem(COUNT, '3')).toBeUndefined();
    expect(numberProblem(FREE, '123456.789')).toBeUndefined();
  });

  it('refuses what the host refuses: words, units, exponents, spaces, a plus sign, a comma decimal', () => {
    for (const text of ['loud', '-3 dB', '-3e0', ' -3', '+1', '-3,5', 'Infinity', 'NaN', '-']) {
      expect(numberProblem(PEAK, text)).toBe('Enter a number, like -3 or 0.5.');
    }
  });

  it('names the range, with its unit, for a value outside it', () => {
    expect(numberProblem(PEAK, '0.5')).toBe('Enter a value from -60 to 0 dBTP.');
    expect(numberProblem(COUNT, '-1')).toBe('Enter a value at least 0 words.');
  });

  it('names the step for a value between steps', () => {
    expect(numberProblem(PEAK, '-3.25')).toBe('Use steps of 0.1.');
    expect(numberProblem(COUNT, '2.5')).toBe('Use steps of 1.');
  });
});

describe('describeNumberRange', () => {
  it('describes each shape of range, and nothing for an unbounded one', () => {
    expect(describeNumberRange(PEAK)).toBe('From -60 to 0 dBTP');
    expect(describeNumberRange(COUNT)).toBe('At least 0 words');
    expect(describeNumberRange({ ...FREE, max: 1 })).toBe('At most 1');
    expect(describeNumberRange(FREE)).toBe('');
  });
});

describe('snapToStep', () => {
  it('leaves a value on step and in range as it is', () => {
    expect(snapToStep(PEAK, -3.5)).toBe(-3.5);
    expect(snapToStep(COUNT, 3)).toBe(3);
    expect(snapToStep(FREE, 123456.789)).toBe(123456.789);
  });

  it('clamps to the range', () => {
    expect(snapToStep(PEAK, 4)).toBe(0);
    expect(snapToStep(PEAK, -99)).toBe(-60);
    expect(snapToStep(COUNT, -1)).toBe(0);
  });

  it('moves a value between steps to the nearest one, a half step up, without float drift', () => {
    expect(snapToStep({ min: 0, max: null, step: 0.1, unit: 's' }, 0.15)).toBe(0.2);
    expect(snapToStep({ min: 0, max: null, step: 0.1, unit: 's' }, 0.14)).toBe(0.1);
    expect(snapToStep({ min: 0, max: null, step: 0.1, unit: 's' }, 0.30000000000000004)).toBe(0.3);
    expect(snapToStep(COUNT, 2.4)).toBe(2);
  });

  it('counts steps from the minimum, as the host does, and from 0 without one', () => {
    const fromMin = { min: 0.1, max: null, step: 0.5, unit: 'dB' };
    expect(snapToStep(fromMin, 1)).toBe(1.1);
    expect(snapToStep(fromMin, 0.7)).toBe(0.6);
    expect(snapToStep({ min: null, max: null, step: 5, unit: '' }, -7)).toBe(-5);
  });

  it('stays under a maximum that is between steps', () => {
    expect(snapToStep({ min: 0, max: 10, step: 4, unit: '' }, 10)).toBe(8);
  });

  it('gives only values the host check accepts', () => {
    const ranges = [PEAK, COUNT, { min: 0.1, max: null, step: 0.5, unit: 'dB' }, { min: 0.01, max: 5, step: 0.01, unit: 's' }];
    for (const range of ranges) {
      for (const n of [-80, -3.14159, 0, 0.005, 0.15, 1.2345, 4.999, 77.7]) {
        expect(numberProblem(range, String(snapToStep(range, n))), `${JSON.stringify(range)} ${n}`).toBeUndefined();
      }
    }
  });
});

describe('wholeNumberRange', () => {
  it('spans a list of consecutive whole numbers in steps of one, with the unit it is given', () => {
    expect(wholeNumberRange(['0', '1', '2', '3'], 's')).toEqual({ min: 0, max: 3, step: 1, unit: 's' });
    expect(wholeNumberRange(['-1', '0', '1'])).toEqual({ min: -1, max: 1, step: 1, unit: '' });
  });

  it.each([
    ['a gap', ['0', '1', '3']],
    ['numbers out of order', ['1', '0', '2']],
    ['a fraction', ['0', '0.5', '1']],
    ['a word', ['0', '1', 'abc']],
    ['an empty value', ['', '0', '1']],
    ['one value', ['4']],
    ['nothing', []],
  ])('is undefined for %s', (_name, choices) => {
    expect(wholeNumberRange(choices)).toBeUndefined();
  });
});
