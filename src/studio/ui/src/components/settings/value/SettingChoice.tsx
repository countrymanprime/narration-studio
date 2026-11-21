import type { ReactElement } from 'react';
import { RadioGroup } from '../../primitives/RadioGroup';
import { Select } from '../../primitives/Select';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import { wholeNumberRange } from '../numberSetting';
import type { ChoiceControl } from '../registry/types';
import { SettingNumber } from './SettingNumber';
import { useValueInFlight } from './useValueInFlight';

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
      onChange={(next) => void onChange(next)}
    />
  );
}

function RadioChoice({ label, value, options, onChange, describedBy, disabled }: DrawProps): ReactElement {
  return <RadioGroup label={label} value={value} options={options} disabled={disabled} describedBy={describedBy} onChange={(next) => void onChange(next)} />;
}

/**
 * A choice of consecutive whole numbers as a number box. The box cannot be emptied: "not set" is not one of the choices, and the host refuses it.
 * `SettingChoice` draws a stored value the host does not offer as a select instead.
 */
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

/**
 * Where a Reset `IconButton` sits beside a choice: beside a radio stack it is level with the first option (a 20 px line under the 36 px button, so
 * the button gives up 8 px above and below), not centred against the whole stack, where it reads as belonging to the middle option. `line` goes
 * on the flex line that holds the control and the button, `button` on the button.
 */
export const resetBeside = (control: ChoiceControl | undefined): { line: string; button: string } =>
  control === 'radio' ? { line: 'items-start', button: '-my-2' } : { line: 'items-center', button: '' };

/** A control that is a group of options, which has no one element a `<label>` can point at. */
export const isGroupControl = (control: ChoiceControl | undefined): boolean => control === 'segmented' || control === 'radio';

const BESIDE = 'flex flex-wrap items-center gap-x-2.5 gap-y-1.5';
/**
 * How a Settings row lays out a project's own value under the computer's: `block` holds the words "This project uses" and `line`, and `line`
 * holds the control and the way back to the computer's value. A select, a box or a switch reads as one sentence on one line. A group of options
 * is a block of its own, its words above it and clear of the computer's group by more than the distance between two options, so two radio stacks
 * do not read as one list; under a radio stack the way back is below the last option, where it cannot be taken for one option's.
 */
export function projectValueLayout(control: ChoiceControl | undefined): { block: string; line: string } {
  if (control === 'radio') return { block: 'mt-2 flex flex-col items-start gap-1.5', line: 'flex flex-col items-start gap-1.5' };
  if (control === 'segmented') return { block: 'mt-2 flex flex-col items-start gap-1.5', line: `${BESIDE} max-w-full` };
  return { block: BESIDE, line: 'contents' };
}

/**
 * One host `choice` setting, drawn by the control it declares (component-selection CS-E6): the Settings rows, the "Set on a page" panels and the
 * pages' options dialogs all draw a choice with this. A stored value the host no longer offers is shown first and chosen, in every control (a
 * number box becomes a select for it), so the control never claims a choice that is not the real one (CS-E4). A group the host offers one option for, with that option stored, is the
 * option's words and no control (CS-B7): there is nothing to choose. While a save is out the value on its way is the chosen one, so choosing it
 * again sends nothing and going back to the stored value is sent.
 */
export function SettingChoice({ control, staleLabel, ...rest }: SettingChoiceProps): ReactElement {
  const { options, id } = rest;
  const { shown: value, send } = useValueInFlight(rest.value, rest.onChange);
  const isOffered = options.some((option) => option.value === value);
  if (isGroupControl(control) && options.length === 1 && isOffered) {
    return (
      <span id={id} data-only-choice className="min-w-0 text-[0.9375rem] [overflow-wrap:anywhere]">
        {options[0].label}
      </span>
    );
  }
  const shown = isOffered ? options : [{ value, label: staleLabel?.(value) ?? value }, ...options];
  // A number box's range is what the host offers. A stale whole number next to it ("-1" before "0" to "10") would widen the box's range to a value
  // the host refuses, so any stale value is a select, which lists the real choices, until one is chosen.
  const Draw = control === 'number' && !isOffered ? SelectChoice : DRAW[control];
  return <Draw {...rest} value={value} options={shown} onChange={send} />;
}
