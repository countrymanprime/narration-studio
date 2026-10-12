import type { HeardWord } from '../../model/align';
import { duplicateRead } from '../../model/duplicates';
import type { SplitTarget } from './splitCommand';

/** What the page knows of a take of a passage whose line is being checked for a second read. */
export interface SplitSource {
  chapterId: string;
  takeId: string;
  label: string;
  /** The words of the script for the line. */
  script: string;
  /** What was heard in the take, timed from the take's own start. */
  heard: readonly HeardWord[];
  /** Seconds into the chapter where the take starts. */
  projectStart: number;
}

/** Where to cut a take that reads the line twice, or null when it reads it once. A line with other takes already has its choice to make. */
export function splitTargetOf(source: SplitSource, takeCount: number): SplitTarget | null {
  if (takeCount !== 1) return null;
  const dup = duplicateRead(source.script, source.heard);
  if (!dup) return null;
  return {
    chapterId: source.chapterId,
    takeId: source.takeId,
    label: source.label,
    at: Math.round((source.projectStart + dup.cutAt) * 1000) / 1000,
  };
}
