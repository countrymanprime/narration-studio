import { describe, expect, it } from 'vitest';
import { textMatchOf } from './textMatch';

const report = (bodyTokens: number, presentTokens: number) => ({ bodyTokens, presentTokens }) as never;
const judgement = (state: 'met' | 'not_met') => ({ state, reason: '', thresholds: { minParagraphPresent: 0.9, maxMissingRun: 5 } });

describe('textMatchOf: the Recording Check’s own "Text present" share and judgement', () => {
  it('rounds present over body words, met or not as the check judged it', () => {
    expect(textMatchOf({ state: 'current', result: report(200, 193), judgement: judgement('met') })).toEqual({ percent: 97, met: true });
    expect(textMatchOf({ state: 'current', result: report(3, 2), judgement: judgement('not_met') })).toEqual({ percent: 67, met: false });
  });
  it('reads an empty chapter as 100%, as the report does', () => {
    expect(textMatchOf({ state: 'current', result: report(0, 0), judgement: judgement('met') })?.percent).toBe(100);
  });
  it('has no figure for a stale or never-run check, or one without a report or judgement', () => {
    expect(textMatchOf({ state: 'stale', result: report(10, 10), judgement: judgement('met') })).toBeUndefined();
    expect(textMatchOf({ state: 'never' })).toBeUndefined();
    expect(textMatchOf({ state: 'current', judgement: judgement('met') })).toBeUndefined();
    expect(textMatchOf({ state: 'current', result: report(10, 10) })).toBeUndefined();
  });
});
