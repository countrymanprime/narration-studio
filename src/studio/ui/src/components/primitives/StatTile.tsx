import { ProgressBar } from './ProgressBar';
import { SectionLabel } from './SectionLabel';

const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";

const TONE_TEXT: Record<Exclude<StatTileTone, 'neutral'>, string> = {
  info: 'var(--info-text)',
  success: 'var(--ok-text)',
  warning: 'var(--warn-text)',
  danger: 'var(--danger-text)',
};

export type StatTileTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// One KPI figure: an eyebrow label, a mono value, and an optional hint line under it (promoted from the local copy in
// home/RecordingCheckReport.tsx). `unit` sits beside the value in the label's muted style rather than baked into the
// value string, so a caller that colours the value by `tone` doesn't also tint its unit. `progress` (0-1) draws the
// existing ProgressBar under the value, named after the tile's own label.
export function StatTile({
  label,
  value,
  hint,
  unit,
  progress,
  tone = 'neutral',
  size = 'default',
  className = '',
}: {
  label: string;
  value: string;
  hint?: string;
  unit?: string;
  /** 0 to 1. When given, a ProgressBar is drawn under the value, named after `label`. */
  progress?: number;
  tone?: StatTileTone;
  /** `kpi` is the Studio Next mock's Production tile: a 30 px value, a 16 px unit and a 13 px hint. */
  size?: 'default' | 'kpi';
  className?: string;
}) {
  return (
    <div className={className}>
      {/* The row-start classes place each part in its own row when a StatStrip lays a row of tiles on one subgrid; elsewhere they do nothing. */}
      <SectionLabel as="div" className="row-start-1">
        {label}
      </SectionLabel>
      {/* Plex Mono, weight 500: 22 px by default, 30 px for the Production `kpi` tile (the mock's `.kpi .v`). */}
      <div className={`row-start-2 mt-1 ${size === 'kpi' ? 'text-[1.875rem] leading-[1.1]' : 'text-[1.375rem] leading-[1.35]'} font-medium ${MONO}`}>
        <span style={tone === 'neutral' ? undefined : { color: TONE_TEXT[tone] }}>{value}</span>
        {unit && (
          <span className={`ml-1 ${size === 'kpi' ? 'text-base' : 'text-sm'} font-normal ${MONO}`} style={{ color: 'var(--text-muted)' }}>
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <div className={`row-start-3 ${size === 'kpi' ? 'text-[0.8125rem]' : 'text-xs'} leading-[1.5]`} style={{ color: 'var(--text-muted)' }}>
          {hint}
        </div>
      )}
      {progress !== undefined && (
        <div className="row-start-4 mt-1.5">
          <ProgressBar label={label} value={Math.round(progress * 100)} size="thin" tone="ok" />
        </div>
      )}
    </div>
  );
}
