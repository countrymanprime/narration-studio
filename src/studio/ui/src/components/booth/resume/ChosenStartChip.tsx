import { HeaderChip } from '../../primitives/HeaderChip';
import { TooltipTarget } from '../../primitives/Tooltip';

/**
 * The Booth's top-bar note of the start the narrator chose (Start from here, Record from here): "Starts from ¶ 3", with the same words the side panel's
 * Last punch section says in full ("Next roll starts from ¶ 3"). Drawn only while that panel is closed (a drawer in a window of 1280 px or less, or
 * a column the narrator closed), so a kept start is never silent and never said twice (#3319).
 */
export function ChosenStartChip({ paragraph }: { paragraph: number }) {
  const full = `Next roll starts from ¶ ${paragraph}`;
  return (
    <TooltipTarget text={full}>
      <HeaderChip role="group" aria-label={full} tone="neutral" className="flex-none">
        <span data-chosen-start="">Starts from ¶ {paragraph}</span>
      </HeaderChip>
    </TooltipTarget>
  );
}
