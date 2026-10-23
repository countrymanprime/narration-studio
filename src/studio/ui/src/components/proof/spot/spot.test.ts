import { describe, expect, it } from 'vitest';
import type { PassageTake, WorkspaceTakesResult } from '../../../api/contracts/workspace';
import golden from '../../../../../../tests/fixtures/contracts/workspace-takes.json';
import { heardMarkup, heardText, passageOf, spotOf, takeCounts } from './spot';

const candidate = (id: string, over: Partial<PassageTake> = {}): PassageTake => ({
  id,
  source: 'item_take',
  action: 'make_active',
  confirm: false,
  label: id,
  detail: '',
  active: false,
  itemGuid: 'g',
  takeGuid: id,
  sourceFile: `${id}.wav`,
  sourceStart: 1,
  sourceLength: 4,
  usable: true,
  compared: false,
  ...over,
});
const result = (candidates: PassageTake[]): WorkspaceTakesResult => ({
  chapterId: 'c1',
  firstToken: 0,
  lastToken: 4,
  firstParagraph: 0,
  lastParagraph: 0,
  words: 5,
  passageId: 'p1',
  itemGuid: 'g',
  candidates,
});

describe('spot-lists-takes-in-time-order-with-the-active-one', () => {
  it('labels the takes Take 1..n in the host order, marks the active and kept, and is null under two takes', () => {
    const spot = spotOf(result([candidate('a'), candidate('b', { active: true }), candidate('c', { usable: false, reason: 'No audio' })]), {
      script: 'one two',
      at: 12,
    });
    expect(spot?.takes.map((t) => [t.label, t.active, t.kept, t.hidden, t.start])).toEqual([
      ['Take 1', false, false, false, 12],
      ['Take 2', true, true, false, 12],
      ['Take 3', false, false, true, 12],
    ]);
    expect(spot?.takes[2].reason).toBe('No audio');
    expect(spotOf(result([candidate('a')]), { script: '', at: 0 })).toBeNull();
    expect(spotOf(result([]), { script: '', at: 0 })).toBeNull();
  });
});

describe('counts-only-where-several', () => {
  it('counts the notes whose spot has two or more takes', () => {
    const two = spotOf(result([candidate('a'), candidate('b')]), { script: '', at: 0 });
    expect(
      takeCounts(
        new Map([
          ['n1', two],
          ['n2', null],
        ]),
      ),
    ).toEqual(new Map([['n1', 2]]));
  });
});

describe('take-count-matches-the-editing-count', () => {
  it('lists the golden candidates in the order the Takes panel gets them', () => {
    const read = golden as unknown as WorkspaceTakesResult;
    const spot = spotOf(read, { script: '', at: 0 });
    expect(spot?.takes.map((t) => t.id)).toEqual(read.candidates.map((c) => c.id));
    expect(spot?.takes).toHaveLength(read.candidates.length);
  });
});

describe('passage and heard text', () => {
  const tokens = [
    { i: 0, p: 'h', w: 0, text: 'Title', status: 'heading' },
    { i: 1, p: 'p1', w: 0, text: 'I', status: 'read' },
    { i: 2, p: 'p1', w: 1, text: 'could', status: 'skip' },
    { i: 3, p: 'p1', w: 2, text: 'help', status: 'misread', heard: 'helped' },
    { i: 4, w: 0, text: 'x', status: 'read' },
  ] as const;
  it('finds a paragraph token range and the words heard in it', () => {
    expect(passageOf({ tokens: [...tokens] }, 'p1')).toEqual({ firstToken: 1, lastToken: 3 });
    expect(passageOf({ tokens: [...tokens] }, 'nope')).toBeUndefined();
    expect(passageOf({ tokens: [...tokens] }, undefined)).toBeUndefined();
    expect(heardText(tokens, 1, 3)).toBe('I helped');
  });
});

describe('heardMarkup', () => {
  it('strikes script words not said and marks words said that are not in the script', () => {
    expect(heardMarkup('I could not help it', 'I could not help myself')).toBe('I could not help <del>it</del> <ins>myself</ins>');
    expect(heardMarkup('a b', 'a b')).toBe('a b');
    expect(heardMarkup('a <b>', '')).toBe('<del>a</del> <del>&lt;b&gt;</del>');
  });
});
