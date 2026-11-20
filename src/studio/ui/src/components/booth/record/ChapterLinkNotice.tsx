import type { ChapterTrackCreateResult } from '../../../api/contracts/chapterTrackMap';
import type { DawCapabilitySupport } from '../../../api/contracts/daw';
import { ChapterLinkDialog } from '../../connection/ChapterLinkDialog';
import { useMatchAhead } from '../../connection/chapterMatchCache';
import { useChapterTrackProject } from '../../chapterTracks/ChapterTrackState';
import { useOpenOnce, useReopenOnAsk } from '../../connection/useOpenOnce';
import { destinationFor } from '../../engine/destination';
import { useVoiceLayout } from '../../engine/voiceLayout';
import { NoticeChip } from './RecordSetup';
import { dialogChapterName } from '../../chapterTracks/useChapterLinkActions';

export type Created = Extract<ChapterTrackCreateResult, { outcome: 'created' }>;

/**
 * The Booth's chapter-not-linked notice: a chip above the footer and the dialog that links the chapter to a track or has the DAW add one.
 * The dialog opens by itself the first time the chapter is seen unlinked (`useOpenOnce`), and again on every press of Record (`asked` counts
 * them), so Record never just sits there with a sentence beside it.
 */
export function ChapterLinkNotice({
  chapterId,
  chapterName,
  dawName,
  state,
  create,
  asked,
  hold = false,
  onLinked,
  onCheckAgain,
}: {
  chapterId: string;
  chapterName: string;
  dawName: string;
  /** What is wrong with the chapter's link: none, more than one track (`several_tracks`), or a track the project no longer has (`track_missing`). */
  state: 'unlinked' | 'several' | 'missing';
  /** The DAW's `track_create` capability, when it reports one. */
  create?: DawCapabilitySupport;
  /** How many times Record was pressed while this stops it: each press opens the dialog. */
  asked: number;
  /** Another dialog is up: the automatic opening waits. */
  hold?: boolean;
  /** The chapter is linked: to a track the narrator chose, or to `created`, the one the DAW just added. */
  onLinked: (created?: Created) => void;
  onCheckAgain: () => void;
}) {
  const dest = destinationFor(useVoiceLayout());
  const several = state === 'several';
  // The dialog does not open by itself on a list it cannot offer: it waits for the tracks read ahead (or for that read to end, or a short bound), with the chip on screen meanwhile.
  const ahead = useMatchAhead(useChapterTrackProject(), chapterId);
  const dialog = useOpenOnce(`booth-unlinked:${chapterId}:${state === 'unlinked' ? 'none' : state}`, hold || !ahead, { forgetOnUnmount: true });
  const { reopen } = dialog;
  useReopenOnAsk(asked, reopen);
  return (
    <>
      <NoticeChip
        id="brec-link"
        // While the dialog waits for the tracks the chip says so, so the narrator sees what is happening instead of a notice and a pause.
        label={!ahead ? `Reading the ${dawName} tracks…` : several ? dest.severalChip : state === 'missing' ? dest.missingChip : dest.notLinkedChip}
        onOpen={reopen}
      />
      {dialog.open && (
        <ChapterLinkDialog
          chapterId={chapterId}
          chapterName={chapterName}
          dawName={dawName}
          several={several}
          missing={state === 'missing'}
          // The host's own sentence points at the audio engine panel; this dialog is that fix, so it says what Record waits for instead.
          sentence={
            several
              ? dest.recordWaitsSeveral(dialogChapterName(chapterName))
              : state === 'missing'
                ? dest.recordWaitsMissing(dialogChapterName(chapterName))
                : dest.recordWaits(dialogChapterName(chapterName))
          }
          create={create ? { available: create.available, message: create.message } : undefined}
          onLinked={(_result, created) => {
            dialog.close();
            onLinked(created);
          }}
          onCheckedAgain={onCheckAgain}
          returnFocus={() => document.querySelector<HTMLElement>('#brec-link button')}
          onClose={dialog.close}
        />
      )}
    </>
  );
}
