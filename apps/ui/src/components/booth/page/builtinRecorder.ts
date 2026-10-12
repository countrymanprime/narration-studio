import type { DawResult } from '../../../api/contracts/daw';
import type { RecordingApi } from '../../../api/contracts/recording';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { DawClient } from '../../../ports/daw';

type Recorder = Pick<RecordingApi, 'recorderState' | 'recorderStart' | 'recorderStop'>;

const ok = (message = ''): DawResult => ({ ok: true, changed: true, message, undoSteps: 0 });
const refused = (sentence: string): DawResult => ({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence });

/**
 * The Booth's DAW client with the built-in recorder behind `recordStart` and `recordStop` when the setup has no DAW (`daw: 'none'`,
 * ADR 0455): the take records to the project's Recordings folder with the device the project last recorded with. Every other call,
 * and every call with a DAW, is the DAW client's own. The mock-first seam until the built-in recorder is a DAW kind of its own
 * (SN-D9); nothing here stops a take when the Booth goes away, the leave guard asks first.
 */
export function withBuiltinRecorder(daw: DawClient, recorder: Recorder): DawClient {
  const builtin = async () => (await daw.capabilities()).daw === 'none';
  const run = async (action: () => Promise<{ phase: string; message: string }>, done: (phase: string) => boolean): Promise<DawResult> => {
    try {
      const state = await action();
      return done(state.phase) ? ok(state.message) : refused(state.message || 'The recorder did not answer.');
    } catch (error) {
      return refused(apiErrorMessage(error));
    }
  };
  return {
    ...daw,
    async recordStart(chapterId) {
      if (!(await builtin())) return daw.recordStart(chapterId);
      return run(
        async () => recorder.recorderStart((await recorder.recorderState()).device),
        (phase) => phase === 'recording',
      );
    },
    async recordStop() {
      if (!(await builtin())) return daw.recordStop();
      return run(
        () => recorder.recorderStop(),
        (phase) => phase !== 'recording',
      );
    },
  };
}
