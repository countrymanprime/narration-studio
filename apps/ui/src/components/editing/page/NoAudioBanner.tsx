import { Button } from '../../primitives/Button';
import type { ChapterAudio } from './chapterSource';
import { noAudioText } from './noAudioText';

/** Whether the chapter's missing audio is a link to make (the resolve dialog's to fix) rather than a recording to make. */
export const isLinkProblem = (audio: ChapterAudio, daw: string | null): boolean => daw !== null && (audio.kind === 'unlinked' || audio.kind === 'missing');

/**
 * The banner over the script when the chapter has no audio to edit and the fix is a recording, not a link: nothing is recorded yet (the built-in
 * recorder), or the linked track is empty. A chapter with no track to edit, or whose track is gone, is the chapter link dialog's. The script
 * still reads, without what was heard. `daw` is the DAW's own name, or null for the built-in recorder. Nothing tells the page when the narrator
 * records, so **Read again** asks.
 */
export function NoAudioBanner({ audio, chapterName, daw, onReread }: { audio: ChapterAudio; chapterName: string; daw: string | null; onReread: () => void }) {
  if (audio.kind === 'ready' || isLinkProblem(audio, daw)) return null;
  const text = noAudioText(audio, chapterName, daw);
  return (
    <div
      id="noaudio"
      role="status"
      className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] border border-[var(--review)] bg-[var(--review-soft)] px-4 py-2.5 text-[0.875rem]"
    >
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <b>{text.headline}</b> {text.next}
      </span>
      <Button variant="secondary" size="sm" onClick={onReread}>
        Read again
      </Button>
    </div>
  );
}
