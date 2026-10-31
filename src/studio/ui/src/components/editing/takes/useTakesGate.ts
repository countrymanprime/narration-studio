import { useDawCapabilities } from '../../../hooks/useDawCapabilities';
import type { TakesGate } from './types';

const CHECKING: TakesGate = { ok: false, reason: 'Checking what the DAW can do.' };

/** Whether the DAW can choose a take now, with its own sentence when it cannot. */
export function useTakesGate(): TakesGate {
  const { caps, failed } = useDawCapabilities();
  if (failed) return { ok: false, reason: 'Could not ask the DAW what it can do.' };
  if (!caps) return CHECKING;
  const support = caps.capabilities['takes'];
  return support?.available ? { ok: true } : { ok: false, reason: support?.message ?? 'The DAW cannot choose a take now.' };
}
