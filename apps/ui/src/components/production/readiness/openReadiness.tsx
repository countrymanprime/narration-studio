import { useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import type { ChapterStatus, StageChapterRecommendation } from '../../../types';
import type { Notify } from '../../primitives/Toast';
import { useStageRecommendations, type StageDecision } from '../../stages/useStageRecommendations';
import { ReadinessPanel } from './ReadinessPanel';

type Options = {
  chapterId: string;
  /** Where the hook says what a Confirm, Dismiss or Revert did, or why the host refused it. */
  notify: Notify;
  /** Hears the chapter status a Confirm or Revert set, so the caller's own chapter list follows. */
  onStatus: (chapterId: string, status: ChapterStatus) => void;
};

/**
 * The panel as the overlay holds it: it reads the suggestions itself, because the overlay renders a spec made once. It keeps the suggestion
 * it first read, so Confirm sends the basis the narrator saw: if the evidence moved, the host refuses, the panel reads again and says so.
 */
function ReadinessContent({ chapterId, notify, onStatus }: Options) {
  const { state, refresh, decide, isPending, busy } = useStageRecommendations({ refreshKey: chapterId, notify, onStatus });
  const recommendation = state.byChapter.get(chapterId);
  const [seen, setSeen] = useState<StageChapterRecommendation>();
  // A status that moved (a Confirm or Revert) starts a new reading; a re-read of the same stage keeps the first.
  if (recommendation && (!seen || seen.from !== recommendation.from)) setSeen(recommendation);
  const onDecide = (decision: StageDecision) => {
    if (!recommendation) return;
    const basis = decision === 'confirm' && seen ? { ...recommendation, target: seen.target, basisKey: seen.basisKey } : recommendation;
    void decide(decision, basis);
  };
  return (
    <ReadinessPanel
      recommendation={recommendation}
      seen={seen}
      phase={state.phase}
      error={state.error}
      isPending={(decision) => isPending(decision, chapterId)}
      busy={busy}
      onDecide={onDecide}
      onCheckNow={() => void refresh()}
    />
  );
}

/** Opens the readiness slide-over of a chapter through the overlay service; the chip that called it gets focus back when it closes. */
export function openReadiness(options: Options): () => void {
  return overlay.open({ kind: 'slideOver', title: 'Stage readiness', render: () => <ReadinessContent {...options} /> });
}
