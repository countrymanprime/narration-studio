import { useCallback, useId, useState, type ReactNode } from 'react';
import { useErrorToast } from '../../../hooks/useErrorToast';
import { useCommandProvider } from '../../../input/commandProviders';
import { Button } from '../../primitives/Button';
import { ColourField } from '../../primitives/ColourField';
import { Dialog } from '../../primitives/Dialog';
import { IconButton } from '../../primitives/IconButton';
import { Select } from '../../primitives/Select';
import { Switch } from '../../primitives/Switch';
import { describeNumberRange } from '../../settings/numberSetting';
import { SettingNumber } from '../../settings/value/SettingNumber';
import type { ScopedSettingField } from '../../../types';
import { proofingChoiceLabel } from '../options';
import { useProjectOptions } from './useProjectOptions';

function Row({ field, onSet }: { field: ScopedSettingField; onSet: (key: string, value: string | null) => Promise<boolean> }) {
  const range = field.number;
  const noteId = useId();
  // The range note under the box, as in Settings (CS-N1): a typed number past it becomes the limit, and this says what the limit is.
  const rangeNote = range ? describeNumberRange(range) : '';
  const control =
    field.kind === 'number' && range ? (
      <span className="flex flex-col gap-1">
        {/* Saved when the narrator settles on it, never per key; an emptied box hands the setting back, as Reset does. */}
        <SettingNumber
          label={field.label}
          className="max-w-[8rem]"
          value={field.effectiveValue}
          range={range}
          commit="settle"
          allowEmpty
          describedBy={rangeNote ? noteId : undefined}
          onChange={(value) => onSet(field.key, value === '' ? null : value)}
        />
        {rangeNote && (
          <span id={noteId} className="text-[0.8125rem] text-[var(--text-muted)]">
            {rangeNote}
          </span>
        )}
      </span>
    ) : field.kind === 'choice' ? (
      <Select
        label={field.label}
        // As wide as a colour row's swatch and hex box, so the controls down the dialog share a right edge (alignment audit XPC-10).
        className="w-[10.75rem]"
        value={field.effectiveValue}
        options={field.choices.map((c) => ({ value: c, label: proofingChoiceLabel(field.key, c) }))}
        onChange={(value) => void onSet(field.key, value)}
      />
    ) : field.kind === 'color' ? (
      <ColourField mode="free" label={field.label} value={field.effectiveValue} hexClassName="max-w-[8rem]" onChange={(hex) => onSet(field.key, hex)} />
    ) : null;
  const reset = field.isSet ? (
    <IconButton action="undo" label={`Reset ${field.label}`} className="border-transparent" onClick={() => void onSet(field.key, null)} />
  ) : null;
  // A switch is its own label, so its row has no label column. Only the stored text "true" is on, as in Settings.
  if (field.kind === 'bool')
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Switch checked={field.effectiveValue === 'true'} onChange={(on) => void onSet(field.key, String(on))}>
          {field.label}
        </Switch>
        {reset}
      </div>
    );
  if (!control) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="w-56 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">{field.label}</span>
      {control}
      {reset}
    </div>
  );
}

/**
 * A page's own options for what it does, kept off the page until wanted: the jump menu lists "Open <title>" while the page is showing, and it opens
 * a dialog with the settings of one tool, this project's values, saved at once at the project layer. Settings keeps the same keys with its own
 * Global / This project switch. A setting this project overrides has a Reset that hands it back to the computer-wide value or the default.
 */
export function ProofOptions({
  title,
  group,
  tool,
  keys,
  onSaved,
  note,
}: {
  title: string;
  /** The jump menu heading the command is listed under: the page's name. */
  group: string;
  tool: string;
  keys: readonly string[];
  /** Runs after each accepted save, so the page can read again what the option changes. */
  onSaved?: () => void;
  /** What to know before changing them, above the rows. */
  note?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { fields, error, set, forgetError } = useProjectOptions(tool, keys, { enabled: open, onSaved });
  // A save can end after the dialog has gone (a number typed, then Close or a press outside): its refusal has no dialog to show in, so it is a toast.
  useErrorToast(open ? undefined : error);
  const close = () => {
    forgetError();
    setOpen(false);
  };
  useCommandProvider(
    useCallback(
      () => [{ id: `options.open.${tool}.${keys.join('.')}`, group, label: `Open ${title}`, hint: 'This project', run: () => setOpen(true) }],
      [tool, keys, group, title],
    ),
  );
  if (!open) return null;
  return (
    <Dialog
      title={title}
      description="Saved at once for this project. Settings sets the same values for every project."
      dismissOnOutsidePress={true}
      onClose={close}
      actions={
        <Button variant="secondary" onClick={close}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {note}
        {fields.map((field) => (
          <Row key={field.key} field={field} onSet={set} />
        ))}
        {error ? (
          <p role="alert" className="m-0 text-[length:var(--font-size-sm)] [overflow-wrap:anywhere] text-[var(--danger-text)]">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
