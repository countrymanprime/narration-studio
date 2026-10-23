// The state matrix (definition of done, rule 3) for the selection-to-range model, written before the code. The control is a pure function of the
// chapter's alignment answer and the selected keys; the dialog that shows its answer has its own matrix (voiceSample.test.tsx).
//
//   empty (no keys)                'asks for a selection first'
//   one word, many words           'one heard word', 'words across paragraphs of one item'
//   huge                           'a whole chapter selection is one range' (the host refuses it as too long: the model does not count seconds)
//   refused                        'only unheard words', 'two items', 'a check that is not current', 'an item the saved project no longer has'
//   stale                          'a stale check', 'a current check with no record id'
//   words not in the script        'a said word that is not in the script is left out'
//   unheard ends                   'the range starts and ends on heard words'
//   misread                        'a misread word is heard'
//   retakes out of order           'times are the earliest start and the latest end of one item'
//   right-to-left and emoji        'words in any script reach the text as given'
//   heading tokens                 'a heading token has no paragraph and is not a script word'
//   rapid double-fire, reload,
//   leave mid-action, the DAW      not tested: a pure function holds no state and talks to nothing
import { describe, expect, it } from 'vitest';
import type { WorkspaceAlignmentResult, WorkspaceItem, WorkspaceToken } from '../../../api/contracts/workspace';
import { VOICE_SAMPLE_SENTENCES } from '../../../api/contracts/voiceSamples';
import { voiceSampleRange } from './voiceSampleRange';

const item = (index: number, extra: Partial<WorkspaceItem> = {}): WorkspaceItem => ({
  index,
  itemGuid: `{ITEM-${index}}`,
  live: true,
  takeGuid: `{TAKE-${index}}`,
  ...extra,
});
let at = 0;
const heard = (p: string, w: number, text: string, start: number, end: number, itemIndex = 0, status: WorkspaceToken['status'] = 'read'): WorkspaceToken => ({
  i: at++,
  p,
  w,
  text,
  status,
  item: itemIndex,
  start,
  end,
});
const missing = (p: string, w: number, text: string): WorkspaceToken => ({ i: at++, p, w, text, status: 'skip' });
const align = (tokens: WorkspaceToken[], over: Partial<WorkspaceAlignmentResult> = {}): WorkspaceAlignmentResult => ({
  chapterId: 'c-0001',
  state: 'current',
  reasons: [],
  needsAlignAgain: false,
  paragraphs: [{ id: 'p-1', text: '' }],
  tokens,
  extras: [],
  items: [item(0), item(1)],
  recordId: 'record-7',
  ...over,
});
const tokensOf = (): WorkspaceToken[] => {
  at = 0;
  return [heard('p-1', 0, 'Off', 1, 1.4), heard('p-1', 1, 'with', 1.4, 1.7), heard('p-1', 2, 'his', 1.7, 2), heard('p-1', 3, 'head!', 2, 2.6)];
};

describe('voiceSampleRange', () => {
  it('asks for a selection first', () => {
    expect(voiceSampleRange(align(tokensOf()), [])).toEqual({ ok: false, reason: 'nothing_selected', message: 'Select the words first.' });
  });

  it('one heard word', () => {
    expect(voiceSampleRange(align(tokensOf()), ['p-1:3'])).toEqual({
      ok: true,
      range: {
        chapterId: 'c-0001',
        itemGuid: '{ITEM-0}',
        takeGuid: '{TAKE-0}',
        sourceStart: 2,
        sourceEnd: 2.6,
        startKey: 'p-1:3',
        endKey: 'p-1:3',
        words: 'head!',
        alignmentRecordId: 'record-7',
      },
    });
  });

  it('words across paragraphs of one item', () => {
    at = 0;
    const tokens = [heard('p-1', 0, 'Off', 1, 1.4), heard('p-1', 1, 'with', 1.4, 1.7), heard('p-2', 0, 'I', 4, 4.2), heard('p-2', 1, 'say', 4.2, 4.6)];
    const result = voiceSampleRange(align(tokens), ['p-1:1', 'p-2:0', 'p-2:1']);
    expect(result).toMatchObject({ ok: true, range: { sourceStart: 1.4, sourceEnd: 4.6, startKey: 'p-1:1', endKey: 'p-2:1', words: 'with I say' } });
  });

  it('a whole chapter selection is one range', () => {
    const result = voiceSampleRange(align(tokensOf()), ['p-1:0', 'p-1:1', 'p-1:2', 'p-1:3']);
    expect(result).toMatchObject({ ok: true, range: { sourceStart: 1, sourceEnd: 2.6, words: 'Off with his head!' } });
  });

  it('the range starts and ends on heard words', () => {
    at = 0;
    const tokens = [
      missing('p-1', 0, 'Off'),
      heard('p-1', 1, 'with', 1.4, 1.7),
      missing('p-1', 2, 'his'),
      heard('p-1', 3, 'head!', 2, 2.6),
      missing('p-1', 4, 'now'),
    ];
    const result = voiceSampleRange(align(tokens), ['p-1:0', 'p-1:1', 'p-1:2', 'p-1:3', 'p-1:4']);
    expect(result).toMatchObject({ ok: true, range: { startKey: 'p-1:1', endKey: 'p-1:3', sourceStart: 1.4, sourceEnd: 2.6, words: 'with his head!' } });
  });

  it('a said word that is not in the script is left out', () => {
    const result = voiceSampleRange(align(tokensOf()), ['p-1:x0', 'p-1:0', 'p-1:x1']);
    expect(result).toMatchObject({ ok: true, range: { startKey: 'p-1:0', endKey: 'p-1:0', words: 'Off' } });
    expect(voiceSampleRange(align(tokensOf()), ['p-1:x0'])).toMatchObject({ ok: false, reason: 'not_heard' });
  });

  it('a misread word is heard', () => {
    at = 0;
    const tokens = [heard('p-1', 0, 'Off', 1, 1.4, 0, 'misread')];
    expect(voiceSampleRange(align(tokens), ['p-1:0'])).toMatchObject({ ok: true, range: { sourceStart: 1, sourceEnd: 1.4 } });
  });

  it('a heading token has no paragraph and is not a script word', () => {
    at = 0;
    const tokens: WorkspaceToken[] = [{ i: at++, w: 0, text: 'Chapter', status: 'heading', item: 0, start: 0, end: 0.5 }, heard('p-1', 0, 'Off', 1, 1.4)];
    expect(voiceSampleRange(align(tokens), ['p-1:0'])).toMatchObject({ ok: true, range: { words: 'Off' } });
  });

  it('only unheard words', () => {
    at = 0;
    const tokens = [missing('p-1', 0, 'Off'), missing('p-1', 1, 'with')];
    expect(voiceSampleRange(align(tokens), ['p-1:0', 'p-1:1'])).toEqual({ ok: false, reason: 'not_heard', message: VOICE_SAMPLE_SENTENCES.not_heard });
    expect(voiceSampleRange(align(tokensOf()), ['p-9:9'])).toMatchObject({ ok: false, reason: 'not_heard' });
  });

  it('two items', () => {
    at = 0;
    const tokens = [heard('p-1', 0, 'Off', 1, 1.4, 0), heard('p-1', 1, 'with', 9, 9.4, 1)];
    expect(voiceSampleRange(align(tokens), ['p-1:0', 'p-1:1'])).toEqual({ ok: false, reason: 'spans_takes', message: VOICE_SAMPLE_SENTENCES.spans_takes });
  });

  it('times are the earliest start and the latest end of one item', () => {
    at = 0;
    const tokens = [heard('p-1', 0, 'Off', 5, 5.4), heard('p-1', 1, 'with', 3, 3.3), heard('p-1', 2, 'his', 4, 4.2)];
    expect(voiceSampleRange(align(tokens), ['p-1:0', 'p-1:1', 'p-1:2'])).toMatchObject({ ok: true, range: { sourceStart: 3, sourceEnd: 5.4 } });
  });

  it('a stale check', () => {
    expect(voiceSampleRange(align(tokensOf(), { state: 'stale' }), ['p-1:0'])).toEqual({
      ok: false,
      reason: 'stale_alignment',
      message: VOICE_SAMPLE_SENTENCES.stale_alignment,
    });
  });

  it('a check that is not current', () => {
    expect(voiceSampleRange(align([], { state: 'never', recordId: undefined }), ['p-1:0'])).toMatchObject({ ok: false, reason: 'not_heard' });
    expect(voiceSampleRange(align(tokensOf(), { needsAlignAgain: true, tokens: [] }), ['p-1:0'])).toMatchObject({ ok: false, reason: 'not_heard' });
  });

  it('a current check with no record id', () => {
    expect(voiceSampleRange(align(tokensOf(), { recordId: undefined }), ['p-1:0'])).toMatchObject({ ok: false, reason: 'stale_alignment' });
  });

  it('an item the saved project no longer has', () => {
    expect(voiceSampleRange(align(tokensOf(), { items: [item(0, { live: false, takeGuid: undefined })] }), ['p-1:0'])).toMatchObject({
      ok: false,
      reason: 'stale_alignment',
    });
    expect(voiceSampleRange(align(tokensOf(), { items: [item(0, { takeGuid: undefined })] }), ['p-1:0'])).toMatchObject({
      ok: false,
      reason: 'stale_alignment',
    });
    expect(voiceSampleRange(align(tokensOf(), { items: [] }), ['p-1:0'])).toMatchObject({ ok: false, reason: 'stale_alignment' });
  });

  it('words in any script reach the text as given', () => {
    at = 0;
    const tokens = [heard('p-1', 0, 'שלום', 1, 1.4), heard('p-1', 1, '🦎', 1.4, 1.7), heard('p-1', 2, 'اليوم,', 1.7, 2)];
    expect(voiceSampleRange(align(tokens), ['p-1:0', 'p-1:1', 'p-1:2'])).toMatchObject({ ok: true, range: { words: 'שלום 🦎 اليوم,' } });
  });
});
