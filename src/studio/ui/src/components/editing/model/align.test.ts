import { describe, expect, it } from 'vitest';
import { alignToScript, type HeardWord } from './align';

const heard = (...words: string[]): HeardWord[] => words.map((text, k) => ({ text, off0: k, off1: k + 0.5, conf: 1 }));
const shape = (script: string[], said: string[]): string[] =>
  alignToScript(script, heard(...said)).map((op) =>
    op.kind === 'x' ? `x:${op.heard.text}@${op.heard.off0}` : `${op.st}:${script[op.i]}@${op.heard?.off0 ?? '-'}`,
  );

describe('a word said twice in a row (a misspoken word and its correction)', () => {
  it('keeps the last of them as the script word and flags the earlier one: the correction is the word that stays', () => {
    expect(shape(['go', 'to', 'the', 'back', 'door'], ['go', 'to', 'the', 'back', 'back', 'door'])).toEqual([
      'ok:go@0',
      'ok:to@1',
      'ok:the@2',
      'x:back@3',
      'ok:back@4',
      'ok:door@5',
    ]);
  });

  it('does the same at the start and the end of a line', () => {
    expect(shape(['back', 'door'], ['back', 'back', 'door'])).toEqual(['x:back@0', 'ok:back@1', 'ok:door@2']);
    expect(shape(['the', 'back'], ['the', 'back', 'back'])).toEqual(['ok:the@0', 'x:back@1', 'ok:back@2']);
  });

  it('keeps a word the script says twice as two words', () => {
    expect(shape(['very', 'very', 'good'], ['very', 'very', 'good'])).toEqual(['ok:very@0', 'ok:very@1', 'ok:good@2']);
  });

  it('flags the extra copies when a word is said three times', () => {
    expect(shape(['no', 'way'], ['no', 'no', 'no', 'way'])).toEqual(['x:no@0', 'x:no@1', 'ok:no@2', 'ok:way@3']);
  });

  it('still reads a misspoken attempt the recogniser wrote differently as an extra word before the right one', () => {
    expect(shape(['the', 'back', 'door'], ['the', 'bact', 'back', 'door'])).toEqual(['ok:the@0', 'x:bact@1', 'ok:back@2', 'ok:door@3']);
  });

  it('keeps the last copies of a word the script says more than once', () => {
    expect(shape(['no', 'no', 'no'], ['no', 'no', 'no', 'no', 'no'])).toEqual(['x:no@0', 'x:no@1', 'ok:no@2', 'ok:no@3', 'ok:no@4']);
    expect(shape(['very', 'very', 'good'], ['very', 'very', 'very', 'good'])).toEqual(['x:very@0', 'ok:very@1', 'ok:very@2', 'ok:good@3']);
  });
});
