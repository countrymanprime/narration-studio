import type { DeliveryProfile, MeasureFileResult } from '../../../types';
import { formatLevel } from '../../master/deliveryFormat';
import { isSample, profileName } from './packageItems';

const W = 520;
const H = 70;
const PAD = 12;

/**
 * Book consistency (the Studio Next mock's `Consistency`): each measured file's RMS as a tick against the profile's RMS range, red when
 * the host judged the file's RMS as not met, and the spread across files in dB. A profile with no RMS range draws the ticks without a band.
 */
export function Consistency({ files, profile }: { files: readonly MeasureFileResult[]; profile: DeliveryProfile | undefined }) {
  const rule = profile?.rules.find((candidate) => candidate.metric === 'rms_dbfs' && candidate.scope === 'file' && !candidate.off);
  const rows = files
    .filter((file) => file.status === 'measured' && file.report?.rms_dbfs != null && !isSample(file))
    .map((file) => ({
      file,
      rms: file.report!.rms_dbfs as number,
      missed: file.rules.some((result) => result.ruleId === rule?.id && result.status === 'not_met'),
    }));
  if (rows.length === 0) return <p className="text-sm text-[var(--text-muted)]">No measured files yet.</p>;

  const values = rows.map((row) => row.rms);
  const band = rule && rule.min !== null && rule.max !== null ? { lo: rule.min, hi: rule.max } : undefined;
  const lo = Math.min(...values, band?.lo ?? Infinity) - (band ? 1 : 1);
  const hi = Math.max(...values, band?.hi ?? -Infinity) + 1;
  const x = (value: number) => PAD + ((value - lo) / (hi - lo)) * (W - 2 * PAD);
  const spread = Math.max(...values) - Math.min(...values);
  const label = { fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'IBM Plex Mono,monospace' };
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`RMS by file against the ${profile ? profileName(profile) : 'profile'} range`}
      >
        {band && (
          <>
            <rect x={x(band.lo)} y={22} width={x(band.hi) - x(band.lo)} height={26} rx={4} fill="var(--ok-soft)" stroke="var(--ok)" />
            <text x={x(band.lo)} y={H - 6} {...label}>
              {formatLevel(band.lo)}
            </text>
            <text x={x(band.hi)} y={H - 6} textAnchor="end" {...label}>
              {formatLevel(band.hi)}
            </text>
          </>
        )}
        {rows.map(({ file, rms, missed }) => (
          <line
            key={file.path}
            x1={x(rms)}
            x2={x(rms)}
            y1={16}
            y2={54}
            stroke={missed ? 'var(--danger-text)' : 'var(--text)'}
            strokeWidth={3}
            strokeLinecap="round"
          >
            <title>
              {file.name}: {formatLevel(rms)} dB{missed ? ' (not met)' : ''}
            </title>
          </line>
        ))}
      </svg>
      <p className="text-sm text-[var(--text-muted)]">
        Spread {spread.toFixed(1)} dB across {rows.length} {rows.length === 1 ? 'file' : 'files'}.
      </p>
    </>
  );
}
