import type { ComponentPropsWithRef } from 'react';
import type { ControlNaming } from './controlNaming';

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
  return (
    <select
      {...rest}
      aria-label={label}
      value={showPlaceholder ? PLACEHOLDER_VALUE : value}
      onChange={(event) => event.target.value !== PLACEHOLDER_VALUE && onChange(event.target.value)}
      // A fixed height, not a minimum: a native <select> doesn't resolve `leading-[1.35]` the way an <input> or a styled
      // div does, so pinning the height is what makes it match TextField and Button (`--control-height`, 36px).
      className={`box-border h-[var(--control-height)] rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-0 text-[0.88rem] leading-[1.35] text-[var(--text)] ${fullWidth ? 'w-full' : ''} ${className}`}
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
