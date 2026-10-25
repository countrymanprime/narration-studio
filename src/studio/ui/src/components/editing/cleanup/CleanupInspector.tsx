import { useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { Disclosure } from '../../primitives/Disclosure';
import { NumberInput } from '../../primitives/NumberInput';
import { SectionLabel } from '../../primitives/SectionLabel';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import type { CleanupPreview as Preview } from './cleanupApply';
import { CleanupPreview } from './CleanupPreview';
import { LEVELS, dawCommandReason, levelOf, opSpec, type CleanupKind, type CleanupParams, type Level, type ParamKey } from './cleanupOps';

/** The chapter's noise floor in dBFS, or why there is none. */
type NoiseFloor = { ok: true; value: number } | { ok: false; reason: string };

export interface CleanupInspectorProps {
  kind: CleanupKind;
  params: CleanupParams;
  /** Findings to fix, findings already fixed, and how many are selected. */
  open: number;
  fixed: number;
  selected: number;
  advanced: boolean;
  onAdvanced: (open: boolean) => void;
  onLevel: (level: Level) => void;
  onParam: (key: ParamKey, value: number) => void;
  noiseFloor: NoiseFloor;
  /** The DAW's reason Apply is off (not running, capability off), or null. */
  dawReason: string | null;
  preview: Preview | null;
  onPreview: () => void;
  /** The sentence for a preview that is playing, or why it cannot play. While it plays the button stops it. */
  previewNote?: { text: string; playing: boolean } | null;
  onStopPreview?: () => void;
  onApply: () => void;
  /** An apply is running. */
  busy?: boolean;
}

/** The DAW's capability report, read once; null until it answers (or if it cannot). */
function useCapabilities(): DawCapabilities | null {
  const daw = usePort('daw');
  const [caps, setCaps] = useState<DawCapabilities | null>(null);
  useEffect(() => {
    let live = true;
    daw
      .capabilities()
      .then((c) => live && setCaps(c))
      .catch(() => live && setCaps(null));
    return () => {
      live = false;
    };
  }, [daw]);
  return caps;
}

/** The chosen kind's heading with what is left to fix, above its findings, so an empty list's sentence sits under its own heading
 * (alignment audit XED-12). */
export function CleanupKindHeading({ kind, open, fixed }: { kind: CleanupKind; open: number; fixed: number }) {
  return (
    <div className="flex items-baseline gap-2 pt-3">
      <h3 className="m-0 font-['Barlow_Condensed',sans-serif] text-lg font-semibold">{opSpec(kind).label}</h3>
      <span className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
        {open} to fix{fixed ? ` · ${fixed} fixed` : ''}
      </span>
    </div>
  );
}

/** Light, Standard or Heavy, the thresholds behind them, and Preview and Apply for the selected findings. */
export function CleanupInspector(p: CleanupInspectorProps) {
  const spec = opSpec(p.kind);
  const level = levelOf(p.kind, p.params);
  const caps = useCapabilities();
  // Why Apply is off, in the order a narrator can fix them: the DAW first, then what the DAW's capability report says it cannot do.
  const reason = p.dawReason ?? dawCommandReason(p.kind, caps);
  return (
    <div className="flex flex-col gap-3 pt-3">
      <SectionLabel>Strength</SectionLabel>
      <ToggleGroup
        label="Strength"
        look="segmented"
        value={level ?? 'custom'}
        onChange={(v) => {
          if (v !== 'custom') p.onLevel(v as Level);
        }}
        options={[...LEVELS.map(([value, label]) => ({ value, label })), { value: 'custom', label: 'Custom', disabled: level !== null }]}
      />
      <Disclosure title="Advanced" open={p.advanced} onOpenChange={p.onAdvanced}>
        <div className="flex flex-col gap-2 pt-2">
          {spec.fields.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {f.label} ({f.unit}), {f.min} to {f.max}
              </span>
              <NumberInput
                label={`${f.label} (${f.unit})`}
                value={p.params[f.key] ?? 0}
                min={f.min}
                max={f.max}
                step={f.step}
                onValueChange={(v) => p.onParam(f.key, v)}
              />
            </label>
          ))}
        </div>
      </Disclosure>
      {p.kind === 'noise' ? (
        <div className="flex flex-col gap-1">
          <SectionLabel>Chapter noise floor</SectionLabel>
          {p.noiseFloor.ok ? (
            <span className="font-['IBM_Plex_Mono',ui-monospace,monospace]">{p.noiseFloor.value} dBFS</span>
          ) : (
            <span className="text-[var(--text-muted)]">Not measured: {p.noiseFloor.reason}</span>
          )}
        </div>
      ) : null}
      {p.preview ? <CleanupPreview preview={p.preview} /> : null}
      {p.previewNote ? (
        <p role="status" className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
          {p.previewNote.text}
        </p>
      ) : null}
      {reason ? (
        <p id="cleanup-note" className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
          {reason}
        </p>
      ) : null}
      {/* Preview and Apply stay in view at the drawer's foot while the settings above them scroll (alignment audit XED-11, R3ED-8). */}
      <div data-cleanup-actions="" className="sticky bottom-0 -mx-3 -mb-3 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-3">
        <Button variant="secondary" disabled={!p.selected} onClick={p.previewNote?.playing ? p.onStopPreview : p.onPreview}>
          {p.previewNote?.playing ? 'Stop preview' : 'Preview'}
        </Button>
        <span className="flex-1" />
        <Button disabled={!p.selected || reason !== null || p.busy} onClick={p.onApply}>
          Apply to {p.selected} selected
        </Button>
      </div>
    </div>
  );
}
