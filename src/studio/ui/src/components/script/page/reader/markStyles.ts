import type { CSSProperties } from 'react';
import type { MarkColour, MarkStyle } from '../../../../api/contracts/marks';

/** The token each of the mock's six mark colours is drawn with. */
const COLOUR_TOKEN: Record<MarkColour, string> = {
  copper: '--accent',
  info: '--info',
  ok: '--ok',
  warn: '--warn',
  bad: '--danger',
  violet: '--org',
};

/** The line a mark draws in its type's colour: a tint, one of four underlines, or a box. The text colour is never changed. */
export function markStyle(colour: MarkColour, style: MarkStyle): CSSProperties {
  const c = `var(${COLOUR_TOKEN[colour]})`;
  switch (style) {
    case 'highlight':
      return { backgroundColor: `color-mix(in srgb, ${c} 22%, transparent)` };
    case 'box':
      return { boxShadow: `inset 0 0 0 1.5px ${c}`, borderRadius: 2 };
    default:
      return {
        textDecorationLine: 'underline',
        textDecorationStyle: style === 'underline' ? 'solid' : style,
        textDecorationColor: c,
        textDecorationThickness: 2,
        textUnderlineOffset: 3,
      };
  }
}
