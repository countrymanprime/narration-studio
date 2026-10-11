import { CHECKPOINT_MINUTES, WPH } from './estimates';
import { platformHas } from './platform';
import type { PlatformCapability } from './profiles';

/** What a milestone can measure. A custom milestone has no estimate and is marked done by hand. `needs` is a delivery-profile capability. */
type MeasureDef = { id: string; label: string; needs?: PlatformCapability };

/** The measures the host accepts (ADR 0800 decision 3), in the order the dialog lists them. `chN` and `minN` stand for `ch<N>` and `min<N>`. */
export const MEASURES: readonly MeasureDef[] = [
  { id: 'custom', label: 'Custom: no estimate' },
  { id: 'rec', label: 'All recorded' },
  { id: 'edit', label: 'All edited' },
  { id: 'proof', label: 'All proofed' },
  { id: 'editproof', label: 'All edited and proofed' },
  { id: 'chN', label: 'First N chapters edited and proofed' },
  { id: 'minN', label: 'First N finished minutes, recorded, edited and proofed' },
  { id: 'checkpoint', label: '15-minute checkpoint', needs: 'checkpoint15' },
  { id: 'all', label: 'Whole book' },
];

/** The stored measure that reads as the first CHECKPOINT_MINUTES finished minutes. */
export const CHECKPOINT_MEASURE = 'checkpoint';

/** The measure's id in the list: a missing one is custom, and `ch4` and `min20` are `chN` and `minN`. */
export const measOf = (stored: string | undefined): string =>
  !stored || stored === 'custom' ? 'custom' : /^ch\d+$/.test(stored) ? 'chN' : /^min\d+$/.test(stored) ? 'minN' : stored;

/** The N of "first N finished minutes". */
export const minutesOf = (stored: string | undefined): number => {
  if (stored === CHECKPOINT_MEASURE) return CHECKPOINT_MINUTES;
  const m = /^min(\d+)$/.exec(stored ?? '');
  return m ? Number(m[1]) : CHECKPOINT_MINUTES;
};

/** The N of "first N chapters". */
export const chaptersOf = (stored: string | undefined): number => {
  const m = /^ch(\d+)$/.exec(stored ?? '');
  return m ? Number(m[1]) : 6;
};

/** The longest "first N finished minutes" a book of `words` words has. */
export const maxMinutes = (words: number): number => Math.max(1, Math.floor((words / WPH) * 60));

/**
 * The measures the project's delivery profile offers, plus the one the milestone already has: a stored measure is always an offered
 * one, even when the profile no longer offers it.
 */
export function measureOptions(
  profileId: string | undefined,
  current?: string,
  reported?: readonly PlatformCapability[],
): Array<{ value: string; label: string }> {
  const own = current === undefined ? undefined : measOf(current);
  return MEASURES.filter((m) => !m.needs || platformHas(profileId, m.needs, reported) || m.id === own).map((m) => ({ value: m.id, label: m.label }));
}

/** The measure as the narrator chose it, with its value filled in: "First 15 finished minutes", "First 4 chapters edited and proofed", "Whole book". */
export function measureText(stored: string | undefined): string {
  const m = measOf(stored);
  if (m === 'chN') return `First ${chaptersOf(stored)} chapters edited and proofed`;
  if (m === 'minN' || stored === CHECKPOINT_MEASURE) return `First ${minutesOf(stored)} finished minutes`;
  if (m === 'custom') return 'Custom';
  return MEASURES.find((x) => x.id === m)?.label ?? m;
}
