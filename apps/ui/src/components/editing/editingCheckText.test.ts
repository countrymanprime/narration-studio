import { describe, expect, it } from 'vitest';
import type { Finding } from '../../types';
import { candidateClass } from './editingCheckText';

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
