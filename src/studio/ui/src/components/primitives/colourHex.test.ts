// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isStoredHex, normaliseHex, toPickerValue } from './colourHex';

describe('normaliseHex', () => {
  it('trims, drops one leading # and writes capitals', () => {
    expect(normaliseHex('  #b5473c ')).toBe('B5473C');
    expect(normaliseHex('B5473C')).toBe('B5473C');
    expect(normaliseHex('')).toBe('');
  });

  it('keeps what is not a colour as typed, so the caller can refuse it', () => {
    expect(normaliseHex('zzz')).toBe('zzz');
    expect(normaliseHex('##b5473c')).toBe('#b5473c');
  });

  // B8 (#3680): `'ﬀ'.toUpperCase()` is "FF", so three of the ligature read as white.
  it('a non-ASCII letter that upper-cases to hex digits is refused', () => {
    expect('ﬀﬀﬀ'.toUpperCase()).toBe('FFFFFF');
    expect(normaliseHex('ﬀﬀﬀ')).toBe('ﬀﬀﬀ');
    expect(isStoredHex(normaliseHex('ﬀﬀﬀ'))).toBe(false);
    expect(isStoredHex(normaliseHex('ﬀﬀﬀﬀﬀﬀ'))).toBe(false);
    expect(toPickerValue('ﬀﬀﬀ')).toBe('#808080');
    // Dotless and dotted i, and the long s, upper-case to ASCII letters in some locales or always; none is a hex digit either way.
    expect(isStoredHex(normaliseHex('ſſſſſſ'))).toBe(false);
  });
});

describe('isStoredHex', () => {
  it('accepts exactly six capital hex digits', () => {
    expect(isStoredHex('B5473C')).toBe(true);
    expect(isStoredHex('000000')).toBe(true);
  });

  it.each(['', 'b5473c', '#B5473C', 'B5473', 'B5473C0', 'B5473G', 'FFF', 'Б5473C'])('refuses %j', (text) => {
    expect(isStoredHex(text)).toBe(false);
  });
});

describe('toPickerValue', () => {
  it('writes a stored colour the way a colour input holds it', () => {
    expect(toPickerValue('B5473C')).toBe('#b5473c');
    // The host accepts either case, so a settings file may hold lower case.
    expect(toPickerValue('b5473c')).toBe('#b5473c');
  });

  it.each(['', 'B547', 'not a colour'])('shows mid grey for %j', (hex) => {
    expect(toPickerValue(hex)).toBe('#808080');
  });
});
