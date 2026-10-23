import { forwardRef, useState, type KeyboardEvent } from 'react';
import { TextField } from './TextField';

type TextFieldProps = Parameters<typeof TextField>[0];

type Props = Omit<TextFieldProps, 'value' | 'onChange' | 'type' | 'mono' | 'readOnly' | 'min' | 'max' | 'step' | 'inputMode'> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  invalid?: boolean;
};

const decimals = (n: number): number => (String(n).split('.')[1] ?? '').length;

// A number field that keeps what you type. A valid in-range number is applied at once; an empty, out-of-range or non-number
// entry is settled when focus leaves or on Enter: out of range clamps to `min` or `max`, junk reverts to the last value.
// ArrowUp and ArrowDown step by `step` and stop at the limits. It is built on `TextField` (a text box with
// `inputMode="decimal"`), not Base UI's NumberField, because that settles junk by itself on every keystroke and cannot hold
// a draft the narrator is still typing. Pass `onKeyDown` to take over a key: a prevented event is left alone.
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { value, onValueChange, min, max, step = 1, invalid, onBlur, onKeyDown, ...rest },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const parse = (text: string): number | null => {
    const n = Number(text);
    return text.trim() !== '' && Number.isFinite(n) ? n : null;
  };
  const apply = (n: number): void => {
    if (n !== value) onValueChange(n);
  };
  const settle = (): void => {
    if (draft === null) return;
    const n = parse(draft);
    if (n !== null) apply(clamp(n));
    setDraft(null);
  };
  const stepBy = (direction: 1 | -1): void => {
    const base = (draft !== null ? parse(draft) : null) ?? value;
    const places = Math.max(decimals(step), decimals(base));
    apply(clamp(Number((base + direction * step).toFixed(places))));
    setDraft(null);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter') {
      const input = event.currentTarget;
      settle();
      // After the settled value has rendered, or the new text would drop the selection.
      queueMicrotask(() => input.select());
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepBy(event.key === 'ArrowUp' ? 1 : -1);
    }
  };
  return (
    <TextField
      {...(rest as TextFieldProps)}
      ref={ref}
      mono
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      aria-invalid={invalid ? true : undefined}
      value={draft ?? String(value)}
      onChange={(text) => {
        setDraft(text);
        const n = parse(text);
        if (n !== null && n === clamp(n)) apply(n);
      }}
      onBlur={(event) => {
        settle();
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
});
