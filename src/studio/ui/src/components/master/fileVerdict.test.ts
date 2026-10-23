import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOCK_ACX } from '../../api/deliveryProfilesMock';
import { measureJobSchema } from '../../api/schemas/measure';
import type { DeliveryProfile, DeliveryRule, DeliveryRuleResult, MeasureFileResult } from '../../types';
import { fileVerdict, leftToCheck, misses, missesWithLimit, suggestedFix } from './fileVerdict';

// The host's own judged payload (bindings_measure_contract_test.go): Chapter 01 at 48 kHz, Chapter 02 silent, Chapter 03 unreadable.
const measured = measureJobSchema.parse(
  JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', 'tests', 'fixtures', 'contracts', 'measure-success.json'), 'utf8')),
);
const file = (name: string): MeasureFileResult => {
  const found = measured.files.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
};

describe('fileVerdict', () => {
  it('fails a file with any rule not met, never passes one with a value it could not measure or nothing judged, and has no verdict for an unread file', () => {
    expect(fileVerdict(file('Chapter 01.wav'))).toBe('fail');
    expect(fileVerdict(file('Chapter 03.mp3'))).toBe('none');
    // A silent render meets its sample rate and length, but its levels could not be measured: no verdict, never a pass.
    expect(fileVerdict(file('Chapter 02.wav'))).toBe('none');
    const met = file('Chapter 01.wav').rules.map((result) => (result.status === 'not_met' ? { ...result, status: 'met' as const } : result));
    expect(fileVerdict({ ...file('Chapter 01.wav'), rules: met })).toBe('pass');
    expect(fileVerdict({ ...file('Chapter 01.wav'), rules: met.map((result) => ({ ...result, status: 'not_checked' as const })) })).toBe('none');
  });

  it('counts the rules left to the narrator: not checked by the app, or not measurable', () => {
    expect(leftToCheck(file('Chapter 01.wav'))).toBe(1);
    expect(leftToCheck(file('Chapter 02.wav'))).toBe(6);
  });
});

describe('misses', () => {
  it('says which rule a file missed, by how much, and what to do about it', () => {
    const [miss, ...rest] = misses(file('Chapter 01.wav'), MOCK_ACX);
    expect(rest).toHaveLength(0);
    expect(miss.text).toBe('Sample rate 48 kHz: not 44.1 kHz.');
    expect(miss.fix).toBe('Render it again at 44.1 kHz, then re-check.');
  });

  it('never promises that mastering lowers a noise floor', () => {
    const noise = MOCK_ACX.rules.find((rule) => rule.metric === 'noise_floor_dbfs');
    if (!noise) throw new Error('no noise floor rule');
    expect(suggestedFix(noise, { ruleId: noise.id, status: 'not_met', value: -57.8, violation: 'above_max' })).toMatch(
      /^Mastering does not lower the noise floor/,
    );
  });
});

describe('missesWithLimit', () => {
  const rule = (over: Partial<DeliveryRule>): DeliveryRule => ({
    ...MOCK_ACX.rules[0],
    min: null,
    max: null,
    oneOf: [],
    sameAcrossFiles: false,
    unit: '',
    ...over,
  });
  const against = (...rules: DeliveryRule[]): DeliveryProfile => ({ ...MOCK_ACX, rules });
  const missed = (target: DeliveryRule, value: number | null, violation: DeliveryRuleResult['violation'] = 'above_max'): MeasureFileResult => ({
    ...file('Chapter 01.wav'),
    rules: [{ ruleId: target.id, status: 'not_met', value, violation }],
  });

  it('says the value and the limit of a level, a duration and a sample rate in the units a narrator reads', () => {
    const noise = rule({ id: 'n', label: 'Noise floor', metric: 'noise_floor_dbfs', unit: 'dBFS', max: -60 });
    expect(missesWithLimit(missed(noise, -57.8), against(noise))).toEqual(['noise floor −57.8 dBFS (limit ≤ −60 dBFS)']);
    const length = rule({ id: 'd', label: 'Length', metric: 'duration_seconds', unit: 's', max: 7200 });
    expect(missesWithLimit(missed(length, 7500), against(length))).toEqual(['length 2:05:00 (limit ≤ 120 min)']);
    const rate = rule({ id: 'r', label: 'Sample rate', metric: 'sample_rate', unit: 'Hz', oneOf: [44100] });
    expect(missesWithLimit(missed(rate, 48000, 'not_one_of'), against(rate))).toEqual(['sample rate 48 kHz (limit 44.1 kHz)']);
  });

  it('reads a one-of rule that must match in every file, and a rule with a limit in words', () => {
    const rate = rule({ id: 'r', label: 'Sample rate', metric: 'sample_rate', unit: 'Hz', oneOf: [44100, 48000], sameAcrossFiles: true });
    expect(missesWithLimit(missed(rate, 32000, 'not_one_of'), against(rate))).toEqual([
      'sample rate 32 kHz (limit 44.1 kHz or 48 kHz, the same in every file)',
    ]);
    const bitrate = rule({ id: 'b', label: 'Bit rate', metric: 'bitrate', boundText: '192 kbps+ CBR' });
    expect(missesWithLimit(missed(bitrate, 128), against(bitrate))).toEqual(['bit rate 128 (limit 192 kbps+ CBR)']);
  });

  it('leaves out the value a missed rule has none of, and the limit a rule has no text for, and still names the rule', () => {
    const noise = rule({ id: 'n', label: 'Noise floor', metric: 'noise_floor_dbfs', unit: 'dBFS', max: -60 });
    expect(missesWithLimit(missed(noise, null), against(noise))).toEqual(['noise floor (limit ≤ −60 dBFS)']);
    const open = rule({ id: 'o', label: 'Peak', metric: 'sample_peak_dbfs', unit: 'dBFS' });
    expect(missesWithLimit(missed(open, -1.5), against(open))).toEqual(['peak −1.5 dBFS']);
    expect(missesWithLimit(missed(open, null), against(open))).toEqual(['peak']);
  });

  it('skips a miss whose rule the profile no longer has, and any rule that was met', () => {
    const noise = rule({ id: 'n', label: 'Noise floor', metric: 'noise_floor_dbfs', unit: 'dBFS', max: -60 });
    expect(missesWithLimit(missed(noise, -57.8), against())).toEqual([]);
    const met: MeasureFileResult = { ...file('Chapter 01.wav'), rules: [{ ruleId: noise.id, status: 'met', value: -64 }] };
    expect(missesWithLimit(met, against(noise))).toEqual([]);
  });
});
