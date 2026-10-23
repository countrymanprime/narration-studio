import { describe, expect, it } from 'vitest';
import type { Finding } from '../../../api/contracts/findings';
import { buildDoc, type Aligner, type ScriptParagraph } from '../model';
import { findingsAt } from './findingLink';

const TEXT = 'The White Rabbit ran. The white rabbit, again.';
const paragraph: ScriptParagraph = { id: 'p-1', text: TEXT, units: [{ key: 'u0@0', s: 0, e: TEXT.length }] };
const untranscribed: Aligner = { engine: () => ({ id: 'none', name: 'none' }), snap: (sec) => sec, heard: () => null };
const doc = buildDoc({ paragraphs: [paragraph], aligner: untranscribed, cuts: [], effects: [], accepted: [] });

const note = (id: string, over: Partial<Finding> & { expected?: string; ordinal?: number; pid?: string; chapter?: string } = {}): Finding => {
  const { expected = 'White Rabbit', ordinal, pid = 'p-1', chapter = 'c1', ...rest } = over;
  return {
    schema_version: 1,
    id,
    analyzer: 'transcript-compare',
    project: {},
    source: {},
    category: 'transcript_discrepancy',
    severity: 'warning',
    confidence: 0.9,
    confidence_reason: '',
    evidence_version: `v-${id}`,
    manuscript: { chapter_id: chapter, expected, span: { paragraph_id: pid, ...(ordinal !== undefined ? { ordinal } : {}) } },
    review: { status: 'unreviewed' },
    ...rest,
  };
};

describe('findings-at-the-flagged-words', () => {
  it('finds the note whose script words overlap the flagged words', () => {
    const found = findingsAt(doc, 'c1', [note('a'), note('b', { ordinal: 1 })], ['p-1:2']);
    expect(found.map((f) => f.id)).toEqual(['a']);
  });

  it('tells a repeat apart by its ordinal', () => {
    expect(findingsAt(doc, 'c1', [note('a'), note('b', { ordinal: 1 })], ['p-1:5']).map((f) => f.id)).toEqual(['b']);
  });

  it('leaves out another chapter, another paragraph, words not in the script and other kinds of finding', () => {
    const others = [
      note('ch', { chapter: 'c2' }),
      note('para', { pid: 'p-2' }),
      note('gone', { expected: 'purple elephant' }),
      note('extra', { expected: '' }),
      note('entity', { category: 'entity' }),
    ];
    expect(findingsAt(doc, 'c1', others, ['p-1:1', 'p-1:2'])).toEqual([]);
  });

  it('keeps a recording-check pickup finding', () => {
    expect(findingsAt(doc, 'c1', [note('gap', { analyzer: 'recording-check', category: 'pickup' })], ['p-1:1']).map((f) => f.id)).toEqual(['gap']);
  });

  it('finds nothing for no keys', () => {
    expect(findingsAt(doc, 'c1', [note('a')], [])).toEqual([]);
  });
});
