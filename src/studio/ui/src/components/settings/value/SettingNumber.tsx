import { useId, useRef, useState } from 'react';
import type { NumberSettingRange } from '../../../api/contracts/system';
import { NumberInput } from '../../primitives/NumberInput';
import { acceptedNumberText, describeNumberRange, numberProblem } from '../numberSetting';

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
  onChange: Save;
  placeholder?: string;
  id?: string;
  describedBy?: string;
  /** Writes the range ("From 0 to 10 s") as a muted note under the box, describing it after `describedBy`. */
  showRange?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** The box's width. */
  className?: string;
};

type Save = (value: string) => void | Promise<unknown>;

/**
 * The value the box shows while its save is out: the one on its way, then the stored one again once the save ends, kept or refused. `send`
 * compares with what is shown, not with what is stored, so going back to the stored value while a save is out is sent after it, and a second
 * Enter on the value being saved sends nothing.
 */
function useValueInFlight(value: string, onChange: Save): { shown: string; send: (next: string) => void } {
  const [sent, setSent] = useState<{ value: string; save: number } | null>(null);
  const saves = useRef(0);
  const shown = sent?.value ?? value;
  const send = (next: string): void => {
    if (next === shown) return;
    const started = onChange(next);
    if (!(started instanceof Promise)) return;
    const save = ++saves.current;
    setSent({ value: next, save });
    // Only the latest save stops the showing: an earlier one that ends while a later one is out leaves the later value up.
    const end = () => setSent((now) => (now?.save === save ? null : now));
    // Whoever started the save shows how it ended; here it only stops showing the value as on its way.
    started.then(end, end);
  };
  return { shown, send };
}

const UNBOUNDED: NumberSettingRange = { min: null, max: null, step: null, unit: '' };
/** The stored text as a number, or null when it is empty or not a number the host would read (`numberProblem` holds the host's rule). */
const stored = (value: string): number | null => (value.trim() === '' || numberProblem(UNBOUNDED, value.trim()) ? null : Number(value));

/**
 * The number box of a setting, with its unit: the one place a stored string becomes a number and back (component-selection CS-N1). What is
 * typed is clamped to the range and moved onto the step before it is reported, so the host is never sent a number it refuses; a number too
 * large to write without an exponent is not reported at all. An unset value is an empty box, never 0. A stored text that is not a number (a
 * hand-edited file) is shown as the placeholder of a marked, empty box, and a stored number past the range is marked too.
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
  showRange = false,
  disabled,
  invalid,
  className,
}: SettingNumberProps) {
  // The value a save in flight is carrying is shown until that save ends, so the box does not fall back to the old value while the host answers.
  const { shown, send } = useValueInFlight(value, onChange);
  const unitId = useId();
  const noteId = useId();
  const note = showRange ? describeNumberRange(range) : '';
  const isJunk = shown.trim() !== '' && stored(shown) === null;
  // Only a value past the range is marked, not one between steps: on main the host's own defaults for the cleanup levels (12 and 30 dB on a
  // 0.5 step counted from 0.1) sit between its steps, and a default must not read as an error.
  const n = stored(shown);
  const isRefused = isJunk || (n !== null && ((range.min !== null && n < range.min) || (range.max !== null && n > range.max)));
  const shownUnit = unit ?? range.unit;
  // A range note names the unit, so it describes the box (this one, or the caller's); with no range to note, the unit beside the box is.
  const describesByUnit = shownUnit !== '' && describeNumberRange(range) === '';
  const report = (n: number | null): void => {
    if (n === null) {
      if (allowEmpty) send('');
      return;
    }
    const next = acceptedNumberText(range, n);
    if (next !== undefined) send(next);
  };
  const box = (
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
        aria-describedby={[describedBy, note ? noteId : '', describesByUnit ? unitId : ''].filter(Boolean).join(' ') || undefined}
        onValueChange={report}
      />
      {shownUnit && (
        <span id={unitId} className="flex-none text-[0.8125rem] text-[var(--text-muted)]">
          {shownUnit}
        </span>
      )}
    </span>
  );
  if (!note) return box;
  // The note hangs under the box, so a row that lines its label up with the box (`items-start`) keeps them level.
  return (
    <span className="flex flex-col gap-1">
      {box}
      <span id={noteId} className="text-[0.8125rem] text-[var(--text-muted)]">
        {note}
      </span>
    </span>
  );
}
