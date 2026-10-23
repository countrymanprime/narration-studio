import type { StatusTone } from './components/primitives/StatusBadge';
import { statusTone, type StatusId } from './kinds/statusTone';

// The five chapter production statuses: their labels, their order and the token each one is drawn in. Shared by the
// chapter list, the audiobook estimate and the MeterBar story, so it sits above the feature folders (a primitive's story
// may not import a feature component).
export const STATUS_LABELS = { not_started: 'Not Started', recording: 'Recording', editing: 'Editing', proofing: 'Proofing', finalized: 'Finalized' } as const;
export const STATUS_ORDER = ['not_started', 'recording', 'editing', 'proofing', 'finalized'] as const;

// The registry status each stage is drawn as (kinds/statusTone.ts): the three stages in the middle of the pipeline share one meaning,
// In progress, so they share its tone.
const STATUS_ID: Record<keyof typeof STATUS_LABELS, StatusId> = {
  not_started: 'not_started',
  recording: 'in_progress',
  editing: 'in_progress',
  proofing: 'in_progress',
  finalized: 'done',
};

export const STATUS_TONE: Record<keyof typeof STATUS_LABELS, StatusTone> = {
  not_started: statusTone(STATUS_ID.not_started),
  recording: statusTone(STATUS_ID.recording),
  editing: statusTone(STATUS_ID.editing),
  proofing: statusTone(STATUS_ID.proofing),
  finalized: statusTone(STATUS_ID.finalized),
};
