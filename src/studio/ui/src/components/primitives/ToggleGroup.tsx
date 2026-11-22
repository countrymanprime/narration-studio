import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Pill } from './Pill';

type ToggleGroupOption = {
  value: string;
  label: string;
  disabled?: boolean;
  // Shown as a hint on the chip (why it is off, or what it means).
  title?: string;
  // Off, with the reason a hover, a focus and a screen reader get (`Pill`'s `disabledReason`).
  disabledReason?: string;
};

/** `default` is a row of standalone chips, each with its own border. `segmented` is one bordered container (the Master
 * platform switch): the control height (36 px; the mock draws 33), 1 px `--line-strong`, `--bg` fill, radius
 * ≈6; the chosen segment is inset, filled `--accent`, and the rest carry no fill, in the label's own case (title case in
 * the mocks, not uppercase — ACX, iNaudio, Google Play). */
export type ToggleGroupLook = 'default' | 'segmented';

/** Where a key moves focus to among `count` chips, from the chip at `from`; `undefined` for a key the group leaves alone. The arrows wrap. */
function rovingTarget(key: string, from: number, count: number): number | undefined {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (from + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (from - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/** The place of the chip an event came from, or -1. An event's `target` is typed as the group it was heard on, so it is widened here. */
function chipAt(chips: readonly HTMLButtonElement[], target: EventTarget): number {
  return chips.findIndex((chip) => chip === target);
}

// A group of chips of which one is chosen (the Whisper model, the text size, the theme). The group has a name a screen
// reader says before its chips ("Chunk length, group"). Each chip is a `Pill`, a toggle that reports `aria-pressed`; pressing the chosen one again reports it too and the
// caller decides. The default row wraps with 6 px gaps; `className` is the group's placement.
//
// The group is one tab stop (component-selection CS-K6): Tab lands on the chosen chip, or on the first that can take focus when
// none is chosen. The arrow keys, Home and End move focus only and Enter or Space chooses, so arrowing across a
// setting that saves at once saves nothing. A chip off with a reason stays in the rotation, so its reason can be read; a
// natively disabled chip is skipped. Base UI's toggle group is not used: it skips an `aria-disabled` chip and starts on the first chip, not the chosen one.
export function ToggleGroup({
  label,
  value,
  onChange,
  options,
  look = 'default',
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ToggleGroupOption[];
  look?: ToggleGroupLook;
  className?: string;
}) {
  // The chip that has focus holds the tab stop while focus is in the group, so Tab and Shift+Tab leave the group from any chip.
  const [focused, setFocused] = useState<string | undefined>(undefined);
  // A chip that is off and has a hint (`title`) is drawn as off with a reason: it stays focusable and reads its hint on focus. A natively disabled
  // chip with a title would make `Tooltip` wrap it in a span that is a second tab stop and swallows the arrows (#3993, qa-breaker B1).
  const asReasoned = (option: ToggleGroupOption): ToggleGroupOption =>
    option.disabled && !option.disabledReason && option.title ? { ...option, disabled: false, disabledReason: option.title } : option;
  const chips = options.map(asReasoned);
  const reachable = chips.filter((option) => !option.disabled);
  const tabStop = (reachable.find((option) => option.value === focused) ?? reachable.find((option) => option.value === value) ?? reachable[0])?.value;
  const holdTabStop = (event: FocusEvent<HTMLDivElement>) => {
    // Each chip draws one button, in the order of `options`.
    const index = chipAt(Array.from(event.currentTarget.querySelectorAll('button')), event.target);
    setFocused(options[index]?.value);
  };
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const chips = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const from = chipAt(chips, event.target); // -1 when the key came from something that is not a chip
    const to = from < 0 ? undefined : rovingTarget(event.key, from, chips.length);
    if (to === undefined) return;
    event.preventDefault();
    chips[to].focus();
  };
  const containerClass =
    look === 'segmented'
      ? // At least the control height (36 px), so it lines up with a search box or a select beside it (alignment audit XSE1-19); a group wider than its container wraps its options onto another line rather than clip the last (#2642).
        'inline-flex max-w-full min-h-[var(--control-height)] flex-wrap gap-0.5 rounded-[var(--radius-button)] border border-[var(--line-strong)] bg-[var(--bg)] p-[0.1875rem]'
      : // The chips wrap onto another line rather than squeeze, 6 px apart (alignment audit cause L); at no specificity, so a
        // caller's own gap or nowrap still wins.
        'flex [:where(&)]:flex-wrap [:where(&)]:gap-1.5';
  return (
    <div
      role="group"
      aria-label={label}
      className={`${containerClass} ${className}`}
      onKeyDown={moveFocus}
      onFocus={holdTabStop}
      onBlur={() => setFocused(undefined)}
    >
      {chips.map((option) => (
        <Pill
          key={option.value}
          label={option.label}
          active={value === option.value}
          disabled={option.disabled}
          title={option.title}
          disabledReason={option.disabledReason}
          look={look === 'segmented' ? 'segmented' : 'chip'}
          tabIndex={option.value === tabStop ? 0 : -1}
          onClick={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}
