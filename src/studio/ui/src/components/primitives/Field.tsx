import { Field as BaseField } from '@base-ui/react/field';
import type { ReactNode } from 'react';

// The look every field label shares: ~14px, Plex Sans 500, --text-muted. A control with no visible `Field` wrapper (a raw `<label>` beside a `Select`, a read-only value's caption)
// imports this instead of pasting its own copy, so a size fix here reaches every consumer.
export const FIELD_LABEL_CLASSES = 'block text-[0.88rem] font-medium text-[var(--text-muted)]';

// mt-2 (8px) is the mocks' label-to-control gap.
const CONTROL_CLASSES =
  'mt-2 w-full box-border rounded-[var(--control-radius)] font-medium border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[0.88rem] leading-[1.35] text-[var(--text)] data-[invalid]:border-[var(--danger)]';

// A labelled text control. Base UI's Field wires the label, the hint and the error to the control (`for`, `aria-invalid`,
// `aria-describedby`), so none of that is written by hand here. The control stays controlled: it never holds
// its own value.
export function Field({
  label,
  value,
  onChange,
  onBlur,
  disabled,
  textarea = false,
  placeholder,
  autoFocus,
  hint,
  error,
  secret = false,
  labelHidden = false,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  textarea?: boolean;
  placeholder?: string;
  // Focus the control when it mounts: a dialog whose one job is this field opens with it ready (see Dialog's initial focus).
  autoFocus?: boolean;
  // Help that belongs to the field; the control is described by it.
  hint?: ReactNode;
  // What is wrong with the value: shows under the field, marks it `aria-invalid` and describes it (a disabled field shows
  // the error but is not marked invalid: Base UI leaves `aria-invalid` off a disabled control).
  error?: string;
  // A value that must not be shown or kept by the browser (the narrator's own API key): a masked input with the browser's
  // autofill, spell check and autocorrect off. Never with `textarea`.
  secret?: boolean;
  // The mock's Inspector textareas have a placeholder and no visible label: the label stays for a screen reader (and the control
  // loses the gap the label would have taken).
  labelHidden?: boolean;
  // A 56 px textarea instead of the 80 px one.
  compact?: boolean;
}) {
  return (
    <BaseField.Root
      invalid={Boolean(error)}
      disabled={disabled}
      className={`text-[0.88rem] font-medium text-[var(--text-muted)] ${labelHidden ? '' : 'first:mt-3'}`}
    >
      <BaseField.Label className={labelHidden ? 'sr-only' : FIELD_LABEL_CLASSES}>{label}</BaseField.Label>
      <BaseField.Control
        render={
          textarea ? (
            <textarea
              // `block`: an inline textarea sits on the text baseline and leaves a 6 px descender gap under it in its row.
              className={`block ${compact ? 'min-h-14' : 'min-h-20'} py-[0.6rem] ${labelHidden ? CONTROL_CLASSES.replace('mt-2', 'mt-0') : CONTROL_CLASSES}`}
            />
          ) : secret ? (
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={`h-[var(--control-height)] py-0 ${CONTROL_CLASSES}`}
            />
          ) : (
            // A value wider than the box (a folder path in a narrow dialog) ends in an ellipsis while the box is not being edited, rather than being
            // cut with nothing to say it goes on (alignment audit R3EN2-17). No `title`: it would be read as the box's description, the value twice.
            <input className={`h-[var(--control-height)] py-0 text-ellipsis ${CONTROL_CLASSES}`} />
          )
        }
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {hint != null && hint !== false && hint !== '' && (
        <BaseField.Description className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</BaseField.Description>
      )}
      {error && (
        <BaseField.Error match className="mt-1 block text-xs text-[var(--danger-text)]">
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}
