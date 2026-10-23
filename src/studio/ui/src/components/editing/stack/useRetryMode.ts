import { useCallback, useEffect, useState } from 'react';
import type { RetryLevel, RetryMode, RetryModeAnswer } from '../../../api/contracts/editStacks';
import { usePort } from '../../../ports/usePort';

export interface RetryModeChoice {
  /** What applies at the level, or null until the host has answered. */
  answer: RetryModeAnswer | null;
  /** Chooses the mode at the level, or with '' takes it back so the level follows the one above. Moves nothing. */
  choose: (mode: RetryMode | '') => Promise<void>;
  /** The host's sentence when it refused to read or store the choice. */
  error: string | null;
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** A level's retry choice, read from and stored through the Editing records port. */
export function useRetryMode(level: RetryLevel, chapterId: string, passageId: string, onChange?: (answer: RetryModeAnswer) => void): RetryModeChoice {
  const log = usePort('editStacks');
  const [answer, setAnswer] = useState<RetryModeAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    log.editingRetryModeGet(level, chapterId, passageId).then(
      (a) => live && setAnswer(a),
      (e: unknown) => live && setError(why(e)),
    );
    return () => {
      live = false;
    };
  }, [log, level, chapterId, passageId]);
  const choose = useCallback(
    async (mode: RetryMode | '') => {
      try {
        const a = await log.editingRetryModeSet(level, chapterId, passageId, mode);
        setAnswer(a);
        setError(null);
        onChange?.(a);
      } catch (e) {
        setError(why(e));
      }
    },
    [log, level, chapterId, passageId, onChange],
  );
  return { answer, choose, error };
}
