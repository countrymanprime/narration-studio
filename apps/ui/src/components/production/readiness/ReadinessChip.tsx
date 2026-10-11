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
  const colors = toneColors(VERDICT_TONE[verdict]);
  return (
    <TooltipTarget text={`${label} · ${stage}`}>
      {/* native-control-ok: the verdict mark must carry aria-haspopup="dialog" and its own name, which Badge's button and HeaderChip do not take. */}
      <button
        type="button"
        data-rchip={recommendation.chapterId}
        data-verdict={verdict}
        aria-label={`Stage readiness: ${label}, ${stage}`}
        aria-haspopup="dialog"
        // The mock's round 20 px mark, in the tone's soft fill and text colour (the pairs the palette guard already checks).
        className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border border-solid p-0 text-[0.7rem] leading-none font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        style={{ background: colors.fill, color: colors.text, borderColor: colors.line }}
        onClick={onOpen}
      >
        <span aria-hidden="true">{VERDICT_GLYPH[verdict]}</span>
      </button>
    </TooltipTarget>
  );
}
