import type { NumberSettingRange } from '../../api/contracts/system';

// The page's copy of the host's number check (src/studio/desktop/settings_number.go): a plain decimal, in range, on step. The
// host still validates every save; this only lets the row say what is wrong before Save is pressed.
const PLAIN_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;
const STEP_TOLERANCE = 1e-9;

const withUnit = (value: number, unit: string) => (unit ? `${value} ${unit}` : `${value}`);

function rangeWords({ min, max, unit }: NumberSettingRange): string {
  if (min !== null && max !== null) return `from ${min} to ${withUnit(max, unit)}`;
  if (min !== null) return `at least ${withUnit(min, unit)}`;
  if (max !== null) return `at most ${withUnit(max, unit)}`;
  return '';
}

/** The range in words, like "From -60 to 0 dBTP", or '' when the field is unbounded. */
export function describeNumberRange(range: NumberSettingRange): string {
  const words = rangeWords(range);
  return words && words[0].toUpperCase() + words.slice(1);
}

/** Why `text` cannot be saved in a number field with `range`, or undefined when it can. Empty text is "not set", which is valid. */
export function numberProblem(range: NumberSettingRange, text: string): string | undefined {
  if (text === '') return undefined;
  const value = Number(text);
  if (!PLAIN_NUMBER.test(text) || !Number.isFinite(value)) return 'Enter a number, like -3 or 0.5.';
  if ((range.min !== null && value < range.min) || (range.max !== null && value > range.max)) return `Enter a value ${rangeWords(range)}.`;
  if (range.step !== null) {
    const steps = (value - (range.min ?? 0)) / range.step;
    if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE * Math.max(1, Math.abs(steps))) return `Use steps of ${range.step}.`;
  }
  return undefined;
}

const decimals = (n: number): number => (String(n).split('.')[1] ?? '').length;

/**
 * `n` moved to the nearest value the host accepts for `range`: on a step counted from `min` (from 0 with no `min`, the host's origin rule),
 * a half step going up, and inside `min` and `max`. A `max` between steps gives the last step below it.
 */
export function snapToStep(range: NumberSettingRange, n: number): number {
  const { min, max, step } = range;
  const bounded = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  if (step === null || step <= 0) return bounded;
  const origin = min ?? 0;
  const places = Math.max(decimals(step), decimals(origin));
  // The tolerance sends a half step up although its quotient is a hair under (0.15 / 0.1 is 1.4999999999999998).
  const onStep = (steps: number): number => Number((origin + steps * step).toFixed(places));
  const steps = Math.round((bounded - origin) / step + STEP_TOLERANCE);
  const snapped = onStep(steps);
  return max !== null && snapped > max ? onStep(steps - 1) : snapped;
}

/**
 * The range a list of choices spans when they are consecutive whole numbers ("0" to "10"), so the choice can be drawn as a number box; undefined
 * for any other list.
 */
export function wholeNumberRange(choices: readonly string[], unit = ''): NumberSettingRange | undefined {
  if (choices.length < 2 || !choices.every((choice) => /^-?\d+$/.test(choice))) return undefined;
  const numbers = choices.map(Number);
  if (!numbers.every((n, index) => index === 0 || n === numbers[index - 1] + 1)) return undefined;
  return { min: numbers[0], max: numbers[numbers.length - 1], step: 1, unit };
}
