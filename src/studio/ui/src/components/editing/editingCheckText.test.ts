import { describe, expect, it } from 'vitest';
import type { Finding } from '../../types';
import { candidateClass, keepUnits, sentenceStart } from './editingCheckText';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    schema_version: 1,
    id: 'f1',
    analyzer: 'editing',
    project: {},
    source: { file: 'C:/media/ch1.wav' },
    time_range: { start: 10, end: 12, source_start: 10, source_end: 12 },
    category: 'silence_cleanup',
    severity: 'info',
    confidence: 0.6,
    confidence_reason: 'not a calibrated score',
    evidence: { class: 'silence', reason: 'a gap candidate' },
    review: { status: 'unreviewed' },
    ...overrides,
  };
}

describe('candidateClass', () => {
  it('reads a known class from evidence', () => {
    expect(candidateClass(finding({ evidence: { class: 'click' } }))).toBe('click');
  });

  it('is undefined for an unknown or missing class', () => {
    expect(candidateClass(finding({ evidence: { class: 'unknown-thing' } }))).toBeUndefined();
    expect(candidateClass(finding({ evidence: {} }))).toBeUndefined();
    expect(candidateClass(finding({ evidence: undefined }))).toBeUndefined();
  });
});

describe('keepUnits', () => {
  it('joins a number to its unit with a no-break space', () => {
    expect(keepUnits('1 empty-space candidate: 1.80 s between two phrases.')).toBe('1 empty-space candidate: 1.80\u00a0s between two phrases.');
    expect(keepUnits('differ from -20 dBFS RMS by more than 2 dB.')).toBe('differ from -20\u00a0dBFS RMS by more than 2\u00a0dB.');
  });

  it('leaves a number before a word alone', () => {
    expect(keepUnits('1 item on 3 tracks')).toBe('1 item on 3 tracks');
  });
});

describe('sentenceStart', () => {
  it('capitalises the first letter only', () => {
    expect(sentenceStart('link this chapter to the REAPER track')).toBe('Link this chapter to the REAPER track');
    expect(sentenceStart('')).toBe('');
  });
});
