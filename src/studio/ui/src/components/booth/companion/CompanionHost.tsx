import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { headingName } from '../../../chapterHeading';
import { useApi } from '../../../api/ApiContext';
import { useCapability } from '../../../useCapability';
import { CommandScope } from '../../../input/router';
import type { GuideEntity, GuideType, ManuscriptNote } from '../../../types';
import type { BoothSource } from '../page/useBoothData';
import { CompanionShell } from '../CompanionShell';
import { RecordInReaperConfirm } from '../RecordInReaperConfirm';
import { ResumePrompt } from '../ResumePrompt';
import { UnresolvedCreditsWarning } from '../UnresolvedCreditsWarning';
import { flagMarks, flagSaves, visibleFlags, withMarks } from '../readerFlags';
import { CREDITS_LABEL, readerMarks, type ReaderMark } from '../readerModel';
import { loadFlagVisibility } from '../readerPreferences';
import { useFollowCursor } from '../useFollowCursor';
import { useRecordInReaper } from '../useRecordInReaper';
import { useListeningMic } from '../listening/useListeningMic';
import { useTeleprompterSession } from '../useTeleprompterSession';

const NO_ENTITIES: GuideEntity[] = [];
const NO_NOTES: ManuscriptNote[] = [];
const NO_TYPES: GuideType[] = [];
const NO_MARKS = new Map<string, ReaderMark[]>();
const NO_DISMISSED: ReadonlySet<number> = new Set();

type Props = {
  source: BoothSource;
  /** The Story Bible entries; the ones this chapter mentions are marked in the text. Chapter mode only. */
  entities?: GuideEntity[];
  /** The Story Bible's types, which colour the entries' marks. */
  types?: GuideType[];
  /** This chapter's notes. Chapter mode only. */
  notes?: ManuscriptNote[];
  /** "Full app" and the double Escape: the Booth on the same chapter or credits. */
  onFullApp: () => void;
  /** The credits' unresolved-token warning's "Fill them in Settings". */
  onFixCredits?: () => void;
};

/**
 * The Companion's own host (SNO-10a): the session, header and recording `CompanionShell` needs, composed from the same
 * hooks the old Booth's companion mode used, so the Companion no longer lives inside the Booth. The shell is
 * frozen as built (DQ-13). There is no F11 here: the narrow panel never goes fullscreen.
 *
 * Flags the session raised are kept as findings when it ends and when the Companion is left, as in the Booth.
 */
export function CompanionHost({ source, entities = NO_ENTITIES, types = NO_TYPES, notes = NO_NOTES, onFullApp, onFixCredits }: Props) {
  const api = useApi();
  const chapter = source.kind === 'chapter' ? source.chapter : undefined;
  const session = useTeleprompterSession({
    chapterId: chapter?.id ?? '',
    chapter,
    credits: source.kind === 'credits' ? { kind: source.credits, text: source.preview.text } : undefined,
  });
  // The Companion records in the DAW, so it listens on the DAW's own input as the Booth does (useListeningMic).
  useListeningMic({
    dawRecords: true,
    chapterId: chapter?.id ?? '',
    chosen: session.chosenDevice,
    source: session.inputSource,
    settingsLoaded: session.settingsLoaded,
    devices: session.devices,
    listenOn: session.listenOn,
  });
  const follow = useFollowCursor({ active: session.active, cursor: session.cursor });
  const record = useCapability('record');
  const recording = useRecordInReaper(chapter?.id, record.available);
  const chapterTitle = source.kind === 'chapter' ? headingName(source.chapter) : CREDITS_LABEL[source.credits];
  const { paragraphs, rows } = session;
  const { flags } = session.session;

  const storyMarks = useMemo(() => (paragraphs ? readerMarks(paragraphs, entities, notes, types) : NO_MARKS), [paragraphs, entities, notes, types]);
  const visibility = useMemo(loadFlagVisibility, []);
  const shownFlags = useMemo(() => visibleFlags(flags, visibility, NO_DISMISSED), [flags, visibility]);
  const marks = useMemo(() => withMarks(storyMarks, flagMarks(rows, shownFlags)), [storyMarks, rows, shownFlags]);

  // Credits have no chapter to keep a finding against.
  const chapterId = chapter?.id;
  const latest = useRef({ rows, flags });
  useEffect(() => {
    latest.current = { rows, flags };
  });
  const keep = useCallback(() => {
    if (!chapterId) return;
    const { saves } = flagSaves(latest.current.rows, latest.current.flags, NO_DISMISSED);
    if (saves.length > 0) void api.teleprompterSaveFlags(chapterId, saves).catch(() => {});
  }, [api, chapterId]);
  const wasActive = useRef(session.active);
  useEffect(() => {
    if (wasActive.current && !session.active) keep();
    wasActive.current = session.active;
  }, [session.active, keep]);
  const keepOnLeave = useRef(keep);
  useEffect(() => {
    keepOnLeave.current = keep;
  });
  useEffect(() => () => keepOnLeave.current(), []);

  const header: ReactNode =
    source.kind === 'chapter' ? (
      <ResumePrompt chapterId={source.chapter.id} model={session.model} active={session.active} onStartWord={(word) => session.setStartWord(word)} />
    ) : source.preview.unresolved.length > 0 ? (
      <UnresolvedCreditsWarning kind={source.credits} tokens={source.preview.unresolved} onFix={onFixCredits} />
    ) : undefined;

  return (
    // Booth scope: `reading.toggle` (Space) resolves here ahead of `global`.
    <CommandScope kind="booth">
      <CompanionShell
        session={session}
        follow={follow}
        chapterTitle={chapterTitle}
        chapterId={chapterId}
        recording={recording}
        marks={marks}
        header={header}
        onFullApp={onFullApp}
      />
      {recording.confirmPending && chapter && (
        <RecordInReaperConfirm chapterTitle={chapterTitle} confirm={recording.confirm} cancel={recording.cancelConfirm} />
      )}
    </CommandScope>
  );
}
