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
    setState((prev) => (prev.caps === null && !prev.failed ? prev : { caps: null, failed: false }));
    // A report that says what the last one said keeps the last one's identity. Callers hold the capabilities in effect and memo dependencies, and
    // some of those effects ask the DAW again, which reports again: a new object each time would be a loop.
    const report = (caps: DawCapabilities) =>
      live && setState((prev) => (prev.caps !== null && !prev.failed && sameReport(prev.caps, caps) ? prev : { caps, failed: false }));
    daw.capabilities().then(report, (error: unknown) => live && setState({ caps: null, failed: true, error }));
    const stop = daw.subscribeCapabilities?.(report);
    return () => {
      live = false;
      stop?.();
    };
  }, [daw]);
  return state;
}

const sameReport = (a: DawCapabilities, b: DawCapabilities): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);
