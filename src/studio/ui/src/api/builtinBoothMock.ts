// The mock Booth Record for the built-in recorder (src/studio/desktop/bindings_booth_record.go): the same ReadAloudRecordStart and
// ReadAloudRecordStop the Booth uses with a DAW, answered by the recorder mock and the mock DAW's transport together, so a
// take the Booth starts shows in the recorder's state, the capability report and the transport as the host's does.
// Its answers follow tests/fixtures/contracts/read-aloud-recordings-builtin.json (wireContracts.test.ts pins them).
import type { DawCapabilities, DawCapabilityReason } from './contracts/daw';
import type { RecordingApi } from './contracts/recording';
import type { ReadAloudRecordReason, ReadAloudRecording, TeleprompterApi } from './contracts/teleprompter';
import type { DawMockControl } from './dawMock';

type Deps = {
  /** The REAPER-shaped answers, for every project that does not record in the app. */
  delegate: Pick<TeleprompterApi, 'readAloudRecordStart' | 'readAloudRecordStartAt' | 'readAloudRecordStop'>;
  capabilities: () => Promise<DawCapabilities>;
  control: Pick<DawMockControl, 'record'>;
  recorder: Pick<RecordingApi, 'recorderState' | 'recorderDevices' | 'recorderStart' | 'recorderStop'>;
  /** The microphone the Booth's Levels menu chose (the global Teleprompter.input_device row); '' when none. */
  chosenMicrophone: () => Promise<string>;
};

const refused = (reason: ReadAloudRecordReason, message: string): ReadAloudRecording => ({ outcome: 'refused', reason, message });

// The reasons the host's resolver gives a capability, as a refusal names them (the capability entry carries the same ones).
const WIRE_REASONS: Record<DawCapabilityReason, ReadAloudRecordReason> = {
  standalone: 'standalone',
  not_running: 'not_running',
  experimental_off: 'experimental_off',
  failed: 'failed',
  turned_off: 'turned_off',
  not_yet: 'not_yet',
  unsupported: 'unsupported',
};
const wireReason = (reason: DawCapabilityReason | undefined): ReadAloudRecordReason => (reason ? WIRE_REASONS[reason] : 'failed');

export function createBuiltinBoothRecordMock(deps: Deps): Pick<TeleprompterApi, 'readAloudRecordStart' | 'readAloudRecordStartAt' | 'readAloudRecordStop'> {
  const inApp = async () => (await deps.capabilities()).daw === 'Built-in';
  // The host's order: the capability's own refusal, then the microphone, then the device.
  const microphone = async (): Promise<{ device: string } | ReadAloudRecording> => {
    const chosen = (await deps.chosenMicrophone()).trim();
    if (chosen) return { device: chosen };
    const last = (await deps.recorder.recorderState()).device.trim();
    if (last) return { device: last };
    const { devices, error } = await deps.recorder.recorderDevices();
    if (devices.length === 1) return { device: devices[0].name };
    if (devices.length === 0) return refused('no_microphone', error ?? 'No microphone found. Plug one in, then press Record again.');
    return refused('choose_microphone', 'Choose the microphone in Levels, then press Record.');
  };
  return {
    readAloudRecordStart: async (chapterId) => {
      if (!(await inApp())) return deps.delegate.readAloudRecordStart(chapterId);
      const record = (await deps.capabilities()).capabilities.record;
      if (!record?.available) return refused(wireReason(record?.reason), record?.message ?? 'Recording is not available in the built-in recorder right now.');
      const picked = await microphone();
      if ('outcome' in picked) return picked;
      // A refusal the mock DAW was scripted to give (control.refuseNext) and the transport that the Booth hears.
      const gate = deps.control.record('start');
      if (gate) return refused('failed', gate.message);
      try {
        await deps.recorder.recorderStart(picked.device);
      } catch (error) {
        deps.control.record('stop');
        return refused('failed', error instanceof Error ? error.message : String(error));
      }
      return { outcome: 'started' };
    },
    readAloudRecordStartAt: async (chapterId, at) => {
      if (!(await inApp())) return deps.delegate.readAloudRecordStartAt(chapterId, at);
      if (!Number.isFinite(at) || at < 0) return refused('bad_time', 'The record start time is not a usable number of seconds.');
      return refused('not_yet', 'Not available with the built-in recorder yet.');
    },
    readAloudRecordStop: async () => {
      if (!(await inApp())) return deps.delegate.readAloudRecordStop();
      if ((await deps.recorder.recorderState()).phase !== 'recording')
        return refused('not_recording', 'The built-in recorder is not recording, so nothing was stopped.');
      await deps.recorder.recorderStop();
      deps.control.record('stop');
      return { outcome: 'stopped' };
    },
  };
}
