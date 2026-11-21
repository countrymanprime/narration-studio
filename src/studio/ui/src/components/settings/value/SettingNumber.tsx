import { useId } from 'react';
import type { NumberSettingRange } from '../../../api/contracts/system';
import { NumberInput } from '../../primitives/NumberInput';
import { acceptedNumberText, describeNumberRange, numberProblem } from '../numberSetting';
import { useValueInFlight } from './useValueInFlight';

type SettingNumberProps = {
  label: string;
  /** The stored text: a number, or '' for "not set". */
  value: string;
  range: NumberSettingRange;
  /** Overrides the range's unit. */
  unit?: string;
  /** `settle` for a box that saves what it reports (Enter, leaving the box, an arrow step); `input` for a field of a form that is itself the draft. */
  commit: 'input' | 'settle';
  /** An emptied box is "not set" and is reported as ''. Without it an emptied box reports nothing and shows the stored value again. */
  allowEmpty?: boolean;
  /** A value the host accepts: in range and on step, or '' for an emptied box that may be. May return the save it starts. */
  onChange: (value: string) => void | Promise<unknown>;
  placeholder?: string;
  id?: string;
  describedBy?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** The box's width. */
  className?: string;
};

const UNBOUNDED: NumberSettingRange = { min: null, max: null, step: null, unit: '' };
/** The stored text as a number, or null when it is empty or not a number the host would read (`numberProblem` holds the host's rule). */
const stored = (value: string): number | null => (value.trim() === '' || numberProblem(UNBOUNDED, value.trim()) ? null : Number(value));

/**
 * The number box of a setting, with its unit: the one place a stored string becomes a number and back (component-selection CS-N1). What is
 * typed is clamped to the range and moved onto the step before it is reported, so the host is never sent a number it refuses; a number too
 * large to write without an exponent is not reported at all. An unset value is an empty box, never 0. A stored text that is not a number (a
 * hand-edited file) is shown as the placeholder of a marked, empty box, and a stored number the range refuses is marked too.
 */
export function SettingNumber({
  label,
  value,
  range,
  unit,
  commit,
  allowEmpty = false,
  onChange,
  placeholder,
  id,
  describedBy,
  disabled,
  invalid,
  className,
}: SettingNumberProps) {
  // The value a save in flight is carrying is shown until that save ends, so the box does not fall back to the old value while the host answers.
  const { shown, send } = useValueInFlight(value, onChange);
  const unitId = useId();
  const isJunk = shown.trim() !== '' && stored(shown) === null;
  const isRefused = shown.trim() !== '' && numberProblem(range, shown.trim()) !== undefined;
  const shownUnit = unit ?? range.unit;
  // A range note names the unit, and the caller ties its note to the box; with no range to note, the unit beside the box is its description.
  const describesByUnit = shownUnit !== '' && describeNumberRange(range) === '';
  const report = (n: number | null): void => {
    if (n === null) {
      if (allowEmpty) void send('');
      return;
    }
    const next = acceptedNumberText(range, n);
    if (next !== undefined) void send(next);
  };
  return (
    <span className="flex min-w-0 items-center gap-2">
      <NumberInput
        allowEmpty
        id={id}
        label={label}
        className={className}
        value={stored(shown)}
        min={range.min ?? undefined}
        max={range.max ?? undefined}
        step={range.step ?? undefined}
        stepFrom={range.step === null ? undefined : (range.min ?? 0)}
        commit={commit}
        disabled={disabled}
        invalid={invalid || isRefused}
        placeholder={placeholder ?? (isJunk ? shown : undefined)}
        aria-describedby={[describedBy, describesByUnit ? unitId : ''].filter(Boolean).join(' ') || undefined}
        onValueChange={report}
      />
      {shownUnit && (
        <span id={unitId} className="flex-none text-[0.8125rem] text-[var(--text-muted)]">
          {shownUnit}
        </span>
      )}
    </span>
  );
}
