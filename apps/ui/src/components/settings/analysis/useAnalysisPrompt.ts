import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';

const TOOL = 'ManuscriptGuide';
const KEY = 'analysis_prompt';

/**
 * Whether a Story Bible scan offers the analysis tools first: `ManuscriptGuide.analysis_prompt`, `ask` or `basic`, saved for every
 * project. It is read when the section opens and again whenever the window comes back into focus, so a choice made elsewhere (the scan's
 * own "don't ask again") shows here. `ask` is undefined until the first read answers.
 */
export function useAnalysisPrompt() {
  const api = usePort('system');
  const [ask, setAsk] = useState<boolean>();
  const [error, setError] = useState('');

  const read = useCallback(async () => {
    try {
      const fields = await api.settingsForScope('global');
      const field = fields[TOOL]?.find((candidate) => candidate.key === KEY);
      if (field) setAsk(field.effectiveValue === 'ask');
      setError('');
    } catch (reason) {
      setError(apiErrorMessage(reason));
    }
  }, [api]);

  useEffect(() => {
    void read();
    const onFocus = () => void read();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [read]);

  const change = useCallback(
    async (next: boolean) => {
      const before = ask;
      setAsk(next);
      setError('');
      try {
        await api.saveSettings(TOOL, 'global', { [KEY]: next ? 'ask' : 'basic' });
      } catch (reason) {
        setAsk(before);
        setError(`The choice could not be saved: ${apiErrorMessage(reason)}`);
      }
    },
    [api, ask],
  );

  return { ask, error, change };
}
