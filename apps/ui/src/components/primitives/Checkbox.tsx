import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faMinus } from '@fortawesome/free-solid-svg-icons';
import type { ReactNode } from 'react';

type DataProps = { [K in `data-${string}`]?: string | number | boolean | undefined };

// A checkbox is named by visible `children` (the label row) or, with no visible text, by an `aria-label`.
type Naming = { children: ReactNode; 'aria-label'?: undefined } | { children?: undefined; 'aria-label': string };

export type CheckboxProps = DataProps &
  Naming & {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    // The mixed state of a parent whose children are partly selected: reports aria-checked="mixed" and draws a dash.
    indeterminate?: boolean;
  };

const BOX_CLASS =
  'inline-flex size-4 flex-none items-center justify-center rounded-[0.25rem] border-2 border-[var(--btn-line)] bg-[var(--surface)] text-[var(--accent-contrast)] data-[checked]:border-[var(--accent)] data-[checked]:bg-[var(--accent)] data-[indeterminate]:border-[var(--accent)] data-[indeterminate]:bg-[var(--accent)] data-[disabled]:opacity-40';

// A checkbox: with children, a labelled row (the box, then the label content, and pressing the label toggles it); with an
// `aria-label` instead, the bare box. Base UI's Checkbox is a styled `role="checkbox"` with a hidden native input for
// forms; the box is drawn with the app's tokens, not the browser's default control (ADR 0047). Controlled: it never
// holds its own state. `data-*` attributes land on the box.
export function Checkbox({ checked, onChange, disabled, indeterminate, children, ...rest }: CheckboxProps) {
  const box = (
    <BaseCheckbox.Root
      {...rest}
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      onCheckedChange={(next) => onChange(next)}
      className={children === undefined ? BOX_CLASS : `mt-[0.2rem] ${BOX_CLASS}`}
    >
      <BaseCheckbox.Indicator className="inline-flex text-[0.6rem]">
        <FontAwesomeIcon icon={indeterminate ? faMinus : faCheck} />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
  if (children === undefined) return box;
  return (
    <label className="flex items-start gap-2 py-0.5 text-sm">
      {box}
      <span>{children}</span>
    </label>
  );
}
