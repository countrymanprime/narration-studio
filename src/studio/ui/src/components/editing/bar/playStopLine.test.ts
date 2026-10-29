import { describe, expect, it } from 'vitest';
import { playStopLine } from './playStopLine';

describe('playStopLine', () => {
  it('names the word, the alignment end, the planned and actual stop and the path', () => {
    expect(playStopLine({ word: { text: 'statues', end: 10.5 }, planned: 10.8, actual: 10.812, path: 'app' })).toBe(
      'word="statues" alignment_end=10.500 planned_stop=10.800 tail_ms=300 actual_stop=10.812 actual_minus_planned_ms=12 path=app',
    );
  });
  it('says unknown where the stop was not seen, and keeps a quote or a line break out of the line', () => {
    const line = playStopLine({ word: { text: 'a"b\nc', end: 1 }, planned: 1.1, actual: null, path: 'daw' });
    expect(line).toContain('word="a b c"');
    expect(line).toContain('actual_stop=unknown actual_minus_planned_ms=unknown path=daw');
  });
  it('strips what could break a log line: direction marks, line and paragraph separators, a trailing backslash', () => {
    const line = playStopLine({ word: { text: 'a\u202Eb\u2028c\u0085d\\', end: 1 }, planned: 1.1, actual: 1.1, path: 'app' });
    expect(line).toContain('word="a b c d "');
  });
  it('cuts a very long word so the numbers after it stay in the line', () => {
    const line = playStopLine({ word: { text: 'x'.repeat(5000), end: 1 }, planned: 1.1, actual: 1.1, path: 'app' });
    expect(line.length).toBeLessThan(400);
    expect(line).toContain('path=app');
  });
});
