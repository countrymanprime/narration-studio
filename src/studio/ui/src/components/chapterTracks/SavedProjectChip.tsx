import { HeaderChip } from '../primitives/HeaderChip';
import { TooltipTarget } from '../primitives/Tooltip';
import { useSecondsSince } from '../layout/CheckLine';
import { useChapterTrackState } from './ChapterTrackState';

/** What the chip says: the one wording on every page that shows it (#3394). */
export const SAVED_PROJECT = 'Saved project';

/**
 * A mark on a page whose chapter audio and links come from the saved project file, not from REAPER: REAPER is closed, or the read fell back
 * to the file. Its hint is the host's own sentence and when the tracks were read, as the audio engine panel's status line gives them. It draws
 * nothing for REAPER's own tracks or before the first read. A read that fails after a good one keeps what was shown (`source`), so the chip stays
 * while the shown tracks are still the saved file's (qa B1). It reads the one shared state (`useChapterTrackState`), so Proof, Editing
 * and Pickups cannot disagree about it.
 */
export function SavedProjectChip() {
  const state = useChapterTrackState();
  const seconds = useSecondsSince(state.readAt);
  if (state.readAt === null || state.source !== 'saved') return null;
  const ago = seconds === null ? '' : ` ${state.live.stale ? 'Last read' : 'Read'} ${seconds} s ago.`;
  return (
    <TooltipTarget text={`${state.live.message || 'The tracks in the saved project.'}${ago}`}>
      <HeaderChip role="group" aria-label={SAVED_PROJECT} focusable>
        {SAVED_PROJECT}
      </HeaderChip>
    </TooltipTarget>
  );
}
