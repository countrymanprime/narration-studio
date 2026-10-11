import type { DawCapabilities, DawResult } from '../api/contracts/daw';
import { DAW_ANSWERS, DAW_PROJECT, type DawProject } from '../fixtures/daw';
import type { NarrationApi } from '../types';

// The DAW port (ADR 0770, ADR 0810): what the app asks of the DAW and what it answers, one `DawResult` per call. A refusal
// carries the capability's or the host's own sentence in `refused` and `message`; this file never words one for the DAW and
// never branches on which DAW it is talking to, so behaviour differs only through the capability fields. A later DAW slice
// adds its method here together with its command (ISP).

export interface DawClient {
  /** What the launch's DAW can do now, as the host or the mock setup reports it. */
  capabilities(): Promise<DawCapabilities>;
  /** Start recording on the chapter's track. */
  recordStart(chapterId: string): Promise<DawResult>;
  /** Stop a recording this app started. */
  recordStop(): Promise<DawResult>;
  /** Make `candidateId` the active take of the passage between the two tokens. */
  useTake(chapterId: string, firstToken: number, lastToken: number, candidateId: string): Promise<DawResult>;
  /** Add the approved marker for a finding. */
  addMarker(findingId: string): Promise<DawResult>;
}

/** The `NarrationApi` methods the host adapter calls: no new binding, only today's. */
export type DawHostApi = Pick<NarrationApi, 'dawCapabilities' | 'readAloudRecordStart' | 'readAloudRecordStop' | 'workspaceUseTake' | 'findingsAddMarker'>;

/** A refused call changed nothing; `refused` holds the sentence and `message` repeats it. */
function refused(sentence: string | undefined, call: string): DawResult {
  if (!sentence) throw new Error(`${call} was refused with no sentence to show`);
  return { ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence };
}

/** The host sends no sentence with a plain success, so `message` is empty then rather than worded here. */
const done = (changed: boolean, undoSteps: number, message = ''): DawResult => ({ ok: true, changed, message, undoSteps });

/** Maps today's host results to `DawResult`. A record start or stop is a transport action, not an edit, so it adds no undo point. */
export function createHostDawClient(api: DawHostApi): DawClient {
  return {
    capabilities: () => api.dawCapabilities(),
    async recordStart(chapterId) {
      const result = await api.readAloudRecordStart(chapterId);
      return result.outcome === 'refused' ? refused(result.message, 'recordStart') : done(true, 0, result.message);
    },
    async recordStop() {
      const result = await api.readAloudRecordStop();
      return result.outcome === 'refused' ? refused(result.message, 'recordStop') : done(true, 0, result.message);
    },
    async useTake(chapterId, firstToken, lastToken, candidateId) {
      const result = await api.workspaceUseTake(chapterId, firstToken, lastToken, candidateId);
      if (result.outcome === 'refused') return refused(result.message, 'useTake');
      return done(result.changed, result.changed ? 1 : 0, result.message);
    },
    async addMarker(findingId) {
      const result = await api.findingsAddMarker(findingId);
      if (result.outcome === 'refused') return refused(result.message, 'addMarker');
      return result.outcome === 'added' ? done(true, 1) : done(false, 0);
    },
  };
}

/** The capability's own sentence when it is not available, else null. */
function unavailable(capabilities: DawCapabilities, name: string, call: string): string | null {
  const support = capabilities.capabilities[name];
  if (support?.available) return null;
  if (!support?.message) throw new Error(`${call}: the setup gives no sentence for ${name}`);
  return support.message;
}

/** The mock, driven by one setup from `fixtures/daw.ts`. It refuses what the host refuses, with the host's sentences, and answers the rest as the host does. */
export function createMockDawClient(setup: DawCapabilities, project: DawProject = DAW_PROJECT): DawClient {
  return {
    capabilities: () => Promise.resolve(setup),
    async recordStart(chapterId) {
      const sentence = unavailable(setup, 'record', 'recordStart');
      if (sentence) return refused(sentence, 'recordStart');
      if (!project.chapterIds.includes(chapterId)) return refused(DAW_ANSWERS.noTrack, 'recordStart');
      return done(true, 0);
    },
    async recordStop() {
      const sentence = unavailable(setup, 'record', 'recordStop');
      return sentence ? refused(sentence, 'recordStop') : done(true, 0);
    },
    async useTake(chapterId, _firstToken, _lastToken, candidateId) {
      const sentence = unavailable(setup, 'takes', 'useTake');
      if (sentence) return refused(sentence, 'useTake');
      if (!project.chapterIds.includes(chapterId) || !project.candidateIds.includes(candidateId)) return refused(DAW_ANSWERS.staleTake, 'useTake');
      return done(true, 1, DAW_ANSWERS.takeUsed);
    },
    async addMarker(findingId) {
      const sentence = unavailable(setup, 'markers', 'addMarker');
      if (sentence) return refused(sentence, 'addMarker');
      if (!project.findingIds.includes(findingId)) throw new Error(`no finding ${findingId} in the project`);
      return done(true, 1);
    },
  };
}
