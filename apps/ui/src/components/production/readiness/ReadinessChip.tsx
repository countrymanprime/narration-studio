import { toneColors } from '../../primitives/StatusBadge';
import { TooltipTarget } from '../../primitives/Tooltip';
import type { StageChapterRecommendation } from '../../../types';
import { stageLabel } from '../../stages/stageText';
import { VERDICT_GLYPH, VERDICT_LABEL, VERDICT_TONE, verdictOf } from './verdict';

/**
 * The verdict chip on the cell of the stage a chapter is in (the mock's `rchip`). It opens the readiness slide-over; the cell keeps
 * opening its page. Its name says the verdict and the stage, and the glyph is decoration: the verdict is never told by colour alone.
 */
export function ReadinessChip({ recommendation, onOpen }: { recommendation: StageChapterRecommendation; onOpen: () => void }) {
  const verdict = verdictOf(recommendation);
  const stage = stageLabel(recommendation.from);
  const label = VERDICT_LABEL[verdict];
  return (
    <TooltipTarget text={`${label} · ${stage}`}>
      <button
        type="button"
        data-rchip={recommendation.chapterId}
        data-verdict={verdict}
        aria-label={`Stage readiness: ${label}, ${stage}`}
        aria-haspopup="dialog"
        // The mock's round 20 px mark: the tone's text colour filled, the glyph in the surface colour.
        className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-[0.7rem] leading-none font-bold text-[var(--surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        style={{ background: toneColors(VERDICT_TONE[verdict]).text }}
        onClick={onOpen}
      >
        <span aria-hidden="true">{VERDICT_GLYPH[verdict]}</span>
      </button>
    </TooltipTarget>
  );
}
