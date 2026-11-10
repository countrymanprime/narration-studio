import { describe, expect, it } from 'vitest';
import { formatCount, plural, pluralWord } from './plural';

describe('plural', () => {
  it('says one for exactly one and the many form for everything else, zero included', () => {
    expect([0, 1, 2].map((n) => plural(n, 'take'))).toEqual(['0 takes', '1 take', '2 takes']);
    expect(plural(-1, 'take')).toBe('-1 takes');
    expect(plural(1.5, 'hour')).toBe('1.5 hours');
  });
  it('takes an irregular many form', () => {
    expect(plural(1, 'punch', 'punches')).toBe('1 punch');
    expect(plural(2, 'punch', 'punches')).toBe('2 punches');
  });
  it('groups thousands the way every other count in the app is written', () => {
    expect(plural(1234, 'word')).toBe('1,234 words');
    expect(plural(1_000_000, 'word')).toBe('1,000,000 words');
  });
  it('reads 0 for a count the host did not send and never throws', () => {
    for (const bad of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
      expect(plural(bad as unknown as number, 'take')).toBe('0 takes');
    expect(plural(-0, 'take')).toBe('0 takes');
  });
  it('writes only the word when the sentence puts the count somewhere else', () => {
    expect([pluralWord(1, 'take'), pluralWord(3, 'take'), pluralWord(2, 'punch', 'punches')]).toEqual(['take', 'takes', 'punches']);
  });
});

describe('formatCount', () => {
  it('groups thousands and reads 0 for a count that is missing', () => {
    expect([0, 999, 1000, 5002, 7_995_521].map(formatCount)).toEqual(['0', '999', '1,000', '5,002', '7,995,521']);
    expect([Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number].map(formatCount)).toEqual(['0', '0', '0']);
  });
});
