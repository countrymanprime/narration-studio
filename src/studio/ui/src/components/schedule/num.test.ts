import { describe, expect, it } from 'vitest';
import { num } from './dates';

// #3942 (qa): `num` is not `formatCount`. The Schedule's "Value at this rate" is amount x words / rate, so at a rate that rounds to 0 words per hour it is Infinity, and
// the page has to say so ("∞"), not "0", which reads as a contract worth nothing.
describe('num', () => {
  it('groups thousands', () => expect(num(2903)).toBe('2,903'));
  it('keeps an infinite value visible instead of reading 0', () => {
    expect(num(Infinity)).toBe('∞');
    expect(num(Infinity)).not.toBe('0');
  });
});
