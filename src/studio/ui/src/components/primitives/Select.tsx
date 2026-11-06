import type { ComponentPropsWithRef } from 'react';
import type { ControlNaming } from './controlNaming';
import { SELECT_BOX_CLASSES } from './selectBox';

// `group` heads an `<optgroup>`: consecutive options with the same group sit under one heading, and an option with none sits outside any.
type SelectOption = { value: string; label: string; group?: string };

type Props = Omit<ComponentPropsWithRef<'select'>, 'aria-label' | 'id' | 'value' | 'defaultValue' | 'onChange' | 'children' | 'title'> &
  ControlNaming & {
    value: string;
    onChange: (value: string) => void;
    options: readonly SelectOption[];
    // Fill the container's width (a form column); by default the select is as wide as its longest option.
    fullWidth?: boolean;
    // Shown, greyed and unpickable, while `value` is not among the options; it goes away once a real option is chosen.
    placeholder?: string;
  };

/**
 * The width limits Select adds when its caller sets none: it stays inside its container (`max-w-full`) and may shrink in a flex row (`min-w-0`), so a very long name
 * ends in an ellipsis instead of widening the box. A caller's own `max-w-*` or `min-w-*` replaces it: the stylesheet orders `max-w-full` after `max-w-80` and
 * `max-w-[260px]`, so adding it beside theirs would override the limit they asked for.
 */
function limits(className: string): string {
  const own = (kind: 'max' | 'min') => new RegExp(`(^|\\s)${kind}-w-`).test(className);
  return `${own('max') ? '' : 'max-w-full'} ${own('min') ? '' : 'min-w-0'}`.trim();
}

// The placeholder option's own value: a string no caller's option can have, so `onChange` can never report it.
const PLACEHOLDER_VALUE = '\u0000placeholder';

const SelectOptionRow = ({ option }: { option: SelectOption }) => <option value={option.value}>{option.label}</option>;

// Runs of options that share a group, in order; an ungrouped option is a run of its own.
function grouped(options: readonly SelectOption[]): { group: string | undefined; options: SelectOption[] }[] {
  const out: { group: string | undefined; options: SelectOption[] }[] = [];
  for (const option of options) {
    const last = out[out.length - 1];
    if (option.group !== undefined && last?.group === option.group) last.options.push(option);
    else out.push({ group: option.group, options: [option] });
  }
  return out;
}

// The browser's own `<select>` element, drawn with the app's tokens. It stays native on purpose: the platform's
// picker, keyboard search and form behaviour are the accessibility, `fireEvent.change` and Playwright's `selectOption` keep
// working, and no option needs rich content. Controlled, and `onChange` reports the chosen value, not the event.
export function Select({ label, value, onChange, options, fullWidth = false, placeholder, className = '', ...rest }: Props) {
  const showPlaceholder = placeholder !== undefined && !options.some((option) => option.value === value);
  // The full name of what the closed box shows: a long one ends in an ellipsis there, and this is how to read the rest.
  const shown = showPlaceholder ? placeholder : options.find((option) => option.value === value)?.label;
  return (
    <select
      {...rest}
      aria-label={label}
      value={showPlaceholder ? PLACEHOLDER_VALUE : value}
      onChange={(event) => event.target.value !== PLACEHOLDER_VALUE && onChange(event.target.value)}
      // A fixed height, not a minimum: a native <select> doesn't resolve `leading-[1.35]` the way an <input> or a styled
      // div does, so pinning the height is what makes it match TextField and Button (`--control-height`, 36px).
      className={`${SELECT_BOX_CLASSES} truncate ${limits(className)} ${fullWidth ? 'w-full' : ''} ${className}`}
      title={shown}
    >
      {showPlaceholder && (
        <option value={PLACEHOLDER_VALUE} disabled hidden>
          {placeholder}
        </option>
      )}
      {grouped(options).map((entry) =>
        entry.group === undefined ? (
          <SelectOptionRow key={entry.options[0].value} option={entry.options[0]} />
        ) : (
          <optgroup key={`group:${entry.group}:${entry.options[0].value}`} label={entry.group}>
            {entry.options.map((option) => (
              <SelectOptionRow key={option.value} option={option} />
            ))}
          </optgroup>
        ),
      )}
    </select>
  );
}
