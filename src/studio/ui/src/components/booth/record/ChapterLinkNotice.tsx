import type { ChapterTrackCreateResult } from '../../../api/contracts/chapterTrackMap';
import type { DawCapabilitySupport } from '../../../api/contracts/daw';
import { ChapterLinkDialog } from '../../connection/ChapterLinkDialog';
import { useOpenOnce, useReopenOnAsk } from '../../connection/useOpenOnce';
import { NoticeChip } from './RecordSetup';

type Created = Extract<ChapterTrackCreateResult, { outcome: 'created' }>['track'];

/**
 * The Booth's chapter-not-linked notice: a chip above the footer and the dialog that links the chapter to a track or has the DAW add one.
 * The dialog opens by itself the first time the chapter is seen unlinked (`useOpenOnce`), and again on every press of Record (`asked` counts
 * them), so Record never just sits there with a sentence beside it.
 */
export function ChapterLinkNotice({
  chapterId,
  chapterName,
  dawName,
  several,
  create,
  asked,
  hold = false,
  onLinked,
  onCheckAgain,
}: {
  chapterId: string;
  chapterName: string;
  dawName: string;
  /** The chapter has more than one track (`several_tracks`), not none. */
  several: boolean;
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
  const dialog = useOpenOnce(`booth-unlinked:${chapterId}:${several ? 'several' : 'none'}`, hold, { forgetOnUnmount: true });
  const { reopen } = dialog;
  useReopenOnAsk(asked, reopen);
  return (
    <>
      <NoticeChip id="brec-link" label={several ? 'Linked to several tracks' : 'Not linked to a track'} onOpen={reopen} />
      {dialog.open && (
        <ChapterLinkDialog
          chapterId={chapterId}
          chapterName={chapterName}
          dawName={dawName}
          several={several}
          // The host's own sentence points at the audio engine panel; this dialog is that fix, so it says what Record waits for instead.
          sentence={
            several
              ? `Record can't start: a take needs exactly one track for ${chapterName}. Linking one replaces the others.`
              : `Record can't start until ${chapterName} has a track to record on.`
          }
          create={create ? { available: create.available, message: create.message } : undefined}
          onLinked={(_result, created) => {
            dialog.close();
            onLinked(created);
          }}
          onCheckedAgain={onCheckAgain}
          onClose={dialog.close}
        />
      )}
    </>
  );
}
