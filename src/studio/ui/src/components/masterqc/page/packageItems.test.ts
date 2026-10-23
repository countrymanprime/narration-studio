import { describe, expect, it } from 'vitest';
import type { DeliveryProfile } from '../../../types';
import { acx, passing } from './testPage';
import { packageItems } from './packageItems';

const sample = (seconds: number) => {
  const file = passing('Retail sample.wav');
  return { ...file, report: { ...file.report!, duration_seconds: seconds } };
};
const withSampleRule = (min: number | null, max: number | null): DeliveryProfile => ({
  ...acx,
  rules: acx.rules.map((rule) => (rule.metric === 'retail_sample_seconds' ? { ...rule, min, max, off: false } : rule)),
});
const retail = (profile: DeliveryProfile, seconds: number) => packageItems(profile, [sample(seconds)]).find((item) => item.text.startsWith('Retail sample'));

describe('the retail sample line', () => {
  it('names the profile’s range when it has both ends, and passes inside it', () => {
    expect(retail(withSampleRule(60, 300), 280)).toEqual({ state: 'ok', text: 'Retail sample 4:40 (1 to 5 min)' });
  });

  it('fails a sample under the minimum or over the maximum', () => {
    expect(retail(withSampleRule(60, 300), 30)?.state).toBe('bad');
    expect(retail(withSampleRule(60, 300), 301)?.state).toBe('bad');
  });

  it('names only the end the profile has, never a minimum it lacks', () => {
    expect(retail(withSampleRule(null, 300), 280)?.text).toBe('Retail sample 4:40 (up to 5 min)');
    expect(retail(withSampleRule(60, null), 280)?.text).toBe('Retail sample 4:40 (at least 1 min)');
  });
});
