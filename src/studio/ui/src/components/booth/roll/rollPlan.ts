import type { DawCapabilities } from '../../../api/contracts/daw';

/** The capability a roll or a punch asks of the DAW: the catalogue's `punch` ("Punch and roll"). */
const ROLL_CAPABILITY = 'punch';

/**
 * What a roll does in the connected DAW, read from the capability and never from which DAW it is: `roll` just rolls (the DAW keeps
 * the earlier audio as a take, or backups are on), `confirm` asks first because the audio it replaces is not kept, and `refused`
 * carries the capability's own sentence and rolls nothing.
 */
export type RollPlan = { kind: 'roll' } | { kind: 'confirm'; dawName: string } | { kind: 'refused'; reason: string };

/** The mock's sentence for a capability that is off without saying why. */
const NO_REASON = 'Rolling again is not available.';

/** The DAW's name as the question words it, read from the report ("REAPER", "Audacity"); a standalone launch records in the app. */
function dawNameOf(capabilities: DawCapabilities): string {
  return capabilities.daw === 'none' ? 'the built-in recorder' : capabilities.daw;
}

export function rollPlan(capabilities: DawCapabilities | null): RollPlan {
  const support = capabilities?.capabilities[ROLL_CAPABILITY];
  if (!capabilities || !support?.available) return { kind: 'refused', reason: support?.message || NO_REASON };
  return support.destructive ? { kind: 'confirm', dawName: dawNameOf(capabilities) } : { kind: 'roll' };
}
