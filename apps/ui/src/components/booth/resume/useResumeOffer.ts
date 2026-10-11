import { useEffect, useRef, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import type { TeleprompterLocateResult, TeleprompterSpan } from '../../../types';
import { resumeOfferFor, type KeptResume, type ResumeOfferState } from './resumeOffer';

const NONE: ResumeOfferState = { kind: 'none' };

/**
 * The chapter's resume offer: asks the host where the recording ends (`teleprompterLocate`, ADR 0111) once per chapter and
 * reduces the answer to one line (`resumeOfferFor`). It only reads. Nothing is asked, and nothing is offered, while a take
 * runs; a failed or pending lookup offers nothing. `model` is read when the lookup starts.
 */
export function useResumeOffer(args: {
  chapterId: string;
  model: string;
  spans: readonly TeleprompterSpan[];
  recording: boolean;
  kept?: KeptResume | null;
}): ResumeOfferState {
  const { chapterId, model, spans, recording, kept } = args;
  const teleprompter = usePort('teleprompter');
  const [answer, setAnswer] = useState<{ chapterId: string; result: TeleprompterLocateResult } | null>(null);
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    if (recording) return;
    let current = true;
    teleprompter
      .teleprompterLocate(chapterId, { model: modelRef.current })
      .then((result) => current && setAnswer({ chapterId, result }))
      .catch(() => current && setAnswer(null));
    return () => {
      current = false;
    };
  }, [teleprompter, chapterId, recording]);

  const result = answer?.chapterId === chapterId ? answer.result : null;
  return answer || kept ? resumeOfferFor({ spans, recording, kept, result }) : NONE;
}
