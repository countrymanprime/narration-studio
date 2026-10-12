import type { DawBackup, DawCapabilities, DawCutMode, DawProjectState, DawResult } from '../api/contracts/daw';
import type { PickupMarker, PickupMarkerState, PickupsState } from '../api/contracts/pickups';
import {
  backupLabelOk,
  DAW_ANSWERS,
  DAW_PROJECT,
  MockBackupTable,
  type DawProject,
  fxListOf,
  fxRangeOf,
  nothingToStackOf,
  stackOf,
  fxRangeRemovedOf,
  plainChainName,
  pickupMarkersReadAnswer,
  pickupsImportedAnswer,
  projectStateOf,
  rangeCutOf,
  recordingFromAnswer,
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

/** One of the narrator's saved chains on the words between two tokens (the Studio Next mock's `FxRangeRequest`, narrowed as
 * `DeleteRangeRequest` is). `chainName` is a name `fxChains()` listed; `fadeMs` is the fade at each new seam, 0 to 500. */
export type FxRangeRequest = { chapterId: string; firstToken: number; lastToken: number; chainName: string; fadeMs: number };

/** A chain to take off the words between two tokens again. */
export type FxRangeRemoval = { chapterId: string; firstToken: number; lastToken: number; chainName: string };

/** One saved chain, effect or macro as the DAW lists it (the mock's `FxChoice`). REAPER names a chain by its path under FXChains, which
 * is both its id and its name. */
export type FxChoice = { id: string; name: string };

/** What the DAW offers for Add FX (the mock's `FxList`): where the list comes from, and the entries. */
export type FxList = { source: string; choices: FxChoice[] };

/** One take a stack (or un-stack) would move, as the plan the page shows has it (the Studio Next mock's `StackMove`). */
export type StackMove = { takeId: string; from: number; to: number; len: number };

/** The takes of one passage a stack would move onto the first read's spot (the mock's `StackGroup`). */
export type StackGroup = { passageId: string; itemGuid: string; base: string; moves: StackMove[] };

/** A stack or un-stack of a chapter's passages (the mock's `StackRequest`). Only `chapterId` and each group's `passageId` reach the host:
 * it rebuilds the items, moves and shift itself (bindings_daw_stack.go), so the rest is the plan the page showed, for display. */
export type StackRequest = { chapterId: string; groups: StackGroup[]; shift: number };

/** A backup of the audio around a chapter's words before an edit (the Studio Next mock's backupAround, narrowed to what the page may
 * send: the host resolves the words' times and the chapter's track itself, and the DAW adds the narrator's window either side). `label`
 * is what the Backups list shows it was made for ("Roll at ¶ 3"). */
export type BackupRequest = { chapterId: string; firstToken: number; lastToken: number; label: string };

/** The answer for a pickup id this session never marked or read, or one whose marker is already in the asked state. */
export const NOTHING_TO_CHANGE = 'Nothing to change.';

export interface DawClient {
  /** What the launch's DAW can do now, as the host or the mock setup reports it. */
  capabilities(): Promise<DawCapabilities>;
  /** The project as last saved, whether the DAW has unsaved changes, and the transport. `playPosition` is for display only. */
  projectState(): Promise<DawProjectState>;
  /** Start recording on the chapter's track: from the end of its last item (ADR 0791), or from `at` (project seconds) when the
   * narrator chose a punch. A time that is not a finite, non-negative number of seconds is refused before anything changes. */
  recordStart(chapterId: string, at?: number): Promise<DawResult>;
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
  /** Put one of the narrator's saved chains on the request's words: the DAW splits the item at both ends and the chain goes on the middle
   * piece. The chain must be one `fxChains()` listed. */
  applyFxToRange(request: FxRangeRequest): Promise<DawResult>;
  /** Take the chain off the words again and join the piece back. A piece without the chain answers `changed: false`. */
  removeFxFromRange(request: FxRangeRemoval): Promise<DawResult>;
  /** The DAW's own saved chains, for Add FX. Rejects when the DAW cannot list them now. */
  fxChains(): Promise<FxList>;
  /** Put the later reads of the request's passages on the first read's spot as takes, and move the audio after them up. */
  stackTakes(request: StackRequest): Promise<DawResult>;
  /** Move the stacked takes of the request's passages back to where they were recorded. */
  unstackTakes(request: StackRequest): Promise<DawResult>;
  /** Clone the audio around the request's words before an edit, so it can be put back. It changes no audio (`changed: false`). */
  backupAround(request: BackupRequest): Promise<DawResult>;
  /** Put a backup's audio back over the window it came from. Refused when the DAW has no backup with that id. */
  restoreBackup(backupId: string): Promise<DawResult>;
  /** The project's backups, newest first. */
  backups(): Promise<DawBackup[]>;
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
  | 'readAloudRecordStartAt'
  | 'readAloudRecordStop'
  | 'workspaceUseTake'
  | 'workspaceHideTakes'
  | 'dawRoll'
  | 'dawDeleteRange'
  | 'dawApplyFxToRange'
  | 'dawRemoveFxFromRange'
  | 'workspaceListFXChains'
  | 'dawStackTakes'
  | 'dawUnstackTakes'
  | 'dawBackupAround'
  | 'dawRestoreBackup'
  | 'dawBackups'
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
    async recordStart(chapterId, at) {
      const result = await (at === undefined ? api.readAloudRecordStart(chapterId) : api.readAloudRecordStartAt(chapterId, at));
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
    /** The bindings answer a DawResult already: they resolve the range on the host and check the chain against the DAW's list. */
    applyFxToRange: ({ chapterId, firstToken, lastToken, chainName, fadeMs }) => api.dawApplyFxToRange(chapterId, firstToken, lastToken, chainName, fadeMs),
    removeFxFromRange: ({ chapterId, firstToken, lastToken, chainName }) => api.dawRemoveFxFromRange(chapterId, firstToken, lastToken, chainName),
    /** The bindings answer a DawResult already and take passage ids only: the host rebuilds the plan from what the DAW reports now. */
    stackTakes: ({ chapterId, groups }) =>
      api.dawStackTakes(
        chapterId,
        groups.map((group) => group.passageId),
      ),
    unstackTakes: ({ chapterId, groups }) =>
      api.dawUnstackTakes(
        chapterId,
        groups.map((group) => group.passageId),
      ),
    /** The bindings answer a DawResult already and take ids only: the host resolves the window and the track itself. */
    backupAround: ({ chapterId, firstToken, lastToken, label }) => api.dawBackupAround(chapterId, firstToken, lastToken, label),
    restoreBackup: (backupId) => api.dawRestoreBackup(backupId),
    backups: async () => (await api.dawBackups()).backups,
    /** WorkspaceListFXChains, the list the Add FX menu shows, named for the launch's DAW. */
    async fxChains() {
      const [capabilities, listing] = await Promise.all([api.dawCapabilities(), api.workspaceListFXChains()]);
      return fxListOf(capabilities, listing.names);
    },
    async addMarker(findingId) {
      const result = await api.findingsAddMarker(findingId);
      if (result.outcome === 'refused') return refused(result.message, 'addMarker', result.reason === 'stale');
      return result.outcome === 'added' ? done(true, 1) : done(false, 0);
    },
    ...hostPickupMarkers(api),
  };
}

/** A stack or un-stack as the host answers it on `setup`: the stack_takes sentence first, then a passage `project` does not list (code
 * stale), then nothing to move; then the takes the request's plan moves, by the capability's mode. */
function restack(setup: DawCapabilities, project: DawProject, { chapterId, groups }: StackRequest, unstack: boolean): DawResult {
  const call = unstack ? 'unstackTakes' : 'stackTakes';
  const sentence = unavailable(setup, 'stack_takes', call);
  if (sentence) return refused(sentence, call);
  const known = project.passageIds ?? [];
  if (!project.chapterIds.includes(chapterId) || groups.some((group) => !known.includes(group.passageId))) {
    return refused(DAW_ANSWERS.stackNotAPassage, call, true);
  }
  const takes = groups.reduce((sum, group) => sum + group.moves.length, 0);
  if (takes === 0) return refused(nothingToStackOf(setup), call);
  const stack = stackOf(setup, takes, unstack);
  return { ...done(true, stack.undoSteps, stack.message), ...(stack.steps ? { steps: stack.steps } : {}) };
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
    async recordStart(chapterId, at) {
      if (at !== undefined && (!Number.isFinite(at) || at < 0)) return refused(DAW_ANSWERS.recordBadTime, 'recordStart');
      const sentence = unavailable(setup, 'record', 'recordStart');
      if (sentence) return refused(sentence, 'recordStart');
      // The host places the cursor at a punch with the punch role, so a start at a time needs that capability too.
      const punch = at === undefined ? null : unavailable(setup, 'punch', 'recordStart');
      if (punch) return refused(punch, 'recordStart');
      if (!project.chapterIds.includes(chapterId)) return refused(DAW_ANSWERS.noTrack, 'recordStart', true);
      return at === undefined ? done(true, 0) : done(true, 0, recordingFromAnswer(at));
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
    async applyFxToRange({ chapterId, firstToken, lastToken, chainName, fadeMs }) {
      const sentence = unavailable(setup, 'fx_range', 'applyFxToRange');
      if (sentence) return refused(sentence, 'applyFxToRange');
      if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > MAX_CUT_FADE_MS) return refused(DAW_ANSWERS.cutBadFade, 'applyFxToRange');
      if (!project.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) return refused(DAW_ANSWERS.rangeStale, 'applyFxToRange', true);
      if (!(project.fxChains ?? []).includes(chainName)) return refused(DAW_ANSWERS.fxBadChain, 'applyFxToRange');
      const fx = fxRangeOf(setup, chainName, lastToken - firstToken + 1);
      return { ...done(true, fx.undoSteps, fx.message), ...(fx.steps ? { steps: fx.steps } : {}) };
    },
    async removeFxFromRange({ chapterId, firstToken, lastToken, chainName }) {
      const sentence = unavailable(setup, 'fx_range', 'removeFxFromRange');
      if (sentence) return refused(sentence, 'removeFxFromRange');
      if (!project.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken)
        return refused(DAW_ANSWERS.rangeStale, 'removeFxFromRange', true);
      if (!plainChainName(chainName)) return refused(DAW_ANSWERS.fxBadChain, 'removeFxFromRange');
      const fx = fxRangeRemovedOf(setup, chainName);
      return { ...done(true, fx.undoSteps, fx.message), ...(fx.steps ? { steps: fx.steps } : {}) };
    },
    stackTakes: (request) => Promise.resolve(restack(setup, project, request, false)),
    unstackTakes: (request) => Promise.resolve(restack(setup, project, request, true)),
    ...mockBackups(setup, project),
    async fxChains() {
      const sentence = unavailable(setup, 'fx_chains', 'fxChains');
      if (sentence) throw new Error(sentence);
      return fxListOf(setup, project.fxChains ?? []);
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

/** The backups calls over a table the mock keeps as the Audacity adapter does: the backups sentence first, then a label the host would
 * not keep, then a chapter `project` does not list or tokens that are no range (code stale). The list answers on any setup. */
function mockBackups(setup: DawCapabilities, project: DawProject): Pick<DawClient, 'backupAround' | 'restoreBackup' | 'backups'> {
  const table = new MockBackupTable();
  return {
    async backupAround({ chapterId, firstToken, lastToken, label }) {
      const sentence = unavailable(setup, 'backups', 'backupAround');
      if (sentence) return refused(sentence, 'backupAround');
      if (!backupLabelOk(label)) return refused(DAW_ANSWERS.backupLabel, 'backupAround');
      if (!project.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) return refused(DAW_ANSWERS.rangeStale, 'backupAround', true);
      return table.backup(setup, chapterId, firstToken, lastToken, label);
    },
    async restoreBackup(backupId) {
      const sentence = unavailable(setup, 'backups', 'restoreBackup');
      if (sentence) return refused(sentence, 'restoreBackup');
      return table.restore(setup, backupId);
    },
    backups: () => Promise.resolve(table.list()),
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
