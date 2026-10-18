import { describe, expect, it } from 'vitest';
import { buildDoc, findingWords, type Aligner, type ScriptParagraph } from '.';

const TEXT = 'The White Rabbit ran. The white rabbit, again.';
const paragraph: ScriptParagraph = { id: 'p-1', text: TEXT, units: [{ key: 'u0@0', s: 0, e: TEXT.length }] };
const untranscribed: Aligner = { engine: () => ({ id: 'none', name: 'none' }), snap: (sec) => sec, heard: () => null };
const doc = buildDoc({ paragraphs: [paragraph], aligner: untranscribed, cuts: [], effects: [], accepted: [] });

describe('findingWords', () => {
  it('names the words of the expected text, ignoring case and punctuation', () => {
    expect(findingWords(doc, 'p-1', 'White Rabbit')).toEqual(['p-1:1', 'p-1:2']);
  });
  it('takes the ordinal-th match when the text repeats in the paragraph', () => {
    expect(findingWords(doc, 'p-1', 'white rabbit', 1)).toEqual(['p-1:5', 'p-1:6']);
  });
  it('is empty for a paragraph, a text or an ordinal that is not there', () => {
    expect(findingWords(doc, 'nope', 'White Rabbit')).toEqual([]);
    expect(findingWords(doc, 'p-1', 'purple elephant')).toEqual([]);
    expect(findingWords(doc, 'p-1', 'white rabbit', 5)).toEqual([]);
    expect(findingWords(doc, 'p-1', '  ')).toEqual([]);
  });
});
