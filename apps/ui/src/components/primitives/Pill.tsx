import { Toggle } from '@base-ui/react/toggle';
import { TooltipTarget } from './Tooltip';

/** `filter` is a list's filter chip (Proof's notes): 28 px, a full pill in sentence case, the active one filled with the text colour.
 * `chip` is a standalone toggle (the Whisper model, chunk length): 32 px, its own border, the label in capitals. `segmented`
 * is one segment of a `ToggleGroup look="segmented"` container: no
 * border of its own (the container draws it), the label in its own case, and the height fills the container's inset. */
export type PillLook = 'chip' | 'segmented' | 'filter';

const LOOK_CLASS: Record<PillLook, (active: boolean) => string> = {
  chip: (active) =>
    `h-[var(--button-height)] rounded-[var(--radius-button)] border px-3 uppercase leading-none ${active ? 'active border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]' : 'border-[var(--line-strong)] text-[var(--text-muted)]'}`,
  segmented: (active) =>
    `h-full rounded-[0.28rem] border-0 px-3 leading-none ${active ? 'active bg-[var(--accent)] text-[var(--accent-contrast)]' : 'text-[var(--text)]'}`,
  filter: (active) =>
    `h-7 rounded-full border px-3 leading-none ${active ? 'active border-[var(--text)] bg-[var(--text)] text-[var(--surface)]' : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-muted)]'}`,
};

// The label's own type: the caps condensed face of a button, or the body face in its own case for a filter chip.
const TYPE_CLASS: Record<PillLook, string> = {
  chip: "font-['Barlow_Condensed',sans-serif] text-[0.85rem] font-semibold tracking-[var(--tracking-button)]",
  segmented: "font-['Barlow_Condensed',sans-serif] text-[0.85rem] font-semibold tracking-[var(--tracking-button)]",
  filter: 'text-[0.85rem] font-medium',
};

// A toggle chip. Base UI's Toggle gives it `aria-pressed`, so a screen reader hears which chip of a group is selected. The
// callers use chips as a single choice, so pressing one (even the selected one) just reports a click and the caller decides.
// The `active` class stays, and stays mutually exclusive with the inactive classes: tests and drivers select it.
export function Pill({
  label,
  active,
  disabled,
  title,
  look = 'chip',
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  look?: PillLook;
  onClick?: () => void;
}) {
  const button = (
    <Toggle
      pressed={active}
      disabled={disabled}
      onPressedChange={() => onClick?.()}
      className={`inline-flex items-center justify-center ${TYPE_CLASS[look]} disabled:opacity-40 ${LOOK_CLASS[look](active)}`}
    >
      {label}
    </Toggle>
  );
  return title ? <TooltipTarget text={title}>{button}</TooltipTarget> : button;
}
