import { describe, expect, it } from 'vitest';
import { makeChapters } from '../../../fixtures/chapters';
import type { MeasureFileResult } from '../../../types';
import { chapterForFile, textMatchOf } from './textMatch';

const report = (bodyTokens: number, presentTokens: number) => ({ bodyTokens, presentTokens }) as never;
const judgement = (state: 'met' | 'not_met') => ({ state, reason: '', thresholds: { minParagraphPresent: 0.9, maxMissingRun: 5 } });

describe('textMatchOf: the Recording Check’s own "Text present" share and judgement', () => {
  it('rounds present over body words, met or not as the check judged it', () => {
    expect(textMatchOf({ state: 'current', result: report(200, 193), judgement: judgement('met') })).toEqual({ percent: 97, met: true });
    expect(textMatchOf({ state: 'current', result: report(3, 2), judgement: judgement('not_met') })).toEqual({ percent: 66, met: false });
  });
  it('never draws 100% for a check that was not met (996 of 1000 words)', () => {
    expect(textMatchOf({ state: 'current', result: report(1000, 996), judgement: judgement('not_met') })).toEqual({ percent: 99, met: false });
    expect(textMatchOf({ state: 'current', result: report(1000, 1000), judgement: judgement('not_met') })).toEqual({ percent: 99, met: false });
    expect(textMatchOf({ state: 'current', result: report(1000, 996), judgement: judgement('met') })).toEqual({ percent: 100, met: true });
  });
  it('has no figure for a chapter with no body words: nothing was compared', () => {
    expect(textMatchOf({ state: 'current', result: report(0, 0), judgement: judgement('met') })).toBeUndefined();
  });
  it('has no figure for a stale or never-run check, or one without a report or judgement', () => {
    expect(textMatchOf({ state: 'stale', result: report(10, 10), judgement: judgement('met') })).toBeUndefined();
    expect(textMatchOf({ state: 'never' })).toBeUndefined();
    expect(textMatchOf({ state: 'current', judgement: judgement('met') })).toBeUndefined();
    expect(textMatchOf({ state: 'current', result: report(10, 10) })).toBeUndefined();
  });
});

describe('chapterForFile: one chapter per file, by whole-word title or number, the longest title winning', () => {
  const chapters = makeChapters({ shape: 'titleAndSubtitle', count: 100 });
  const file = (name: string) => ({ name }) as MeasureFileResult;
  const idOf = (name: string) => chapterForFile(file(name), chapters)?.id;

  it('maps Chapter 1, 10, 100 and a retake to their own chapters, never to a chapter whose title is a prefix', () => {
    expect(idOf('Chapter 1.wav')).toBe('chapter-1');
    expect(idOf('Chapter 10.wav')).toBe('chapter-10');
    expect(idOf('Chapter 11.wav')).toBe('chapter-11');
    expect(idOf('Chapter 100 final.wav')).toBe('chapter-100');
    expect(idOf('Chapter 1 retake.wav')).toBe('chapter-1');
    expect(idOf('Chapter 1 - take 2.wav')).toBe('chapter-1');
    expect(idOf('CHAPTER 19 (mastered).wav')).toBe('chapter-19');
  });
  it('reads a file named by its number alone as that chapter', () => {
    expect(idOf('07.wav')).toBe('chapter-7');
    expect(idOf('Ch 12.wav')).toBe('chapter-12');
  });
  it('gives no chapter to a name that fits two chapters equally well, or none', () => {
    const twins = [
      { ...chapters[0]!, id: 'a', title: 'Interlude', index: 0 },
      { ...chapters[1]!, id: 'b', title: 'Interlude', index: 1 },
    ];
    expect(chapterForFile(file('Interlude.wav'), twins)).toBeUndefined();
    expect(idOf('Epilogue.wav')).toBeUndefined();
    expect(idOf('Chapter 1 and Chapter 2.wav')).toBeUndefined();
  });
});
