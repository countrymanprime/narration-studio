import { useEffect, useState } from 'react';
import type { ScopedSettingField } from '../../../types';
import { Select } from '../../primitives/Select';
import { Switch } from '../../primitives/Switch';
import { TextField } from '../../primitives/TextField';
import { describeNumberRange, numberProblem } from '../numberSetting';
import { choiceLabel } from '../data/values';
import type { SettingMeta } from '../registry/types';

// One width for a setting's select and text box, so the controls down the page line up (alignment audit cause E); a program path is wider.
// The control takes its row's width up to that one (`w-full` with a cap), so in a narrow column it ends at the card's padding instead of
// running past the card and the window (alignment audit XSE2-1, XSE2-2); `min-w-0` lets it shrink beside its Reset button.
const FIELD_WIDTH = 'w-full max-w-80 min-w-0';
const PATH_WIDTH = 'w-full max-w-[26rem] min-w-0';

export type ValueControlProps = {
  row: SettingMeta;
  field: ScopedSettingField;
  value: string;
  /** Whose value this is, for the accessible name: "all projects", "this project". */
  which?: string;
  id: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** The narrator settled on a value. An emptied number is `''`. */
  onChange: (value: string) => void;
};

/** A text or number box that keeps the draft while typing and settles on Enter or when focus leaves, so a half-typed value is never saved. */
function SettledBox({
  value,
  onSettle,
  label,
  id,
  describedBy,
  invalid,
  disabled,
  mono,
  inputMode,
  placeholder,
  className,
}: {
  value: string;
  onSettle: (value: string) => void;
  label: string;
  id: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  mono?: boolean;
  inputMode?: 'decimal';
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const settle = () => {
    if (draft !== value) onSettle(draft);
  };
  return (
    <TextField
      id={id}
      label={label}
      mono={mono}
      inputMode={inputMode}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      aria-describedby={describedBy}
      aria-invalid={invalid ? true : undefined}
      onChange={setDraft}
      onBlur={settle}
      onKeyDown={(event) => {
        if (event.key === 'Enter') settle();
        if (event.key === 'Escape') setDraft(value);
      }}
    />
  );
}

/** The control for one value of a plain setting, by the kind the host reports. */
export function ValueControl({ row, field, value, which, id, describedBy, invalid, disabled, onChange }: ValueControlProps) {
  const name = row.label + (which ? ` (${which})` : '');
  const [typed, setTyped] = useState<string | undefined>();
  useEffect(() => setTyped(undefined), [value]);

  if (field.kind === 'bool') {
    const on = value === 'true';
    return (
      <Switch checked={on} disabled={disabled} onChange={(next) => onChange(String(next))}>
        <span className="sr-only">{name}: </span>
        <span aria-hidden="true">{on ? 'On' : 'Off'}</span>
      </Switch>
    );
  }
  if (field.kind === 'choice') {
    const options = field.choices.map((choice) => ({ value: choice, label: choiceLabel(row, choice) }));
    // A stored value the host no longer offers still shows, so the control never claims a choice that is not the real one.
    if (!field.choices.includes(value)) options.unshift({ value, label: choiceLabel(row, value) });
    return (
      <Select
        id={id}
        label={name}
        value={value}
        options={options}
        disabled={disabled}
        aria-describedby={describedBy}
        className={FIELD_WIDTH}
        onChange={onChange}
      />
    );
  }
  if (field.kind === 'number' && field.number) {
    const shown = typed ?? value;
    const problem = numberProblem(field.number, shown.trim());
    const hint = problem ?? describeNumberRange(field.number);
    return (
      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <SettledBox
            id={id}
            label={name}
            mono
            inputMode="decimal"
            value={value}
            disabled={disabled}
            invalid={Boolean(problem) || invalid}
            describedBy={describedBy}
            className="w-24"
            onSettle={(next) => {
              setTyped(next);
              if (!numberProblem(field.number!, next.trim())) onChange(next.trim());
            }}
          />
          {(row.unit ?? field.number.unit) && <span className="text-[0.8125rem] text-[var(--text-muted)]">{row.unit ?? field.number.unit}</span>}
        </span>
        {typed !== undefined && problem && (
          <span role="alert" className="text-xs text-[var(--danger-text)]">
            {problem}
          </span>
        )}
        {hint && typed === undefined && <span className="text-xs text-[var(--text-muted)]">{hint}</span>}
      </span>
    );
  }
  if (field.kind === 'color') {
    return (
      <span className="flex items-center gap-2">
        <TextField
          label={`${name} swatch`}
          type="color"
          value={`#${value.replace('#', '').padEnd(6, '0').slice(0, 6)}`}
          disabled={disabled}
          onChange={(next) => onChange(next.slice(1).toUpperCase())}
        />
        <SettledBox
          id={id}
          label={name}
          mono
          value={value}
          disabled={disabled}
          invalid={invalid}
          describedBy={describedBy}
          className="w-28"
          onSettle={(next) => onChange(next.replace('#', '').toUpperCase())}
        />
      </span>
    );
  }
  return (
    <SettledBox
      id={id}
      label={name}
      value={value}
      disabled={disabled}
      invalid={invalid}
      describedBy={describedBy}
      placeholder={row.id === 'daw.reaperPath' ? 'C:\\Program Files\\REAPER\\reaper.exe' : undefined}
      className={row.id === 'daw.reaperPath' ? PATH_WIDTH : FIELD_WIDTH}
      onSettle={onChange}
    />
  );
}
