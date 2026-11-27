import { describe, expect, it } from 'vitest';
import { textDirection } from '../../../../../visibleText';
import { quoteTerm } from './findState';

describe('quoteTerm (#4113)', () => {
  it('quotes a plain term as it was', () => {
    expect(quoteTerm('rabbit')).toBe('“rabbit”');
  });

  it('isolates a right-to-left search term inside its quotes, and the sentence round it reads left to right', () => {
    const AR = '\u0627\u0644\u0641\u0635\u0644'.repeat(5);
    const quoted = quoteTerm(AR);
    expect(quoted).toBe('“\u2068' + AR + '\u2069”');
    expect(textDirection(`Couldn't find ${quoted} in the script: not available`)).toBe('ltr');
  });
});
