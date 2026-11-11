import { useState } from 'react';
import { EnginePanelLink } from '../engine/EnginePanelContext';
import { chapterName } from '../../chapterName';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { apiErrorMessage } from '../../api/errorMessage';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { useChapterLinkActions } from '../chapterTracks/useChapterLinkActions';
import { MappingConfirm } from './MappingConfirm';

/**
 * The chapter-track link, confirmed right where a check refused for want of one (the recording check's result and the Editing check): the same
 * prompt the audio engine panel lists, over the app's one chapter-track state. The tracks and the links it offers are that state's, so a link made
 * here shows in the Engine panel, the Booth and the Production board at once, and one made there shows here (#3413).
 * `notify` says who lost the track when the chosen one was held by another chapter.
 */
export function ChapterTrackLinkFix({
  chapter,
  notify,
  onLinked,
  onNavigate,
}: {
  chapter: ManuscriptChapter;
  notify: (text: string) => void;
  onLinked: () => void | Promise<void>;
  onNavigate?: () => void;
}) {
  const actions = useChapterLinkActions();
  const state = useChapterTrackState({ enabled: true });
  // A link that could not be made is said under the picker, which stays: the narrator can choose again once the cause is gone.
  const [linkError, setLinkError] = useState('');
  const confirming = usePendingAction();
  const listError = state.project ? '' : state.live.error;
  if (listError)
    return (
      <p style={{ color: 'var(--danger-text)' }}>
        The REAPER tracks could not be listed: {listError} <EnginePanelLink onOpen={onNavigate} />
      </p>
    );
  // Both reads (the tracks and the links) answer before the prompt shows, so the "linked to" notes are there from the first draw. A links read
  // that failed (the state is stale) leaves the notes off rather than leaving the prompt reading for good.
  if (!state.project || (state.readAt === null && !state.stale)) return <p role="status">Reading the REAPER tracks…</p>;
  return (
    <>
      <MappingConfirm
        chapterTitle={chapterName(chapter, 'short')}
        tracks={state.project.tracks}
        links={state.mappings}
        chapterId={chapter.id}
        busy={confirming.isBusy}
        onConfirm={(trackGuid) =>
          void confirming.run('confirm', async () => {
            try {
              // The replacing binding: a track another chapter holds moves to this one, and the chapter that lost it is named (#3365).
              const { result, linkedNotice } = await actions.set(chapter.id, trackGuid);
              notify(linkedNotice);
              state.applyMappings(result.mappings);
              setLinkError('');
              await onLinked();
            } catch (reason) {
              setLinkError(apiErrorMessage(reason));
            }
          })
        }
        onClear={() => {}}
      />
      {linkError && (
        <p role="alert" style={{ color: 'var(--danger-text)' }}>
          The link could not be made: {linkError}
        </p>
      )}
    </>
  );
}
