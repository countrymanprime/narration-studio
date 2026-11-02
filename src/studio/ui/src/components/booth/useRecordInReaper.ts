import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { errorText } from './useTeleprompterSession';

const SETTINGS_TOOL = 'ReadAloud';
const ENABLED_KEY = 'record_in_reaper';

export type RecordInReaperState = {
  /** The project-scope settings have been read once; the toggle shows its real state only after this. */
  loaded: boolean;
  enabled: boolean;
  /** This app is, as far as it knows, currently recording in REAPER because `beforeStart` told it to. */
  recording: boolean;
  /** When (`Date.now()`) REAPER confirmed the recording this app started, for the toggle's "REC 06:42"; absent while not recording. */
  recordingSince?: number;
  /** The last arm, start or stop refusal's message, cleared at the start of the next attempt. */
  error?: string;
  /** Called before a session starts listening (Play). Resolves true when it is fine to go ahead: the toggle is off, the
   * capability is unavailable, there is no chapter (credits), or REAPER confirmed it started recording. Resolves false
   * only on a genuine refusal or timeout, with `error` set to why. */
  beforeStart: () => Promise<boolean>;
  /** Called after a session has stopped (Stop, or the dialog's "Stop reading?" confirm). A no-op unless this app
   * actually started a REAPER recording for this session. */
  afterStop: () => void;
};

/**
 * The Record-in-REAPER setting's reading and what Play and Stop do while it is on. The setting is a per-project on/off
 * (`ReadAloud.record_in_reaper`, read the way `Keymap.overrides` is; no Settings panel names this tool). Nothing in the app turns it on or off
 * any more (its toggle and first-time confirm had no caller and were removed, #2602), so it is on only for a project that saved it earlier.
 * While it is on: `ReadAloudRecordStart` before a session starts listening, `ReadAloudRecordStop` after it
 * stops. Reading with the toggle off, with the record capability unavailable, or with no chapter (credits mode)
 * never touches REAPER: `beforeStart` answers true at once, as before the toggle existed, so a narrator whose REAPER access
 * lapses can still just read.
 */
export function useRecordInReaper(chapterId: string | undefined, capabilityAvailable: boolean): RecordInReaperState {
  const api = useApi();
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number>();
  const recording = recordingSince !== undefined;
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    void api
      .settingsForScope('project')
      .then((fields) => {
        if (!live) return;
        const rows = fields[SETTINGS_TOOL] ?? [];
        setEnabled(rows.find((row) => row.key === ENABLED_KEY)?.effectiveValue === 'true');
        setLoaded(true);
      })
      .catch((reason) => live && setError(errorText(reason)));
    return () => {
      live = false;
    };
  }, [api]);

  const beforeStart = useCallback(async (): Promise<boolean> => {
    if (!enabled || !capabilityAvailable || !chapterId) return true;
    // Reading finished while REAPER kept recording and Play starts reading again: REAPER is already
    // recording the take this app started, so asking it to start again would only be refused.
    if (recording) return true;
    setError(undefined);
    try {
      const result = await api.readAloudRecordStart(chapterId);
      if (result.outcome === 'started') {
        setRecordingSince(Date.now());
        return true;
      }
      setError(result.message);
      return false;
    } catch (reason) {
      setError(errorText(reason));
      return false;
    }
  }, [api, chapterId, enabled, capabilityAvailable, recording]);

  const afterStop = useCallback(() => {
    if (!recording) return;
    setRecordingSince(undefined);
    api.readAloudRecordStop().catch((reason) => setError(errorText(reason)));
  }, [api, recording]);

  return { loaded, enabled, recording, recordingSince, error, beforeStart, afterStop };
}
