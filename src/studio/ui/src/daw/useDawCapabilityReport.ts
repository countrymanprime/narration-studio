import { useCallback } from 'react';
import { useDawSession, useDawState } from './useDawSession';

/**
 * The host's whole capability report, read once and kept current by `daw_capabilities_changed`, with the same stale-read guard as
 * `useCapability` (an event that arrives before the first read wins). `retry` reads again after a failed read.
 */
export function useDawCapabilityReport() {
  const session = useDawSession();
  const report = useDawState((state) => state.caps) ?? undefined;
  const error = useDawState((state) => state.capsError);
  const retry = useCallback(() => void session.checkConnection(), [session]);
  return { report, loadError: report ? '' : error, retry };
}
