import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawProjectState } from '../../../api/contracts/daw';
import type { ReadAloudReaperReason, ReadAloudReaperStatus } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';
import { recordCheck, type ChapterRecordState } from './recordCheck';

function tracksOf(status: ReadAloudReaperStatus, reason?: ReadAloudReaperReason): ChapterRecordState['tracks'] {
  if (status !== 'no_link') return 'one';
  return reason === 'several_links' ? 'several' : 'none';
}

export type RecordControlState = {
  capabilities: DawCapabilities | null;
  /** The DAW project as last saved and whether it has unsaved changes; null until the DAW port answers. */
  project: DawProjectState | null;
  recording: boolean;
  /** False when the DAW was already recording and this app did not start the take; the leave guard reads it (ADR 0232). */
  startedByApp: boolean;
  /** Why Record cannot start, or the host's refusal of the last press; '' when nothing stops it. */
  reason: string;
  disabled: boolean;
  /** Start or stop a take (the `reading.toggle` command). A start that a precondition stops says why through `notify` and starts nothing. */
  toggle: () => Promise<void>;
};

/**
 * The Booth's Record control over the DAW port: the capabilities and the host's read of the chapter's track give `recordCheck`, a press
 * calls `recordStart(chapterId)` or `recordStop()` once, and a refused call shows the host's sentence and changes nothing.
 * Nothing is armed first, the host arms and starts in one call, and nothing stops a take when the Booth unmounts: the leave
 * guard (`useBoothLeaveGuard`) owns that question. The project's saved state is read when the Booth opens and again after each take
 * starts or stops, the moments its unsaved changes are likely to change.
 */
export function useRecordControl({ chapterId, notify }: { chapterId: string; notify: (sentence: string) => void }): RecordControlState {
  const daw = usePort('daw');
  const teleprompter = usePort('teleprompter');
  const [capabilities, setCapabilities] = useState<DawCapabilities | null>(null);
  const [project, setProject] = useState<DawProjectState | null>(null);
  const [match, setMatch] = useState<{ chapterId: string; tracks: ChapterRecordState['tracks']; message: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [refused, setRefused] = useState<{ chapterId: string; sentence: string } | null>(null);
  const busy = useRef(false);
  const readsTracks = !!capabilities?.capabilities.track_state?.available;

  useEffect(() => {
    let current = true;
    daw
      .capabilities()
      .then((c) => current && setCapabilities(c))
      .catch(() => current && setCapabilities(null));
    return () => {
      current = false;
    };
  }, [daw]);

  useEffect(() => {
    let current = true;
    daw
      .projectState()
      .then((state) => current && setProject(state))
      .catch(() => current && setProject(null));
    return () => {
      current = false;
    };
  }, [daw, recording]);

  useEffect(() => {
    if (!readsTracks) return;
    let current = true;
    teleprompter
      .readAloudReaperState(chapterId)
      .then(({ status, reason, message }) => current && setMatch({ chapterId, message, tracks: tracksOf(status, reason) }))
      .catch(() => current && setMatch(null));
    return () => {
      current = false;
    };
  }, [teleprompter, chapterId, readsTracks]);

  const chapter: ChapterRecordState = match?.chapterId === chapterId ? match : { tracks: 'unread', message: '' };
  const check = capabilities ? recordCheck(capabilities, chapter) : null;
  const shown = refused?.chapterId === chapterId ? refused.sentence : '';
  const reason = check?.reason ?? shown;

  const checkRef = useRef(check);
  checkRef.current = check;
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const toggle = useCallback(async () => {
    if (busy.current) return;
    if (!recordingRef.current && checkRef.current) {
      notify(checkRef.current.reason);
      return;
    }
    busy.current = true;
    try {
      const starting = !recordingRef.current;
      const result = await (starting ? daw.recordStart(chapterId) : daw.recordStop());
      if (result.ok) {
        setRefused(null);
        setRecording(starting);
      } else {
        setRefused({ chapterId, sentence: result.refused ?? result.message });
      }
    } finally {
      busy.current = false;
    }
  }, [daw, chapterId, notify]);

  return { capabilities, project, recording, startedByApp: true, reason, disabled: !recording && !!check, toggle };
}
