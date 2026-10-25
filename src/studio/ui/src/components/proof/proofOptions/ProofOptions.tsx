import { useCallback, useState, type ReactNode } from 'react';
import { useCommandProvider } from '../../../input/commandProviders';
import { Button } from '../../primitives/Button';
import { Dialog } from '../../primitives/Dialog';
import { NumberInput } from '../../primitives/NumberInput';
import { Select } from '../../primitives/Select';
import { Switch } from '../../primitives/Switch';
import { TextField } from '../../primitives/TextField';
import type { ScopedSettingField } from '../../../types';
import { proofingChoiceLabel } from '../options';
import { useProjectOptions } from './useProjectOptions';

// A native colour input can only show a full #rrggbb value; a stored colour is six capital hex digits without the hash.
const HEX = /^[0-9A-F]{6}$/;
const NEUTRAL_PICKER = '#808080';
const asHex = (text: string): string => text.trim().replace(/^#/, '').toUpperCase();

function ColourRow({ field, onSave }: { field: ScopedSettingField; onSave: (hex: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? field.effectiveValue;
  const settle = () => {
    if (draft === null) return;
    const hex = asHex(draft);
    if (HEX.test(hex) && hex !== field.effectiveValue) onSave(hex);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2">
      <TextField
        label={`${field.label} picker`}
        type="color"
        value={HEX.test(field.effectiveValue) ? `#${field.effectiveValue}` : NEUTRAL_PICKER}
        onChange={(value) => onSave(asHex(value))}
      />
      <TextField
        label={field.label}
        mono
        className="max-w-[8rem]"
        value={shown}
        onChange={setDraft}
        onBlur={settle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') settle();
        }}
      />
    </div>
  );
}

function Row({ field, onSet }: { field: ScopedSettingField; onSet: (key: string, value: string | null) => void }) {
  const range = field.number;
  const control =
    field.kind === 'number' && range ? (
      <span className="flex items-center gap-2">
        <NumberInput
          label={field.label}
          className="max-w-[8rem]"
          value={Number(field.effectiveValue)}
          min={range.min ?? undefined}
          max={range.max ?? undefined}
          step={range.step ?? undefined}
          onValueChange={(n) => onSet(field.key, String(n))}
        />
        {range.unit ? <span className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">{range.unit}</span> : null}
      </span>
    ) : field.kind === 'choice' ? (
      <Select
        label={field.label}
        // As wide as a colour row's swatch and hex box, so the controls down the dialog share a right edge (alignment audit XPC-10).
        className="w-[10.75rem]"
        value={field.effectiveValue}
        options={field.choices.map((c) => ({ value: c, label: proofingChoiceLabel(field.key, c) }))}
        onChange={(value) => onSet(field.key, value)}
      />
    ) : field.kind === 'color' ? (
      <ColourRow field={field} onSave={(hex) => onSet(field.key, hex)} />
    ) : null;
  const reset = field.isSet ? (
    <Button variant="link" aria-label={`Reset ${field.label}`} onClick={() => onSet(field.key, null)}>
      Reset
    </Button>
  ) : null;
  // A switch is its own label, so its row has no label column. Only the stored text "true" is on, as in Settings.
  if (field.kind === 'bool')
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Switch checked={field.effectiveValue === 'true'} onChange={(on) => onSet(field.key, String(on))}>
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
  const { fields, error, set } = useProjectOptions(tool, keys, { enabled: open, onSaved });
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
      onClose={() => setOpen(false)}
      actions={
        <Button variant="secondary" onClick={() => setOpen(false)}>
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
