import { HeaderChip } from '../../primitives/HeaderChip';
import { TooltipTarget } from '../../primitives/Tooltip';

/**
 * The Booth's top-bar note of the start the narrator chose (Start from here, Record from here): "Starts ¶ 3" (a short form to fit the bar's one row; its name is the whole sentence), with the same words the side panel's
 * Last punch section says in full ("Next roll starts from ¶ 3"). Drawn only while that panel is closed (a drawer in a window of 1280 px or less, or
 * a column the narrator closed), so a kept start is never silent and never said twice (#3319). It is a readout, not a button like "Resume at ¶ 14": no fill and a
 * dashed rim, and it has no press. The top bar keeps its slot while no start is chosen, so nothing moves when one is.
 */
export function ChosenStartChip({ paragraph }: { paragraph: number }) {
  const full = `Next roll starts from ¶ ${paragraph}`;
  return (
    <TooltipTarget text={full}>
      <HeaderChip role="group" aria-label={full} tone="neutral" className="flex-none border-dashed! bg-transparent!">
        <span data-chosen-start="">Starts ¶ {paragraph}</span>
      </HeaderChip>
    </TooltipTarget>
  );
}
