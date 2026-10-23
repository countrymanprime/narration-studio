import { describe, expect, it } from 'vitest';
import type { VoiceSample } from '../../../api/contracts/voiceSamples';
import { markName, markState, sampleMarks } from './sampleMarks';

const sample = (
  id: string,
  over: Partial<VoiceSample> & { endKey?: string; chapterId?: string; state?: VoiceSample['source']['state'] } = {},
): VoiceSample => ({
  id,
  characterId: over.characterId ?? 'queen',
  label: over.label ?? '',
  note: '',
  primary: false,
  createdAt: '2026-10-17T09:30:00Z',
  durationMs: 6800,
  bytes: 1000,
  clipState: over.clipState ?? 'ok',
  source: {
    chapterId: over.chapterId ?? 'c1',
    chapterTitle: 'Chapter 1',
    text: 'Off with his head',
    startKey: 'p1:0',
    endKey: over.endKey ?? 'p1:3',
    state: over.state ?? 'ok',
  },
});
const list = (...samples: VoiceSample[]) => ({
  samples,
  totals: { count: samples.length, bytes: 0 },
  limits: { minSeconds: 0.5, maxSeconds: 30, perCharacter: 20, projectBytes: 1, labelUnits: 60, noteUnits: 500 },
});
const has =
  (...keys: string[]) =>
  (key: string) =>
    keys.includes(key);

describe('sampleMarks', () => {
  it('has-nothing-before-the-list-is-read: no list, no marks', () => {
    expect(sampleMarks(undefined, 'c1', has('p1:3'))).toEqual({ at: new Map(), moved: [] });
  });

  it('puts-a-sample-on-the-word-its-range-ends-with: and only for this chapter', () => {
    const marks = sampleMarks(list(sample('a'), sample('b', { chapterId: 'c2' })), 'c1', has('p1:3'));
    expect([...marks.at.keys()]).toEqual(['p1:3']);
    expect(marks.at.get('p1:3')?.map((s) => s.id)).toEqual(['a']);
    expect(marks.moved).toEqual([]);
  });

  it('keeps-the-hosts-order-when-two-samples-end-on-one-word', () => {
    const marks = sampleMarks(list(sample('first'), sample('second')), 'c1', has('p1:3'));
    expect(marks.at.get('p1:3')?.map((s) => s.id)).toEqual(['first', 'second']);
  });

  it('lists-a-sample-whose-word-is-gone-as-moved: the text changed under it', () => {
    const marks = sampleMarks(list(sample('a', { state: 'text_changed' })), 'c1', has('p9:0'));
    expect(marks.at.size).toBe(0);
    expect(marks.moved.map((s) => s.id)).toEqual(['a']);
  });

  it('draws-a-changed-sample-where-its-word-still-is', () => {
    const marks = sampleMarks(list(sample('a', { state: 'text_changed' })), 'c1', has('p1:3'));
    expect(marks.at.get('p1:3')?.map((s) => s.id)).toEqual(['a']);
    expect(marks.moved).toEqual([]);
  });
});

describe('markState', () => {
  it('is-the-worst-of-its-samples: a missing clip over a changed passage over fine', () => {
    expect(markState([sample('a')])).toBe('ok');
    expect(markState([sample('a'), sample('b', { state: 'text_changed' })])).toBe('changed');
    expect(markState([sample('a', { state: 'text_changed' }), sample('b', { clipState: 'missing' })])).toBe('missing');
    expect(markState([sample('a', { clipState: 'hash_changed' })])).toBe('missing');
  });
});

describe('markName', () => {
  const names = (id: string) => (id === 'queen' ? 'The Queen of Hearts' : id === 'narration' ? 'Narration' : undefined);
  it('names-one-sample-by-character-label-and-state', () => {
    expect(markName([sample('a', { label: 'Furious, to the court' })], names)).toBe('Voice sample: The Queen of Hearts, Furious, to the court');
    expect(markName([sample('a')], names)).toBe('Voice sample: The Queen of Hearts');
    expect(markName([sample('a', { state: 'text_changed' })], names)).toBe('Voice sample: The Queen of Hearts. The words changed since it was marked');
    expect(markName([sample('a', { clipState: 'missing' })], names)).toBe('Voice sample: The Queen of Hearts. The audio file is missing');
  });
  it('counts-several-and-says-a-gone-character-plainly', () => {
    expect(markName([sample('a'), sample('b')], names)).toBe('2 voice samples');
    expect(markName([sample('a', { characterId: 'ghost' })], names)).toBe('Voice sample: a character who is no longer in the Story Bible');
  });
});
