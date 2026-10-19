import type { TrackItem } from '../../../api/contracts/tracks';

/** Seconds of the recording heard before a pickup's time, and after it: enough to hear the line in its sentence. */
export const BEFORE_SECONDS = 3;
export const AFTER_SECONDS = 6;

/** Where in a source file a pickup's time falls, or why the app cannot play it. */
export type OriginalSpot = { ok: true; sourceFile: string; at: number } | { ok: false; reason: string };

/**
 * The item on the chapter's track that holds `at` (project seconds, as `PickupItem.at` gives them) and the matching second of its source file:
 * the item starts `sourceStart` seconds into its file and plays `playRate` seconds of it for each second of project time. An item the app cannot
 * read (its file is missing or its kind is not supported) is skipped; a time between items, or past the last, has no audio to play.
 */
export function originalSpot(items: readonly TrackItem[], at: number): OriginalSpot {
  const holding = items.filter((item) => at >= item.position && at < item.position + item.length);
  if (holding.length === 0) return { ok: false, reason: 'The chapter’s track has no audio at this line.' };
  const item = holding.find((candidate) => candidate.supported && candidate.sourceAvailable);
  if (!item) return { ok: false, reason: 'The recording at this line is a file the app cannot read here.' };
  return { ok: true, sourceFile: item.sourceFile, at: item.sourceStart + (at - item.position) * (item.playRate > 0 ? item.playRate : 1) };
}
