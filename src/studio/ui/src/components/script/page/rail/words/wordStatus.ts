import type { WordStatus } from '../../../../../api/contracts/scriptPrep';
import type { StatusTone } from '../../../../primitives/StatusBadge';

const LABELS: Record<WordStatus, string> = { set: 'Set', not_set: 'Not set', not_flagged: 'Not flagged' };

/** The mock's status words for the host's status. */
export const statusLabel = (status: WordStatus): string => LABELS[status];
export const statusTone = (status: WordStatus): StatusTone => (status === 'set' ? 'success' : 'neutral');
