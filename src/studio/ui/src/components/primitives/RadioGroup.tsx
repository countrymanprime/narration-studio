import { Radio as BaseRadio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { useId, type ReactNode } from 'react';

export type RadioOption<Value extends string> = {
  value: Value;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Why a disabled option is off: one short sentence drawn under its label, which describes the option to a screen reader. The narrator always sees what is missing (definition of done, no state without an exit). */
  reason?: string;
};

/**
 * A labelled choice of one from a short, named list (docs/design/design-system.md#base-ui-wrappers: Base UI styled with the app's tokens, never imported
 * directly by app code). Unlike Select, every option's label and its help text are always visible at once - for a
 * handful of options where seeing them side by side matters ("Not a chapter" versus
 * "Keep for later" beside "Not a chapter"), not for a long list.
 */
export function RadioGroup<Value extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: Value;
  onChange: (value: Value) => void;
  options: readonly RadioOption<Value>[];
}) {
  return (
    <BaseRadioGroup aria-label={label} value={value} onValueChange={(next) => onChange(next as Value)} className="space-y-2.5">
      {options.map((option) => (
        <RadioItem key={option.value} {...option} />
      ))}
    </BaseRadioGroup>
  );
}

/**
 * One radio outside a RadioGroup, controlled by `checked`: a one-item group, so it gets a `name` for the form and
 * `onCheckedChange` when pressed. Arrow keys move only between radios that share a RadioGroup, so a set of
 * choices belongs in RadioGroup; use this where each radio sits in its own row.
 */
export function Radio({
  value,
  label,
  description,
  disabled,
  name,
  checked,
  onCheckedChange,
}: RadioOption<string> & { name?: string; checked: boolean; onCheckedChange: () => void }) {
  return (
    <BaseRadioGroup name={name} value={checked ? value : ''} onValueChange={() => onCheckedChange()} aria-label={typeof label === 'string' ? label : undefined}>
      <RadioItem value={value} label={label} description={description} disabled={disabled} />
    </BaseRadioGroup>
  );
}

function RadioItem({ value, label, description, disabled, reason }: RadioOption<string>) {
  const descriptionId = useId();
  const reasonId = useId();
  const why = disabled ? reason : undefined;
  const choice = (
    <label className={`flex items-center gap-2.5 text-sm ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
      <BaseRadio.Root
        value={value}
        disabled={disabled}
        aria-describedby={why ? reasonId : description ? descriptionId : undefined}
        // Unselected fill is --surface-3 with the --border rim, not --surface, as the benchmark mocks draw it.
        className="inline-flex size-4 flex-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] data-[checked]:border-[var(--accent)]"
      >
        <BaseRadio.Indicator className="size-2 rounded-full bg-[var(--accent)] data-[unchecked]:hidden" />
      </BaseRadio.Root>
      <span className="font-medium">{label}</span>
    </label>
  );
  return (
    // The description and the reason sit outside the <label>, so a screen reader hears just the option's own name ("Front
    // matter"), not the name followed by its help text run together; aria-describedby adds it after the name.
    <div>
      {choice}
      {why ? (
        <div id={reasonId} className="mt-0.5 ml-[1.65rem] text-sm" style={{ color: 'var(--text-muted)' }}>
          {why}
        </div>
      ) : null}
      {description && (
        <div id={descriptionId} className="mt-0.5 ml-[1.65rem]" style={{ color: 'var(--text-muted)' }}>
          {description}
        </div>
      )}
    </div>
  );
}
