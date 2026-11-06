import { useEffect, useRef, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { unitAtPosition } from '../reading/readingPosition';
import type { BoothUnit, ReadingParagraph } from '../reading/boothUnits';
import { positionAtOffset, secondsBefore, wordRangeOf } from './readingSource';

/** Where the DAW goes when the Booth opens (useMoveDawOnOpen): the end of the chapter's audio, or a time in it. */
type MoveTarget = { where: 'end' } | { where: 'at'; seconds: number };

/**
 * The place the DAW is moved to when the Booth opens at a chapter. Opened with no line it is the end of the chapter's audio. Opened at a line
 * it is where that line was recorded before, from the host (`boothPunchTarget`, the same word-times source as a punch, so it is right in a
 * Voice folders chapter too); a line nobody recorded goes to the end; only when the host cannot say (no recording check, a stale one, a failed
 * read) is it the text-length estimate. Null until the chapter's words are read and the host has answered.
 */
export function useMoveTarget({
  chapterId,
  paragraphs,
  units,
  line,
}: {
  chapterId: string;
  paragraphs: readonly ReadingParagraph[];
  units: readonly BoothUnit[];
  /** The line the Booth opened at; absent when it opened at the chapter. */
  line: { paragraphId: string; offset: number } | undefined;
}): MoveTarget | null {
  const voiceTracks = usePort('voiceTracks');
  const [answer, setAnswer] = useState<{ for: string; target: MoveTarget } | null>(null);
  const position = line ? positionAtOffset(paragraphs, line.paragraphId, line.offset) : null;
  const unit = position && unitAtPosition(paragraphs, units, position);
  const range = unit ? wordRangeOf(paragraphs, units[unit.cur]) : null;
  const key = `${chapterId}|${units.length}|${range ? `${range.paragraphId}:${range.from}:${range.to}` : ''}`;
  const estimate = unit ? secondsBefore(units, unit.cur) : 0;
  const estimateRef = useRef(estimate);
  estimateRef.current = estimate;
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const empty = units.length === 0;
  useEffect(() => {
    if (empty || rangeRef.current) return;
    setAnswer({ for: key, target: { where: 'end' } });
  }, [empty, key]);
  useEffect(() => {
    const asked = rangeRef.current;
    if (empty || !asked) return;
    let live = true;
    voiceTracks
      .boothPunchTarget(chapterId, asked.paragraphId, asked.from, asked.to)
      .then((punch): MoveTarget => {
        if (punch.outcome === 'found' && punch.start !== undefined) return { where: 'at', seconds: punch.start };
        if (punch.outcome === 'never_recorded') return { where: 'end' };
        return { where: 'at', seconds: estimateRef.current };
      })
      .catch((): MoveTarget => ({ where: 'at', seconds: estimateRef.current }))
      .then((target) => live && setAnswer({ for: key, target }));
    return () => {
      live = false;
    };
  }, [key, empty, voiceTracks, chapterId]);
  return answer?.for === key ? answer.target : null;
}
