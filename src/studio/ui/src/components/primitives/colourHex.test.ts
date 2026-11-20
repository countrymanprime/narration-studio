// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isHexColour, isStoredHex, normaliseHex, toPickerValue } from './colourHex';

describe('normaliseHex', () => {
  it('trims, drops one leading # and writes capitals', () => {
    expect(normaliseHex('  #b5473c ')).toBe('B5473C');
    expect(normaliseHex('B5473C')).toBe('B5473C');
    expect(normaliseHex('')).toBe('');
  });

  it('keeps what is not a colour as typed, so the caller can refuse it', () => {
    expect(normaliseHex('zzz')).toBe('zzz');
    expect(normaliseHex(' rgb(1, 2, 3) ')).toBe('rgb(1, 2, 3)');
  });

  // R5 (#3680): the `#` was dropped and the rest kept, so tidying the result a second time trimmed it into a colour.
  it.each(['# abcdef', ' # abcdef', '##abcdef', '#\tabcdef', '#abc def', '# #abcdef'])('a hash, a space, six digits is not a colour: %j', (text) => {
    const once = normaliseHex(text);
    expect(isStoredHex(once)).toBe(false);
    expect(isHexColour(once)).toBe(false);
    expect(normaliseHex(once)).toBe(once);
    expect(toPickerValue(once)).toBe('#808080');
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

describe('isHexColour', () => {
  it.each(['B5473C', 'b5473c', '00ff7F'])('accepts %j as it stands', (value) => {
    expect(isHexColour(value)).toBe(true);
  });

  it.each(['', ' abcdef', 'abcdef ', '#abcdef', 'abcde', 'abcdefa', 'GGGGGG', 'Б5473C', 'ﬀﬀﬀ'])('refuses %j', (value) => {
    expect(isHexColour(value)).toBe(false);
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
