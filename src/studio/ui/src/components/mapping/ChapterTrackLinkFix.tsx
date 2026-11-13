import { useRef } from 'react';
import { EnginePanelLink } from '../engine/EnginePanelContext';
import { chapterName } from '../../chapterName';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { apiErrorMessage } from '../../api/errorMessage';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useChapterTrackState, useChapterTrackProject } from '../chapterTracks/ChapterTrackState';
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
  /** Says something: the takeover sentence, or (`'error'`) that the link could not be made. */
  notify: (text: string, tone?: 'error') => void;
  onLinked: () => void | Promise<void>;
  onNavigate?: () => void;
}) {
  const actions = useChapterLinkActions();
  const state = useChapterTrackState({ enabled: true });
  // The project this prompt opened for: if it is closed or another is opened under it, its chapter is not in what is read now.
  const projectNow = useChapterTrackProject();
  const openedFor = useRef(projectNow);
  const projectGone = projectNow === null || projectNow !== openedFor.current;
  const confirming = usePendingAction();
  // The project was closed under this dialog: there is nothing left to read, so it says so rather than reading for good.
  if (projectGone) return <p role="status">This project is no longer open, so its tracks cannot be read. Close this and open the project again.</p>;
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
            await onLinked();
          } catch (reason) {
            // A toast, the picker stays: the narrator can choose again once the cause is gone.
            notify(`The link could not be made: ${apiErrorMessage(reason)}`, 'error');
          }
        })
      }
      onClear={() => {}}
    />
  );
}
