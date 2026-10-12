import type { Finding } from '../../../api/contracts/findings';

type Spec = {
  id: string;
  start: number;
  end: number;
  cls: 'silence' | 'breath' | 'click' | 'plosive' | 'noise';
  item?: string | null;
  db?: number;
  dur?: number;
  status?: Finding['review']['status'];
  category?: string;
  extra?: Record<string, unknown>;
};

/** A finding as the host holds it: a Proof finding or an editing candidate of one sound. */
export function finding(s: Spec): Finding {
  const item = s.item === undefined ? 'item-1' : s.item;
  return {
    schema_version: 1,
    id: s.id,
    analyzer: 'editing',
    project: {},
    source: item ? { item_guid: item } : {},
    time_range: { start: s.start, end: s.end },
    category: s.category ?? (s.cls === 'silence' ? 'silence_cleanup' : 'audio_quality'),
    severity: 'info',
    confidence: 0.6,
    confidence_reason: 'measured',
    evidence: {
      class: s.cls,
      duration_seconds: s.dur ?? s.end - s.start,
      ...(s.db !== undefined ? { level_dbfs: s.db } : {}),
      ...s.extra,
    },
    review: { status: s.status ?? 'unreviewed' },
  };
}

/** Three gaps (two over the Standard limit of 1.2 s), a breath, a click, a plosive and a noise, all on one item. */
export const FINDINGS: Finding[] = [
  finding({ id: 'g1', start: 10, end: 12.4, cls: 'silence' }),
  finding({ id: 'g2', start: 30, end: 30.8, cls: 'silence' }),
  finding({ id: 'g3', start: 50, end: 53, cls: 'silence' }),
  finding({ id: 'b1', start: 20, end: 20.4, cls: 'breath', db: -22 }),
  finding({ id: 'b2', start: 25, end: 25.4, cls: 'breath', db: -40 }),
  finding({ id: 'c1', start: 40, end: 40.03, cls: 'click', db: -20 }),
  finding({ id: 'p1', start: 41, end: 41.1, cls: 'plosive', db: -10 }),
  finding({ id: 'n1', start: 60, end: 61, cls: 'noise', db: -30, extra: { noise_floor_dbfs: -58 } }),
];
