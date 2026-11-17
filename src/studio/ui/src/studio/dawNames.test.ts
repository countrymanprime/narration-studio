import { describe, expect, it } from 'vitest';
import { noAnswerSentence, recorderName } from './dawNames';

describe('noAnswerSentence', () => {
  it('names who did not answer, whoever records', () => {
    expect(noAnswerSentence(recorderName('REAPER'))).toBe('REAPER did not answer in time.');
    expect(noAnswerSentence(recorderName('Built-in'))).toBe('The built-in recorder did not answer in time.');
    expect(noAnswerSentence(recorderName(undefined))).toBe('The DAW did not answer in time.');
  });
});
