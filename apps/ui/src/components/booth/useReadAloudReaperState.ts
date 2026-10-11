import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { errorText } from './useTeleprompterSession';
import type { ReadAloudReaperState } from '../../types';

/**
 * Read-only REAPER transport and armed-track state for a chapter (`readAloudReaperState`, ADR 0249): asked once when
 * the dialog mounts, and again only on a Refresh press - never on a timer (ADR 0122). `chapterId` is undefined in
 * credits mode (no chapter track to ask about), where this hook asks nothing.
 */
export function useReadAloudReaperState(chapterId: string | undefined) {
  const api = useApi();
  const [state, setState] = useState<ReadAloudReaperState>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(() => {
    if (!chapterId) return;
    void api
      .readAloudReaperState(chapterId)
      .then((next) => {
        setState(next);
        setError(undefined);
      })
      .catch((reason) => setError(errorText(reason)));
  }, [api, chapterId]);

  useEffect(() => {
    setState(undefined);
    setError(undefined);
    refresh();
  }, [refresh]);

  return { state, error, refresh };
}
