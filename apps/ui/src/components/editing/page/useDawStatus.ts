import { useCallback, useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';

export interface DawStatus {
  /** What the DAW said it can do, or null until it has answered (or when it could not). */
  caps: DawCapabilities | null;
  /** The sentence the banner shows when the DAW is not answering, else null. */
  off: string | null;
  /** The DAW's own name for the banner, or "the DAW" when the launch names none. */
  dawName: string;
  /** Asks the DAW again. */
  retry: () => void;
}

/** The DAW-neutral name the banner uses: the DAW's own, or "The DAW" when the launch names none. */
const nameOf = (caps: DawCapabilities | null): string => (!caps || caps.daw === 'none' || caps.daw === 'Built-in' ? 'the DAW' : caps.daw);

/** The reasons a capability is off because of a setting, not because the DAW is quiet: the edit notice says them, the banner never does. */
const SETTING_REASONS: ReadonlySet<string> = new Set(['experimental_off', 'turned_off']);

/**
 * Whether the DAW answers, from `DawClient.capabilities`, asked again on Check again and on each capabilities event. When it does not, the sentence
 * is the record capability's own message, unless that is a setting being off (then the DAW is simply "not answering"), else "<DAW> is not
 * running." The built-in recorder always answers.
 */
export function useDawStatus(): DawStatus {
  const daw = usePort('daw');
  const events = usePort('dawCapabilities');
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (c) => live && setCaps(c),
      () => live && setCaps(null),
    );
    return () => {
      live = false;
    };
  }, [daw, asked]);
  useEffect(() => events.subscribeDawCapabilities(() => setAsked((n) => n + 1)), [events]);

  const retry = useCallback(() => setAsked((n) => n + 1), []);
  const record = caps?.capabilities['record'];
  const aSetting = record?.reason !== undefined && SETTING_REASONS.has(record.reason);
  const name = !caps || caps.daw === 'none' || caps.daw === 'Built-in' ? 'The DAW' : caps.daw;
  const off = caps && !caps.reachable ? ((aSetting ? undefined : record?.message) ?? `${name} is ${aSetting ? 'not answering' : 'not running'}.`) : null;
  return { caps, off, dawName: nameOf(caps), retry };
}
