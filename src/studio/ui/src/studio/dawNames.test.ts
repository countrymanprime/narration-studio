import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { noAnswerSentence, notAskedSentence, recorderName, unreachedSentence } from './dawNames';

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
  // "did not answer in time" in any spelling with or without a subject (a name in JSX, concatenated or in a template string is a subject too), "the stop did not go through", and any way of saying a recorder could not be reached.
  // A `logUi(...)` call is the run log's, not the narrator's, so it is not scanned.
  const hand =
    /did(?:n't|n\u2019t|\s+not)\s+(?:answer|respond|reply)\s+in\s+time|\bthe\s+(?:stop|undo)\s+did(?:n't|n\u2019t|\s+not)\s+go\s+through|(?:could(?:n't|n\u2019t|\s+not)|cannot|can\s+not|can't|can\u2019t)\s+(?:be\s+reached|reach\b)|\bunreachable\b|\b(?:not|isn't|isn\u2019t|wasn't|wasn\u2019t)\s+reachable\b|\bunable\s+to\s+reach\b/i;
  const sayings = (file: string) => readFileSync(file, 'utf8').replace(/\blogUi\([^)]*\)/g, '');
  it('finds none outside the helper', () => {
    const hits = files(root).filter((f) => hand.test(sayings(f)));
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
      '<p>{name} did not answer in time.</p>',
      "name + ' did not answer in time.'",
      'The recorder did not answer in time',
      'the  stop did not answer in time',
      "REAPER couldn't be reached.",
      'REAPER cannot be reached.',
      'Could not reach REAPER.',
      'REAPER is unreachable.',
      'REAPER can not be reached.',
      'REAPER is not reachable.',
      "REAPER isn't reachable.",
      'REAPER wasn\u2019t reachable.',
      'Unable to reach REAPER.',
      'REAPER did not reply in time.',
    ])
      expect(hand.test(text), text).toBe(true);
    // The roll's and the meter's own sentences are different sentences.
    for (const text of ['REAPER did not answer the roll in time.', 'The built-in recorder did not answer in 3 s.']) expect(hand.test(text), text).toBe(false);
  });
});

describe('notAskedSentence', () => {
  it('names who was not asked, with a capital, and the reason', () => {
    expect(notAskedSentence('the DAW', new Error('bridge down'))).toBe('The DAW was not asked: bridge down');
    expect(notAskedSentence('REAPER', 'no socket')).toBe('REAPER was not asked: no socket');
    expect(notAskedSentence('the DAW', 'no socket', 'stop')).toBe('The DAW was not asked to stop: no socket');
  });
});
