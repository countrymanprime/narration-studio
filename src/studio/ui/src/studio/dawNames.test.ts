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
  it('finds none outside the helper', () => {
    const hand =
      /\b(?:the (?:stop|undo|start)|The DAW|the DAW|REAPER|Audacity|the built-in recorder) did not answer in time|\bthe (?:stop|undo) did not go through\./;
    const hits = files(root).filter((f) => hand.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
