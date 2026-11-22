import { forwardRef, useState, type KeyboardEvent } from 'react';
import { useSettledDraft } from './settledDraft';
import { TextField } from './TextField';

type TextFieldProps = Parameters<typeof TextField>[0];

type Base = Omit<TextFieldProps, 'value' | 'onChange' | 'type' | 'mono' | 'readOnly' | 'min' | 'max' | 'step' | 'inputMode'> & {
  min?: number;
  max?: number;
  step?: number;
  invalid?: boolean;
  /** When a typed value is reported: `input` (the default) at each valid keystroke, `settle` only on Enter, on leaving the box or on an arrow step. */
  commit?: 'input' | 'settle';
  /** Where the allowed steps are counted from (a setting's minimum). With it, an arrow from a value between two steps lands on the next step and not one step past the value. */
  stepFrom?: number;
  /** The number a clamped value is reported as (a setting's value moved onto its step), or undefined for one that cannot be reported, which puts the value back. */
  accepted?: (n: number) => number | undefined;
};
/** `onValueChange` may return the save it starts: a `settle` box then shows the value being saved until that save ends. */
type Filled = { allowEmpty?: false; value: number; onValueChange: (value: number) => void | Promise<unknown> };
/** The box may be empty, which is "not set": `null`, never 0. */
type Emptiable = { allowEmpty: true; value: number | null; onValueChange: (value: number | null) => void | Promise<unknown> };
type Props = Base & (Filled | Emptiable);

const decimals = (n: number): number => (String(n).split('.')[1] ?? '').length;
// A decimal as a person types one. `Number()` alone also reads hex, binary and exponent text (0x10, 0b11, 1e2), which nobody means by them.
const PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;
// Absorbs the binary error of a decimal step (0.3 / 0.1 is not 3), relative to the number of steps.
const STEP_TOLERANCE = 1e-9;
const asText = (n: number | null): string => (n === null ? '' : String(n));

// A number field that keeps what you type. A valid in-range number is applied at once; an empty, out-of-range or non-number
// entry is settled when focus leaves or on Enter: out of range clamps to `min` or `max`, junk reverts to the last value.
// ArrowUp and ArrowDown step by `step` and stop at the limits. It is built on `TextField` (a text box with
// `inputMode="decimal"`), not Base UI's NumberField, because that settles junk by itself on every keystroke and cannot hold
// a draft the narrator is still typing. Pass `onKeyDown` to take over a key: a prevented event is left alone.
// `commit="settle"` is for a box that saves what it reports, and keeps its draft in `useSettledDraft`: nothing is reported while typing,
// Escape drops the draft, a value is reported once, the value being saved is shown until its save ends, and a box taken away while it
// holds a draft (its dialog dismissed by a press outside) reports it, as leaving the box does.
// `allowEmpty` makes an emptied box a value (`null`) and not junk; an arrow step from an empty box starts at `min`, else 0.
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { value, onValueChange, allowEmpty, commit = 'input', min, max, step = 1, stepFrom, accepted, invalid, onBlur, onKeyDown, ...rest },
  ref,
) {
  const isSettle = commit === 'settle';
  // The draft of an `input` box; a `settle` box keeps its draft in `settled`.
  const [typedDraft, setTypedDraft] = useState<string | null>(null);
  // The union ties `null` to `allowEmpty`; inside, `null` is only ever reported under that flag.
  const report = onValueChange as (value: number | null) => void | Promise<unknown>;
  const clamp = (n: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const parse = (text: string): number | null => {
    const n = Number(text.trim());
    return PLAIN_NUMBER.test(text.trim()) && Number.isFinite(n) ? n : null;
  };
  const toAccepted = (n: number): number | undefined => (accepted ? accepted(n) : n);
  const isEmptied = (text: string): boolean => Boolean(allowEmpty) && text.trim() === '';
  /** What `text` is reported as: a number clamped and accepted, `null` for an emptied box, or undefined for nothing to report. */
  const readDraft = (text: string): number | null | undefined => {
    if (isEmptied(text)) return null;
    const n = parse(text);
    return n === null ? undefined : toAccepted(clamp(n));
  };
  const apply = (n: number | null | undefined): void => {
    if (n !== undefined && n !== value) void report(n);
  };
  const settled = useSettledDraft(asText(value), (text) => report(text === '' ? null : Number(text)), {
    read: (text) => {
      const n = readDraft(text);
      return n === undefined ? null : asText(n);
    },
    settleOnUnmount: isSettle,
  });
  const settle = (): void => {
    if (typedDraft === null) return;
    apply(readDraft(typedDraft));
    setTypedDraft(null);
  };
  const stepped = (base: number, direction: 1 | -1): number => {
    if (stepFrom === undefined) return Number((base + direction * step).toFixed(Math.max(decimals(step), decimals(base))));
    const steps = (base - stepFrom) / step;
    const isOnStep = Math.abs(steps - Math.round(steps)) <= STEP_TOLERANCE * Math.max(1, Math.abs(steps));
    const target = isOnStep ? Math.round(steps) + direction : direction === 1 ? Math.ceil(steps) : Math.floor(steps);
    return Number((stepFrom + target * step).toFixed(Math.max(decimals(step), decimals(stepFrom))));
  };
  const stepBy = (direction: 1 | -1): void => {
    const shown = isSettle ? (settled.standing === '' ? null : Number(settled.standing)) : value;
    const typed = isSettle ? settled.draft : typedDraft;
    const base = (typed !== null ? parse(typed) : null) ?? shown;
    const next = clamp(base === null ? (min ?? 0) : stepped(base, direction));
    if (isSettle) {
      settled.settleText(String(next));
      return;
    }
    apply(toAccepted(next));
    setTypedDraft(null);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter') {
      const input = event.currentTarget;
      if (isSettle) settled.settleText(settled.draft);
      else settle();
      // After the settled value has rendered, or the new text would drop the selection.
      queueMicrotask(() => input.select());
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepBy(event.key === 'ArrowUp' ? 1 : -1);
    } else if (event.key === 'Escape' && isSettle) {
      settled.reset();
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
      value={isSettle ? settled.draft : (typedDraft ?? asText(value))}
      onChange={(text) => {
        if (isSettle) {
          settled.setDraft(text);
          return;
        }
        setTypedDraft(text);
        const n = parse(text);
        if (n !== null && n === clamp(n)) apply(toAccepted(n));
        else if (isEmptied(text)) apply(null);
      }}
      onBlur={(event) => {
        if (isSettle) settled.settleText(settled.draft);
        else settle();
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
});
