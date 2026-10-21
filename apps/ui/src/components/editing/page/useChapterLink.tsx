import type { ReactNode } from 'react';
import { ChapterLinkDialog } from '../../connection/ChapterLinkDialog';
import { ConnectionIndicator } from '../../connection/ConnectionIndicator';
import { useOpenOnce } from '../../connection/useOpenOnce';
import type { ChapterAudio } from './chapterSource';
import { isLinkProblem } from './NoAudioBanner';
import { noAudioText } from './noAudioText';

/**
 * The chapter-not-linked mark and dialog for the Editing page. The indicator replaces the banner; the dialog opens by itself once for the chapter
 * (`useOpenOnce`, held while the DAW dialog is up so two never stack) and links the chosen track in place, after which the page reads the chapter again.
 */
export function useChapterLink({
  audio,
  chapterId,
  chapterName,
  daw,
  hold,
  onReread,
}: {
  audio: ChapterAudio;
  chapterId: string;
  chapterName: string;
  daw: string | null;
  hold: boolean;
  onReread: () => void;
}): { indicator: ReactNode; dialog: ReactNode } {
  const problem = isLinkProblem(audio, daw);
  const state = useOpenOnce(problem ? `chapter-unlinked:${chapterId}:${audio.kind}` : null, hold);
  if (!problem || daw === null || audio.kind === 'ready' || audio.kind === 'empty') return { indicator: null, dialog: null };
  const text = noAudioText(audio, chapterName, daw);
  return {
    indicator: <ConnectionIndicator id="noaudio" label="Not linked to a track" onOpen={state.reopen} />,
    dialog: state.open ? (
      <ChapterLinkDialog
        chapterId={chapterId}
        chapterName={chapterName}
        sentence={`${text.headline} ${text.next}`}
        dawName={daw}
        missing={audio.kind === 'missing'}
        onLinked={onReread}
        onCheckedAgain={onReread}
        onClose={state.close}
      />
    ) : null,
  };
}
