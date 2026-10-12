import { Input } from '@base-ui/react/input';
import type { ComponentPropsWithRef } from 'react';
import type { ControlNaming } from './controlNaming';

// The look every text control shares; the wrapper owns it, not a global rule or a per-page copy (ADR 0053).
// The size is set separately (SANS_CLASSES/MONO_CLASSES): a `text-*` utility can't be layered safely, since two of them in one
// className race for the same CSS property.
const BASE_CLASSES =
  'box-border rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-0 leading-[1.35] text-[var(--text)]';
// A colour swatch is a small square, not a field.
const COLOR_CLASSES = 'size-[2.35rem] rounded-[0.35rem] border border-[var(--line-strong)] bg-[var(--surface)] p-[0.2rem]';
// The height is the mock's (ADR 0760): 36px, or 32px for `sm`. A caller's `w-` class replaces the default `w-full`.
const SIZE_CLASSES = { md: 'h-9', sm: 'h-8' } as const;
const SANS_CLASSES = 'text-[0.88rem]';
// Values that are code, not prose - a hex colour, an id, a number - read a touch larger than body text (~15px on the mocks' numeric fields).
const MONO_CLASSES = "text-[0.9375rem] font-['IBM_Plex_Mono',ui-monospace,monospace]";
// A value the app computed that the narrator can read and copy but not edit: the same
// control, on --surface-2 instead of --surface, cursor-default, no focus ring.
const READ_ONLY_CLASSES = 'cursor-default bg-[var(--surface-2)] focus-visible:outline-none';

type Props = Omit<ComponentPropsWithRef<'input'>, 'aria-label' | 'id' | 'value' | 'defaultValue' | 'onChange' | 'type' | 'title' | 'size'> &
  ControlNaming & {
    value: string;
    onChange: (value: string) => void;
    // `color` is the browser's colour picker; no other input type is offered, so a page cannot ask for a native one.
    type?: 'text' | 'color';
    // The typeface for values that are code: a hex colour, an id, a number.
    mono?: boolean;
    // A value the narrator can read and select but not change.
    readOnly?: boolean;
    // `md` is 36px high, `sm` 32px.
    size?: keyof typeof SIZE_CLASSES;
  };

// A bare text input: the control alone, full width of its container unless a `w-` class says otherwise, controlled, and `onChange` reports the text, not the
// event. Use `Field` when the control has a visible label, a hint or an error. It passes standard input attributes and the
// ref through (`placeholder`, `disabled`, `onKeyDown`, and the `role` and `aria-*` of the alias combobox), so a widget can build
// on it.
export function TextField({ label, value, onChange, type = 'text', mono = false, readOnly = false, size = 'md', className = '', ...rest }: Props) {
  const ownsWidth = /(^|\s)!?w-/.test(className);
  return (
    <Input
      {...rest}
      type={type}
      aria-label={label}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
      className={`${type === 'color' ? COLOR_CLASSES : `${BASE_CLASSES} ${SIZE_CLASSES[size]} ${ownsWidth ? '' : 'w-full'} ${mono ? MONO_CLASSES : SANS_CLASSES}`} ${readOnly ? READ_ONLY_CLASSES : ''} ${className}`}
    />
  );
}
