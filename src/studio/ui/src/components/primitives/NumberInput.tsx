import { forwardRef, useEffect, useRef, useState, type KeyboardEvent } from 'react';
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
};
type Filled = { allowEmpty?: false; value: number; onValueChange: (value: number) => void };
/** The box may be empty, which is "not set": `null`, never 0. */
type Emptiable = { allowEmpty: true; value: number | null; onValueChange: (value: number | null) => void };
type Props = Base & (Filled | Emptiable);

const decimals = (n: number): number => (String(n).split('.')[1] ?? '').length;
// A decimal as a person types one. `Number()` alone also reads hex, binary and exponent text (0x10, 0b11, 1e2), which nobody means by them.
const PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;
// Absorbs the binary error of a decimal step (0.3 / 0.1 is not 3), relative to the number of steps.
const STEP_TOLERANCE = 1e-9;

// A number field that keeps what you type. A valid in-range number is applied at once; an empty, out-of-range or non-number
// entry is settled when focus leaves or on Enter: out of range clamps to `min` or `max`, junk reverts to the last value.
// ArrowUp and ArrowDown step by `step` and stop at the limits. It is built on `TextField` (a text box with
// `inputMode="decimal"`), not Base UI's NumberField, because that settles junk by itself on every keystroke and cannot hold
// a draft the narrator is still typing. Pass `onKeyDown` to take over a key: a prevented event is left alone.
// `commit="settle"` is for a box that saves what it reports: nothing is reported while typing, and Escape drops the draft.
// Such a box that is taken away while it holds a draft (its dialog dismissed by a press outside) reports it, as leaving the box does.
// `allowEmpty` makes an emptied box a value (`null`) and not junk; an arrow step from an empty box starts at `min`, else 0.
export const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { value, onValueChange, allowEmpty, commit = 'input', min, max, step = 1, stepFrom, invalid, onBlur, onKeyDown, ...rest },
  ref,
) {
  const [draft, setDraftState] = useState<string | null>(null);
  // The draft as of the last event, for the unmount below: state is a render behind when Escape and the unmount come in one event.
  const liveDraft = useRef<string | null>(null);
  const setDraft = (text: string | null): void => {
    liveDraft.current = text;
    setDraftState(text);
  };
  // The union ties `null` to `allowEmpty`; inside, `null` is only ever reported under that flag.
  const report = onValueChange as (value: number | null) => void;
  const clamp = (n: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const parse = (text: string): number | null => {
    const n = Number(text.trim());
    return PLAIN_NUMBER.test(text.trim()) && Number.isFinite(n) ? n : null;
  };
  const isEmptied = (text: string): boolean => Boolean(allowEmpty) && text.trim() === '';
  const apply = (n: number | null): void => {
    if (n !== value) report(n);
  };
  const reportDraft = (text: string): void => {
    const n = parse(text);
    if (n !== null) apply(clamp(n));
    else if (isEmptied(text)) apply(null);
  };
  const settle = (): void => {
    if (draft === null) return;
    reportDraft(draft);
    setDraft(null);
  };
  const latestReportDraft = useRef(reportDraft);
  latestReportDraft.current = reportDraft;
  useEffect(
    () => () => {
      if (commit === 'settle' && liveDraft.current !== null) latestReportDraft.current(liveDraft.current);
    },
    [commit],
  );
  const stepped = (base: number, direction: 1 | -1): number => {
    if (stepFrom === undefined) return Number((base + direction * step).toFixed(Math.max(decimals(step), decimals(base))));
    const steps = (base - stepFrom) / step;
    const isOnStep = Math.abs(steps - Math.round(steps)) <= STEP_TOLERANCE * Math.max(1, Math.abs(steps));
    const target = isOnStep ? Math.round(steps) + direction : direction === 1 ? Math.ceil(steps) : Math.floor(steps);
    return Number((stepFrom + target * step).toFixed(Math.max(decimals(step), decimals(stepFrom))));
  };
  const stepBy = (direction: 1 | -1): void => {
    const typed = draft !== null ? parse(draft) : null;
    const base = typed ?? value;
    apply(clamp(base === null ? (min ?? 0) : stepped(base, direction)));
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
    } else if (event.key === 'Escape' && commit === 'settle') {
      setDraft(null);
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
      value={draft ?? (value === null ? '' : String(value))}
      onChange={(text) => {
        setDraft(text);
        if (commit === 'settle') return;
        const n = parse(text);
        if (n !== null && n === clamp(n)) apply(n);
        else if (isEmptied(text)) apply(null);
      }}
      onBlur={(event) => {
        settle();
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
});
