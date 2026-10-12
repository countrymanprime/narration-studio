import type { GuidePronunciationValue } from '../../types';

/** The source as the narrator reads it: their own typed pronunciation is "Yours", a dictionary keeps its own name. */
export const pronunciationSourceLabel = (value: Pick<GuidePronunciationValue, 'source'>): string => (value.source === 'user' ? 'Yours' : value.source);
