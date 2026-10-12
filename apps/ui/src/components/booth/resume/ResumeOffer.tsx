import { HeaderChip } from '../../primitives/HeaderChip';
import { TooltipTarget } from '../../primitives/Tooltip';
import type { DawProjectState } from '../../../api/contracts/daw';
import type { TeleprompterSpan } from '../../../types';
import { saveNote, sourceText, type KeptResume, type ResumeOfferState, type ResumeTarget } from './resumeOffer';
import { useResumeOffer } from './useResumeOffer';

/**
 * The Booth's one resume line (the mock's `bresume`): "Resume at ¶ n", with where the place was read from beside it, and a
 * word of caution when it is an estimate. Choosing it only reports the place for Start to begin at (ADR 0112); it starts
 * nothing and moves nothing in the DAW. A locate that needs the Whisper model offers nothing and says why in its tooltip;
 * the download prompt stays with the Companion's `WhisperModelPrompt`. A place read from the saved project carries `saved`, the
 * project's save note (`saveNote`), so the line says it is as of that save.
 */
export function ResumeOfferLine({ state, saved = '', onChoose }: { state: ResumeOfferState; saved?: string; onChoose: (target: ResumeTarget) => void }) {
  if (state.kind === 'none') {
    if (!state.note) return null;
    return (
      <TooltipTarget text={state.note}>
        <HeaderChip aria-label={`No resume point. ${state.note}`}>No resume point</HeaderChip>
      </TooltipTarget>
    );
  }
  const { offer } = state;
  const why = offer.source === 'saved' && saved ? `${sourceText(offer)} · ${saved}` : sourceText(offer);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <TooltipTarget text={`Sets where Start begins · ${why}`}>
        <HeaderChip aria-label={`Resume at ¶ ${offer.paragraph}`} onClick={() => onChoose({ paragraphId: offer.paragraphId, word: offer.word })}>
          Resume at ¶ {offer.paragraph}
        </HeaderChip>
      </TooltipTarget>
      <span className="truncate text-xs text-[var(--text-muted)]">{why}</span>
    </span>
  );
}

/** `ResumeOfferLine` over the host's answer for the chapter; `project` and `dawName` give the save note. */
export function ResumeOffer(props: {
  chapterId: string;
  model: string;
  spans: readonly TeleprompterSpan[];
  recording: boolean;
  kept?: KeptResume | null;
  project?: DawProjectState | null;
  dawName?: string;
  onChoose: (target: ResumeTarget) => void;
}) {
  const { onChoose, project, dawName = '', ...lookup } = props;
  return <ResumeOfferLine state={useResumeOffer(lookup)} saved={saveNote(project, dawName)} onChoose={onChoose} />;
}
