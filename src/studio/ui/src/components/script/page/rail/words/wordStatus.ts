import type { StatusTone } from '../../../../primitives/StatusBadge';
import type { NameStatus } from '../../data/script.selectors';

/** A word's status in the Words card: its Story Bible name's (#2595), or `not_flagged` when no entry has that name. */
export type WordStatus = NameStatus | 'not_flagged';

const LABELS: Record<WordStatus, string> = { set: 'Set', not_set: 'Not set', not_flagged: 'Not flagged' };

/** The mock's status words. */
export const statusLabel = (status: WordStatus): string => LABELS[status];
export const statusTone = (status: WordStatus): StatusTone => (status === 'set' ? 'success' : 'neutral');
