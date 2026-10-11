import { useCallback, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { NarrationApi } from '../../../types';
import type { ChapterStatus } from '../../../api/contracts/manuscript';

type TimerApi = Pick<NarrationApi, 'productionStartTimer' | 'productionStopTimer'>;

/**
 * The stage timer as the old Production page ran it (SN0-Q4: the timer stays as built). Start refused because another timer runs says
 * so in the host's words; the host stops the other first and never switches silently. `onChange` runs after each write, so the page reads
 * the overview again and the shell's timer chip keeps its feed.
 */
export function useStageTimer(api: TimerApi, onChange: () => void | Promise<void>) {
  const [starting, setStarting] = useState<string>();
  const [stopping, setStopping] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const start = useCallback(
    async (chapterId: string, stage: ChapterStatus) => {
      setStarting(chapterId);
      setProblem(undefined);
      setNotice(undefined);
      try {
        const answer = await api.productionStartTimer(chapterId, stage);
        if (answer.status === 'refused') setProblem(answer.message);
        await onChange();
      } catch (error) {
        setProblem(apiErrorMessage(error));
      } finally {
        setStarting(undefined);
      }
    },
    [api, onChange],
  );

  const stop = useCallback(
    async (nameOf: (chapterId: string) => string) => {
      setStopping(true);
      setProblem(undefined);
      try {
        const answer = await api.productionStopTimer();
        if (answer.stopped) setNotice(`Timer stopped: the session on ${nameOf(answer.session.chapterId)} is logged.`);
        await onChange();
      } catch (error) {
        setProblem(apiErrorMessage(error));
      } finally {
        setStopping(false);
      }
    },
    [api, onChange],
  );

  return { starting, stopping, problem, notice, start, stop };
}
