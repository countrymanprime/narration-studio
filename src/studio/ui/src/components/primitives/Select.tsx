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
// The closed select is drawn by us, not the operating system: its own caret (two gradients in --text-muted, so it follows the theme) in 2 rem
// kept clear at the right, so it looks like the app's other pickers beside it (the Booth's chapter picker, alignment audit XBO-20) and a long
// label stops before the caret (R3MS-19). The list it opens stays the native one.
const SELECT_CLASSES =
  'box-border h-[var(--control-height)] appearance-none rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] bg-no-repeat py-0 pr-8 pl-3 text-[0.88rem] leading-[1.35] text-[var(--text)] [background-image:linear-gradient(45deg,transparent_50%,var(--text-muted)_50%),linear-gradient(135deg,var(--text-muted)_50%,transparent_50%)] [background-position:calc(100%-1rem)_50%,calc(100%-0.6875rem)_50%] [background-size:0.3125rem_0.3125rem,0.3125rem_0.3125rem]';

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
      className={`${SELECT_CLASSES} ${fullWidth ? 'w-full' : ''} ${className}`}
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

// The select's closed box as a button, for a picker whose list is not a native `<select>`'s (the track picker's tree in a popover). It
// is drawn as `Select` is, with the same caret, height and edge, so the two read as one control; `children` is the shown value. It
// forwards its props and ref, so a `Popover` trigger or any `render` can use it. The caller names it (`aria-label`).
export function SelectTrigger({ fullWidth = false, className = '', children, ...rest }: ComponentPropsWithRef<'button'> & { fullWidth?: boolean }) {
  return (
    <button type="button" {...rest} className={`${SELECT_CLASSES} flex items-center overflow-hidden text-left ${fullWidth ? 'w-full' : ''} ${className}`}>
      {children}
    </button>
  );
}
