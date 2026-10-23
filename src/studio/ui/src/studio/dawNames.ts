// What a launch's DAW kind is called in a sentence, and whether the app's own recorder is what records. Pages ask these, never type a DAW's name.
import type { DawKind } from '../api/contracts/daw';

/** What the Booth calls what records: the DAW's name, "the built-in recorder" for the app's own, "the DAW" before anything is known. */
export function recorderName(daw: DawKind | undefined): string {
  if (daw === 'Built-in') return 'the built-in recorder';
  return daw && daw !== 'none' ? daw : 'the DAW';
}

/** `recorderName` for the start of a sentence. */
export function recorderNameCapital(daw: DawKind | undefined): string {
  const name = recorderName(daw);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/** Whether the app's own recorder is what records: nothing else can start or end its take, so a take it reports is the app's. */
export const recordsInApp = (daw: DawKind | undefined): boolean => daw === 'Built-in';
