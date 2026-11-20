import type { ReactElement } from 'react';
import { RadioGroup } from '../../primitives/RadioGroup';
import { Select } from '../../primitives/Select';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import { wholeNumberRange } from '../numberSetting';
import type { ChoiceControl } from '../registry/types';
import { SettingNumber } from './SettingNumber';

type ChoiceOption = { value: string; label: string };

export type SettingChoiceProps = {
  /** The control the choice declares (`registry/choiceControls.ts`). */
  control: ChoiceControl;
  /** The accessible name of the group, the select or the number box. */
  label: string;
  value: string;
  /** What the host offers, in its order, with the caller's words. */
  options: readonly ChoiceOption[];
  /** Names a stored value the host no longer offers; the value itself when left out. */
  staleLabel?: (value: string) => string;
  /** Shown after the box of a `number`. */
  unit?: string;
  /** The narrator chose another value. May return the save it starts. */
  onChange: (value: string) => void | Promise<unknown>;
  /** Given to a select or a number box, which a `<label>` can point at; a group is named by `label` alone. */
  id?: string;
  describedBy?: string;
  disabled?: boolean;
  /** The width of a `select`. */
  selectClassName?: string;
};

/** What each drawing is handed: the options already include a stale stored value. */
type DrawProps = Omit<SettingChoiceProps, 'control' | 'staleLabel'>;

// A box as wide as every other number box in Settings, so they line up down the page.
const NUMBER_WIDTH = 'w-40';

/** Reports a press on another option; a press on the chosen one changes nothing, so it saves nothing. */
const choose =
  ({ value, onChange }: Pick<DrawProps, 'value' | 'onChange'>) =>
  (next: string): void => {
    if (next !== value) void onChange(next);
  };

function SelectChoice({ label, value, options, onChange, id, describedBy, disabled, selectClassName }: DrawProps): ReactElement {
  return (
    <Select
      id={id}
      label={label}
      value={value}
      options={options}
      disabled={disabled}
      aria-describedby={describedBy}
      className={selectClassName}
      onChange={(next) => void onChange(next)}
    />
  );
}

function SegmentedChoice({ label, value, options, onChange, describedBy, disabled }: DrawProps): ReactElement {
  return (
    <ToggleGroup
      look="segmented"
      label={label}
      value={value}
      options={options}
      disabled={disabled}
      describedBy={describedBy}
      onChange={choose({ value, onChange })}
    />
  );
}

function RadioChoice({ label, value, options, onChange, describedBy, disabled }: DrawProps): ReactElement {
  return <RadioGroup label={label} value={value} options={options} disabled={disabled} describedBy={describedBy} onChange={choose({ value, onChange })} />;
}

/** A choice of consecutive whole numbers as a number box. A stored value that is not one of them cannot be shown in the box, so it is a select until one is chosen. */
function NumberChoice(props: DrawProps): ReactElement {
  const { label, value, options, unit, onChange, id, describedBy, disabled } = props;
  const range = wholeNumberRange(
    options.map((option) => option.value),
    unit,
  );
  if (!range) return <SelectChoice {...props} />;
  return (
    <SettingNumber
      id={id}
      label={label}
      value={value}
      range={range}
      commit="settle"
      disabled={disabled}
      describedBy={describedBy}
      className={NUMBER_WIDTH}
      onChange={onChange}
    />
  );
}

const DRAW: Record<ChoiceControl, (props: DrawProps) => ReactElement> = {
  select: SelectChoice,
  segmented: SegmentedChoice,
  radio: RadioChoice,
  number: NumberChoice,
};

/** A control that is a group of options, which has no one element a `<label>` can point at. */
export const isGroupControl = (control: ChoiceControl | undefined): boolean => control === 'segmented' || control === 'radio';

/**
 * One host `choice` setting, drawn by the control it declares (component-selection CS-E6): the Settings rows, the "Set on a page" panels and the
 * pages' options dialogs all draw a choice with this. A stored value the host no longer offers is shown first and chosen, in every control, so
 * the control never claims a choice that is not the real one (CS-E4).
 */
export function SettingChoice({ control, staleLabel, ...rest }: SettingChoiceProps): ReactElement {
  const { value, options } = rest;
  const shown = options.some((option) => option.value === value) ? options : [{ value, label: staleLabel?.(value) ?? value }, ...options];
  const Draw = DRAW[control];
  return <Draw {...rest} options={shown} />;
}
