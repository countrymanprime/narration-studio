import type { CSSProperties } from 'react';
import type { EntityColour } from './entityColour';
import { kindColour, kindDef, kindFill, type KindId } from './kindMap';

// The one text-mark recipe per kind, as inline style. It is a function of the registry and nothing else, so `KindMark` (an
// element) and a renderer that draws thousands of words and wants a style object, not an element each, draw the same mark.

const UNDERLINE_OFFSET = '0.25em';

/** The style of a kind's text mark; undefined for a kind that is not drawn in running text. `colour` is the entry's, for an entity kind. */
export function kindMarkStyle(id: KindId, colour?: EntityColour): CSSProperties | undefined {
  const { mark } = kindDef(id);
  if (!mark) return undefined;
  const { line, text } = kindColour(id, colour);
  const lineColour = `var(${line})`;
  const base: CSSProperties = { background: mark.fill ? kindFill(id, colour) : 'transparent' };
  if (mark.italic) base.fontStyle = 'italic';
  const decorated = (style: string, thickness: string): CSSProperties => ({
    ...base,
    textDecoration: `underline ${style} ${lineColour}`,
    textDecorationThickness: thickness,
    textUnderlineOffset: UNDERLINE_OFFSET,
  });
  switch (mark.shape) {
    case 'wavy':
      return { ...decorated('wavy', '2px'), color: `var(${text})` };
    case 'double':
      return decorated('double', '3px');
    case 'thin':
      return decorated('solid', '1px');
    case 'dotted':
      return decorated('dotted', '2px');
    case 'dashed-box':
      // A box, not an underline: nothing was said here, so the words are drawn muted inside the outline.
      return { ...base, color: 'var(--text-muted)', outline: `1.5px dashed ${lineColour}`, outlineOffset: '1px' };
    case 'bar':
      // Zero-width in the text: the bar sits at the left of the word it was heard before.
      return { ...base, color: `var(${text})`, boxShadow: `inset 0.14em 0 0 ${lineColour}`, paddingLeft: '0.2em' };
    case 'tint':
      return { ...base, color: `var(${text})`, boxShadow: `inset 0 -${id === 'search' ? '1.5px' : '2px'} 0 ${lineColour}` };
  }
}
