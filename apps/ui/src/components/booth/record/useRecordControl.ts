import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawProjectState } from '../../../api/contracts/daw';
import type { ReadAloudReaperReason, ReadAloudReaperStatus } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';
import { describeApiError } from '../../../api/errorMessage';
import { recordCheck, type ChapterRecordState } from './recordCheck';

/** How often the Booth asks the DAW again while Record cannot start or the last read failed: a lost event must not leave a notice up for ever. */
export const POLL_MS = 4000;

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
  /** Read the capabilities again, after a setting the Booth itself changed. */
  refresh: () => void;
  /** The visible Check again: a fresh read now, whatever a timer or an event last said. */
  checkAgain: () => void;
  /** When (ms since the epoch) the DAW last answered, by a read or an event; null until it has. */
  checkedAt: number | null;
  /** True while the last read failed: the picture above is then the last one heard, not the DAW's answer now. */
  readFailed: boolean;
  /** How many reads have been asked for; things that depend on the same facts (the link state) read again when it changes. */
  reads: number;
};

/** The sentence for a DAW that has gone quiet: what the Booth can and cannot tell, and the way out. */
export function cantTell(daw: string | undefined, checkedAt: number | null, now: number): string {
  const name = daw && daw !== 'none' ? daw : 'the DAW';
  const heard = checkedAt === null ? 'not heard yet' : `last heard ${Math.max(0, Math.round((now - checkedAt) / 1000))} s ago`;
  return `Can't tell whether ${name} is ready (${heard}). Press Check again.`;
}

/** What the Booth says when the DAW stopped a take this app started: the narrator's own Stop there, or the DAW closing. */
export const stoppedInDaw = (daw: string | undefined) =>
  `${daw && daw !== 'none' ? daw : 'The DAW'} stopped recording. The take ended there; press Record to start the next one.`;

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

  // Read on open, on refresh() and checkAgain(), when the window is focused again, and on a timer while Record cannot start or the last read
  // failed; kept current by daw_capabilities_changed. An event that arrives while a read is out wins: that read is dropped as stale.
  const [reads, setReads] = useState(0);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const events = useRef(0);
  useEffect(() => {
    let current = true;
    const unsubscribe = daw.subscribeCapabilities?.((next) => {
      events.current += 1;
      if (!current) return;
      setCapabilities(next);
      setReadFailed(false);
      setCheckedAt(Date.now());
    });
    return () => {
      current = false;
      unsubscribe?.();
    };
  }, [daw]);
  useEffect(() => {
    let current = true;
    const heard = events.current;
    daw
      .capabilities()
      .then((c) => {
        if (!current || heard !== events.current) return;
        setCapabilities(c);
        setReadFailed(false);
        setCheckedAt(Date.now());
      })
      // The last picture stays, marked as not current: the narrator is told the Booth cannot tell, never shown a stale answer as fact.
      .catch(() => current && heard === events.current && setReadFailed(true));
    return () => {
      current = false;
    };
  }, [daw, reads]);
  const refresh = useCallback(() => setReads((n) => n + 1), []);
  const unready = !capabilities || !!capabilities.capabilities.record?.available === false || readFailed;
  useEffect(() => {
    const again = () => setReads((n) => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && again();
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', onVisible);
    const timer = unready ? window.setInterval(again, POLL_MS) : undefined;
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [unready]);

  // A take the narrator stopped in the DAW itself ends here too, once the DAW has been heard recording: the transport is pushed only on
  // a change, so the stopped state the subscription hears first, from before the take started, is not taken for its end (ADR 0232).
  const heardRecording = useRef(false);
  useEffect(() => {
    if (!recording) {
      heardRecording.current = false;
      return;
    }
    return daw.subscribeTransport?.((transport) => {
      if (transport.recording) heardRecording.current = true;
      else if (heardRecording.current) {
        heardRecording.current = false;
        setRecording(false);
        notify(stoppedInDaw(capabilities?.daw));
      }
    });
  }, [daw, recording, notify, capabilities?.daw]);

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
  // Never read at all: Record is off, not silently on. Read once and quiet since: the last answer stands but is not given as fact.
  const blind = !capabilities && readFailed;
  const quiet = readFailed ? cantTell(capabilities?.daw, checkedAt, Date.now()) : '';
  const reason = check?.reason ?? (shown || quiet);

  const gate = check?.reason ?? (blind ? quiet : '');
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const capabilitiesRef = useRef(capabilities);
  capabilitiesRef.current = capabilities;
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const toggle = useCallback(async () => {
    if (busy.current) return;
    if (!recordingRef.current && gateRef.current) {
      notify(gateRef.current);
      return;
    }
    busy.current = true;
    const starting = !recordingRef.current;
    try {
      const result = await (starting ? daw.recordStart(chapterId) : daw.recordStop());
      if (result.ok) {
        setRefused(null);
        setRecording(starting);
      } else {
        setRefused({ chapterId, sentence: result.refused ?? result.message });
      }
    } catch (error) {
      // A host call that failed (not a refusal): nothing changed that this app knows of, and the narrator is told so.
      const what = starting ? 'Record did not start' : 'Stop did not go through';
      setRefused({ chapterId, sentence: `${what}: ${describeApiError(error)}. Check ${capabilitiesRef.current?.daw ?? 'the DAW'} before pressing again.` });
    } finally {
      busy.current = false;
    }
  }, [daw, chapterId, notify]);

  return {
    capabilities,
    project,
    recording,
    startedByApp: true,
    reason,
    disabled: !recording && (!!check || blind),
    toggle,
    refresh,
    checkAgain: refresh,
    checkedAt,
    readFailed,
    reads,
  };
}
