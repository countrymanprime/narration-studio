import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { EntityColour } from '../../kinds/entityColour';
import { kindDef, type KindId } from '../../kinds/kindMap';
import { kindMarkStyle } from '../../kinds/markStyle';

// A kind of highlighted text, drawn from the registry (kinds/kindMap.ts) so the same kind is the same mark on every page. It
// takes over from `Highlight`'s hand-written `Misread/Extra/Skipped/Restart` entries and its entity tints as the pages migrate
// (kindMap.test.ts lists them). A kind with no text mark (a breath, a click: a pin and a chip only) renders its words unmarked.
const BASE = 'ms-highlight rounded-[0.15rem] px-[0.05em] py-[var(--hl-pad-y,0.08em)] text-inherit [box-decoration-break:clone]';

type Props = {
  kind: KindId;
  children: ReactNode;
  /** The entry's colour (`entryColour`, `speakerColour`), for the `entity` kind. */
  colour?: EntityColour;
  onActivate?: () => void;
  /** The control's accessible name, when its words alone would not say what it is. */
  label?: string;
  /** More about the mark for a screen reader (what a flag heard). */
  description?: string;
};

export function KindMark({ kind, children, colour, onActivate, label, description }: Props) {
  const style = kindMarkStyle(kind, colour);
  if (!style) return <>{children}</>;
  if (!onActivate)
    return (
      <mark className={BASE} style={style} data-kind={kind} data-family={kindDef(kind).family} aria-description={description}>
        {children}
      </mark>
    );
  const activate = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
    onActivate();
  };
  return (
    <mark
      role="button"
      tabIndex={0}
      data-kind={kind}
      data-family={kindDef(kind).family}
      aria-label={label}
      aria-description={description}
      className={`${BASE} cursor-pointer`}
      style={style}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate(event);
      }}
    >
      {children}
    </mark>
  );
}
