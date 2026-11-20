import { useRef, useEffect, useState } from 'react';
import type { ScopedSettingField } from '../../../types';
import { ColourField } from '../../primitives/ColourField';
import { Select } from '../../primitives/Select';
import { useSettledDraft } from '../../primitives/settledDraft';
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
// A number box is 10rem, as `ScopedSetting`'s, so the number boxes down the page line up (alignment audit XSE2-37).
const NUMBER_WIDTH = 'w-40';
// What goes in a text box that is empty until the narrator types (alignment audit R3SE1-17).
const PLACEHOLDER: Record<string, string> = {
  'daw.reaperPath': 'C:\\Program Files\\REAPER\\reaper.exe',
  'project.narrator': 'Your name as the narrator',
};
// A number's range and a typing problem are notes, in the row's 13 px note size (alignment audit XSE2-37).
const NOTE = 'text-[0.8125rem]';

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
  /** The narrator settled on a value. An emptied number is `''`. May return the save it starts, resolving to `false` when the host refused it. */
  onChange: (value: string) => void | Promise<unknown>;
  /** A number the narrator settled on is refused (true) or fine (false); the row uses it to drop a "Saved" mark that belongs to an earlier value (#2989). */
  onDraftProblem?: (refused: boolean) => void;
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
  onSettle: (value: string) => void | Promise<unknown>;
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
  const box = useSettledDraft(value, onSettle);
  return (
    <TextField
      id={id}
      label={label}
      mono={mono}
      inputMode={inputMode}
      value={box.draft}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      aria-describedby={describedBy}
      aria-invalid={invalid ? true : undefined}
      onChange={box.setDraft}
      {...box.boxProps}
    />
  );
}

/** The control for one value of a plain setting, by the kind the host reports. */
export function ValueControl({ row, field, value, which, id, describedBy, invalid, disabled, onChange, onDraftProblem }: ValueControlProps) {
  const name = row.label + (which ? ` (${which})` : '');
  const [typed, setTyped] = useState<string | undefined>();
  useEffect(() => setTyped(undefined), [value]);
  // Whether the number now in the box is refused, told to the row while it is so (and when it stops), so a Saved mark from the value before is not drawn beside it (#2989).
  const refused = field.kind === 'number' && Boolean(field.number) && Boolean(numberProblem(field.number!, (typed ?? value).trim()));
  const tell = useRef(onDraftProblem);
  tell.current = onDraftProblem;
  useEffect(() => {
    tell.current?.(refused);
    return () => tell.current?.(false);
  }, [refused]);

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
            className={NUMBER_WIDTH}
            onSettle={(next) => {
              setTyped(next);
              return numberProblem(field.number!, next.trim()) ? undefined : onChange(next.trim());
            }}
          />
          {(row.unit ?? field.number.unit) && <span className="text-[0.8125rem] text-[var(--text-muted)]">{row.unit ?? field.number.unit}</span>}
        </span>
        {typed !== undefined && problem && (
          <span role="alert" className={`${NOTE} text-[var(--danger-text)]`}>
            {problem}
          </span>
        )}
        {hint && typed === undefined && <span className={`${NOTE} text-[var(--text-muted)]`}>{hint}</span>}
      </span>
    );
  }
  if (field.kind === 'color') {
    // No `allowUnset`: the host refuses '' for a colour ("must be a six-digit color"), and a row goes back to its default with Reset.
    return (
      <ColourField
        mode="free"
        label={name}
        id={id}
        describedBy={describedBy}
        invalid={invalid}
        disabled={disabled}
        hexClassName="w-28"
        value={value}
        onChange={onChange}
      />
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
      placeholder={PLACEHOLDER[row.id]}
      className={row.id === 'daw.reaperPath' ? PATH_WIDTH : FIELD_WIDTH}
      onSettle={onChange}
    />
  );
}
