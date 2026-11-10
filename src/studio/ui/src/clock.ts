// The one place a number of seconds becomes a clock reading. A page does not format a duration itself (issue 3277): two screens
// showing the same length must show the same text, so the rounding and the padding are decided here once.

export type ClockOptions = {
  /** 2 pads the minutes ("06:42"), as the REC badge and the recording timer are drawn. Default 1 ("6:42"). */
  minuteDigits?: 1 | 2;
  /** "always" keeps the hours under an hour ("0:07:05"), for an elapsed-time chip. Default: hours only from an hour. */
  hours?: 'always';
};

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Seconds as `m:ss`, or `h:mm:ss` from an hour. Whole seconds are floored, so a clock never shows a second that has not
 * happened yet; negative and non-finite input reads zero.
 */
export function clock(seconds: number, options: ClockOptions = {}): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0 || options.hours === 'always') return `${hours}:${pad(minutes)}:${pad(whole % 60)}`;
  return `${String(minutes).padStart(options.minuteDigits ?? 1, '0')}:${pad(whole % 60)}`;
}

/**
 * A position with a fraction, `m:ss.s` ("1:05.3") or with `decimals: 2` `m:ss.ss` ("1:05.30") for the fine zoom. Rounds to the last decimal first,
 * so 59.96 reads "1:00.0", never "0:60.0".
 */
export function clockTenths(seconds: number, options: Pick<ClockOptions, 'minuteDigits'> & { decimals?: 1 | 2 } = {}): string {
  const decimals = options.decimals ?? 1;
  const unit = 10 ** decimals;
  const units = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * unit)) : 0;
  const rest = (units % (60 * unit)) / unit;
  return `${String(Math.floor(units / (60 * unit))).padStart(options.minuteDigits ?? 1, '0')}:${rest < 10 ? '0' : ''}${rest.toFixed(decimals)}`;
}
