import type { StatusTone } from '../../../../primitives/StatusBadge';
import type { NameStatus } from '../../data/script.selectors';

const LABELS: Record<NameStatus, string> = { set: 'Set', not_set: 'Not set' };

/** The mock's status words for a Story Bible name's pronunciation (#2595). */
export const statusLabel = (status: NameStatus): string => LABELS[status];
export const statusTone = (status: NameStatus): StatusTone => (status === 'set' ? 'success' : 'neutral');
