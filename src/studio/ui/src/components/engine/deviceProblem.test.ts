import { describe, expect, it } from 'vitest';
import { textDirection } from '../../visibleText';
import { deviceProblem } from './outputPrefs';

describe('deviceProblem (#4113)', () => {
  it('says a plain device name as it was', () => {
    expect(deviceProblem('Speakers')).toBe('Could not play on Speakers. Playing on the system default until it is back.');
  });

  it('isolates a right-to-left output device name and reads left to right', () => {
    const AR = '\u0627\u0644\u0641\u0635\u0644'.repeat(6);
    const text = deviceProblem(AR);
    expect(text).toBe('Could not play on \u2068' + AR + '\u2069. Playing on the system default until it is back.');
    expect(textDirection(text)).toBe('ltr');
  });
});
