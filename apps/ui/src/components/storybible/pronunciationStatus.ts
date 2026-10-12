import type { GuidePronunciation, GuidePronunciationStatus, GuidePronunciationValue } from '../../types';
import type { StatusTone } from '../primitives/StatusBadge';

// How a pronunciation's status reads (ADR 0346, superseded by ADR 0792). Only the Booth still prints one, and the host no longer returns
// it, so every name reads Researched until the Booth's swap (SNO-10) deletes this table. The tone is a meaning, not a colour per status.
const PRONUNCIATION_STATUSES: { value: GuidePronunciationStatus; label: string; tone: StatusTone }[] = [
  { value: 'researched', label: 'Researched', tone: 'neutral' },
  { value: 'query_sent', label: 'Query sent', tone: 'warning' },
  { value: 'author_confirmed', label: 'Author confirmed', tone: 'success' },
];

const pronunciationStatusOf = (value: Pick<GuidePronunciation, 'status'>): GuidePronunciationStatus => value.status ?? 'researched';

export const pronunciationStatusInfo = (value: Pick<GuidePronunciation, 'status'>) =>
  PRONUNCIATION_STATUSES.find((row) => row.value === pronunciationStatusOf(value)) ?? PRONUNCIATION_STATUSES[0];

/** The source as the narrator reads it: their own typed pronunciation is "Yours", a dictionary keeps its own name. */
export const pronunciationSourceLabel = (value: Pick<GuidePronunciationValue, 'source'>): string => (value.source === 'user' ? 'Yours' : value.source);
