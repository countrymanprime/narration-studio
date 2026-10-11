import { useCallback, useMemo, useRef } from 'react';
import type { ExtractionDecision } from '../../../../api/contracts/extraction';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import { useJournal } from '../../../../studio/StudioProvider';
import type { Result } from '../../../../studio/journal/createJournal';
import { acceptSuggestion, rejectSuggestion, reviewSuggestion, type DecisionEnv } from './commands';

export type SuggestionDecisions = {
  /** Each answers whether the host made the change. A refusal is the host's own sentence in a toast and nothing changed. */
  accept: (id: string, text?: string) => Promise<boolean>;
  reject: (id: string) => Promise<boolean>;
  review: (id: string) => Promise<boolean>;
};

/** A refusal is the host's own sentence in a toast; nothing was journalled. */
function said(result: Result<ExtractionDecision>): boolean {
  if (!result.ok) overlay.toast(result.refusal.reason, { tone: 'error' });
  return result.ok;
}

/**
 * The narrator's decisions on suggestions, over `usePort('extraction')` and the journal. `onChanged` hears every decision and every
 * undo of one, so the page that lists the suggestions can show them as they are now.
 */
export function useSuggestionDecisions(onChanged?: (decision: ExtractionDecision) => void): SuggestionDecisions {
  const port = usePort('extraction');
  const journal = useJournal();
  const heard = useRef(onChanged);
  heard.current = onChanged;
  const env = useMemo<DecisionEnv>(() => ({ journal, port, changed: (decision) => heard.current?.(decision) }), [journal, port]);
  const accept = useCallback(async (id: string, text?: string) => said(await acceptSuggestion(env, id, text)), [env]);
  const reject = useCallback(async (id: string) => said(await rejectSuggestion(env, id)), [env]);
  const review = useCallback(async (id: string) => said(await reviewSuggestion(env, id)), [env]);
  return useMemo(() => ({ accept, reject, review }), [accept, reject, review]);
}
