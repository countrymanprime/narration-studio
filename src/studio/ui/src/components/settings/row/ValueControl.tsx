import { useId } from 'react';
import type { ScopedSettingField } from '../../../types';
import { ColourField } from '../../primitives/ColourField';
import { useSettledDraft } from '../../primitives/settledDraft';
import { Switch } from '../../primitives/Switch';
import { TextField } from '../../primitives/TextField';
import { describeNumberRange, wholeNumberRange } from '../numberSetting';
import { choiceLabel } from '../registry/choiceLabels';
import type { SettingMeta } from '../registry/types';
import { SettingChoice } from '../value/SettingChoice';
import { SettingNumber } from '../value/SettingNumber';

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
// A number's range is a note, in the row's 13 px note size (alignment audit XSE2-37).
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
};

/** A text box that keeps the draft while typing and settles on Enter or when focus leaves, so a half-typed value is never saved. */
function SettledBox({
  value,
  onSettle,
  label,
  id,
  describedBy,
  invalid,
  disabled,
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
  placeholder?: string;
  className?: string;
}) {
  const box = useSettledDraft(value, onSettle);
  return (
    <TextField
      id={id}
      label={label}
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
export function ValueControl({ row, field, value, which, id, describedBy, invalid, disabled, onChange }: ValueControlProps) {
  const name = row.label + (which ? ` (${which})` : '');
  // A number box's range note is part of what describes the box, after the row's own description.
  const noteId = useId();
  const withNote = [describedBy, noteId].filter(Boolean).join(' ');
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
    const control = row.control ?? 'select';
    // A number box says its range under it, as a `number` field's does; a stored value outside the choices is drawn as a select, which lists them.
    const range = control === 'number' && field.choices.includes(value) ? wholeNumberRange(field.choices, row.unit) : undefined;
    const choice = (
      <SettingChoice
        control={control}
        id={id}
        label={name}
        value={value}
        options={field.choices.map((choice) => ({ value: choice, label: choiceLabel(row, choice) }))}
        staleLabel={(stale) => choiceLabel(row, stale)}
        unit={row.unit}
        disabled={disabled}
        describedBy={range ? withNote : describedBy}
        selectClassName={FIELD_WIDTH}
        onChange={onChange}
      />
    );
    if (!range) return choice;
    return (
      <span className="flex flex-col gap-1">
        {choice}
        <span id={noteId} className={`${NOTE} text-[var(--text-muted)]`}>
          {describeNumberRange(range)}
        </span>
      </span>
    );
  }
  if (field.kind === 'number' && field.number) {
    const range = describeNumberRange(field.number);
    return (
      <span className="flex flex-col gap-1">
        <SettingNumber
          id={id}
          label={name}
          value={value}
          range={field.number}
          unit={row.unit}
          commit="settle"
          allowEmpty
          disabled={disabled}
          invalid={invalid}
          describedBy={range ? withNote : describedBy}
          className={NUMBER_WIDTH}
          onChange={onChange}
        />
        {range && (
          <span id={noteId} className={`${NOTE} text-[var(--text-muted)]`}>
            {range}
          </span>
        )}
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
