import { useCallback, useId, useState, type ReactNode } from 'react';
import { useErrorToast } from '../../../hooks/useErrorToast';
import { useCommandProvider } from '../../../input/commandProviders';
import { Button } from '../../primitives/Button';
import { ColourField } from '../../primitives/ColourField';
import { Dialog } from '../../primitives/Dialog';
import { IconButton } from '../../primitives/IconButton';
import { Switch } from '../../primitives/Switch';
import { choiceControlFor } from '../../settings/registry/choiceControls';
import { fieldChoiceLabel } from '../../settings/registry/choiceLabels';
import { describeNumberRange } from '../../settings/numberSetting';
import { resetBeside, SettingChoice } from '../../settings/value/SettingChoice';
import { SettingNumber } from '../../settings/value/SettingNumber';
import type { ScopedSettingField } from '../../../types';
import { useProjectOptions } from './useProjectOptions';

function Row({ field, tool, onSet }: { field: ScopedSettingField; tool: string; onSet: (key: string, value: string | null) => Promise<boolean> }) {
  const noteId = useId();
  const range = field.number;
  const note = field.kind === 'number' && range ? describeNumberRange(range) : '';
  const choiceControl = field.kind === 'choice' ? choiceControlFor(tool, field.key) : undefined;
  const beside = resetBeside(choiceControl);
  const control =
    field.kind === 'number' && range ? (
      // Saved when the narrator settles on it, never per key; an emptied box hands the setting back, as Reset does.
      <SettingNumber
        label={field.label}
        className="max-w-[8rem]"
        value={field.effectiveValue}
        range={range}
        commit="settle"
        allowEmpty
        describedBy={note ? noteId : undefined}
        onChange={(value) => onSet(field.key, value === '' ? null : value)}
      />
    ) : choiceControl ? (
      <SettingChoice
        control={choiceControl}
        label={field.label}
        // A select is as wide as a colour row's swatch and hex box, so the controls down the dialog share a right edge (alignment audit XPC-10).
        selectClassName="w-[10.75rem]"
        value={field.effectiveValue}
        options={field.choices.map((c) => ({ value: c, label: fieldChoiceLabel(tool, field.key, c) }))}
        staleLabel={(stale) => fieldChoiceLabel(tool, field.key, stale)}
        onChange={(value) => onSet(field.key, value)}
      />
    ) : field.kind === 'color' ? (
      <ColourField mode="free" label={field.label} value={field.effectiveValue} hexClassName="max-w-[8rem]" onChange={(hex) => onSet(field.key, hex)} />
    ) : null;
  const reset = field.isSet ? (
    <IconButton action="undo" label={`Reset ${field.label}`} className={`border-transparent ${beside.button}`} onClick={() => void onSet(field.key, null)} />
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
  // The label is above its control in a narrow window and beside it from `sm` (component-selection CS-S5). The control and its Reset are one
  // line of their own either way, so Reset never wraps away from a control that happened to fit beside the label.
  return (
    <div
      data-option-row
      className={`grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-[14rem_minmax(0,1fr)] ${choiceControl === 'radio' ? 'sm:items-start' : 'sm:items-center'}`}
    >
      <span className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">{field.label}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <div data-control-line className={`flex min-w-0 gap-x-3 ${beside.line}`}>
          {control}
          {reset}
        </div>
        {note && (
          <span id={noteId} className="text-xs text-[var(--text-muted)]">
            {note}
          </span>
        )}
      </div>
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
          <Row key={field.key} field={field} tool={tool} onSet={set} />
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
