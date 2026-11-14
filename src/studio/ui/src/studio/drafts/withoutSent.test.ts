import { describe, expect, it } from 'vitest';
import { withoutSent } from './withoutSent';

describe('what is left in the box once the sent text is taken out', () => {
  it('is nothing when nothing was typed since', () => expect(withoutSent('once', 'once')).toBe(''));
  it('keeps text added at the end', () => expect(withoutSent('once MORE', 'once')).toBe(' MORE'));
  it('keeps text added at the start', () => expect(withoutSent('PRE once', 'once')).toBe('PRE '));
  it('keeps everything when the sent text was edited inside', () => {
    expect(withoutSent('on-X-ce', 'once')).toBe('on-X-ce');
    expect(withoutSent('onc', 'once')).toBe('onc');
    expect(withoutSent('o#nce', 'once')).toBe('o#nce');
  });
  it('keeps everything when text was added on both sides, as it cannot tell which is the sent text', () =>
    expect(withoutSent('PRE once POST', 'once')).toBe('PRE once POST'));
  it('removes the sent text from where it was, not the first copy of it in what was typed', () => {
    expect(withoutSent('Not ok, ok', 'ok')).toBe('Not ok, ');
    expect(withoutSent('Oh yes yes yes', 'yes')).toBe('Oh yes yes ');
    expect(withoutSent('okok', 'ok')).toBe('ok');
  });
  it('is nothing when the same text was typed again', () => expect(withoutSent('once', 'once')).toBe(''));
});
