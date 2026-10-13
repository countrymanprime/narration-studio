import { EnginePanelLink } from '../../engine/EnginePanelContext';
import { Button } from '../../primitives/Button';
import type { ChapterAudio } from './chapterSource';
import { noAudioText } from './noAudioText';

/**
 * The banner over the script when the chapter has no audio to edit (no track linked, the linked track gone from the project, or an empty track):
 * why, and the way forward. The script still reads, without what was heard; the bar, the strip and the edit actions have nothing to act on.
 * `daw` is the DAW's own name, or null for the built-in recorder. Nothing tells the page when the narrator links the chapter, so **Read again** asks.
 */
export function NoAudioBanner({ audio, chapterName, daw, onReread }: { audio: ChapterAudio; chapterName: string; daw: string | null; onReread: () => void }) {
  if (audio.kind === 'ready') return null;
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
      {text.offersEngine ? <EnginePanelLink className="font-semibold" /> : null}
      <Button variant="secondary" size="sm" onClick={onReread}>
        Read again
      </Button>
    </div>
  );
}
