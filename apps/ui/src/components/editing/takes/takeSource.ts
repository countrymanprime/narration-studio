import type { DawKind } from '../../../api/contracts/daw';

/** What a take is called in the DAW the project is open in: the sub-line under it names where it lives. Unknown until the DAW has answered. */
export function takeSourceLabel(daw: DawKind | undefined): string | null {
  switch (daw) {
    case 'REAPER':
      return 'REAPER take';
    case 'Audacity':
      return 'Audacity clip';
    case 'Built-in':
    case 'none':
      return 'Recorder take';
    default:
      return null;
  }
}
