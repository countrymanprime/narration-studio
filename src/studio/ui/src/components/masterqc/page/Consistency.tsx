import type { DeliveryProfile, MeasureFileResult } from '../../../types';
import { formatLevel } from '../../master/deliveryFormat';
import { isSample, profileName } from './packageItems';

const W = 520;
const H = 48;
// Room at each end for a tick on the scale's edge.
const PAD = 3;
// The band, and how far a tick stands past it above and below.
const BAND_TOP = 10;
const BAND_HEIGHT = 28;
const TICK_OVER = 5;

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
  // The scale runs from the band's ends (or the furthest file outside them), so the band fills the card's width and starts where the
  // caption does (XMS-20); with no band, a dB of room either side of the files.
  const margin = band ? 0 : 1;
  const lo = Math.min(...values, band?.lo ?? Infinity) - margin;
  const hi = Math.max(...values, band?.hi ?? -Infinity) + margin;
  const x = (value: number) => PAD + ((value - lo) / (hi - lo)) * (W - 2 * PAD);
  const spread = Math.max(...values) - Math.min(...values);
  // Where a value sits across the chart, as a share of its width, for the HTML labels under it.
  const at = (value: number) => `${(x(value) / W) * 100}%`;
  const chartLabel = `RMS by file against ${rangeOf(profile)}`;
  return (
    <>
      {/* The chart fills the card's width at a fixed height (the strokes keep their width), so the band lines up with the caption and
          the ticks stand only a little past the band; its labels are HTML at body size under it, not SVG text that shrank to 7 px at
          390 (XMS-20, R3MS-18). */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-12 w-full" role="img" aria-label={chartLabel}>
        {band && (
          <rect
            x={x(band.lo)}
            y={BAND_TOP}
            width={x(band.hi) - x(band.lo)}
            height={BAND_HEIGHT}
            fill="var(--ok-soft)"
            stroke="var(--ok)"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {rows.map(({ file, rms, missed }) => (
          <line
            key={file.path}
            x1={x(rms)}
            x2={x(rms)}
            y1={BAND_TOP - TICK_OVER}
            y2={BAND_TOP + BAND_HEIGHT + TICK_OVER}
            stroke={missed ? 'var(--danger-text)' : 'var(--text)'}
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {file.name}: {formatLevel(rms)} dB{missed ? ' (not met)' : ''}
            </title>
          </line>
        ))}
      </svg>
      {band && (
        <div aria-hidden="true" className="relative mt-1.5 h-5 font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.8125rem] text-[var(--text-muted)]">
          <span className="absolute" style={{ left: at(band.lo) }}>
            {formatLevel(band.lo)}
          </span>
          <span className="absolute -translate-x-full" style={{ left: at(band.hi) }}>
            {formatLevel(band.hi)}
          </span>
        </div>
      )}
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Spread {spread.toFixed(1)} dB across {rows.length} {rows.length === 1 ? 'file' : 'files'}.
      </p>
    </>
  );
}

/**
 * "the ACX range", or for a custom profile its own name in quotes ("the range of “My ACX, tighter peak”"), so a name with a comma or a
 * capital does not read as part of the sentence (R4MS2-7).
 */
export function rangeOf(profile: DeliveryProfile | undefined): string {
  if (!profile) return 'the profile range';
  return profile.builtIn ? `the ${profileName(profile)} range` : `the range of “${profileName(profile)}”`;
}
