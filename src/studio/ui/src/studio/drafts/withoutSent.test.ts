import { describe, expect, it } from 'vitest';
import { withoutSent } from './withoutSent';

describe('what is left in the box once the sent text is taken out', () => {
  it('is nothing when nothing was typed since', () => expect(withoutSent('once', 'once')).toBe(''));
  it('keeps text added at the end', () => expect(withoutSent('once MORE', 'once')).toBe(' MORE'));
  it('keeps text added at the start', () => expect(withoutSent('PRE once', 'once')).toBe('PRE '));
  it('keeps text added in the middle of what was sent being impossible: the sent text must still be whole', () =>
    expect(withoutSent('on-X-ce', 'once')).toBe('on-X-ce'));
  it('takes the sent text out from between two additions', () => expect(withoutSent('PRE once POST', 'once')).toBe('PRE  POST'));
});
