import type { CSSProperties } from 'react';
import { spokenMarked } from '../../clock';

/**
 * A figure as it is drawn, and for a screen reader with every hours-and-minutes figure in it spelled out ("4 hours 35 minutes": "4h 35m" is read letter by
 * letter). Text with no such figure is drawn as it is. The one place a visible "5h 40m" gets its spoken form (#3443): the Production tiles, the stage bar's
 * legend and the Est. cells, and the Schedule's worked-out list.
 */
export function SpokenFigure({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const spoken = spokenMarked(text);
  if (spoken === text) {
    return (
      <span className={className} style={style}>
        {text}
      </span>
    );
  }
  return (
    // `relative`: the hidden copy is `position: absolute`, and with no positioned ancestor it sits where the page's own box is and can widen the page's scroll width.
    <span className={`relative ${className ?? ''}`.trim()} style={style}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only select-none">{spoken}</span>
    </span>
  );
}
