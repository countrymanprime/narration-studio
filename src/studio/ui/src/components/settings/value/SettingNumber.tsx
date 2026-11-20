import { useState } from 'react';
import type { NumberSettingRange } from '../../../api/contracts/system';
import { NumberInput } from '../../primitives/NumberInput';
import { snapToStep } from '../numberSetting';

type SettingNumberProps = {
  label: string;
  /** The stored text: a number, or '' for "not set". */
  value: string;
  range: NumberSettingRange;
  /** Overrides the range's unit. */
  unit?: string;
  /** `settle` for a box that saves what it reports (Enter, leaving the box, an arrow step); `input` for a field of a form that is itself the draft. */
  commit: 'input' | 'settle';
  /** A value the host accepts: in range and on step, or '' for an emptied box. May return the save it starts. */
  onChange: (value: string) => void | Promise<unknown>;
  placeholder?: string;
  id?: string;
  describedBy?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** The box's width. */
  className?: string;
};

const stored = (value: string): number | null => {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) ? n : null;
};

/**
 * The number box of a setting, with its unit: the one place a stored string becomes a number and back (component-selection CS-N1). What is
 * typed is clamped to the range and moved onto the step before it is reported, so the host is never sent a number it refuses. An unset
 * value is an empty box, never 0. A stored text that is not a number (a hand-edited file) is shown as the placeholder of a marked, empty box.
 */
export function SettingNumber({ label, value, range, unit, commit, onChange, placeholder, id, describedBy, disabled, invalid, className }: SettingNumberProps) {
  // The value a save in flight is carrying, shown until that save ends, so the box does not fall back to the old value while the host answers.
  const [sent, setSent] = useState<string | null>(null);
  const shown = sent ?? value;
  const isJunk = shown.trim() !== '' && stored(shown) === null;
  const shownUnit = unit ?? range.unit;
  const send = (n: number | null): void => {
    const next = n === null ? '' : String(snapToStep(range, n));
    if (next === value) return;
    const save = onChange(next);
    if (!(save instanceof Promise)) return;
    setSent(next);
    const end = () => setSent((now) => (now === next ? null : now));
    // Whoever started the save shows how it ended; here it only stops showing the value as on its way.
    save.then(end, end);
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
        commit={commit}
        disabled={disabled}
        invalid={invalid || isJunk}
        placeholder={placeholder ?? (isJunk ? shown : undefined)}
        aria-describedby={describedBy}
        onValueChange={send}
      />
      {shownUnit && <span className="flex-none text-[0.8125rem] text-[var(--text-muted)]">{shownUnit}</span>}
    </span>
  );
}
