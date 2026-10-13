import { describe, expect, it } from 'vitest';
import type { DeliveryProfile, MeasureFileResult } from '../../../types';
import { failingChapter, pickupChapters } from './nextUpSources';

const rms = { id: 'rms', label: 'RMS', metric: 'rms_dbfs', unit: 'dBFS', min: -23, max: -18, oneOf: [], sameAcrossFiles: false };
const peak = { id: 'peak', label: 'Peak', metric: 'sample_peak_dbfs', unit: 'dBFS', min: null, max: -3, oneOf: [], sameAcrossFiles: false };
const profile = { rules: [rms, peak] } as unknown as DeliveryProfile;

const file = (name: string, rules: MeasureFileResult['rules']) =>
  ({ name, path: name, status: 'measured', report: null, fingerprint: null, findings: [], rules }) as unknown as MeasureFileResult;

const chapters = [
  { id: 'c1', index: 0, title: 'One' },
  { id: 'c2', index: 1, title: 'Two' },
];

describe('failingChapter', () => {
  it('names the first chapter whose file misses a rule, and each miss with its value and limit', () => {
    const files = [
      file('One.wav', [{ ruleId: 'rms', status: 'met', value: -20 }]),
      file('Two.wav', [
        { ruleId: 'rms', status: 'not_met', value: -25.3, violation: 'below_min' },
        { ruleId: 'peak', status: 'not_met', value: -1, violation: 'above_max' },
      ]),
    ];
    expect(failingChapter(chapters, files, profile)).toEqual({
      chapterId: 'c2',
      tag: 'Two',
      fails: ['rms −25.3 dBFS (limit −23 to −18 dBFS)', 'peak −1.0 dBFS (limit ≤ −3 dBFS)'],
    });
  });

  it('is null when every file passes, no profile is known, or nothing was measured', () => {
    const passing = [file('One.wav', [{ ruleId: 'rms', status: 'met', value: -20 }])];
    expect(failingChapter(chapters, passing, profile)).toBeNull();
    expect(failingChapter(chapters, [file('Two.wav', [{ ruleId: 'rms', status: 'not_met', value: -30 }])], null)).toBeNull();
    expect(failingChapter(chapters, [], profile)).toBeNull();
  });
});

describe('pickupChapters', () => {
  it('names each chapter with an open line once, in the order of the lines', () => {
    const names: Record<string, string> = { c1: 'One', c2: 'Two' };
    expect(pickupChapters([{ chapterId: 'c2' }, { chapterId: 'c1' }, { chapterId: 'c2' }], (id) => names[id] ?? id)).toEqual(['Two', 'One']);
  });
});
