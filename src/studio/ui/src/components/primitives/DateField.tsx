import { Input } from '@base-ui/react/input';
import type { ComponentPropsWithRef } from 'react';
import type { ControlNaming } from './controlNaming';

// The text control's look at its 36 px height, in the mono face a date reads best in. `color-scheme` follows the theme (styles.css sets it on the root), so the
// browser's calendar button and popup are drawn light or dark with the page.
const CLASSES =
  "box-border h-[var(--control-height)] rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-0 text-[0.9375rem] leading-[1.35] text-[var(--text)] font-['IBM_Plex_Mono',ui-monospace,monospace]";

type Props = Omit<ComponentPropsWithRef<'input'>, 'aria-label' | 'id' | 'value' | 'defaultValue' | 'onChange' | 'type' | 'title' | 'size'> &
  ControlNaming & {
    /** The date as "YYYY-MM-DD", or '' while none is set. */
    value: string;
    /** The date as "YYYY-MM-DD", or '' while the field is empty or only part written. The browser never reports a date that does not exist (February 30). */
    onChange: (value: string) => void;
  };

/**
 * The browser's own date field: the narrator types the parts or opens the calendar, and `onChange` reports "YYYY-MM-DD" (the form the plan stores), never a locale's
 * writing of it. Full width of its container unless a `w-` class says otherwise. Named like `TextField`: by `label` or by an `id` a visible `<label htmlFor>` points at.
 */
export function DateField({ label, value, onChange, className = '', ...rest }: Props) {
  const ownsWidth = /(^|\s)!?w-/.test(className);
  return (
    <Input
      {...rest}
      type="date"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${CLASSES} ${ownsWidth ? '' : 'w-full'} ${className}`}
    />
  );
}
