import type { CSSProperties } from 'react';
import type { MarkColour, MarkStyle } from '../api/contracts/marks';
import { tint, type EntityColour } from './entityColour';

// A narrator's mark type draws in the colour and the line style the narrator chose for it, on every page that shows the text (D8):
// the Script reader, the Booth and Editing. The six mark colours are custom properties of styles.css; the style is a tint, a box or
// one of four underlines. The words keep their text colour. This is the one map from a mark colour to its token (it replaces the
// four copies the audit found, docs/research/finding-colours-and-chips.md section 3.3).

const COLOUR_TOKEN: Record<MarkColour, string> = {
  copper: '--accent',
  info: '--info',
  ok: '--ok',
  warn: '--warn',
  bad: '--danger',
  violet: '--org',
};

/** The custom property a mark colour is drawn in, bare (`--org`). An end marker (a note's or a query's) takes the same token (D8). */
export const markToken = (colour: MarkColour): string => COLOUR_TOKEN[colour];

/** The colour of a manuscript note, which has no mark type of its own: the note token, drawn as a tint with a 2px line like an entry. */
export const NOTE_COLOUR: EntityColour = { hue: 'faint', line: '--note', text: '--text' };

/** The inline style of a narrator mark: a 22% tint, a 1.5px box, or an underline (solid, double, dotted or wavy) 2px thick. */
export function narratorMarkStyle(colour: MarkColour, style: MarkStyle): CSSProperties {
  const token = markToken(colour);
  const line = `var(${token})`;
  switch (style) {
    case 'highlight':
      return { background: tint(token, 22) };
    case 'box':
      return { boxShadow: `inset 0 0 0 1.5px ${line}`, borderRadius: 2 };
    default:
      return {
        textDecorationLine: 'underline',
        textDecorationStyle: style === 'underline' ? 'solid' : style,
        textDecorationColor: line,
        textDecorationThickness: '2px',
        textUnderlineOffset: '0.25em',
      };
  }
}
