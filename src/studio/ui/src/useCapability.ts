import { useEffect, useRef, useState } from 'react';
import { useApi } from './api/ApiContext';
import type { DawCapabilityKey } from './api/contracts/daw';
import type { CapabilityEntry } from './components/primitives/CapabilityGate';

/** How often a capability whose first read failed is asked for again, until the DAW answers. */
export const CAPABILITY_RETRY_MS = 4000;

const UNKNOWN_CAPABILITY: CapabilityEntry = { level: 'unsupported', available: false };

/**
 * One capability's live entry from the DAW port's capability report: read once
 * with `dawCapabilities()`, then kept current by `daw_capabilities_changed`, the same read-then-subscribe race
 * handling as `useChapterSync` (an update the subscription's own attach triggers may resolve before the plain read
 * does, so a stale read is dropped rather than allowed to overwrite it). A capability the host's report does not
 * carry - one this build's `DawCapabilityKey` union does not yet know, or a future one an older host never sends -
 * answers `unsupported`/unavailable rather than throwing, since `CapabilityGate` needs an entry for every control it
 * wraps whether or not the host has heard of it yet.
 */
export function useCapability(capability: DawCapabilityKey): CapabilityEntry {
  const api = useApi();
  const [entry, setEntry] = useState<CapabilityEntry>(UNKNOWN_CAPABILITY);
  const [heard, setHeard] = useState(false);
  const [reads, setReads] = useState(0);
  const events = useRef(0);

  useEffect(() => {
    const unsubscribe = api.subscribeDawCapabilities((next) => {
      events.current += 1;
      setHeard(true);
      setEntry(next.capabilities[capability] ?? UNKNOWN_CAPABILITY);
    });
    return unsubscribe;
  }, [api, capability]);

  useEffect(() => {
    let current = true;
    const before = events.current;
    void api
      .dawCapabilities()
      .then((next) => {
        if (!current || before !== events.current) return;
        setHeard(true);
        setEntry(next.capabilities[capability] ?? UNKNOWN_CAPABILITY);
      })
      // A failed read leaves the entry unsupported/unavailable and `heard` false, which the retry below acts on: it is asked again on a
      // timer, and on the next focus, until the DAW answers or a daw_capabilities_changed event arrives (SILENT_CATCHES).
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [api, capability, reads]);

  // A lost event must not leave a stale answer: read again whenever the window is focused, and on a timer only while nothing has been heard.
  useEffect(() => {
    const again = () => setReads((n) => n + 1);
    window.addEventListener('focus', again);
    const timer = heard ? undefined : window.setInterval(again, CAPABILITY_RETRY_MS);
    return () => {
      window.removeEventListener('focus', again);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [heard]);

  return entry;
}
