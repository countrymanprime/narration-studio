// The one place a number of seconds becomes a clock reading. A page does not format a duration itself (issue 3277): two screens
// showing the same length must show the same text, so the rounding and the padding are decided here once.

export type ClockOptions = {
  /** 2 pads the minutes ("06:42"), as the REC badge and the recording timer are drawn. Default 1 ("6:42"). */
  minuteDigits?: 1 | 2;
  /** "always" keeps the hours under an hour ("0:07:05"), for an elapsed-time chip. Default: hours only from an hour. */
  hours?: 'always';
  /**
   * `hh:mm:ss.fff`, always: two-digit hours, minutes and seconds and the milliseconds after a dot (a colon there would read as frames), "00:01:05.300".
   * Rounded to the millisecond (unlike the default form, which floors whole seconds), so no sub-millisecond fraction is hidden and 59.9996 reads
   * "00:01:00.000", never "00:00:59.1000"; a value exactly half a millisecond up rounds as the double does. Capped at a billion seconds. Overrides the
   * other options. Owner, 2026-11-13 (#3443); no screen adopts it until the owner names one.
   */
  full?: true;
};

/** The longest length `full` writes: a billion seconds, in milliseconds. */
const MAX_FULL_MILLIS = 1e9 * 1000;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Seconds as `m:ss`, or `h:mm:ss` from an hour. Whole seconds are floored, so a clock never shows a second that has not
 * happened yet; negative and non-finite input reads zero.
 */
export function clock(seconds: number, options: ClockOptions = {}): string {
  if (options.full) return clockFull(seconds);
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0 || options.hours === 'always') return `${hours}:${pad(minutes)}:${pad(whole % 60)}`;
  return `${String(minutes).padStart(options.minuteDigits ?? 1, '0')}:${pad(whole % 60)}`;
}

/** `hh:mm:ss.fff` (see `ClockOptions.full`): milliseconds are rounded first and carried, so every field is in range. */
function clockFull(seconds: number): string {
  // Capped at a billion seconds (over thirty years): beyond that the milliseconds are not exact in a double, and `seconds * 1000` can overflow.
  const millis = Number.isFinite(seconds) ? Math.min(Math.max(0, Math.round(seconds * 1000)), MAX_FULL_MILLIS) : 0;
  const whole = Math.floor(millis / 1000);
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}.${String(millis % 1000).padStart(3, '0')}`;
}

/**
 * A position with a fraction, `m:ss.s` ("1:05.3") or with `decimals: 2` `m:ss.ss` ("1:05.30") for the fine zoom, and `h:mm:ss.s` from an hour so it
 * agrees with `clock`. Rounds to the last decimal first, so 59.96 reads "1:00.0", never "0:60.0".
 */
export function clockTenths(seconds: number, options: Pick<ClockOptions, 'minuteDigits'> & { decimals?: 1 | 2 } = {}): string {
  const decimals = options.decimals ?? 1;
  const unit = 10 ** decimals;
  const units = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * unit)) : 0;
  const hours = Math.floor(units / (3600 * unit));
  const minutes = Math.floor(units / (60 * unit)) % 60;
  const rest = (units % (60 * unit)) / unit;
  const secs = `${rest < 10 ? '0' : ''}${rest.toFixed(decimals)}`;
  return hours > 0 ? `${hours}:${pad(minutes)}:${secs}` : `${String(minutes).padStart(options.minuteDigits ?? 1, '0')}:${secs}`;
}
