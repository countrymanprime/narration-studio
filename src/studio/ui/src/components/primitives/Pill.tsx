import { Toggle } from '@base-ui/react/toggle';
import { useId } from 'react';
import type { IconName } from '../../icons.catalog';
import { Icon } from './Icon';
import { TooltipTarget } from './Tooltip';

/** `filter` is a list filter: 28 px, a round pill in sentence case, the ink fill when pressed (the mock's `.chip`). `chip` is a standalone toggle (the Whisper model, chunk length): 32 px, its own border, the label in capitals. `segmented`
 * is one segment of a `ToggleGroup look="segmented"` container: no
 * border of its own (the container draws it), the label in its own case, and the height is the container's inset (its control height less the border and padding), so a wrapped group keeps every segment a full target. */
export type PillLook = 'chip' | 'segmented' | 'filter';

const LOOK_CLASS: Record<PillLook, (active: boolean) => string> = {
  chip: (active) =>
    `h-[var(--button-height)] rounded-[var(--radius-button)] border px-3 uppercase leading-none ${active ? 'active border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]' : 'border-[var(--line-strong)] text-[var(--text-muted)]'}`,
  filter: (active) =>
    `h-[var(--chip-height)] rounded-full border px-3 leading-none ${active ? 'active border-[var(--text)] bg-[var(--text)] text-[var(--surface)]' : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-muted)]'}`,
  segmented: (active) =>
    // A segment grows with the group, so a group wider than its labels shares the room and centres each label in its own part; an unchosen
    // segment is muted and takes a fill on hover, so it reads as a choice and not a label (alignment audit XPF-6).
    `min-h-[calc(var(--control-height)-0.5rem)] grow rounded-[0.28rem] border-0 px-3 leading-none ${active ? 'active bg-[var(--accent)] text-[var(--accent-contrast)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'}`,
};

// A toggle chip. Base UI's Toggle gives it `aria-pressed`, so a screen reader hears which chip of a group is selected. The
// callers use chips as a single choice, so pressing one (even the selected one) just reports a click and the caller decides.
// The `active` class stays, and stays mutually exclusive with the inactive classes: tests and drivers select it.
export function Pill({
  label,
  active,
  disabled,
  title,
  disabledReason,
  look = 'chip',
  tabIndex,
  icon,
  action = false,
  raised = false,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  /** Off, with the reason: the chip stays focusable and hoverable (a native `disabled` takes neither), a press does nothing, and the reason is its hint and its description. */
  disabledReason?: string;
  look?: PillLook;
  /** Set by `ToggleGroup`, whose chips share one tab stop; a chip that stands alone leaves it out and is its own tab stop. */
  tabIndex?: number;
  /** A glyph before the label, asked for by action name. */
  icon?: IconName;
  /** A chip that does something when pressed and holds no state (the approval's "2 effects above"): a plain button, with no `aria-pressed`. */
  action?: boolean;
  /** Floats over other content (a pointer over a scrolling body): the overlay shadow, so it reads as above what it covers. */
  raised?: boolean;
  onClick?: () => void;
}) {
  const reasonId = useId();
  const gated = Boolean(disabledReason);
  const className = `inline-flex items-center justify-center whitespace-nowrap ${look === 'filter' ? 'text-[0.88rem] font-medium' : "font-['Barlow_Condensed',sans-serif] text-[0.85rem] font-semibold tracking-[var(--tracking-button)]"} ${gated ? 'cursor-not-allowed opacity-75' : 'disabled:opacity-40'} ${LOOK_CLASS[look](active)} ${icon ? 'gap-1.5' : ''} ${raised ? 'shadow-[var(--shadow-lg)]' : ''}`;
  const content = (
    <>
      {icon && <Icon name={icon} />}
      {label}
    </>
  );
  const button = action ? (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={gated || undefined}
      aria-describedby={gated ? reasonId : undefined}
      tabIndex={tabIndex}
      onClick={() => (gated ? undefined : onClick?.())}
      // Off with a reason it is dimmed like the toggle chip (`ariaStateGuards.test.ts` holds every raw aria-disabled button to that).
      className={`${className} aria-disabled:opacity-75`}
    >
      {content}
    </button>
  ) : (
    <Toggle
      pressed={active}
      disabled={disabled}
      aria-disabled={gated || undefined}
      aria-describedby={gated ? reasonId : undefined}
      tabIndex={tabIndex}
      onPressedChange={() => (gated ? undefined : onClick?.())}
      className={className}
    >
      {content}
    </Toggle>
  );
  // A caller that sometimes has a reason passes `''` when it has none, as `Button` does: the chip is then wrapped the same way throughout, so it is
  // the same element when the reason arrives and a focused chip keeps focus (a swap of wrappers rebuilds the button and focus falls to the page).
  const wrapped = gated || title || disabledReason !== undefined;
  return (
    <>
      {wrapped ? <TooltipTarget text={gated ? disabledReason! : (title ?? '')}>{button}</TooltipTarget> : button}
      {gated && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </>
  );
}
