import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { PronunciationSource } from '../../../api/contracts/pronunciationSources';

export type PronunciationSources = {
  /** In the order the host offers them; empty until the list arrives. */
  sources: readonly PronunciationSource[];
  /** The source a name with nothing yet takes first; empty until the list arrives. */
  defaultId: string;
  /** Why the list could not be read, in the host's words. */
  error?: string;
  /** Reads the list again: reading changes nothing, so a failed read's toast offers it as Retry (#2919). */
  retry: () => void;
};

/** The sources of the pronunciation port, read when the component mounts and again on `retry`. */
export function usePronunciationSources(): PronunciationSources {
  const port = usePort('pronunciationSources');
  const [state, setState] = useState<Omit<PronunciationSources, 'retry'>>({ sources: [], defaultId: '' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    port.pronunciationSources().then(
      (list) => live && setState({ sources: list.sources, defaultId: list.default }),
      (reason: unknown) => live && setState({ sources: [], defaultId: '', error: apiErrorMessage(reason) }),
    );
    return () => {
      live = false;
    };
  }, [port, attempt]);
  return { ...state, retry };
}
