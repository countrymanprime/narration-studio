import type { DawCapabilities, DawCutMode, DawProjectState, DawResult } from '../api/contracts/daw';
import type { PickupMarker, PickupMarkerState, PickupsState } from '../api/contracts/pickups';
import {
  DAW_ANSWERS,
  DAW_PROJECT,
  type DawProject,
  pickupMarkersReadAnswer,
  pickupsImportedAnswer,
  projectStateOf,
  rangeCutOf,
  rolledOf,
  takesHiddenOf,
} from '../fixtures/daw';
import type { NarrationApi } from '../types';

// The DAW port (ADR 0770, ADR 0810): what the app asks of the DAW and what it answers, one `DawResult` per call. A refusal
// carries the capability's or the host's own sentence in `refused` and `message`; this file never words one for the DAW and
// never branches on which DAW it is talking to, so behaviour differs only through the capability fields. A later DAW slice
// adds its method here together with its command (ISP).
//
// Pickup markers (SN-D44) are the DAW's truth for whether a pickup is done. The DAW addresses a marker by its time, not by the
// app's id, so each client keeps, for its own session, the time of every pickup it marked or read (`PickupRefs`). The client
// never queues a write the DAW refused: a page that wants a write to wait for the DAW keeps its own queue.

/** A pickup the app asks the DAW to mark: the app's own id, its project time in seconds, its optional tag and its note. */
export type DawPickupItem = { ref: string; start: number; tag: string; note: string };

/** A pickup marker as the DAW holds it, with the app's id when this session marked it or read it at that time before. */
export type DawPickupMarker = PickupMarker & { ref?: string };

/** `readPickupMarkers`' answer: the result, and every pickup marker in time order (none when refused). */
export type DawPickupMarkersRead = DawResult & { markers: DawPickupMarker[] };

/** A cut of the words between two tokens of a chapter's stored alignment (the Studio Next mock's `DeleteRangeRequest`, narrowed to what
 * the page may send: the host resolves the item, its times and the word count itself). `fadeMs` is the fade at each seam, 0 to 500. */
export type DeleteRangeRequest = { chapterId: string; firstToken: number; lastToken: number; mode: DawCutMode; fadeMs: number };

/** The longest fade at a cut's seam (bridge.MaxCutFadeMs). */
const MAX_CUT_FADE_MS = 500;

/** The answer for a pickup id this session never marked or read, or one whose marker is already in the asked state. */
export const NOTHING_TO_CHANGE = 'Nothing to change.';

export interface DawClient {
  /** What the launch's DAW can do now, as the host or the mock setup reports it. */
  capabilities(): Promise<DawCapabilities>;
  /** The project as last saved, whether the DAW has unsaved changes, and the transport. `playPosition` is for display only. */
  projectState(): Promise<DawProjectState>;
  /** Start recording on the chapter's track. */
  recordStart(chapterId: string): Promise<DawResult>;
  /** Stop a recording this app started. */
  recordStop(): Promise<DawResult>;
  /** Make `candidateId` the active take of the passage between the two tokens. */
  useTake(chapterId: string, firstToken: number, lastToken: number, candidateId: string): Promise<DawResult>;
  /** Mute the other takes of the passage between the two tokens, keeping `keepCandidateId`, in one undo step. Nothing is deleted. */
  hideTakes(chapterId: string, firstToken: number, lastToken: number, keepCandidateId: string): Promise<DawResult>;
  /** Roll again while recording: stop the recording this app started on the chapter's track and record again from `at` (project
   * seconds), keeping the earlier audio as a take. Where `punch` is destructive it is refused until `confirmed`. */
  roll(chapterId: string, at: number, opts?: { confirmed?: boolean }): Promise<DawResult>;
  /** Cut the request's words and their audio: the DAW moves the cut audio aside rather than deleting it. `close` moves the later audio
   * up, `gap` keeps the length. Words already cut answer `changed: false`. */
  deleteRange(request: DeleteRangeRequest): Promise<DawResult>;
  /** Add the approved marker for a finding. */
  addMarker(findingId: string): Promise<DawResult>;
  /** Mark pickups as open pickup markers in one undo step. One already marked near its time is left alone, so adding twice adds nothing. */
  addPickupMarkers(items: readonly DawPickupItem[]): Promise<DawResult>;
  /** Mark the pickup `ref` done, or open again, by renaming its marker. `ref` is an id this session marked or read. */
  setPickupMarkerDone(ref: string, done: boolean): Promise<DawResult>;
  /** Every pickup marker the DAW holds, open and done; the DAW's names win over what the app thought. */
  readPickupMarkers(): Promise<DawPickupMarkersRead>;
}

/** The `NarrationApi` methods the host adapter calls. */
export type DawHostApi = Pick<
  NarrationApi,
  | 'dawCapabilities'
  | 'dawProjectState'
  | 'readAloudRecordStart'
  | 'readAloudRecordStop'
  | 'workspaceUseTake'
  | 'workspaceHideTakes'
  | 'dawRoll'
  | 'dawDeleteRange'
  | 'findingsAddMarker'
  | 'pickupsImport'
  | 'pickupsResolve'
  | 'pickupsReopen'
  | 'pickupsListMarkers'
  | 'pickupsState'
  | 'subscribePickups'
>;

/** How far apart a pickup's time and its marker's may be and still be the same pickup (narration_pickups.lua's tolerance). */
const PICKUP_TOLERANCE = 0.15;

/** The time of each pickup this session marked or read, and its state when the session knows it. */
class PickupRefs {
  private readonly known = new Map<string, { start: number; state?: PickupMarkerState }>();

  get(ref: string): { start: number; state?: PickupMarkerState } | undefined {
    return this.known.get(ref);
  }

  /** After an import: each item is at its time; its state is known only when none was already there (`allNew`). */
  marked(items: readonly DawPickupItem[], allNew: boolean): void {
    for (const item of items) this.known.set(item.ref, { start: item.start, state: allNew ? 'open' : this.known.get(item.ref)?.state });
  }

  set(ref: string, state: PickupMarkerState): void {
    const entry = this.known.get(ref);
    if (entry) this.known.set(ref, { ...entry, state });
  }

  /** Each marker with the id of the nearest known pickup within the tolerance, whose state becomes the marker's. */
  read(markers: readonly PickupMarker[]): DawPickupMarker[] {
    return markers.map((marker) => {
      let nearest: { ref: string; gap: number } | undefined;
      for (const [ref, { start }] of this.known) {
        const gap = Math.abs(start - marker.start);
        if (gap <= PICKUP_TOLERANCE && (!nearest || gap < nearest.gap)) nearest = { ref, gap };
      }
      if (!nearest) return { ...marker };
      this.set(nearest.ref, marker.state);
      return { ...marker, ref: nearest.ref };
    });
  }
}

/** One pickups run: subscribe, start it, and answer the first finished state of a run other than the one before. A start that
 * throws (no pickups service, a bad position) rejects, as the other host calls do. */
async function settledPickupsRun(api: DawHostApi, start: () => Promise<unknown>): Promise<PickupsState> {
  const before = (await api.pickupsState()).runId;
  return new Promise<PickupsState>((resolve, reject) => {
    let finished = false;
    // The settle waits a microtask, so `unsubscribe` is assigned even when a state arrives while subscribing.
    const finish = (settle: () => void) => {
      if (finished) return;
      finished = true;
      queueMicrotask(() => {
        unsubscribe();
        settle();
      });
    };
    const unsubscribe = api.subscribePickups((state) => {
      if (state.runId === undefined || state.runId === before || (state.phase !== 'success' && state.phase !== 'error')) return;
      finish(() => resolve(state));
    });
    start().catch((error: unknown) => finish(() => reject(error)));
  });
}

/** CSV text in the columns `pickupsImport` reads (start,note,tag), each cell on one line (the host reads a row per line, and a
 * marker name is one line anyway) and quoted when it needs to be. */
function pickupsCsv(items: readonly DawPickupItem[]): string {
  const cell = (text: string) => {
    const value = text.replace(/[\r\n]+/g, ' ');
    return /[",]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  };
  return ['start,note,tag', ...items.map((item) => [String(item.start), cell(item.note), cell(item.tag)].join(','))].join('\n') + '\n';
}

/** A refused call changed nothing; `refused` holds the sentence and `message` repeats it. `stale` adds the one code (ADR 0861). */
function refused(sentence: string | undefined, call: string, stale = false): DawResult {
  if (!sentence) throw new Error(`${call} was refused with no sentence to show`);
  const result: DawResult = { ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence };
  return stale ? { ...result, code: 'stale' } : result;
}

/** The host sends no sentence with a plain success, so `message` is empty then rather than worded here. */
const done = (changed: boolean, undoSteps: number, message = ''): DawResult => ({ ok: true, changed, message, undoSteps });

/** The three pickup marker calls over the host's pickups bindings, each refused first with the `pickups` capability's own sentence. */
function hostPickupMarkers(api: DawHostApi): Pick<DawClient, 'addPickupMarkers' | 'setPickupMarkerDone' | 'readPickupMarkers'> {
  const refs = new PickupRefs();
  const unavailableNow = async (call: string) => unavailable(await api.dawCapabilities(), 'pickups', call);
  return {
    async addPickupMarkers(items) {
      const sentence = await unavailableNow('addPickupMarkers');
      if (sentence) return refused(sentence, 'addPickupMarkers');
      if (items.length === 0) return done(false, 0);
      const state = await settledPickupsRun(api, () => api.pickupsImport(pickupsCsv(items)));
      if (state.phase === 'error') return refused(state.message, 'addPickupMarkers');
      const added = state.importReport?.added ?? 0;
      refs.marked(items, (state.importReport?.existing ?? 0) === 0);
      return done(added > 0, added > 0 ? 1 : 0, state.message);
    },
    async setPickupMarkerDone(ref, isDone) {
      const sentence = await unavailableNow('setPickupMarkerDone');
      if (sentence) return refused(sentence, 'setPickupMarkerDone');
      const known = refs.get(ref);
      const want: PickupMarkerState = isDone ? 'done' : 'open';
      if (!known || known.state === want) return done(false, 0, NOTHING_TO_CHANGE);
      const state = await settledPickupsRun(api, () => (isDone ? api.pickupsResolve(known.start) : api.pickupsReopen(known.start)));
      if (state.phase === 'error') return refused(state.message, 'setPickupMarkerDone');
      refs.set(ref, want);
      return done(true, 1, state.message);
    },
    async readPickupMarkers() {
      const sentence = await unavailableNow('readPickupMarkers');
      if (sentence) return { ...refused(sentence, 'readPickupMarkers'), markers: [] };
      const state = await settledPickupsRun(api, () => api.pickupsListMarkers());
      if (state.phase === 'error') return { ...refused(state.message, 'readPickupMarkers'), markers: [] };
      return { ...done(false, 0, state.message), markers: refs.read(state.markers ?? []) };
    },
  };
}

/** Maps today's host results to `DawResult`. A record start or stop is a transport action, not an edit, so it adds no undo point.
 * A host refusal whose `reason` is `stale` (or, for a record start, `track_missing`: the linked track is gone) answers code
 * `stale` with the host's own sentence. */
export function createHostDawClient(api: DawHostApi): DawClient {
  return {
    capabilities: () => api.dawCapabilities(),
    projectState: () => api.dawProjectState(),
    async recordStart(chapterId) {
      const result = await api.readAloudRecordStart(chapterId);
      return result.outcome === 'refused' ? refused(result.message, 'recordStart', result.reason === 'track_missing') : done(true, 0, result.message);
    },
    async recordStop() {
      const result = await api.readAloudRecordStop();
      return result.outcome === 'refused' ? refused(result.message, 'recordStop') : done(true, 0, result.message);
    },
    async useTake(chapterId, firstToken, lastToken, candidateId) {
      const result = await api.workspaceUseTake(chapterId, firstToken, lastToken, candidateId);
      if (result.outcome === 'refused') return refused(result.message, 'useTake', result.reason === 'stale');
      return done(result.changed, result.changed ? 1 : 0, result.message);
    },
    /** The binding answers a DawResult already, with code `stale` for a kept take it no longer offers (the #1164 mapping). */
    hideTakes: (chapterId, firstToken, lastToken, keepCandidateId) => api.workspaceHideTakes(chapterId, firstToken, lastToken, keepCandidateId),
    /** The binding answers a DawResult already: it looks up the track, checks `at` and holds the confirmation rule itself. */
    roll: (chapterId, at, opts) => api.dawRoll(chapterId, at, opts?.confirmed ?? false),
    /** The binding answers a DawResult already: it resolves the range to an item and its times on the host. */
    deleteRange: ({ chapterId, firstToken, lastToken, mode, fadeMs }) => api.dawDeleteRange(chapterId, firstToken, lastToken, mode, fadeMs),
    async addMarker(findingId) {
      const result = await api.findingsAddMarker(findingId);
      if (result.outcome === 'refused') return refused(result.message, 'addMarker', result.reason === 'stale');
      return result.outcome === 'added' ? done(true, 1) : done(false, 0);
    },
    ...hostPickupMarkers(api),
  };
}

/** The capability's own sentence when it is not available, else null. */
function unavailable(capabilities: DawCapabilities, name: string, call: string): string | null {
  const support = capabilities.capabilities[name];
  if (support?.available) return null;
  if (!support?.message) throw new Error(`${call}: the setup gives no sentence for ${name}`);
  return support.message;
}

/** The mock, driven by one setup from `fixtures/daw.ts`. It refuses what the host refuses, with the host's sentences, and answers the rest as the host does.
 * `projectState` defaults to the setup's own from the fixtures. */
export function createMockDawClient(
  setup: DawCapabilities,
  project: DawProject = DAW_PROJECT,
  projectState: DawProjectState = projectStateOf(setup),
): DawClient {
  return {
    capabilities: () => Promise.resolve(setup),
    projectState: () => Promise.resolve(projectState),
    async recordStart(chapterId) {
      const sentence = unavailable(setup, 'record', 'recordStart');
      if (sentence) return refused(sentence, 'recordStart');
      if (!project.chapterIds.includes(chapterId)) return refused(DAW_ANSWERS.noTrack, 'recordStart', true);
      return done(true, 0);
    },
    async recordStop() {
      const sentence = unavailable(setup, 'record', 'recordStop');
      return sentence ? refused(sentence, 'recordStop') : done(true, 0);
    },
    async useTake(chapterId, _firstToken, _lastToken, candidateId) {
      const sentence = unavailable(setup, 'takes', 'useTake');
      if (sentence) return refused(sentence, 'useTake');
      if (!project.chapterIds.includes(chapterId) || !project.candidateIds.includes(candidateId)) return refused(DAW_ANSWERS.staleTake, 'useTake', true);
      return done(true, 1, DAW_ANSWERS.takeUsed);
    },
    async hideTakes(chapterId, _firstToken, _lastToken, keepCandidateId) {
      const sentence = unavailable(setup, 'takes', 'hideTakes');
      if (sentence) return refused(sentence, 'hideTakes');
      if (!project.chapterIds.includes(chapterId) || !project.candidateIds.includes(keepCandidateId)) return refused(DAW_ANSWERS.staleHide, 'hideTakes', true);
      const hidden = takesHiddenOf(setup, project.otherTakes?.[keepCandidateId] ?? 1);
      return done(hidden.changed, hidden.changed ? 1 : 0, hidden.message);
    },
    async roll(chapterId, at, opts = {}) {
      const sentence = unavailable(setup, 'punch', 'roll');
      if (sentence) return refused(sentence, 'roll');
      if (!Number.isFinite(at) || at < 0) return refused(DAW_ANSWERS.rollBadTime, 'roll');
      if (!project.chapterIds.includes(chapterId)) return refused(DAW_ANSWERS.rollStale, 'roll', true);
      if (setup.capabilities.punch?.destructive && !opts.confirmed) return refused(DAW_ANSWERS.rollConfirm, 'roll');
      const rolled = rolledOf(setup, at);
      return done(true, rolled.undoSteps, rolled.message);
    },
    async deleteRange({ chapterId, firstToken, lastToken, mode, fadeMs }) {
      const sentence = unavailable(setup, 'cut_range', 'deleteRange');
      if (sentence) return refused(sentence, 'deleteRange');
      if (mode !== 'close' && mode !== 'gap') return refused(DAW_ANSWERS.cutBadMode, 'deleteRange');
      if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > MAX_CUT_FADE_MS) return refused(DAW_ANSWERS.cutBadFade, 'deleteRange');
      if (!project.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) return refused(DAW_ANSWERS.rangeStale, 'deleteRange', true);
      const cut = rangeCutOf(setup, lastToken - firstToken + 1);
      return { ...done(true, cut.undoSteps, cut.message), ...(cut.steps ? { steps: cut.steps } : {}) };
    },
    async addMarker(findingId) {
      const sentence = unavailable(setup, 'markers', 'addMarker');
      if (sentence) return refused(sentence, 'addMarker');
      if (!project.findingIds.includes(findingId)) throw new Error(`no finding ${findingId} in the project`);
      return done(true, 1);
    },
    ...mockPickupMarkers(setup),
  };
}

/** The pickup marker calls over a marker list the mock keeps as the DAW would, answering with the host's sentences. */
function mockPickupMarkers(setup: DawCapabilities): Pick<DawClient, 'addPickupMarkers' | 'setPickupMarkerDone' | 'readPickupMarkers'> {
  const refs = new PickupRefs();
  let markers: PickupMarker[] = [];
  const near = (start: number, state?: PickupMarkerState) =>
    markers
      .filter((marker) => Math.abs(marker.start - start) <= PICKUP_TOLERANCE && (state === undefined || marker.state === state))
      .sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start))[0];
  return {
    async addPickupMarkers(items) {
      const sentence = unavailable(setup, 'pickups', 'addPickupMarkers');
      if (sentence) return refused(sentence, 'addPickupMarkers');
      if (items.length === 0) return done(false, 0);
      const fresh = items.filter((item) => !near(item.start));
      markers = [...markers, ...fresh.map((item) => ({ start: item.start, state: 'open' as const, tag: item.tag, note: item.note }))];
      refs.marked(items, fresh.length === items.length);
      return done(fresh.length > 0, fresh.length > 0 ? 1 : 0, pickupsImportedAnswer(fresh.length, items.length - fresh.length));
    },
    async setPickupMarkerDone(ref, isDone) {
      const sentence = unavailable(setup, 'pickups', 'setPickupMarkerDone');
      if (sentence) return refused(sentence, 'setPickupMarkerDone');
      const known = refs.get(ref);
      const want: PickupMarkerState = isDone ? 'done' : 'open';
      if (!known || known.state === want) return done(false, 0, NOTHING_TO_CHANGE);
      const marker = near(known.start, isDone ? 'open' : 'done');
      if (!marker) return refused(isDone ? DAW_ANSWERS.noOpenPickup : DAW_ANSWERS.noResolvedPickup, 'setPickupMarkerDone');
      markers = markers.map((each) => (each === marker ? { ...each, state: want } : each));
      refs.set(ref, want);
      return done(true, 1, isDone ? DAW_ANSWERS.pickupResolved : DAW_ANSWERS.pickupReopened);
    },
    async readPickupMarkers() {
      const sentence = unavailable(setup, 'pickups', 'readPickupMarkers');
      if (sentence) return { ...refused(sentence, 'readPickupMarkers'), markers: [] };
      const listed = [...markers].sort((a, b) => a.start - b.start);
      const open = listed.filter((marker) => marker.state === 'open').length;
      return { ...done(false, 0, pickupMarkersReadAnswer(open, listed.length - open)), markers: refs.read(listed) };
    },
  };
}
