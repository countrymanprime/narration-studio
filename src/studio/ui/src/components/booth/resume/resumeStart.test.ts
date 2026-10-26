import { describe, expect, it } from 'vitest';
import type { RecordedThrough } from '../../../api/contracts/manuscript';
import type { ReadingParagraph } from '../reading/boothUnits';
import { resumeStart } from './resumeStart';

const PARAGRAPHS: ReadingParagraph[] = [
  { id: 'p1', text: 'Alice was beginning to get very tired.' },
  { id: 'p2', text: 'So she was considering in her own mind.' },
  { id: 'p3', text: 'There was nothing so very remarkable in that.' },
];

const through = (over: Partial<RecordedThrough> = {}): RecordedThrough => ({
  paragraphId: 'p2',
  word: 3,
  percent: 45,
  complete: false,
  source: 'booth',
  confident: true,
  ...over,
});

describe('where the Booth opens a chapter', () => {
  it('opens a chapter with nothing recorded and never visited at its top', () => {
    expect(resumeStart({ paragraphs: PARAGRAPHS })).toEqual({ place: null, reason: 'start' });
  });

  it('opens a half-recorded chapter on the word after the last one recorded', () => {
    expect(resumeStart({ paragraphs: PARAGRAPHS, recorded: through() })).toEqual({ place: { paragraphId: 'p2', word: 4 }, reason: 'recorded' });
  });

  it('moves to the next paragraph when the recording ends on a paragraph’s last word', () => {
    expect(resumeStart({ paragraphs: PARAGRAPHS, recorded: through({ word: 7 }) }).place).toEqual({ paragraphId: 'p3', word: 0 });
  });

  it('puts the recorded place before the place the narrator last read to', () => {
    const start = resumeStart({ paragraphs: PARAGRAPHS, recorded: through(), kept: { paragraphId: 'p1', word: 2 } });
    expect(start).toEqual({ place: { paragraphId: 'p2', word: 4 }, reason: 'recorded' });
  });

  it('opens where the narrator left the chapter when nothing is recorded', () => {
    expect(resumeStart({ paragraphs: PARAGRAPHS, kept: { paragraphId: 'p3', word: 5 } })).toEqual({ place: { paragraphId: 'p3', word: 5 }, reason: 'kept' });
  });

  it('opens a complete chapter where the narrator left it, else at its top, never past its end', () => {
    const complete = through({ paragraphId: 'p3', word: 7, percent: 100, complete: true });
    expect(resumeStart({ paragraphs: PARAGRAPHS, recorded: complete, kept: { paragraphId: 'p2', word: 1 } })).toEqual({
      place: { paragraphId: 'p2', word: 1 },
      reason: 'kept',
    });
    expect(resumeStart({ paragraphs: PARAGRAPHS, recorded: complete })).toEqual({ place: null, reason: 'start' });
  });

  it('lets an explicit target win over everything', () => {
    expect(resumeStart({ paragraphs: PARAGRAPHS, explicit: true, recorded: through(), kept: { paragraphId: 'p3', word: 1 } })).toEqual({
      place: null,
      reason: 'explicit',
    });
  });

  it('degrades when the script changed: a recorded or kept paragraph that is gone is passed over', () => {
    expect(resumeStart({ paragraphs: PARAGRAPHS, recorded: through({ paragraphId: 'gone' }), kept: { paragraphId: 'p3', word: 2 } })).toEqual({
      place: { paragraphId: 'p3', word: 2 },
      reason: 'kept',
    });
    expect(resumeStart({ paragraphs: PARAGRAPHS, kept: { paragraphId: 'gone', word: 2 } })).toEqual({ place: null, reason: 'start' });
  });

  it('keeps a word past a shortened paragraph’s end inside it', () => {
    expect(resumeStart({ paragraphs: PARAGRAPHS, kept: { paragraphId: 'p1', word: 99 } }).place).toEqual({ paragraphId: 'p1', word: 6 });
    expect(resumeStart({ paragraphs: PARAGRAPHS, recorded: through({ paragraphId: 'p3', word: 99 }) }).place).toEqual({ paragraphId: 'p3', word: 7 });
  });

  it('has nowhere to go in a chapter with no paragraphs', () => {
    expect(resumeStart({ paragraphs: [], recorded: through(), kept: { paragraphId: 'p1', word: 0 } })).toEqual({ place: null, reason: 'start' });
  });
});
