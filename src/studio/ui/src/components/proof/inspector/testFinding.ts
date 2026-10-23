import type { Finding } from '../../../types';

/** A Transcript Compare note for the inspector tests and stories: the script line, what was heard, and the version the check gave it. */
export function inspectorFinding(overrides: Partial<Finding> & { heard?: string; version?: string } = {}): Finding {
  const { heard = 'I could not help myself', version = 'v1', ...rest } = overrides;
  return {
    schema_version: 1,
    id: 'f1',
    analyzer: 'transcript-compare',
    project: {},
    source: {},
    category: 'transcript_discrepancy',
    severity: 'warning',
    confidence: 0.9,
    confidence_reason: 'The words differ.',
    evidence_version: version,
    manuscript: { expected: 'I could not help it', recorded: heard },
    review: { status: 'unreviewed' },
    ...rest,
  };
}
