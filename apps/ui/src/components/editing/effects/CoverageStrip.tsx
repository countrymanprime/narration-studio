import { useMemo } from 'react';
import type { WordFx } from '../../../api/contracts/wordFx';
import { NumberInput } from '../../primitives/NumberInput';
import { SectionLabel } from '../../primitives/SectionLabel';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';
import { clock } from '../bar/clock';
import type { CutSpan } from '../model';
import { FX_CAP_LABEL, FX_CAP_MAX, FX_CAP_MIN, FX_CAP_PCT, capState, coverageOf, fmtPct, liveEffects, spanOf, type CapState } from './effectsMath';

const CAP_PILL: Record<CapState, [StatusTone, string]> = {
  within: ['success', 'Within the cap'],
  over: ['warning', 'Over the cap'],
  far: ['danger', 'Far over the cap'],
};

const SHADE: Record<number, string> = { 1: 'var(--accent-soft)', 2: 'var(--accent)' };

/**
 * Where effects sit in the chapter, how much of it they cover, and the cap that figure is judged against, in a field beside it. A click on
 * the strip picks the effect there. Without `onCapChange` the field shows the cap and is off.
 */
export function CoverageStrip({
  effects,
  cuts,
  total,
  selectedId,
  onSelect,
  cap = FX_CAP_PCT,
  onCapChange,
  capError = '',
}: {
  effects: readonly WordFx[];
  cuts: readonly CutSpan[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The cap in percent of the chapter (Editing.fx_cap_pct). */
  cap?: number;
  onCapChange?: (pct: number) => void;
  /** Why the cap could not be read or saved, or ''. */
  capError?: string;
}) {
  const on = useMemo(() => liveEffects(effects).map((f) => ({ id: f.id, name: f.chainName, ...spanOf(f, cuts, total) })), [effects, cuts, total]);
  const cov = useMemo(() => coverageOf(on, total), [on, total]);
  const [tone, state] = CAP_PILL[capState(cov.pct, cap)];
  /** The effect a click on a stretch selects: the last one to start there. */
  const topAt = (mid: number) => [...on].filter((r) => r.start <= mid && mid < r.end).sort((a, b) => b.start - a.start)[0];
  const at = (x: number): string => `${(x / total) * 100}%`;
  return (
    <section aria-label="Coverage" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SectionLabel>Coverage</SectionLabel>
        <b data-cover-figure>Effects cover {fmtPct(cov.pct)} of this chapter</b>
        <StatusBadge tone={tone} label={state} />
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
          <SectionLabel>Cap</SectionLabel>
          <NumberInput
            data-fxcap
            label={FX_CAP_LABEL}
            className="w-[76px]"
            value={cap}
            min={FX_CAP_MIN}
            max={FX_CAP_MAX}
            step={1}
            disabled={!onCapChange}
            onValueChange={(pct) => onCapChange?.(pct)}
          />
          %
        </label>
      </div>
      {capError ? <p className="m-0 text-[length:var(--font-size-sm)] text-[var(--danger)]">{capError}</p> : null}
      <div
        role="group"
        aria-label={on.length ? 'Where effects sit in this chapter' : 'No effects on this chapter'}
        className="relative h-6 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface-2)]"
      >
        {cov.segs.map((s) => {
          const top = topAt((s.start + s.end) / 2);
          const label = `${s.n} ${s.n > 1 ? 'effects' : 'effect'} from ${clock(s.start)} to ${clock(s.end)}`;
          return (
            // native-control-ok: a bar placed by time on the strip; Button's padded uppercase chrome cannot draw it.
            <button
              key={s.start}
              type="button"
              data-n={Math.min(2, s.n)}
              data-fx={top?.id}
              data-on={top?.id === selectedId || undefined}
              aria-label={top ? `${label}: ${top.name}` : label}
              aria-pressed={top ? top.id === selectedId : undefined}
              title={label}
              className="absolute top-0 h-full border-0 p-0 data-[on]:ring-2 data-[on]:ring-[var(--accent-strong)]"
              style={{ left: at(s.start), width: at(s.end - s.start), background: SHADE[Math.min(2, s.n)] }}
              onClick={() => top && onSelect(top.id)}
            />
          );
        })}
      </div>
      <div className="flex gap-3 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
        <span>None</span>
        <span>
          <i aria-hidden="true" className="mr-1 inline-block size-2.5 align-middle" style={{ background: SHADE[1] }} />1 effect
        </span>
        <span>
          <i aria-hidden="true" className="mr-1 inline-block size-2.5 align-middle" style={{ background: SHADE[2] }} />2 or more
        </span>
      </div>
    </section>
  );
}
