import type { DawCapabilityKey } from './api/contracts/daw';
import type { CapabilityEntry } from './components/primitives/CapabilityGate';
import { DAW_RETRY_MS } from './daw/dawSession';
import { useDawState } from './daw/useDawSession';

/** How often a capability report that has never been heard is asked for again (the session's own retry). */
export const CAPABILITY_RETRY_MS = DAW_RETRY_MS;

const UNKNOWN_CAPABILITY: CapabilityEntry = { level: 'unsupported', available: false };

/**
 * One capability's live entry from the app's DAW session (`daw/dawSession.ts`), which reads the report at app start, keeps it current
 * from `daw_capabilities_changed`, and asks again on focus and while the DAW has not answered. A capability the host's report does not
 * carry - one this build's `DawCapabilityKey` union does not yet know, or a future one an older host never sends - answers
 * `unsupported`/unavailable rather than throwing, since `CapabilityGate` needs an entry for every control it wraps.
 */
export function useCapability(capability: DawCapabilityKey): CapabilityEntry {
  return useDawState((state) => state.caps?.capabilities[capability] ?? UNKNOWN_CAPABILITY);
}
