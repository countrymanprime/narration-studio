import type { DawCapabilities } from '../../../api/contracts/daw';
import { useDawSession, useDawState } from '../../../daw/useDawSession';

export interface DawStatus {
  /** What the DAW said it can do, or null until it has answered (or when it could not). */
  caps: DawCapabilities | null;
  /** The sentence the banner shows when the DAW is not answering, else null. */
  off: string | null;
  /** The DAW's own name for the banner, or "the DAW" when the launch names none. */
  dawName: string;
  /** When the DAW was last asked and answered (ms since the epoch), null before it has; the dialog says "last checked N s ago" from it. */
  checkedAt: number | null;
  /** When the DAW was last seen reachable, null when it has not been since the page opened. */
  heardAt: number | null;
  /** The last read failed: the dialog says it cannot tell, and `caps` is still what was heard before. */
  readFailed: boolean;
  /** Asks the DAW again, resolving once the answer is in. */
  retry: () => Promise<void>;
  /** Takes a read made elsewhere (the dialog's wait after Start), so the page's picture follows it. */
  take: (caps: DawCapabilities) => void;
}

/** The DAW-neutral name the banner uses: the DAW's own, or "The DAW" when the launch names none. */
const nameOf = (caps: DawCapabilities | null): string => (!caps || caps.daw === 'none' || caps.daw === 'Built-in' ? 'the DAW' : caps.daw);

/** The reasons a capability is off because the engine is not connected or not answering. */
const CONNECTION_REASONS: ReadonlySet<string> = new Set(['standalone', 'not_running']);

/** The reasons a capability is off because the engine has no such thing yet, which says nothing about whether the engine is answering. */
const NOT_BUILT_REASONS: ReadonlySet<string> = new Set(['not_yet', 'unsupported']);

/**
 * Whether the DAW answers, from `DawClient.capabilities`, asked again on Check again and on each capabilities event. When it does not, the sentence
 * is the record capability's own message, else "<DAW> is not running." An engine that has no recording yet (Audacity's `record` is "not available yet") says nothing about the connection there, so the
 * sentence is the first capability that does. The built-in recorder always answers.
 */
export function useDawStatus(): DawStatus {
  const session = useDawSession();
  const caps = useDawState((state) => state.caps);
  const checkedAt = useDawState((state) => state.capsCheckedAt);
  const heardAt = useDawState((state) => state.capsHeardAt);
  const readFailed = useDawState((state) => state.capsReadFailed);
  const recordRow = caps?.capabilities['record'];
  const record =
    caps && recordRow?.reason && NOT_BUILT_REASONS.has(recordRow.reason)
      ? Object.values(caps.capabilities).find((c) => c.reason && CONNECTION_REASONS.has(c.reason))
      : recordRow;
  const name = !caps || caps.daw === 'none' || caps.daw === 'Built-in' ? 'The DAW' : caps.daw;
  const off = caps && !caps.reachable ? (record?.message ?? `${name} is not running.`) : null;
  return { caps, off, dawName: nameOf(caps), checkedAt, heardAt, readFailed, retry: session.refreshCapabilities, take: session.takeCapabilities };
}
