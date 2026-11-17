import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { noAnswerSentence, recorderName, unreachedSentence } from './dawNames';

describe('noAnswerSentence', () => {
  it('names who did not answer, whoever records', () => {
    expect(noAnswerSentence(recorderName('REAPER'))).toBe('REAPER did not answer in time.');
    expect(noAnswerSentence(recorderName('Built-in'))).toBe('The built-in recorder did not answer in time.');
    expect(noAnswerSentence(recorderName(undefined))).toBe('The DAW did not answer in time.');
  });
});

describe('unreachedSentence', () => {
  it('names who could not be reached', () => {
    expect(unreachedSentence(recorderName('REAPER'))).toBe('REAPER could not be reached.');
    expect(unreachedSentence(recorderName('Built-in'))).toBe('The built-in recorder could not be reached.');
  });
});

describe('the Booth writes no "did not answer in time" sentence by hand', () => {
  // One source for one concept: a stop, an undo or a start that got no answer says `noAnswerSentence`, never "the stop did not answer in time" or "The DAW did not answer in time".
  const root = join(__dirname, '..', 'components', 'booth');
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.(test|stories)\./.test(e.name) ? [join(dir, e.name)] : [],
    );
  // A subject, a "did not answer in time" in any spelling, a template string in front of it, "the stop did not go through", and a hand-written "could not be reached".
  const hand =
    /(?:\b(?:the (?:stop|undo|start)|the daw|reaper|audacity|ableton|the built-in recorder)|\$\{[^}]*\})\s+did(?:n't|n\u2019t|\s+not)\s+(?:answer|respond)\s+in\s+time|\bthe\s+(?:stop|undo)\s+did(?:n't|n\u2019t|\s+not)\s+go\s+through|could\s+not\s+be\s+reached/i;
  it('finds none outside the helper', () => {
    const hits = files(root).filter((f) => hand.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('flags each way to write one by hand', () => {
    for (const text of [
      'the stop did not answer in time.',
      'The stop did not answer in time',
      '`${name} did not answer in time.`',
      "the undo didn't answer in time",
      'REAPER did  not\nanswer in time',
      'The built-in recorder did not respond in time',
      'Ableton did not answer in time',
      'The stop did not go through.',
      'REAPER could not be reached.',
    ])
      expect(hand.test(text), text).toBe(true);
    // The roll's and the meter's own sentences are different sentences.
    for (const text of ['REAPER did not answer the roll in time.', 'The built-in recorder did not answer in 3 s.']) expect(hand.test(text), text).toBe(false);
  });
});
