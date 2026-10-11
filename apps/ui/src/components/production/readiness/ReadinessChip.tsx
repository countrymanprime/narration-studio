import { toneColors, badgeClass, badgeStyle } from '../../primitives/StatusBadge';
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
        className={`${badgeClass('cell')} min-w-0 cursor-pointer px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`}
        style={badgeStyle(toneColors(VERDICT_TONE[verdict]))}
        onClick={onOpen}
      >
        <span aria-hidden="true">{VERDICT_GLYPH[verdict]}</span>
      </button>
    </TooltipTarget>
  );
}
