// The one place a number of seconds becomes a clock reading. A page does not format a duration itself (issue 3277): two screens
// showing the same length must show the same text, so the rounding and the padding are decided here once.

import { plural } from './plural';
import { clamp } from './clamp';

export type ClockOptions = {
  /** 2 pads the minutes ("06:42"), as the REC badge and the recording timer are drawn. Default 1 ("6:42"). */
  minuteDigits?: 1 | 2;
  /** "always" keeps the hours under an hour ("0:07:05"), for an elapsed-time chip. Default: hours only from an hour. */
  hours?: 'always';
  /**
   * `hh:mm:ss.fff`, always: two-digit hours, minutes and seconds and the milliseconds after a dot (a colon there would read as frames), "00:01:05.300".
   * Floored to the millisecond, like every other reading here (a clock never shows a time that has not happened yet), so 59.9996 reads "00:00:59.999",
   * never "00:01:00.000" beside a floored "0:59". The value is taken to the microsecond first, so a time that is a whole number of milliseconds (65.3) is not
   * read one short for the double's sake. Capped at a billion seconds. Overrides the other options. Owner, 2026-11-13 and 2026-11-16 (#3443): the form of every
   * position on Editing and Proof.
   */
  full?: true;
  /**
   * `hh:mm:ss`, always: two-digit hours, minutes and seconds, rounded to the NEAREST second ("00:02:11"; 130.4 reads "00:02:10", 130.5 "00:02:11"), no milliseconds.
   * Owner, 2026-11-22 (#3590): the form of a Pickups time and nowhere else (`clock.guard.test.ts` lists the one file that asks for it). Overrides the other options except `full`.
   */
  hms?: true;
  /**
   * Hours and minutes with their units, "5h 40m" ("0h 10m", "100h 30m"), always marked, so a length of hours beside lengths in minutes and seconds ("10:12") cannot be
   * read as minutes and seconds (owner, 2026-11-16, #3443): every Production and Schedule hours figure. It FLOORS to the whole minute like every other reading (the floor rule of #3443, whose owner confirmation is still open there): 61 s, 89 s,
   * 90 s and 119 s read "0h 01m", 120 s reads "0h 02m", and under a minute (0 < s < 60) it reads "<0h 01m", never "0h 01m", so a figure is never ahead of the time it stands for.
   * Overrides the other options except `full`.
   */
  marked?: true;
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
  if (options.hms) return clockHms(seconds);
  if (options.marked) return clockMarked(seconds);
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0 || options.hours === 'always') return `${hours}:${pad(minutes)}:${pad(whole % 60)}`;
  return `${String(minutes).padStart(options.minuteDigits ?? 1, '0')}:${pad(whole % 60)}`;
}

/**
 * How far below a whole minute a value may be, as a share of the value, and still read as that minute: only a double's own error (a few units of 1.1e-16, from
 * minutes written in hours and back). Anything a real length could be short by (one 48 kHz sample is 21 microseconds) is far above it.
 */
const WHOLE_MINUTE_SLACK = 1e-15;

/**
 * "5h 40m" (see `ClockOptions.marked`): floored to the whole minute; under a minute (but not zero) "<0h 01m"; negative and non-finite input read "0h 00m", as the default reads "0:00";
 * capped at a billion seconds like `full`, so an absurd value never prints digits a double cannot hold. A value that is a whole number of minutes in hours
 * (4 + 35/60 h) is not read one short for the double's sake (a relative 1e-15 of error is forgiven, no more: 59.99994 s is still under a minute, and a length one 48 kHz sample short of a whole minute never reads as it).
 */
function clockMarked(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0h 00m';
  const exact = seconds / 60;
  // Only the double's own error is forgiven (a whole number of minutes written in hours, 4 + 35/60 h, can land a hair below it): 59.99994 s is still under a minute,
  // and a length one sample short of a whole minute never reads as it, however large the value.
  const nearest = Math.round(exact);
  const whole = Math.abs(exact - nearest) <= WHOLE_MINUTE_SLACK * Math.max(1, exact) ? nearest : Math.floor(exact);
  const minutes = Math.min(whole, Math.floor(MAX_FULL_MILLIS / 1000 / 60));
  if (minutes < 1) return '<0h 01m';
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

/**
 * A `marked` figure spelled out for a screen reader: "5 hours 40 minutes", "10 minutes", "less than a minute" ("<0h 01m"). "0h 10m" is read letter by letter and "<" is dropped by
 * the usual punctuation settings, so an accessible name uses this and the visible text stays as `clock` wrote it. A figure inside longer text ("/ 3h 08m") is spelled out where it stands; text with none comes back unchanged.
 */
export function spokenMarked(text: string): string {
  return text.replace(/(<)?(\d+)h (\d{2})m/g, (_whole, less: string | undefined, h: string, m: string) => {
    if (less) return 'less than a minute';
    const [hours, minutes] = [Number(h), Number(m)];
    return [hours > 0 ? plural(hours, 'hour') : '', minutes > 0 || hours === 0 ? plural(minutes, 'minute') : ''].filter(Boolean).join(' ');
  });
}

/** `hh:mm:ss` (see `ClockOptions.hms`): the nearest whole second; negative and non-finite input reads zero, a value past a billion seconds is capped like `full`. */
function clockHms(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.min(Math.max(0, Math.round(seconds)), MAX_FULL_MILLIS / 1000) : 0;
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}`;
}

/** `hh:mm:ss.fff` (see `ClockOptions.full`): floored to the millisecond, so every field is in range and no reading is ahead of the time it stands for. */
function clockFull(seconds: number): string {
  // Capped at a billion seconds (over thirty years): beyond that the milliseconds are not exact in a double, and `seconds * 1000` can overflow.
  const millis = Number.isFinite(seconds) ? clamp(Math.floor(Math.round(seconds * 1e6) / 1000), 0, MAX_FULL_MILLIS) : 0;
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
