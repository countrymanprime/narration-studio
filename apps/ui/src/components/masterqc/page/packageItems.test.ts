import { describe, expect, it } from 'vitest';
import { passing, profile } from '../files/testFiles';
import { packageItems } from './packageItems';

const sampleFile = (seconds: number) => {
  const file = passing('Retail sample.wav');
  return { ...file, report: { ...file.report!, duration_seconds: seconds } };
};

describe('the retail sample line names the profile’s own range', () => {
  const text = (p: typeof profile, seconds: number) => packageItems(p, [sampleFile(seconds)]).find((item) => item.text.startsWith('Retail sample'))!;

  it('says "up to 5 min" when the profile has a maximum and no minimum, never a lower bound it does not hold', () => {
    expect(text(profile, 280)).toEqual({ state: 'ok', text: 'Retail sample 4:40 (up to 5 min)' });
  });

  it('says "1 to 5 min" when the profile has both bounds, and fails a sample under the minimum', () => {
    const bounded = { ...profile, rules: profile.rules.map((rule) => (rule.metric === 'retail_sample_seconds' ? { ...rule, min: 60 } : rule)) };
    expect(text(bounded, 280)).toEqual({ state: 'ok', text: 'Retail sample 4:40 (1 to 5 min)' });
    expect(text(bounded, 30).state).toBe('bad');
  });
});
