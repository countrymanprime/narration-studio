import { useDawState } from '../../../daw/useDawSession';
import { recordCheck, type RecordRefusal } from './recordCheck';

export type CanRecord = { ok: boolean; reason: string };

/** `recordCheck` with nothing known of the chapter's track or the open project: whether the DAW's own capability allows a take at all, and its sentence when not (empty when it does). */
export function canRecord(capabilities: Parameters<typeof recordCheck>[0] | null | undefined): CanRecord {
  if (!capabilities) return { ok: false, reason: 'Checking the audio engine…' };
  const refusal: RecordRefusal | null = recordCheck(capabilities, { tracks: 'unread', message: '' });
  return { ok: !refusal, reason: refusal?.reason ?? '' };
}

/** `canRecord` from the DAW session's live report: the one answer for Production, the Companion and every other page that asks whether Record could work (audit cluster 10). */
export function useCanRecord(): CanRecord {
  const ok = useDawState((state) => canRecord(state.caps).ok);
  const reason = useDawState((state) => canRecord(state.caps).reason);
  return { ok, reason };
}
