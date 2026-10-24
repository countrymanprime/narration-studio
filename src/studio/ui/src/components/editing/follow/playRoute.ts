import type { DawCapabilities } from '../../../api/contracts/daw';

/** Said after every reason the DAW did not play: with a DAW linked, the app never plays the chapter itself (#2251 item 32). */
export const DAW_ONLY = 'Nothing played: while a DAW is linked, the chapter plays only through it.';

export const CHECKING = 'Checking which DAW plays this chapter. Try again in a moment.';

/**
 * Who plays the Editing page's chapter. `daw`: a linked DAW whose engine has a transport this build can drive (`transport_sync` is
 * experimental or supported), so the sound comes through its output, FX and level and never through the app's own audio, even when
 * the DAW cannot play now. `app`: the built-in recorder, no recording tool, or an engine with no such transport yet, so the app plays
 * the files itself. `unknown`: the DAW has not answered yet, so nothing plays.
 */
export type PlayRoute = { kind: 'app' } | { kind: 'daw'; name: string } | { kind: 'unknown' };

export function playRoute(caps: DawCapabilities | null): PlayRoute {
  if (!caps) return { kind: 'unknown' };
  if (caps.daw === 'none' || caps.daw === 'Built-in') return { kind: 'app' };
  const level = caps.capabilities['transport_sync']?.level;
  if (level !== 'experimental' && level !== 'supported') return { kind: 'app' };
  return { kind: 'daw', name: caps.daw };
}

/** Why the DAW cannot take a play now, before it is asked: its capability's own sentence, else that it has not answered. */
export function dawCannotPlay(caps: DawCapabilities, name: string): string {
  const support = caps.capabilities['transport_sync'];
  if (!caps.reachable || !support?.available) return support?.message ?? `${name} is not answering.`;
  return `${name} has not answered, or has another project open.`;
}
