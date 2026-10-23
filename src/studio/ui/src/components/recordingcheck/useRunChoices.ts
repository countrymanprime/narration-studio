import { useCallback, useEffect, useState } from 'react';
import type { CoverageEngines } from '../../api/contracts/coverage';
import { describeApiError } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import { runProblem, startChoices, type RunChoices } from './runChoices';

/**
 * The choices for a recording check on a page that does not already hold the engines: it reads them from the host once, starts the choices at the
 * host's defaults (the narrator's settings) and keeps what the narrator changes for as long as the page is open. `problem` is why the run cannot
 * start with these choices, or undefined; `error` is the failure of the read.
 */
export function useRunChoices() {
  const coverage = usePort('coverage');
  const [engines, setEngines] = useState<CoverageEngines>();
  const [choices, setChoices] = useState<RunChoices>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    coverage
      .coverageEngines()
      .then((answer) => {
        if (!active) return;
        setEngines(answer);
        setChoices((current) => current ?? startChoices(answer));
      })
      .catch((reason: unknown) => {
        if (active) setError(describeApiError(reason));
      });
    return () => {
      active = false;
    };
  }, [coverage]);
  const change = useCallback((patch: Partial<RunChoices>) => setChoices((current) => current && { ...current, ...patch }), []);
  const problem = engines && choices ? runProblem(choices, engines) : undefined;
  return { engines, choices, change, problem, error };
}
