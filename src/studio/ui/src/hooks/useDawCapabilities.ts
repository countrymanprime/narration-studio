import { useEffect, useState } from 'react';
import type { DawCapabilities } from '../api/contracts/daw';
import { usePort } from '../ports/usePort';

/** `caps` is null until the DAW has been asked; `failed` is true when the last ask was refused, and clears when a later report arrives. */
export type DawCapabilitiesState = { caps: DawCapabilities | null; failed: boolean; error?: unknown };

/**
 * What the DAW can do now (audit cluster 18, docs/research/ui-function-audit.md): asked once on mount, then again each time the DAW's report changes
 * (`daw_capabilities_changed`: it connects, goes quiet, or a setting is saved). Every gate reads it from here, so a control that waited on a DAW that was not
 * running when the page opened turns on when the DAW starts, with the header, instead of after a remount. A client with no live source (a mock setup)
 * has nothing to subscribe to and answers once.
 */
export function useDawCapabilities(): DawCapabilitiesState {
  const daw = usePort('daw');
  const [state, setState] = useState<DawCapabilitiesState>({ caps: null, failed: false });
  useEffect(() => {
    let live = true;
    setState({ caps: null, failed: false });
    daw.capabilities().then(
      (caps) => live && setState({ caps, failed: false }),
      (error: unknown) => live && setState({ caps: null, failed: true, error }),
    );
    const stop = daw.subscribeCapabilities?.((caps) => live && setState({ caps, failed: false }));
    return () => {
      live = false;
      stop?.();
    };
  }, [daw]);
  return state;
}
