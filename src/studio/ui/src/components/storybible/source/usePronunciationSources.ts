import { useEffect, useState } from 'react';
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
};

/** The sources of the pronunciation port, read once when the component mounts. */
export function usePronunciationSources(): PronunciationSources {
  const port = usePort('pronunciationSources');
  const [state, setState] = useState<PronunciationSources>({ sources: [], defaultId: '' });
  useEffect(() => {
    let live = true;
    port.pronunciationSources().then(
      (list) => live && setState({ sources: list.sources, defaultId: list.default }),
      (reason: unknown) => live && setState({ sources: [], defaultId: '', error: apiErrorMessage(reason) }),
    );
    return () => {
      live = false;
    };
  }, [port]);
  return state;
}
