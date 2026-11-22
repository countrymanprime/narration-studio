import { useId } from 'react';
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
  onChange: (value: string) => void | Promise<unknown>;
  /**
   * For a field of a form (`commit="input"`): called, as it is typed, with text in the box that is not a number, so the form holds it as its
   * unsaved value and asks before the narrator leaves; while `value` is that text the box shows it. Without it such text reverts.
   */
  onRefused?: (text: string) => void;
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

const UNBOUNDED: NumberSettingRange = { min: null, max: null, step: null, unit: '' };
/** The stored text as a number, or null when it is empty or not a number the host would read (`numberProblem` holds the host's rule). */
const stored = (value: string): number | null => (value.trim() === '' || numberProblem(UNBOUNDED, value.trim()) ? null : Number(value));

/**
 * The number box of a setting, with its unit: the one place a stored string becomes a number and back (component-selection CS-N1). What is
 * typed is clamped to the range and moved onto the step before it is reported, so the host is never sent a number it refuses; a number too
 * large to write without an exponent is not reported at all. An unset value is an empty box, never 0. A stored text that is not a number (a
 * hand-edited file) is shown as the placeholder of a marked, empty box, and a stored number the host refuses (past the range or between
 * steps) is marked too.
 */
export function SettingNumber({
  label,
  value,
  range,
  unit,
  commit,
  allowEmpty = false,
  onChange,
  onRefused,
  placeholder,
  id,
  describedBy,
  showRange = false,
  disabled,
  invalid,
  className,
}: SettingNumberProps) {
  const unitId = useId();
  const noteId = useId();
  const note = showRange ? describeNumberRange(range) : '';
  const isJunk = value.trim() !== '' && stored(value) === null;
  const isRefused = numberProblem(range, value.trim()) !== undefined;
  const shownUnit = unit ?? range.unit;
  // A range note names the unit, so it describes the box (this one, or the caller's); with no range to note, the unit beside the box is.
  const describesByUnit = shownUnit !== '' && describeNumberRange(range) === '';
  // What is typed is moved onto the step before it is reported; a number that cannot be written plainly is not reported at all.
  const accepted = (n: number): number | undefined => {
    const text = acceptedNumberText(range, n);
    return text === undefined ? undefined : Number(text);
  };
  const box = (
    <span className="flex min-w-0 items-center gap-2">
      <NumberInput
        allowEmpty
        id={id}
        label={label}
        className={className}
        value={stored(value)}
        min={range.min ?? undefined}
        max={range.max ?? undefined}
        step={range.step ?? undefined}
        stepFrom={range.step === null ? undefined : (range.min ?? 0)}
        commit={commit}
        accepted={accepted}
        disabled={disabled}
        invalid={invalid || isRefused}
        onRefused={onRefused}
        heldText={onRefused && isJunk ? value.trim() : undefined}
        placeholder={placeholder ?? (isJunk && !onRefused ? value : undefined)}
        aria-describedby={[describedBy, note ? noteId : '', describesByUnit ? unitId : ''].filter(Boolean).join(' ') || undefined}
        onValueChange={(next) => (next !== null ? onChange(String(next)) : allowEmpty ? onChange('') : undefined)}
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
