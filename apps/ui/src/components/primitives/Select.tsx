import type { ComponentPropsWithRef } from 'react';
import type { ControlNaming } from './controlNaming';

type SelectOption = { value: string; label: string };

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

// The browser's own `<select>` element, drawn with the app's tokens (ADR 0053). It stays native on purpose: the platform's
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
      // div does, so pinning the height is what makes it match
      // TextField's 40.8px instead of drifting a little taller.
      className={`box-border h-[var(--control-height)] rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-[0.6rem] text-[0.88rem] leading-[1.35] text-[var(--text)] ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {showPlaceholder && (
        <option value={PLACEHOLDER_VALUE} disabled hidden>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
