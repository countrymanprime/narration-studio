import { HeaderChip } from '../../primitives/HeaderChip';

/**
 * The Booth's footer note of the start the narrator chose (Start from here, Record from here): "Starts ¶ 3" (a short form to fit the bar's one row; its name is the whole sentence), with the same words the side panel's
 * Last punch section says in full ("Next roll starts from ¶ 3"). Drawn only while that panel is closed (a drawer in a window of 1280 px or less, or
 * a column the narrator closed), so a kept start is never silent and never said twice (#3319). It is a readout, not a button like "Resume at ¶ 14": the surface fill and a dashed rim, and it has no press. The footer stands it above its rim at the right, taking no room in any row and no press (no tooltip either: its name is the whole sentence), so no width or paragraph number changes the footer's height or covers a control.
 */
export function ChosenStartChip({ paragraph }: { paragraph: number }) {
  const full = `Next roll starts from ¶ ${paragraph}`;
  return (
    <HeaderChip role="group" aria-label={full} tone="neutral" readout className="flex-none">
      <span data-chosen-start="">Starts ¶ {paragraph}</span>
    </HeaderChip>
  );
}
