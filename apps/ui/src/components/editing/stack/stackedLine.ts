import { isStacked, retryModeOf, type RetryMode, type RetrySettings } from '../model/stacking';
import { KEPT_REASON, STACK_TEXT } from './stackText';
import type { StackLine } from './types';

/** What the takes under a line show of a stack. The chip says Stacked and the strip draws one lane for each take on the one spot. */
export interface StackedView {
  stacked: boolean;
  /** "Stacked" on the chip, or null when the line is not stacked. */
  chip: string | null;
  /** The lane of each take in the timeline strip: the first read on top, then the others in the order they were recorded. Empty when not stacked. */
  lanes: Readonly<Record<string, number>>;
}

/** The flag and the lanes #1296's strip and the chip read for a line. The takes of a stacked line sit on one spot, one lane each. */
export function stackedView(line: Pick<StackLine, 'takes' | 'stack' | 'kept'>): StackedView {
  const stacked = isStacked({ ...line, id: '', chapterId: '' });
  if (!stacked) return { stacked: false, chip: null, lanes: {} };
  const ordered = [...line.takes].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id, 'en', { numeric: true }));
  return { stacked, chip: STACK_TEXT.stacked, lanes: Object.fromEntries(ordered.map((t, i) => [t.id, i])) };
}

/** Why both stack actions are off for the line, or undefined when it can be stacked or un-stacked. */
export const keptReason = (line: Pick<StackLine, 'kept'>): string | undefined => (line.kept ? KEPT_REASON : undefined);

/** The reads a clean-up would hide: the ones that are not the kept take and not hidden already. */
export const otherReads = (line: StackLine): string[] => line.takes.filter((t) => t.id !== line.keptId && !line.hidden.includes(t.id)).map((t) => t.id);

/** The clean-up is offered for a kept line whose reads were left where they are, and only while there are reads left to hide. */
export function canCleanUp(line: StackLine, settings: RetrySettings): boolean {
  return line.kept && !isStacked(line) && retryModeOf(settings, line) === 'leave' && otherReads(line).length > 0;
}

/** The menu offers stacking only to a line that follows the stack choice. */
export const stackModeOf = (line: StackLine, settings: RetrySettings): RetryMode => retryModeOf(settings, line);
