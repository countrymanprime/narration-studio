import { useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';

export type Gate = { ok: true } | { ok: false; reason: string };

export type DawGates = { dawName: string; open: Gate; play: Gate; recheck: Gate };

const CHECKING = 'Checking what the DAW can do…';
const NOT_OFFERED = 'Your DAW does not offer this.';

// Which capability each action rides on: going to a file's place in the project and playing a stretch of it need the DAW to
// navigate; checking the files again reads the project's items. The host words the refusal; this file words none (except the
// two moments before it has answered).
const OPEN = 'navigate';
const PLAY = 'navigate';
const RECHECK = 'project_read';

function gateOf(capabilities: DawCapabilities | undefined, name: string): Gate {
  if (!capabilities) return { ok: false, reason: CHECKING };
  const support = capabilities.capabilities[name];
  return support?.available ? { ok: true } : { ok: false, reason: support?.message ?? NOT_OFFERED };
}

/** The DAW's name as the capability report gives it, never a fixed one: "your DAW" when there is none. */
const dawNameOf = (capabilities: DawCapabilities | undefined): string => (capabilities && capabilities.daw !== 'none' ? capabilities.daw : 'your DAW');

/** What the launch's DAW lets the files table do, from `usePort('daw').capabilities()`. */
export function useDawGates(): DawGates {
  const daw = usePort('daw');
  const [capabilities, setCapabilities] = useState<DawCapabilities>();
  useEffect(() => {
    let current = true;
    daw.capabilities().then(
      (found) => current && setCapabilities(found),
      () => undefined, // The gates stay on "Checking"; the next report from the host replaces them.
    );
    return () => {
      current = false;
    };
  }, [daw]);
  return { dawName: dawNameOf(capabilities), open: gateOf(capabilities, OPEN), play: gateOf(capabilities, PLAY), recheck: gateOf(capabilities, RECHECK) };
}
