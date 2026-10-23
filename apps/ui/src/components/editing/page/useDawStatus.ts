import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';

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

/** How often an off DAW is asked again while the page is open. */
const RECHECK_MS = 10_000;

/** The DAW-neutral name the banner uses: the DAW's own, or "The DAW" when the launch names none. */
const nameOf = (caps: DawCapabilities | null): string => (!caps || caps.daw === 'none' || caps.daw === 'Built-in' ? 'the DAW' : caps.daw);

/** The reasons a capability is off because of a setting, not because the DAW is quiet: the edit notice says them, the banner never does. */
const SETTING_REASONS: ReadonlySet<string> = new Set(['experimental_off', 'turned_off']);

/** The reasons a capability is off because the engine is not connected or not answering. */
const CONNECTION_REASONS: ReadonlySet<string> = new Set(['standalone', 'not_running']);

/** The reasons a capability is off because the engine has no such thing yet, which says nothing about whether the engine is answering. */
const NOT_BUILT_REASONS: ReadonlySet<string> = new Set(['not_yet', 'unsupported']);

/**
 * Whether the DAW answers, from `DawClient.capabilities`, asked again on Check again and on each capabilities event. When it does not, the sentence
 * is the record capability's own message, unless that is a setting being off (then the DAW is simply "not answering"), else "<DAW> is not
 * running." An engine that has no recording yet (Audacity's `record` is "not available yet") says nothing about the connection there, so the
 * sentence is the first capability that does. The built-in recorder always answers.
 */
export function useDawStatus(): DawStatus {
  const daw = usePort('daw');
  const events = usePort('dawCapabilities');
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [heardAt, setHeardAt] = useState<number | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const take = useCallback((next: DawCapabilities) => {
    if (!live.current) return;
    const now = Date.now();
    setCaps(next);
    setCheckedAt(now);
    setReadFailed(false);
    if (next.reachable) setHeardAt(now);
  }, []);
  // A failed read keeps what was heard before and says it failed, so the page never turns a quiet DAW into a fact it did not read.
  const read = useCallback(
    () =>
      daw.capabilities().then(take, () => {
        if (live.current) setReadFailed(true);
      }),
    [daw, take],
  );

  useEffect(() => {
    void read();
  }, [read]);
  useEffect(() => events.subscribeDawCapabilities(() => void read()), [events, read]);
  const retry = read;
  const recordRow = caps?.capabilities['record'];
  const record =
    caps && recordRow?.reason && NOT_BUILT_REASONS.has(recordRow.reason)
      ? Object.values(caps.capabilities).find((c) => c.reason && CONNECTION_REASONS.has(c.reason))
      : recordRow;
  const aSetting = record?.reason !== undefined && SETTING_REASONS.has(record.reason);
  const name = !caps || caps.daw === 'none' || caps.daw === 'Built-in' ? 'The DAW' : caps.daw;
  const off = caps && !caps.reachable ? ((aSetting ? undefined : record?.message) ?? `${name} is ${aSetting ? 'not answering' : 'not running'}.`) : null;
  // While the DAW is off the page asks again on its own: when the window is focused again (the narrator just started it) and every few seconds.
  const isOff = off !== null;
  useEffect(() => {
    const onFocus = () => void read();
    window.addEventListener('focus', onFocus);
    const timer = isOff ? window.setInterval(() => void read(), RECHECK_MS) : undefined;
    return () => {
      window.removeEventListener('focus', onFocus);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [read, isOff]);
  return { caps, off, dawName: nameOf(caps), checkedAt, heardAt, readFailed, retry, take };
}
