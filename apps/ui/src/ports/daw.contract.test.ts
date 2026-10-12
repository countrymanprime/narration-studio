import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { DawCapabilities, DawResult } from '../api/contracts/daw';
import type { PickupMarker, PickupsState } from '../api/contracts/pickups';
import { dawBackupsFileSchema, dawCapabilitiesSchema, dawFxRangeSettingsSchema, dawProjectStateSchema, dawResultSchema } from '../api/schemas/daw';
import { findingMarkerSchema } from '../api/schemas/findings';
import { pickupsStateSchema } from '../api/schemas/pickups';
import { readAloudRecordingSchema } from '../api/schemas/teleprompter';
import { workspaceFXChainsResultSchema, workspaceUseTakeResultSchema } from '../api/schemas/workspace';
import { parseWire } from '../api/wire/parseWire';
import type { InferOutput, StandardSchemaV1 } from '../api/wire/standardSchema';
import {
  backedUpAnswer,
  backupRestoredAnswer,
  BUILTIN_NOTHING_TO_MUTE,
  DAW_ANSWERS,
  DAW_PROJECT,
  DAW_PROJECT_STATES,
  DAW_SETUPS,
  FX_RANGE_STEPS,
  fxChainAddedAnswer,
  fxChainRemovedAnswer,
  fxChainsSource,
  fxBypassAnswer,
  fxSettingSetAnswer,
  fxSettingsReadAnswer,
  FX_RANGE_SETTINGS,
  plainChainName,
  pickupMarkersReadAnswer,
  pickupsImportedAnswer,
  RANGE_CUT_STEPS,
  rangeCutAnswer,
  recordingFromAnswer,
  rolledAnswer,
  rolledReplacingAnswer,
  STACK_STEPS,
  nothingToStackAnswer,
  BUILTIN_NO_SPLIT,
  splitOutsideAnswer,
  splitTakeStaleAnswer,
  takeSplitAnswer,
  gainOutsideAnswer,
  gainTakeStaleAnswer,
  rangeGainAnswer,
  clickOutsideAnswer,
  clicksInShape,
  clickTakeStaleAnswer,
  repairClickAnswer,
  takesHiddenAnswer,
  takesStackedAnswer,
  takesUnstackedAnswer,
} from '../fixtures/daw';
import {
  createHostDawClient,
  createMockDawClient,
  type DawClient,
  type DawHostApi,
  type DawPickupItem,
  NOTHING_TO_CHANGE,
  type StackRequest,
  type BackupRequest,
  type RangeGainRequest,
  type ClickRepairRequest,
} from './daw';
import { type ContractCase, describeProviderContract, type Goldens } from './providerContract';

// One suite over both adapters: the mock on the REAPER setup, and the host adapter fed by the goldens the Go host wrote. The
// stand-in host below answers a known chapter, take and finding with the "ok" golden and anything else with the refusal golden,
// which is what the real host does for an id it no longer has.

const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/contracts/', import.meta.url));
const GOLDEN_FILES = [
  'daw-capabilities-reaper.json',
  'daw-result-ok.json',
  'daw-result-refused-stale.json',
  'daw-result-multi-step.json',
  'daw-hide-takes-done.json',
  'daw-hide-takes-nothing.json',
  'daw-hide-takes-refused.json',
  'daw-roll-done.json',
  'daw-roll-refused-confirm.json',
  'daw-roll-refused-stale.json',
  'daw-delete-range-done.json',
  'daw-delete-range-gap.json',
  'daw-delete-range-refused-stale.json',
  'daw-delete-range-refused-capability.json',
  'daw-delete-range-pad-room-tone.json',
  'daw-delete-range-pad-refused-close.json',
  'daw-apply-fx-range-done.json',
  'daw-apply-fx-range-refused.json',
  'daw-remove-fx-range-done.json',
  'daw-fx-range-params-done.json',
  'daw-fx-range-params-refused.json',
  'daw-fx-range-params-set-done.json',
  'daw-fx-range-bypass-done.json',
  'daw-fx-range-bypass-refused-stale.json',
  'daw-stack-done.json',
  'daw-stack-steps.json',
  'daw-unstack-done.json',
  'daw-stack-refused-stale.json',
  'daw-split-take-done.json',
  'daw-split-take-refused-stale.json',
  'daw-split-take-refused-capability.json',
  'daw-reduce-range-gain-done.json',
  'daw-reduce-range-gain-refused-stale.json',
  'daw-reduce-range-gain-refused-capability.json',
  'daw-repair-click-done.json',
  'daw-repair-click-refused-stale.json',
  'daw-repair-click-refused-capability.json',
  'daw-backup-done.json',
  'daw-backup-restored.json',
  'daw-backup-refused.json',
  'daw-backups-list.json',
  'workspace-fx-chains.json',
  'daw-project-state-saved.json',
  'read-aloud-recordings.json',
  'readaloud-record-start-at.json',
  'workspace-use-take-done.json',
  'workspace-use-take-refused.json',
  'findings-add-marker.json',
  'findings-add-marker-existing.json',
  'findings-add-marker-stale.json',
  'pickups-idle.json',
  'pickups-import-success.json',
  'pickups-markers-listed.json',
  'master-file-play-quietest.json',
  'master-file-opened.json',
  'master-file-refused-not-in-run.json',
  'master-file-refused-no-quiet-stretch.json',
] as const;
/** The chain on one word the fx-range-params-and-bypass cases read and change (SN-E104). */
const FX_TARGET = { chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: 'Podcast Voice.RfxChain' } as const;

const goldens: Goldens = Object.fromEntries(GOLDEN_FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

const read = <S extends StandardSchemaV1>(file: string, schema: S): InferOutput<S> =>
  parseWire(schema, goldens[file], { boundary: 'daw contract', payload: file });
/** One case of read-aloud-recordings.json, e.g. `ready.start`. */
const recording = (key: string): InferOutput<typeof readAloudRecordingSchema> =>
  parseWire(readAloudRecordingSchema, (goldens['read-aloud-recordings.json'] as Record<string, unknown>)[key], { boundary: 'daw contract', payload: key });

/** The host's pickups bindings as internal/pickups.Service answers them: each starts a run, emits it, and finishes it as
 * `pickups:state` once the DAW answers, with the service's sentences. Markers within 0.15 s are one pickup, as in the Lua. */
function pickupsHost(capabilities: DawCapabilities = DAW_SETUPS.reaper) {
  let state: PickupsState = read('pickups-idle.json', pickupsStateSchema);
  let markers: PickupMarker[] = [];
  let run = 0;
  const calls: string[] = [];
  const listeners = new Set<(next: PickupsState) => void>();
  const emit = () => listeners.forEach((listener) => listener(structuredClone(state)));
  const near = (start: number, wanted?: PickupMarker['state']) =>
    markers.find((marker) => Math.abs(marker.start - start) <= 0.15 && (wanted === undefined || marker.state === wanted));
  const begin = (call: string, phase: PickupsState['phase'], finish: () => Partial<PickupsState>) => {
    calls.push(call);
    run += 1;
    state = { ...read('pickups-idle.json', pickupsStateSchema), runId: String(run), phase, message: '…' };
    emit();
    setTimeout(() => {
      state = { ...state, phase: 'success', ...finish() };
      emit();
    }, 0);
    return Promise.resolve({ status: 'started' as const });
  };
  const rename = (from: PickupMarker['state'], to: PickupMarker['state'], position: number, notFound: string, renamed: string) => () => {
    const marker = near(position, from);
    if (!marker) return { phase: 'error' as const, message: notFound };
    marker.state = to;
    return { message: renamed };
  };
  const api: Pick<
    DawHostApi,
    'dawCapabilities' | 'pickupsImport' | 'pickupsResolve' | 'pickupsReopen' | 'pickupsListMarkers' | 'pickupsState' | 'subscribePickups'
  > = {
    dawCapabilities: () => Promise.resolve(capabilities),
    pickupsImport: (csvText) => {
      const rows = csvText
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => line.split(','));
      return begin('import', 'importing', () => {
        const fresh = rows.filter(([start]) => !near(Number(start)));
        markers = [...markers, ...fresh.map(([start, note, tag]) => ({ start: Number(start), state: 'open' as const, tag: tag ?? '', note: note ?? '' }))];
        const existing = rows.length - fresh.length;
        return { importReport: { added: fresh.length, existing, invalid: 0 }, message: pickupsImportedAnswer(fresh.length, existing) };
      }).then(() => ({ status: 'started' as const, rowErrors: [] }));
    },
    pickupsResolve: (position) => begin('resolve', 'resolving', rename('open', 'done', position, DAW_ANSWERS.noOpenPickup, DAW_ANSWERS.pickupResolved)),
    pickupsReopen: (position) => begin('reopen', 'reopening', rename('done', 'open', position, DAW_ANSWERS.noResolvedPickup, DAW_ANSWERS.pickupReopened)),
    pickupsListMarkers: () =>
      begin('list', 'listing', () => {
        const listed = [...markers].sort((a, b) => a.start - b.start).map((marker) => ({ ...marker }));
        const open = listed.filter((marker) => marker.state === 'open').length;
        return { markers: listed, message: pickupMarkersReadAnswer(open, listed.length - open) };
      }),
    pickupsState: () => Promise.resolve(structuredClone(state)),
    subscribePickups: (onUpdate) => {
      listeners.add(onUpdate);
      onUpdate(structuredClone(state));
      return () => listeners.delete(onUpdate);
    },
  };
  return { api, calls };
}

function hostApi(): DawHostApi {
  const known = DAW_PROJECT;
  return {
    ...pickupsHost(read('daw-capabilities-reaper.json', dawCapabilitiesSchema)).api,
    dawCapabilities: () => Promise.resolve(read('daw-capabilities-reaper.json', dawCapabilitiesSchema)),
    dawProjectState: () => Promise.resolve(read('daw-project-state-saved.json', dawProjectStateSchema)),
    readAloudRecordStart: (chapterId) => Promise.resolve(recording(known.chapterIds.includes(chapterId) ? 'ready.start' : 'track_missing.start')),
    // ReadAloudRecordStartAt: the time is checked first, a chapter with no track is the start's stale refusal, and a start at 30 s is
    // the started golden. Any other time has no golden.
    readAloudRecordStartAt: (chapterId, at) => {
      const startAt = goldens['readaloud-record-start-at.json'] as Record<string, unknown>;
      const answer = (key: string) => parseWire(readAloudRecordingSchema, startAt[key], { boundary: 'daw contract', payload: key });
      if (!Number.isFinite(at) || at < 0) return Promise.resolve(answer('bad_time'));
      if (!known.chapterIds.includes(chapterId)) return Promise.resolve(recording('track_missing.start'));
      if (at !== 30) return Promise.reject(new Error(`no golden for a record start at ${at} s`));
      return Promise.resolve(answer('started'));
    },
    readAloudRecordStop: () => Promise.resolve(recording('ready.stop')),
    workspaceUseTake: (chapterId, _first, _last, candidateId) =>
      Promise.resolve(
        read(
          known.chapterIds.includes(chapterId) && known.candidateIds.includes(candidateId) ? 'workspace-use-take-done.json' : 'workspace-use-take-refused.json',
          workspaceUseTakeResultSchema,
        ),
      ),
    findingsAddMarker: (id) =>
      known.findingIds.includes(id) ? Promise.resolve(read('findings-add-marker.json', findingMarkerSchema)) : Promise.reject(new Error(`no finding ${id}`)),
    // WorkspaceHideTakes: a kept take the host offers mutes its item's others (or finds none), and any other id is the stale refusal.
    workspaceHideTakes: (chapterId, _first, _last, keepCandidateId) => {
      if (!known.chapterIds.includes(chapterId) || !known.candidateIds.includes(keepCandidateId)) return Promise.resolve(staleRefusal(DAW_ANSWERS.staleHide));
      return Promise.resolve(read(known.otherTakes?.[keepCandidateId] === 0 ? 'daw-hide-takes-nothing.json' : 'daw-hide-takes-done.json', dawResultSchema));
    },
    // DawRoll on REAPER (punch not destructive, so confirmed is ignored): the time is checked first, a chapter with no track is the
    // stale refusal, and a roll from 40 s is the done golden. Any other time has no golden.
    dawRoll: (chapterId, at) => {
      if (!Number.isFinite(at) || at < 0) return Promise.resolve(refusal(DAW_ANSWERS.rollBadTime));
      if (!known.chapterIds.includes(chapterId)) return Promise.resolve(read('daw-roll-refused-stale.json', dawResultSchema));
      if (at !== 40) return Promise.reject(new Error(`no golden for a roll from ${at} s`));
      return Promise.resolve(read('daw-roll-done.json', dawResultSchema));
    },
    // DawDeleteRange on REAPER: the mode, fade and pad are checked first, room tone with close is the pad-refused-close golden, an
    // unknown chapter or a range read backwards is the stale golden, a one-word cut with a 12 ms fade is the done (close) or gap golden,
    // and one with a 100 ms pad and room tone the pad-room-tone golden. Anything else has no golden.
    dawDeleteRange: (chapterId, firstToken, lastToken, mode, fadeMs, padMs, roomTone) => {
      if (mode !== 'close' && mode !== 'gap') return Promise.resolve(refusal(DAW_ANSWERS.cutBadMode));
      if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > 500) return Promise.resolve(refusal(DAW_ANSWERS.cutBadFade));
      if (!Number.isInteger(padMs) || padMs < 0 || padMs > 500) return Promise.resolve(refusal(DAW_ANSWERS.cutBadPad));
      if (roomTone && mode !== 'gap') return Promise.resolve(read('daw-delete-range-pad-refused-close.json', dawResultSchema));
      if (!known.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) {
        return Promise.resolve(read('daw-delete-range-refused-stale.json', dawResultSchema));
      }
      if (firstToken !== lastToken || fadeMs !== 12) return Promise.reject(new Error(`no golden for a cut of ${firstToken}..${lastToken} with ${fadeMs} ms`));
      if (padMs === 100 && roomTone) return Promise.resolve(read('daw-delete-range-pad-room-tone.json', dawResultSchema));
      if (padMs !== 0 || roomTone) return Promise.reject(new Error(`no golden for a cut with a ${padMs} ms pad and room tone ${roomTone}`));
      return Promise.resolve(read(mode === 'close' ? 'daw-delete-range-done.json' : 'daw-delete-range-gap.json', dawResultSchema));
    },
    // DawApplyFxToRange and DawRemoveFxFromRange on REAPER: the fade is checked first, an unknown chapter or a range read backwards is the
    // range's stale refusal, an apply's chain must be one workspace-fx-chains.json lists and a removal's a plain name, and one word with
    // Podcast Voice (a 10 ms fade) is the done golden. Anything else has no golden.
    dawApplyFxToRange: (chapterId, firstToken, lastToken, chainName, fadeMs) => {
      if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > 500) return Promise.resolve(refusal(DAW_ANSWERS.cutBadFade));
      if (!known.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) return Promise.resolve(staleRefusal(DAW_ANSWERS.rangeStale));
      if (!read('workspace-fx-chains.json', workspaceFXChainsResultSchema).names.includes(chainName)) return Promise.resolve(refusal(DAW_ANSWERS.fxBadChain));
      if (firstToken !== lastToken || chainName !== 'Podcast Voice.RfxChain' || fadeMs !== 10) {
        return Promise.reject(new Error(`no golden for ${chainName} on ${firstToken}..${lastToken} with ${fadeMs} ms`));
      }
      return Promise.resolve(read('daw-apply-fx-range-done.json', dawResultSchema));
    },
    dawRemoveFxFromRange: (chapterId, firstToken, lastToken, chainName) => {
      if (!known.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) return Promise.resolve(staleRefusal(DAW_ANSWERS.rangeStale));
      if (!/^[^\\:]+\.RfxChain$/i.test(chainName) || chainName.split('/').some((part) => part === '' || part === '.' || part === '..')) {
        return Promise.resolve(refusal(DAW_ANSWERS.fxBadChain));
      }
      if (chainName !== 'Podcast Voice.RfxChain') return Promise.reject(new Error(`no golden for taking ${chainName} off`));
      return Promise.resolve(read('daw-remove-fx-range-done.json', dawResultSchema));
    },
    // DawFxRangeParams, DawSetFxRangeParam and DawBypassFxRange on REAPER (SN-E104): an unknown chapter or a range read backwards is the
    // range's stale refusal, a chain must be a plain name, a setting the effect does not have or a value that is not a number is refused,
    // and Podcast Voice's settings, its gain set to -3 and its bypass are the done goldens. Anything else has no golden.
    dawFxRangeParams: (chapterId, firstToken, lastToken, chainName) => {
      const none = (result: DawResult) => Promise.resolve({ result, settings: [], truncated: false, bypassed: false });
      if (!known.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) return none(staleRefusal(DAW_ANSWERS.rangeStale));
      if (!plainChainName(chainName)) return none(refusal(DAW_ANSWERS.fxBadChain));
      if (chainName !== 'Podcast Voice.RfxChain') return Promise.reject(new Error(`no golden for the settings of ${chainName}`));
      return Promise.resolve(read('daw-fx-range-params-done.json', dawFxRangeSettingsSchema));
    },
    dawSetFxRangeParam: (chapterId, firstToken, lastToken, chainName, fx, index, value) => {
      if (!known.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) return Promise.resolve(staleRefusal(DAW_ANSWERS.rangeStale));
      if (!plainChainName(chainName)) return Promise.resolve(refusal(DAW_ANSWERS.fxBadChain));
      if (fx < 0 || index < 0) return Promise.resolve(refusal(DAW_ANSWERS.fxNoSetting));
      if (!Number.isFinite(value)) return Promise.resolve(refusal(DAW_ANSWERS.fxBadValue));
      if (chainName !== 'Podcast Voice.RfxChain' || fx !== 0 || index !== 0 || value !== -3) {
        return Promise.reject(new Error(`no golden for setting ${fx}/${index} of ${chainName} to ${value}`));
      }
      return Promise.resolve(read('daw-fx-range-params-set-done.json', dawResultSchema));
    },
    dawBypassFxRange: (chapterId, firstToken, lastToken, chainName, bypass) => {
      if (!known.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) return Promise.resolve(staleRefusal(DAW_ANSWERS.rangeStale));
      if (!plainChainName(chainName)) return Promise.resolve(refusal(DAW_ANSWERS.fxBadChain));
      if (chainName !== 'Podcast Voice.RfxChain' || !bypass) return Promise.reject(new Error(`no golden for bypass ${bypass} of ${chainName}`));
      return Promise.resolve(read('daw-fx-range-bypass-done.json', dawResultSchema));
    },
    workspaceListFXChains: () => Promise.resolve(read('workspace-fx-chains.json', workspaceFXChainsResultSchema)),
    // MasterPlayQuietest and MasterOpenInDaw (SN-M97): a file the fixture's last run does not list is the stale golden; the run's first
    // file (its quietest window at 12 s) plays and opens, and its second (no window) has no stretch to play.
    masterPlayQuietest: (fileId) => {
      const index = (known.measuredFiles ?? []).findIndex((file) => file.path === fileId);
      if (index < 0) return Promise.resolve(read('master-file-refused-not-in-run.json', dawResultSchema));
      return Promise.resolve(read(index === 0 ? 'master-file-play-quietest.json' : 'master-file-refused-no-quiet-stretch.json', dawResultSchema));
    },
    masterOpenInDaw: (fileId) => {
      const index = (known.measuredFiles ?? []).findIndex((file) => file.path === fileId);
      if (index < 0) return Promise.resolve(read('master-file-refused-not-in-run.json', dawResultSchema));
      if (index !== 0) return Promise.reject(new Error(`no golden for opening ${fileId}`));
      return Promise.resolve(read('master-file-opened.json', dawResultSchema));
    },
    // DawStackTakes and DawUnstackTakes on REAPER: no passage is nothing to move, a passage the fixture project does not list is the stale
    // refusal, and the one known passage is the done golden. Anything else has no golden.
    dawStackTakes: (chapterId, passageIds) => Promise.resolve(stackAnswer(known, chapterId, passageIds, 'daw-stack-done.json')),
    dawUnstackTakes: (chapterId, passageIds) => Promise.resolve(stackAnswer(known, chapterId, passageIds, 'daw-unstack-done.json')),
    // DawSplitTake on REAPER: the time is checked first, a take the fixture project's track does not hold and a cut outside it are the
    // stale refusals, and take-twice cut at 15.5 s is the done golden. Any other time has no golden.
    dawSplitTake: (chapterId, takeId, at) => {
      if (!Number.isFinite(at) || at < 0) return Promise.resolve(refusal(DAW_ANSWERS.splitBadTime));
      const take = known.chapterIds.includes(chapterId) ? known.splitTakes?.[takeId] : undefined;
      if (!take) return Promise.resolve(staleRefusal(splitTakeStaleAnswer('REAPER')));
      if (at <= take.start || at >= take.start + take.length) return Promise.resolve(staleRefusal(splitOutsideAnswer('REAPER')));
      if (at !== 15.5) return Promise.reject(new Error(`no golden for a cut at ${at} s`));
      return Promise.resolve(read('daw-split-take-done.json', dawResultSchema));
    },
    // DawReduceRangeGain on REAPER: the dB and the stretches' shape are checked first, a take the fixture project's track does not hold
    // and a stretch outside the part of its file it plays are the stale refusals, and take-twice lowered by 9 dB at 4..5 and 8..8.5 s is
    // the done golden. Anything else has no golden.
    dawReduceRangeGain: (chapterId, takeId, stretches, reduceDb) => {
      if (!Number.isFinite(reduceDb) || reduceDb < 1 || reduceDb > 24) return Promise.resolve(refusal(DAW_ANSWERS.gainBadDb));
      if (stretches.length === 0 || stretches.length > 500 || stretches.some(({ start, end }) => !(start >= 0) || !Number.isFinite(end) || !(end > start))) {
        return Promise.resolve(refusal(DAW_ANSWERS.gainBadStretches));
      }
      const take = known.chapterIds.includes(chapterId) ? known.gainTakes?.[takeId] : undefined;
      if (!take) return Promise.resolve(staleRefusal(gainTakeStaleAnswer('REAPER')));
      if (stretches.some(({ start, end }) => start < take.from || end > take.to)) return Promise.resolve(staleRefusal(gainOutsideAnswer('REAPER')));
      if (reduceDb !== 9 || JSON.stringify(stretches) !== JSON.stringify(GAIN.stretches)) {
        return Promise.reject(new Error(`no golden for ${JSON.stringify(stretches)} by ${reduceDb} dB`));
      }
      return Promise.resolve(read('daw-reduce-range-gain-done.json', dawResultSchema));
    },
    // DawRepairClick on REAPER: the clicks' shape is checked first, a take the fixture project's track does not hold and a click outside
    // the part of its file it plays are the stale refusals, and take-twice's clicks at 4..4.003 and 8.5..8.502 s are the done golden.
    // Anything else has no golden.
    dawRepairClick: (chapterId, takeId, clicks) => {
      if (!clicksInShape(clicks)) return Promise.resolve(refusal(DAW_ANSWERS.clickBad));
      const take = known.chapterIds.includes(chapterId) ? known.clickTakes?.[takeId] : undefined;
      if (!take) return Promise.resolve(staleRefusal(clickTakeStaleAnswer('REAPER')));
      if (clicks.some(({ start, end }) => start < take.from || end > take.to)) return Promise.resolve(staleRefusal(clickOutsideAnswer('REAPER')));
      if (JSON.stringify(clicks) !== JSON.stringify(CLICKS.clicks)) return Promise.reject(new Error(`no golden for ${JSON.stringify(clicks)}`));
      return Promise.resolve(read('daw-repair-click-done.json', dawResultSchema));
    },
    // The backups bindings on REAPER: the capability's refusal (the refused golden) for a backup and a restore, and the table the list
    // golden holds.
    dawBackupAround: () => Promise.resolve(read('daw-backup-refused.json', dawResultSchema)),
    dawRestoreBackup: () => Promise.resolve(read('daw-backup-refused.json', dawResultSchema)),
    dawBackups: () => Promise.resolve(read('daw-backups-list.json', dawBackupsFileSchema)),
  };
}

/** Two stretches of the fixture project's take-twice lowered by 9 dB: what the reduce-range-gain goldens' host lowered. */
const GAIN: RangeGainRequest = {
  chapterId: 'chapter-1',
  takeId: 'take-twice',
  stretches: [
    { start: 4, end: 5 },
    { start: 8, end: 8.5 },
  ],
  reduceDb: 9,
};

/** Two clicks of the fixture project's take-twice: what the repair-click goldens' host repaired. */
const CLICKS: ClickRepairRequest = {
  chapterId: 'chapter-1',
  takeId: 'take-twice',
  clicks: [
    { start: 4, end: 4.003 },
    { start: 8.5, end: 8.502 },
  ],
};

/** A backup of the fixture project's chapter around its words 140 to 159, which the mock times at 140 to 160 s: a 260 s window. */
const BACKUP: BackupRequest = { chapterId: 'chapter-1', firstToken: 140, lastToken: 159, label: 'Roll at ¶ 3' };
/** The first file of the fixture's last measurement (DAW_PROJECT.measuredFiles), the path the master-file goldens' host measured. */
const RUN_FILE = 'C:/Renders/Chapter 01.wav';

function stackAnswer(known: typeof DAW_PROJECT, chapterId: string, passageIds: string[], done: string): DawResult {
  if (passageIds.length === 0) return refusal(nothingToStackAnswer('REAPER'));
  if (!known.chapterIds.includes(chapterId) || passageIds.some((id) => !(known.passageIds ?? []).includes(id))) {
    return staleRefusal(DAW_ANSWERS.stackNotAPassage);
  }
  return read(done, dawResultSchema);
}

/** One retry of the fixture project's passage moved onto its first read: the plan a dialog would show. */
const STACK: StackRequest = {
  chapterId: 'chapter-1',
  shift: -4,
  groups: [{ passageId: 'pm-chapter-1-p-1', itemGuid: 'item-1', base: 'take-1', moves: [{ takeId: 'take-2', from: 16, to: 10, len: 4 }] }],
};
const UNSTACK: StackRequest = {
  ...STACK,
  shift: 4,
  groups: STACK.groups.map((group) => ({ ...group, moves: [{ takeId: 'take-2', from: 10, to: 16, len: 4 }] })),
};

/** A refusal with no code: the host's own sentence in `refused` and `message`. */
const refusal = (sentence: string): DawResult => ({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence });

/** The stale refusal (ADR 0861): the host's own sentence in `refused` and `message`, and the one code. */
const staleRefusal = (sentence: string): DawResult => ({ ...refusal(sentence), code: 'stale' });

/** What every `DawResult` holds: a refusal changed nothing, repeats its sentence in `message`, and adds no undo point. */
function expectWellFormed(result: unknown): void {
  const parsed = dawResultSchema.parse(result);
  if (parsed.refused === undefined) return;
  expect(parsed.ok).toBe(false);
  expect(parsed.changed).toBe(false);
  expect(parsed.undoSteps).toBe(0);
  expect(parsed.message).toBe(parsed.refused);
}

const PICKUPS: readonly DawPickupItem[] = [
  { ref: 'pickup-1', start: 1.5, tag: 'narrator', note: 'Mispronounced' },
  { ref: 'pickup-2', start: 9.25, tag: '', note: 'Second pickup' },
];

const cases: ReadonlyArray<ContractCase<DawClient>> = [
  {
    name: 'client-methods-answer-a-daw-result',
    check: async (daw) => {
      for (const result of [
        await daw.recordStart('chapter-1'),
        await daw.recordStop(),
        await daw.useTake('chapter-1', 0, 4, 'take-1'),
        await daw.hideTakes('chapter-1', 0, 4, 'take-1'),
        await daw.roll('chapter-1', 40),
        await daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'close', fadeMs: 12 }),
        await daw.applyFxToRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: 'Podcast Voice.RfxChain', fadeMs: 10 }),
        await daw.removeFxFromRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: 'Podcast Voice.RfxChain' }),
        await daw.stackTakes(STACK),
        await daw.unstackTakes(UNSTACK),
        await daw.splitTake('chapter-1', 'take-twice', 15.5),
        await daw.reduceRangeGain(GAIN),
        await daw.repairClick(CLICKS),
        await daw.addMarker('finding-1'),
      ]) {
        expectWellFormed(result);
        expect(result.ok).toBe(true);
      }
    },
  },
  {
    name: 'capabilities-are-the-wire-shape',
    check: async (daw) => {
      expect(dawCapabilitiesSchema.parse(await daw.capabilities()).capabilities).toHaveProperty('record');
    },
  },
  {
    name: 'host-adapter-maps-the-existing-results: the DawResult goldens and every mapped result hold the same invariants',
    check: async (daw, { golden }) => {
      for (const file of ['daw-result-ok.json', 'daw-result-refused-stale.json', 'daw-result-multi-step.json']) expectWellFormed(golden(file, dawResultSchema));
      expect(golden('daw-result-multi-step.json', dawResultSchema).steps).toHaveLength(3);
      expectWellFormed(await daw.recordStart('no-such-chapter'));
      expectWellFormed(await daw.useTake('chapter-1', 0, 4, 'stale-take'));
    },
  },
  {
    name: 'project-state-is-the-wire-shape',
    check: async (daw) => {
      expect(dawProjectStateSchema.parse(await daw.projectState()).playState).toBe('stopped');
    },
  },
  { name: 'project-state-is-answered-alike', observe: (daw) => daw.projectState() },
  { name: 'unknown-chapter-is-refused-alike', observe: (daw) => daw.recordStart('no-such-chapter') },
  { name: 'known-chapter-is-accepted-alike', observe: (daw) => daw.recordStart('chapter-1') },
  {
    name: 'record-start-at-a-punch-starts-there',
    check: async (daw) => {
      expect(await daw.recordStart('chapter-1', 30)).toEqual({ ok: true, changed: true, message: recordingFromAnswer(30), undoSteps: 0 });
      expect(await daw.recordStart('chapter-1')).toEqual({ ok: true, changed: true, message: '', undoSteps: 0 });
    },
  },
  { name: 'record-start-at-a-punch-starts-there: a start at a punch is answered alike', observe: (daw) => daw.recordStart('chapter-1', 30) },
  { name: 'record-start-at-a-punch-starts-there: a negative time is refused alike', observe: (daw) => daw.recordStart('chapter-1', -1) },
  { name: 'record-start-at-a-punch-starts-there: a time that is not a number is refused alike', observe: (daw) => daw.recordStart('chapter-1', Number.NaN) },
  { name: 'record-start-at-a-punch-starts-there: an unknown chapter is refused stale alike', observe: (daw) => daw.recordStart('no-such-chapter', 30) },
  { name: 'stale-take-is-refused-alike', observe: (daw) => daw.useTake('chapter-1', 0, 4, 'stale-take') },
  {
    name: 'mock-refuses-stale-the-same-way: an old take or a missing track changes nothing and answers code stale',
    check: async (daw) => {
      for (const result of [
        await daw.useTake('chapter-1', 0, 4, 'stale-take'),
        await daw.useTake('chapter-9', 0, 4, 'take-1'),
        await daw.recordStart('no-such-chapter'),
      ]) {
        expectWellFormed(result);
        expect(result).toMatchObject({ ok: false, changed: false, undoSteps: 0, code: 'stale' });
      }
    },
  },
  { name: 'current-take-is-accepted-alike', observe: (daw) => daw.useTake('chapter-1', 0, 4, 'take-1') },
  { name: 'dawclient-hide-takes: hiding the others of a kept take is answered alike', observe: (daw) => daw.hideTakes('chapter-1', 0, 4, 'take-1') },
  { name: 'dawclient-hide-takes: a take with no others to hide is answered alike', observe: (daw) => daw.hideTakes('chapter-1', 0, 4, 'take-solo') },
  { name: 'dawclient-hide-takes: a stale kept take is refused alike', observe: (daw) => daw.hideTakes('chapter-1', 0, 4, 'stale-take') },
  { name: 'dawclient-hide-takes: an unknown chapter is refused alike', observe: (daw) => daw.hideTakes('chapter-9', 0, 4, 'take-1') },
  { name: 'dawclient-roll: a roll that keeps the earlier audio is answered alike', observe: (daw) => daw.roll('chapter-1', 40) },
  { name: 'dawclient-roll: confirmed is ignored where punch is not destructive', observe: (daw) => daw.roll('chapter-1', 40, { confirmed: true }) },
  { name: 'dawclient-roll: a chapter with no track is refused stale alike', observe: (daw) => daw.roll('chapter-9', 40) },
  { name: 'dawclient-roll: a negative time is refused alike', observe: (daw) => daw.roll('chapter-1', -1) },
  { name: 'dawclient-roll: a time that is not a number is refused alike', observe: (daw) => daw.roll('chapter-1', Number.NaN) },
  {
    name: 'dawclient-delete-range: a close cut is answered alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'close', fadeMs: 12 }),
  },
  {
    name: 'dawclient-delete-range: a gap cut is answered alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'gap', fadeMs: 12 }),
  },
  {
    name: 'dawclient-delete-range: an unknown chapter is refused stale alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-9', firstToken: 3, lastToken: 3, mode: 'close', fadeMs: 12 }),
  },
  {
    name: 'dawclient-delete-range: a range read backwards is refused stale alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 4, lastToken: 3, mode: 'close', fadeMs: 12 }),
  },
  {
    name: 'dawclient-delete-range: a fade over 500 ms is refused alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'gap', fadeMs: 501 }),
  },
  {
    name: 'delete-range-pad: a padded gap cut filled with room tone is answered alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'gap', fadeMs: 12, padMs: 100, roomTone: true }),
  },
  {
    name: 'delete-range-pad: room tone for a cut that closes up is refused alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'close', fadeMs: 12, padMs: 100, roomTone: true }),
  },
  {
    name: 'delete-range-pad: a pad over 500 ms is refused alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'gap', fadeMs: 12, padMs: 501 }),
  },
  {
    name: 'dawclient-fx-range: a chain on one word is answered alike',
    observe: (daw) => daw.applyFxToRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: 'Podcast Voice.RfxChain', fadeMs: 10 }),
  },
  {
    name: 'dawclient-fx-range: taking a chain off is answered alike',
    observe: (daw) => daw.removeFxFromRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: 'Podcast Voice.RfxChain' }),
  },
  {
    name: 'dawclient-fx-range: a chain the DAW does not list is refused alike',
    observe: (daw) => daw.applyFxToRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: 'Not Listed.RfxChain', fadeMs: 10 }),
  },
  {
    name: 'dawclient-fx-range: a path for a chain is refused alike, on and off',
    observe: async (daw) => [
      await daw.applyFxToRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: '../reaper.ini', fadeMs: 10 }),
      await daw.removeFxFromRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: 'C:\\FXChains\\Podcast Voice.RfxChain' }),
    ],
  },
  {
    name: 'dawclient-fx-range: an unknown chapter or a range read backwards is refused stale alike',
    observe: async (daw) => [
      await daw.applyFxToRange({ chapterId: 'chapter-9', firstToken: 3, lastToken: 3, chainName: 'Podcast Voice.RfxChain', fadeMs: 10 }),
      await daw.removeFxFromRange({ chapterId: 'chapter-1', firstToken: 4, lastToken: 3, chainName: 'Podcast Voice.RfxChain' }),
    ],
  },
  {
    name: 'dawclient-fx-range: a fade over 500 ms is refused alike',
    observe: (daw) => daw.applyFxToRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: 'Podcast Voice.RfxChain', fadeMs: 501 }),
  },
  { name: 'dawclient-fx-range: the chain list is answered alike', observe: (daw) => daw.fxChains() },
  { name: 'fx-range-params-and-bypass: the settings of a chain on words are read alike', observe: (daw) => daw.fxRangeParams(FX_TARGET) },
  {
    name: 'fx-range-params-and-bypass: a setting changed is answered alike',
    observe: (daw) => daw.setFxRangeParam({ ...FX_TARGET, fx: 0, index: 0, value: -3 }),
  },
  { name: 'fx-range-params-and-bypass: a bypass is answered alike', observe: (daw) => daw.bypassFxRange(FX_TARGET, true) },
  {
    name: 'fx-range-params-and-bypass: an unknown chapter or a range read backwards is refused stale alike',
    observe: async (daw) => [
      await daw.fxRangeParams({ ...FX_TARGET, chapterId: 'chapter-9' }),
      await daw.setFxRangeParam({ ...FX_TARGET, firstToken: 4, fx: 0, index: 0, value: -3 }),
      await daw.bypassFxRange({ ...FX_TARGET, chapterId: 'chapter-9' }, false),
    ],
  },
  {
    name: 'fx-range-params-and-bypass: a path for a chain, a setting the effect does not have and a value that is not a number are refused alike',
    observe: async (daw) => [
      await daw.fxRangeParams({ ...FX_TARGET, chainName: '../reaper.ini' }),
      await daw.bypassFxRange({ ...FX_TARGET, chainName: 'C:\\FXChains\\Podcast Voice.RfxChain' }, true),
      await daw.setFxRangeParam({ ...FX_TARGET, fx: -1, index: 0, value: 1 }),
      await daw.setFxRangeParam({ ...FX_TARGET, fx: 0, index: 0, value: Number.NaN }),
    ],
  },
  { name: 'dawclient-stack: a stack of one retry is answered alike', observe: (daw) => daw.stackTakes(STACK) },
  { name: 'dawclient-stack: an un-stack of one take is answered alike', observe: (daw) => daw.unstackTakes(UNSTACK) },
  {
    name: 'dawclient-stack: a passage the chapter does not list, or an unknown chapter, is refused stale alike',
    observe: async (daw) => [
      await daw.stackTakes({ ...STACK, groups: STACK.groups.map((group) => ({ ...group, passageId: '{11111111-1111-4111-8111-111111111111}' })) }),
      await daw.unstackTakes({ ...UNSTACK, chapterId: 'chapter-9' }),
    ],
  },
  { name: 'dawclient-stack: no passage is nothing to move alike', observe: (daw) => daw.stackTakes({ ...STACK, groups: [] }) },
  { name: 'split-take: a take cut at the second read is answered alike', observe: (daw) => daw.splitTake('chapter-1', 'take-twice', 15.5) },
  {
    name: 'split-take: a take the track does not hold, an unknown chapter and a cut outside the take are refused stale alike',
    observe: async (daw) => [
      await daw.splitTake('chapter-1', '{11111111-1111-4111-8111-111111111111}', 15.5),
      await daw.splitTake('chapter-9', 'take-twice', 15.5),
      await daw.splitTake('chapter-1', 'take-twice', 10),
      await daw.splitTake('chapter-1', 'take-twice', 25),
    ],
  },
  {
    name: 'split-take: a time that is not one is refused alike',
    observe: async (daw) => [await daw.splitTake('chapter-1', 'take-twice', -1), await daw.splitTake('chapter-1', 'take-twice', Number.NaN)],
  },
  { name: 'reduce-range-gain: two stretches of a take lowered by 9 dB are answered alike', observe: (daw) => daw.reduceRangeGain(GAIN) },
  {
    name: 'reduce-range-gain: a take the track does not hold, an unknown chapter and a stretch outside the take are refused stale alike',
    observe: async (daw) => [
      await daw.reduceRangeGain({ ...GAIN, takeId: '{11111111-1111-4111-8111-111111111111}' }),
      await daw.reduceRangeGain({ ...GAIN, chapterId: 'chapter-9' }),
      await daw.reduceRangeGain({ ...GAIN, stretches: [{ start: 1, end: 3 }] }),
      await daw.reduceRangeGain({ ...GAIN, stretches: [{ start: 11, end: 12.5 }] }),
    ],
  },
  {
    name: 'reduce-range-gain: a reduction or stretches out of bounds are refused alike',
    observe: async (daw) => [
      await daw.reduceRangeGain({ ...GAIN, reduceDb: 0 }),
      await daw.reduceRangeGain({ ...GAIN, reduceDb: 25 }),
      await daw.reduceRangeGain({ ...GAIN, stretches: [] }),
      await daw.reduceRangeGain({ ...GAIN, stretches: [{ start: 5, end: 4 }] }),
      await daw.reduceRangeGain({ ...GAIN, stretches: [{ start: -1, end: 4 }] }),
    ],
  },
  { name: 'repair-click: two clicks in a take repaired are answered alike', observe: (daw) => daw.repairClick(CLICKS) },
  {
    name: 'repair-click: a take the track does not hold, an unknown chapter and a click outside the take are refused stale alike',
    observe: async (daw) => [
      await daw.repairClick({ ...CLICKS, takeId: '{11111111-1111-4111-8111-111111111111}' }),
      await daw.repairClick({ ...CLICKS, chapterId: 'chapter-9' }),
      await daw.repairClick({ ...CLICKS, clicks: [{ start: 1.999, end: 2.001 }] }),
      await daw.repairClick({ ...CLICKS, clicks: [{ start: 11.999, end: 12.001 }] }),
    ],
  },
  {
    name: 'repair-click: clicks out of bounds are refused alike',
    observe: async (daw) => [
      await daw.repairClick({ ...CLICKS, clicks: [] }),
      await daw.repairClick({ ...CLICKS, clicks: [{ start: 4.003, end: 4 }] }),
      await daw.repairClick({ ...CLICKS, clicks: [{ start: -1, end: -0.998 }] }),
      await daw.repairClick({ ...CLICKS, clicks: [{ start: 4, end: 4.06 }] }),
    ],
  },
  {
    name: 'dawclient-backups: REAPER refuses a backup and a restore alike, with the capability sentence',
    observe: async (daw) => [await daw.backupAround(BACKUP), await daw.restoreBackup('{0F8E2A5C-1B3D-4E6F-8A9B-0C1D2E3F4A5B}')],
  },
  {
    name: 'play-quietest-and-open-file: a file of the last run plays its quietest 5 s and is shown, alike',
    observe: async (daw) => [await daw.playQuietest(RUN_FILE), await daw.openFile(RUN_FILE)],
  },
  {
    name: 'play-quietest-and-open-file: a file id not in the last run is refused stale, alike',
    observe: async (daw) => [await daw.playQuietest('C:/Renders/Chapter 09.wav'), await daw.openFile('C:/Renders/Chapter 09.wav'), await daw.playQuietest('')],
  },
  {
    name: 'play-quietest-and-open-file: a file with no quietest window has no stretch to play, alike',
    observe: (daw) => daw.playQuietest('C:/Renders/Silent/Chapter 01.wav'),
  },
  { name: 'stop-is-answered-alike', observe: (daw) => daw.recordStop() },
  { name: 'unknown-finding-is-rejected-alike', observe: (daw) => daw.addMarker('no-such-finding') },
  { name: 'known-finding-is-accepted-alike', observe: (daw) => daw.addMarker('finding-1') },
  {
    name: 'dawclient-pickup-methods: add, mark done, read back and open again, each a well-formed result',
    check: async (daw) => {
      const added = await daw.addPickupMarkers(PICKUPS);
      expectWellFormed(added);
      expect(added).toEqual({ ok: true, changed: true, message: 'Imported 2 pickups.', undoSteps: 1 });
      expect(await daw.setPickupMarkerDone('pickup-1', true)).toEqual({ ok: true, changed: true, message: DAW_ANSWERS.pickupResolved, undoSteps: 1 });
      const read = await daw.readPickupMarkers();
      expectWellFormed(read);
      expect(read.markers).toEqual([
        { ref: 'pickup-1', start: 1.5, state: 'done', tag: 'narrator', note: 'Mispronounced' },
        { ref: 'pickup-2', start: 9.25, state: 'open', tag: '', note: 'Second pickup' },
      ]);
      expect(await daw.setPickupMarkerDone('pickup-1', false)).toEqual({ ok: true, changed: true, message: DAW_ANSWERS.pickupReopened, undoSteps: 1 });
    },
  },
  {
    name: 'adding-pickups-twice-adds-nothing-alike',
    observe: async (daw) => [await daw.addPickupMarkers(PICKUPS), await daw.addPickupMarkers(PICKUPS)],
  },
  {
    name: 'an-unknown-pickup-ref-is-nothing-to-change-alike',
    observe: async (daw) => [await daw.setPickupMarkerDone('never-marked', true), await daw.setPickupMarkerDone('never-marked', false)],
  },
  {
    name: 'a-pickup-already-in-that-state-is-nothing-to-change-alike',
    observe: async (daw) => {
      await daw.addPickupMarkers(PICKUPS);
      return [
        await daw.setPickupMarkerDone('pickup-2', false),
        await daw.setPickupMarkerDone('pickup-2', true),
        await daw.setPickupMarkerDone('pickup-2', true),
      ];
    },
  },
  {
    name: 'pickup-markers-are-read-alike',
    observe: async (daw) => {
      const empty = await daw.readPickupMarkers();
      await daw.addPickupMarkers(PICKUPS);
      await daw.setPickupMarkerDone('pickup-2', true);
      return [empty, await daw.readPickupMarkers()];
    },
  },
];

// The REAPER golden is the host with no heartbeat, so its pickups capability is unavailable; the pickup cases run over the
// declaration of a REAPER that answers (DAW_SETUPS.reaper), as the mock does.
const reachableHost = (): DawClient => createHostDawClient({ ...hostApi(), ...pickupsHost().api });

describeProviderContract<DawClient>('daw', { mock: () => createMockDawClient(DAW_SETUPS.reaper), host: reachableHost }, cases, {
  goldens,
});

describe('the host adapter maps each existing golden', () => {
  const daw = createHostDawClient(hostApi());

  it('host-adapter-maps-every-stale-path: a stale take, a stale finding and a missing track answer code stale with the host sentence', async () => {
    const staleTake = read('workspace-use-take-refused.json', workspaceUseTakeResultSchema);
    expect(staleTake.reason).toBe('stale');
    expect(await daw.useTake('chapter-1', 0, 4, 'stale-take')).toEqual(staleRefusal(staleTake.message));
    const missing = recording('track_missing.start');
    expect(await daw.recordStart('no-such-chapter')).toEqual(staleRefusal(missing.message ?? ''));
    const staleFinding = read('findings-add-marker-stale.json', findingMarkerSchema);
    if (staleFinding.outcome !== 'refused') throw new Error('findings-add-marker-stale.json is not a refusal');
    expect(staleFinding.reason).toBe('stale');
    const marker = createHostDawClient({ ...hostApi(), findingsAddMarker: () => Promise.resolve(staleFinding) });
    expect(await marker.addMarker('finding-1')).toEqual(staleRefusal(staleFinding.message));
  });

  it('host-adapter-maps-every-stale-path: any other refusal keeps its sentence and carries no code', async () => {
    const sentence = 'Stop the recording in REAPER first.';
    const take = createHostDawClient({
      ...hostApi(),
      workspaceUseTake: () => Promise.resolve({ outcome: 'refused', reason: 'recording', message: sentence, changed: false }),
    });
    expect(await take.useTake('chapter-1', 0, 4, 'take-1')).toEqual({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence });
    const off = recording('experimental_off.start');
    const record = createHostDawClient({ ...hostApi(), readAloudRecordStart: () => Promise.resolve(off) });
    expect(await record.recordStart('chapter-1')).not.toHaveProperty('code');
    const standalone = createHostDawClient({
      ...hostApi(),
      findingsAddMarker: () => Promise.resolve({ outcome: 'refused', reason: 'standalone', message: 'Open a REAPER project first.' }),
    });
    expect(await standalone.addMarker('finding-1')).not.toHaveProperty('code');
  });

  it('host-adapter-maps-the-existing-results: an accepted take, marker and recording answer ok with their undo points', async () => {
    const taken = read('workspace-use-take-done.json', workspaceUseTakeResultSchema);
    expect(await daw.useTake('chapter-1', 0, 4, 'take-1')).toEqual({ ok: true, changed: true, message: taken.message, undoSteps: 1 });
    expect(await daw.addMarker('finding-1')).toEqual({ ok: true, changed: true, message: '', undoSteps: 1 });
    expect(await daw.recordStart('chapter-1')).toEqual({ ok: true, changed: true, message: '', undoSteps: 0 });
  });

  it('record-start-at-a-punch-starts-there: the host adapter sends a time to ReadAloudRecordStartAt and none to ReadAloudRecordStart', async () => {
    const calls: string[] = [];
    const spy = createHostDawClient({
      ...hostApi(),
      readAloudRecordStart: (chapterId) => (calls.push(`start ${chapterId}`), Promise.resolve(recording('ready.start'))),
      readAloudRecordStartAt: (chapterId, at) => (calls.push(`start ${chapterId} at ${at}`), Promise.resolve(recording('ready.start'))),
    });
    await spy.recordStart('chapter-1');
    await spy.recordStart('chapter-1', 30);
    await spy.recordStart('chapter-1', 0);
    expect(calls).toEqual(['start chapter-1', 'start chapter-1 at 30', 'start chapter-1 at 0']);
  });

  it("dawclient-hide-takes: the host adapter answers the binding's DawResult as it is, the stale code and the capability refusal included", async () => {
    expect(await daw.hideTakes('chapter-1', 0, 4, 'take-1')).toEqual(read('daw-hide-takes-done.json', dawResultSchema));
    expect(await daw.hideTakes('chapter-1', 0, 4, 'take-solo')).toEqual(read('daw-hide-takes-nothing.json', dawResultSchema));
    expect(await daw.hideTakes('chapter-1', 0, 4, 'stale-take')).toEqual(staleRefusal(DAW_ANSWERS.staleHide));
    const refusedGolden = read('daw-hide-takes-refused.json', dawResultSchema);
    const calls: string[][] = [];
    const off = createHostDawClient({
      ...hostApi(),
      workspaceHideTakes: (...args) => {
        calls.push(args.map(String));
        return Promise.resolve(refusedGolden);
      },
    });
    const answer = await off.hideTakes('chapter-1', 2, 7, 'take-2');
    expectWellFormed(answer);
    expect(answer).toEqual(refusedGolden);
    expect(calls).toEqual([['chapter-1', '2', '7', 'take-2']]);
  });

  it("dawclient-roll: the host adapter answers the binding's DawResult as it is, and sends confirmed as the page gave it", async () => {
    expect(await daw.roll('chapter-1', 40)).toEqual(read('daw-roll-done.json', dawResultSchema));
    expect(await daw.roll('chapter-9', 40)).toEqual(read('daw-roll-refused-stale.json', dawResultSchema));
    const confirm = read('daw-roll-refused-confirm.json', dawResultSchema);
    expect(confirm).toEqual(refusal(DAW_ANSWERS.rollConfirm));
    const calls: unknown[][] = [];
    const destructive = createHostDawClient({
      ...hostApi(),
      dawRoll: (...args) => {
        calls.push(args);
        return Promise.resolve(confirm);
      },
    });
    const answer = await destructive.roll('chapter-1', 12.5);
    expectWellFormed(answer);
    expect(answer).toEqual(confirm);
    await destructive.roll('chapter-1', 12.5, { confirmed: true });
    expect(calls).toEqual([
      ['chapter-1', 12.5, false],
      ['chapter-1', 12.5, true],
    ]);
  });

  it('dawclient-delete-range: the host adapter sends the request as the binding takes it and answers its DawResult as it is', async () => {
    expect(await daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'close', fadeMs: 12 })).toEqual(
      read('daw-delete-range-done.json', dawResultSchema),
    );
    const capability = read('daw-delete-range-refused-capability.json', dawResultSchema);
    expectWellFormed(capability);
    const calls: unknown[][] = [];
    const off = createHostDawClient({
      ...hostApi(),
      dawDeleteRange: (...args) => {
        calls.push(args);
        return Promise.resolve(capability);
      },
    });
    expect(await off.deleteRange({ chapterId: 'chapter-1', firstToken: 2, lastToken: 7, mode: 'gap', fadeMs: 25 })).toEqual(capability);
    expect(await off.deleteRange({ chapterId: 'chapter-1', firstToken: 2, lastToken: 7, mode: 'gap', fadeMs: 25, padMs: 50, roomTone: true })).toEqual(
      capability,
    );
    // A request without a pad or room tone sends none and leaves the gap silent, as before them.
    expect(calls).toEqual([
      ['chapter-1', 2, 7, 'gap', 25, 0, false],
      ['chapter-1', 2, 7, 'gap', 25, 50, true],
    ]);
  });

  it('dawclient-fx-range: the host adapter sends each request as the bindings take it and lists the chains as the mock FxList', async () => {
    expect(await daw.applyFxToRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, chainName: 'Podcast Voice.RfxChain', fadeMs: 10 })).toEqual(
      read('daw-apply-fx-range-done.json', dawResultSchema),
    );
    const capability = read('daw-apply-fx-range-refused.json', dawResultSchema);
    expectWellFormed(capability);
    const calls: unknown[][] = [];
    const off = createHostDawClient({
      ...hostApi(),
      dawApplyFxToRange: (...args) => {
        calls.push(['apply', ...args]);
        return Promise.resolve(capability);
      },
      dawRemoveFxFromRange: (...args) => {
        calls.push(['remove', ...args]);
        return Promise.resolve(capability);
      },
    });
    expect(await off.applyFxToRange({ chapterId: 'chapter-1', firstToken: 2, lastToken: 7, chainName: 'Podcast Voice.RfxChain', fadeMs: 25 })).toEqual(
      capability,
    );
    expect(await off.removeFxFromRange({ chapterId: 'chapter-1', firstToken: 2, lastToken: 7, chainName: 'Podcast Voice.RfxChain' })).toEqual(capability);
    expect(calls).toEqual([
      ['apply', 'chapter-1', 2, 7, 'Podcast Voice.RfxChain', 25],
      ['remove', 'chapter-1', 2, 7, 'Podcast Voice.RfxChain'],
    ]);
    const names = read('workspace-fx-chains.json', workspaceFXChainsResultSchema).names;
    expect(await daw.fxChains()).toEqual({ source: fxChainsSource('REAPER'), choices: names.map((name) => ({ id: name, name })) });
  });

  it('host-adapter-maps-the-existing-results: a refusal without a sentence is an error, not a sentence the client words', async () => {
    const silent = createHostDawClient({ ...hostApi(), readAloudRecordStart: () => Promise.resolve({ outcome: 'refused', reason: 'timeout' }) });
    await expect(silent.recordStart('chapter-1')).rejects.toThrow('no sentence');
  });
});

describe('the mock setups', () => {
  it('refusal-carries-the-capabilitys-sentence: with REAPER off a recording call is refused with the capability message and changes nothing', async () => {
    const off = DAW_SETUPS['reaper-off'];
    const sentence = off.capabilities.record.message;
    expect(sentence).toBeTruthy();
    const mock = createMockDawClient(off);
    for (const result of [await mock.recordStart('chapter-1'), await mock.recordStop()]) {
      expect(result).toEqual({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence });
    }
  });

  it("record-start-at-a-punch-starts-there: the mock refuses a start at a time with the setup's punch sentence where it cannot place the cursor", async () => {
    for (const id of ['builtin', 'reaper-off'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.punch.message ?? '';
      const record = DAW_SETUPS[id].capabilities.record;
      const expected = record.available ? sentence : (record.message ?? '');
      expect(await createMockDawClient(DAW_SETUPS[id]).recordStart('chapter-1', 30), id).toEqual(refusal(expected));
    }
    expect(await createMockDawClient(DAW_SETUPS.reaper).recordStart('chapter-1', 12.25)).toEqual({
      ok: true,
      changed: true,
      message: recordingFromAnswer(12.25),
      undoSteps: 0,
    });
  });

  it('mock-refuses-stale-the-same-way: the stale take answer is DAW_ANSWERS.staleTake with code stale', async () => {
    expect(await createMockDawClient(DAW_SETUPS.reaper).useTake('chapter-1', 0, 4, 'stale-take')).toEqual(staleRefusal(DAW_ANSWERS.staleTake));
    expect(await createMockDawClient(DAW_SETUPS.reaper).recordStart('no-such-chapter')).toEqual(staleRefusal(DAW_ANSWERS.noTrack));
  });

  it("dawclient-hide-takes: the mock refuses with the setup's takes sentence, finds nothing to hide, or mutes in one undo step naming the DAW", async () => {
    for (const id of ['reaper-off', 'audacity'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.takes.message;
      expect(sentence, id).toBeTruthy();
      expect(await createMockDawClient(DAW_SETUPS[id]).hideTakes('chapter-1', 0, 4, 'take-1'), id).toEqual({
        ok: false,
        changed: false,
        message: sentence,
        undoSteps: 0,
        refused: sentence,
      });
    }
    const reaper = createMockDawClient(DAW_SETUPS.reaper);
    expect(await reaper.hideTakes('chapter-1', 0, 4, 'take-1')).toEqual({ ok: true, changed: true, message: takesHiddenAnswer(1, 'REAPER'), undoSteps: 1 });
    expect(await reaper.hideTakes('chapter-1', 0, 4, 'take-solo')).toEqual({ ok: true, changed: false, message: takesHiddenAnswer(0, 'REAPER'), undoSteps: 0 });
    expect(await reaper.hideTakes('chapter-1', 0, 4, 'stale-take')).toEqual(staleRefusal(DAW_ANSWERS.staleHide));
    const backups = createMockDawClient(DAW_SETUPS['audacity-backups'], { ...DAW_PROJECT, otherTakes: { 'take-1': 2 } });
    expect((await backups.hideTakes('chapter-1', 0, 4, 'take-1')).message).toBe('Muted 2 other takes in Audacity. They are still in the project.');
    expect(await createMockDawClient(DAW_SETUPS.builtin).hideTakes('chapter-1', 0, 4, 'take-1')).toEqual({
      ok: true,
      changed: false,
      message: BUILTIN_NOTHING_TO_MUTE,
      undoSteps: 0,
    });
  });

  it("dawclient-roll: the mock refuses with the setup's punch sentence, asks first where punch is destructive, and keeps the earlier audio on REAPER", async () => {
    for (const id of ['reaper-off', 'builtin'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.punch.message;
      expect(sentence, id).toBeTruthy();
      expect(await createMockDawClient(DAW_SETUPS[id]).roll('chapter-1', 40, { confirmed: true }), id).toEqual(refusal(sentence ?? ''));
    }
    const reaper = createMockDawClient(DAW_SETUPS.reaper);
    expect(await reaper.roll('chapter-1', 62.25)).toEqual({ ok: true, changed: true, message: rolledAnswer(62.25), undoSteps: 0 });
    expect(rolledAnswer(40)).toBe(read('daw-roll-done.json', dawResultSchema).message);
    expect(await reaper.roll('chapter-9', 40)).toEqual(staleRefusal(DAW_ANSWERS.rollStale));
    expect(await reaper.roll('chapter-1', Number.POSITIVE_INFINITY)).toEqual(refusal(DAW_ANSWERS.rollBadTime));

    // Audacity without backups (SN-D83): punch is available, and a roll there replaces the audio.
    const mock = createMockDawClient(DAW_SETUPS.audacity);
    expect(await mock.roll('chapter-1', 40)).toEqual(refusal(DAW_ANSWERS.rollConfirm));
    expect(await mock.roll('chapter-1', 40, { confirmed: false })).toEqual(refusal(DAW_ANSWERS.rollConfirm));
    expect(await mock.roll('chapter-1', 40, { confirmed: true })).toEqual({ ok: true, changed: true, message: rolledReplacingAnswer(40), undoSteps: 1 });
  });

  it('dawclient-stack: the host adapter sends the chapter and the passage ids only, never the plan, and answers its DawResult as it is', async () => {
    const daw = createHostDawClient(hostApi());
    expect(await daw.stackTakes(STACK)).toEqual(read('daw-stack-done.json', dawResultSchema));
    expect(await daw.unstackTakes(UNSTACK)).toEqual(read('daw-unstack-done.json', dawResultSchema));
    const stale = read('daw-stack-refused-stale.json', dawResultSchema);
    expectWellFormed(stale);
    expect(stale.code).toBe('stale');
    const calls: unknown[][] = [];
    const host = createHostDawClient({
      ...hostApi(),
      dawStackTakes: (...args) => {
        calls.push(['stack', ...args]);
        return Promise.resolve(stale);
      },
      dawUnstackTakes: (...args) => {
        calls.push(['unstack', ...args]);
        return Promise.resolve(stale);
      },
    });
    expect(await host.stackTakes(STACK)).toEqual(stale);
    expect(await host.unstackTakes(UNSTACK)).toEqual(stale);
    expect(calls).toEqual([
      ['stack', 'chapter-1', ['pm-chapter-1-p-1']],
      ['unstack', 'chapter-1', ['pm-chapter-1-p-1']],
    ]);
  });

  it('dawclient-backups: the host adapter sends the chapter, tokens and label or the id only, and answers the bindings as they are', async () => {
    const calls: unknown[][] = [];
    const done = read('daw-backup-done.json', dawResultSchema);
    const restored = read('daw-backup-restored.json', dawResultSchema);
    const host = createHostDawClient({
      ...hostApi(),
      dawBackupAround: (...args) => {
        calls.push(['backup', ...args]);
        return Promise.resolve(done);
      },
      dawRestoreBackup: (...args) => {
        calls.push(['restore', ...args]);
        return Promise.resolve(restored);
      },
    });
    expect(await host.backupAround(BACKUP)).toEqual(done);
    expect(await host.restoreBackup('{0F8E2A5C-1B3D-4E6F-8A9B-0C1D2E3F4A5B}')).toEqual(restored);
    expect(calls).toEqual([
      ['backup', 'chapter-1', 140, 159, 'Roll at ¶ 3'],
      ['restore', '{0F8E2A5C-1B3D-4E6F-8A9B-0C1D2E3F4A5B}'],
    ]);
    const list = await host.backups();
    expect(list).toEqual(read('daw-backups-list.json', dawBackupsFileSchema).backups);
    expect(list.map((row) => row.createdAt)).toEqual([...list.map((row) => row.createdAt)].sort().reverse());
    expect(done).toMatchObject({ ok: true, changed: false, undoSteps: 0, message: backedUpAnswer(260, 'Audacity') });
    expect(restored).toMatchObject({ ok: true, changed: true, undoSteps: 1, message: backupRestoredAnswer(260, 'Audacity') });
  });

  it('dawclient-backups: the mock refuses where backups are unavailable, and with backups makes a row and restores it', async () => {
    for (const id of ['reaper', 'reaper-off', 'builtin', 'audacity'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.backups.message;
      expect(sentence, id).toBeTruthy();
      const mock = createMockDawClient(DAW_SETUPS[id]);
      expect(await mock.backupAround(BACKUP), id).toEqual(refusal(sentence ?? ''));
      expect(await mock.restoreBackup('{00000000-0000-4000-8000-000000000001}'), id).toEqual(refusal(sentence ?? ''));
      expect(await mock.backups(), id).toEqual([]);
    }
    const mock = createMockDawClient(DAW_SETUPS['audacity-backups']);
    expect(await mock.backupAround(BACKUP)).toEqual(read('daw-backup-done.json', dawResultSchema));
    expect(await mock.backupAround({ ...BACKUP, firstToken: 3, lastToken: 3, label: 'Trim white space' })).toMatchObject({ ok: true, changed: false });
    const [newest, oldest] = await mock.backups();
    expect(newest).toMatchObject({ label: 'Trim white space', chapterId: 'chapter-1', start: 0, end: 124 });
    expect(oldest).toMatchObject({ label: 'Roll at ¶ 3', start: 20, end: 280 });
    expect(oldest.restored).toBeUndefined();
    for (const row of [newest, oldest]) expect(dawBackupsFileSchema.safeParse({ schemaVersion: 1, backups: [row] }).success).toBe(true);
    expect(await mock.restoreBackup(oldest.id)).toEqual(read('daw-backup-restored.json', dawResultSchema));
    expect((await mock.backups())[1].restored).toEqual(expect.any(String));
    expect(await mock.restoreBackup('{11111111-1111-4111-8111-111111111111}')).toEqual(refusal('Audacity has no backup with that id.'));
    expect(await mock.backupAround({ ...BACKUP, label: '' })).toEqual(refusal(DAW_ANSWERS.backupLabel));
    expect(await mock.backupAround({ ...BACKUP, chapterId: 'chapter-9' })).toEqual(staleRefusal(DAW_ANSWERS.rangeStale));
    expect(await mock.backups()).toHaveLength(2);
  });

  it('dawclient-stack: the mock follows the setups: one undo step natively, the steps listed in steps, none where the app stacks', async () => {
    for (const id of ['reaper-off', 'audacity', 'builtin'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.stack_takes.message;
      expect(sentence, id).toBeTruthy();
      expect(await createMockDawClient(DAW_SETUPS[id]).stackTakes(STACK), id).toEqual(refusal(sentence ?? ''));
      expect(await createMockDawClient(DAW_SETUPS[id]).unstackTakes(UNSTACK), id).toEqual(refusal(sentence ?? ''));
    }
    const reaper = createMockDawClient(DAW_SETUPS.reaper);
    expect(await reaper.stackTakes(STACK)).toEqual({ ok: true, changed: true, message: takesStackedAnswer(1, 'REAPER'), undoSteps: 1 });
    expect(await reaper.unstackTakes(UNSTACK)).toEqual({ ok: true, changed: true, message: takesUnstackedAnswer(1, 'REAPER'), undoSteps: 1 });
    expect(await reaper.stackTakes({ ...STACK, groups: [{ ...STACK.groups[0], moves: [] }] })).toEqual(refusal(nothingToStackAnswer('REAPER')));

    const withMode = (mode: 'steps' | 'app'): DawCapabilities => ({
      ...DAW_SETUPS.audacity,
      capabilities: { ...DAW_SETUPS.audacity.capabilities, stack_takes: { level: 'experimental', available: true, mode } },
    });
    const steps = await createMockDawClient(withMode('steps')).stackTakes(STACK);
    expect(steps).toEqual(read('daw-stack-steps.json', dawResultSchema));
    expect(steps.steps).toEqual([...STACK_STEPS]);
    expect((await createMockDawClient(withMode('app')).stackTakes(STACK)).undoSteps).toBe(0);
  });

  it("split-take: the mock refuses with the setup's takes sentence, the built-in recorder says why it cannot, and a DAW cuts in one undo step", async () => {
    for (const [id, setup] of Object.entries(DAW_SETUPS)) {
      const takes = setup.capabilities.takes;
      const got = await createMockDawClient(setup).splitTake('chapter-1', 'take-twice', 15.5);
      expectWellFormed(got);
      if (!takes?.available) expect(got, id).toEqual(refusal(takes?.message ?? ''));
      else if (setup === DAW_SETUPS.builtin) expect(got, id).toEqual(refusal(BUILTIN_NO_SPLIT));
      else expect(got, id).toEqual({ ok: true, changed: true, message: takeSplitAnswer(setup.daw), undoSteps: 1 });
    }
    expect(await createMockDawClient(DAW_SETUPS.reaper).splitTake('chapter-1', 'take-twice', 15.5)).toEqual(read('daw-split-take-done.json', dawResultSchema));
    for (const file of ['daw-split-take-refused-stale.json', 'daw-split-take-refused-capability.json']) expectWellFormed(read(file, dawResultSchema));
    expect(read('daw-split-take-refused-stale.json', dawResultSchema).code).toBe('stale');
  });

  it('split-take: the host adapter sends the chapter, the take id and the time only, and answers the binding as it is', async () => {
    const stale = read('daw-split-take-refused-stale.json', dawResultSchema);
    const calls: unknown[][] = [];
    const host = createHostDawClient({
      ...hostApi(),
      dawSplitTake: (...args) => {
        calls.push(args);
        return Promise.resolve(stale);
      },
    });
    expect(await host.splitTake('chapter-1', 'take-twice', 15.5)).toEqual(stale);
    expect(calls).toEqual([['chapter-1', 'take-twice', 15.5]]);
  });

  it("reduce-range-gain: the mock refuses with the setup's range_gain sentence and answers undo steps by the capability's mode", async () => {
    for (const [id, setup] of Object.entries(DAW_SETUPS)) {
      const support = setup.capabilities.range_gain;
      const got = await createMockDawClient(setup).reduceRangeGain(GAIN);
      expectWellFormed(got);
      if (!support?.available) expect(got, id).toEqual(refusal(support?.message ?? ''));
      else if (support.mode === 'steps')
        expect(got, id).toEqual({
          ok: true,
          changed: true,
          message: `Lowered 2 stretches by 9 dB in ${setup.daw}.`,
          undoSteps: 2,
          steps: ['Select the stretch', 'Lower it by 9 dB'],
        });
      else expect(got, id).toEqual({ ok: true, changed: true, message: rangeGainAnswer(setup.daw, 2, 9), undoSteps: 1 });
    }
    expect(await createMockDawClient(DAW_SETUPS.reaper).reduceRangeGain(GAIN)).toEqual(read('daw-reduce-range-gain-done.json', dawResultSchema));
    for (const file of ['daw-reduce-range-gain-refused-stale.json', 'daw-reduce-range-gain-refused-capability.json'])
      expectWellFormed(read(file, dawResultSchema));
    expect(read('daw-reduce-range-gain-refused-stale.json', dawResultSchema).code).toBe('stale');
  });

  it('reduce-range-gain: the host adapter sends the chapter, the take id, the stretches and the dB only, and answers the binding as it is', async () => {
    const stale = read('daw-reduce-range-gain-refused-stale.json', dawResultSchema);
    const calls: unknown[][] = [];
    const host = createHostDawClient({
      ...hostApi(),
      dawReduceRangeGain: (...args) => {
        calls.push(args);
        return Promise.resolve(stale);
      },
    });
    expect(await host.reduceRangeGain(GAIN)).toEqual(stale);
    expect(calls).toEqual([['chapter-1', 'take-twice', GAIN.stretches, 9]]);
  });

  it("repair-click: the mock refuses with the setup's click_repair sentence and answers undo steps by the capability's mode", async () => {
    for (const [id, setup] of Object.entries(DAW_SETUPS)) {
      const support = setup.capabilities.click_repair;
      const got = await createMockDawClient(setup).repairClick(CLICKS);
      expectWellFormed(got);
      if (!support?.available) expect(got, id).toEqual(refusal(support?.message ?? ''));
      else if (support.mode === 'steps')
        expect(got, id).toEqual({
          ok: true,
          changed: true,
          message: `Repaired 2 clicks in ${setup.daw}.`,
          undoSteps: 2,
          steps: ['Select around the click', 'Run Click Removal on it'],
        });
      else expect(got, id).toEqual({ ok: true, changed: true, message: repairClickAnswer(setup.daw, 2), undoSteps: 1 });
    }
    expect(await createMockDawClient(DAW_SETUPS.reaper).repairClick(CLICKS)).toEqual(read('daw-repair-click-done.json', dawResultSchema));
    for (const file of ['daw-repair-click-refused-stale.json', 'daw-repair-click-refused-capability.json']) expectWellFormed(read(file, dawResultSchema));
    expect(read('daw-repair-click-refused-stale.json', dawResultSchema).code).toBe('stale');
  });

  it('repair-click: the host adapter sends the chapter, the take id and the clicks only, and answers the binding as it is', async () => {
    const stale = read('daw-repair-click-refused-stale.json', dawResultSchema);
    const calls: unknown[][] = [];
    const host = createHostDawClient({
      ...hostApi(),
      dawRepairClick: (...args) => {
        calls.push(args);
        return Promise.resolve(stale);
      },
    });
    expect(await host.repairClick(CLICKS)).toEqual(stale);
    expect(calls).toEqual([['chapter-1', 'take-twice', CLICKS.clicks]]);
  });

  it("dawclient-delete-range: the mock refuses with the setup's cut_range sentence and answers undo steps by the capability's mode", async () => {
    const request = { chapterId: 'chapter-1', firstToken: 2, lastToken: 4, mode: 'close', fadeMs: 0 } as const;
    for (const id of ['reaper-off', 'audacity'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.cut_range.message;
      expect(sentence, id).toBeTruthy();
      expect(await createMockDawClient(DAW_SETUPS[id]).deleteRange(request), id).toEqual(refusal(sentence ?? ''));
    }
    // The built-in recorder cuts by its own edit list (mode app), so it answers and adds no engine undo step.
    expect(await createMockDawClient(DAW_SETUPS.builtin).deleteRange(request)).toMatchObject({ ok: true, changed: true, undoSteps: 0 });
    const reaper = createMockDawClient(DAW_SETUPS.reaper);
    expect(await reaper.deleteRange(request)).toEqual({ ok: true, changed: true, message: rangeCutAnswer(3, 'REAPER'), undoSteps: 1 });
    expect(rangeCutAnswer(1, 'REAPER')).toBe(read('daw-delete-range-done.json', dawResultSchema).message);
    expect(await reaper.deleteRange({ ...request, chapterId: 'chapter-9' })).toEqual(staleRefusal(DAW_ANSWERS.rangeStale));
    expect(await reaper.deleteRange({ ...request, fadeMs: 2.5 })).toEqual(refusal(DAW_ANSWERS.cutBadFade));

    // A DAW that makes the cut in several edits lists them, one undo step each; one where the app keeps the edit adds none.
    const withMode = (mode: 'steps' | 'app'): DawCapabilities => ({
      ...DAW_SETUPS.reaper,
      capabilities: { ...DAW_SETUPS.reaper.capabilities, cut_range: { level: 'experimental', available: true, mode } },
    });
    expect(await createMockDawClient(withMode('steps')).deleteRange(request)).toEqual({
      ok: true,
      changed: true,
      message: rangeCutAnswer(3, 'REAPER'),
      undoSteps: RANGE_CUT_STEPS.length,
      steps: [...RANGE_CUT_STEPS],
    });
    expect((await createMockDawClient(withMode('app')).deleteRange(request)).undoSteps).toBe(0);
  });

  it("dawclient-fx-range: the mock refuses with the setup's fx_range sentence, lists the setup's chains and answers undo steps by the mode", async () => {
    const request = { chapterId: 'chapter-1', firstToken: 2, lastToken: 4, chainName: 'Podcast Voice.RfxChain', fadeMs: 0 } as const;
    for (const id of ['reaper-off', 'audacity', 'builtin'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.fx_range.message;
      expect(sentence, id).toBeTruthy();
      expect(await createMockDawClient(DAW_SETUPS[id]).applyFxToRange(request), id).toEqual(refusal(sentence ?? ''));
      expect(await createMockDawClient(DAW_SETUPS[id]).removeFxFromRange(request), id).toEqual(refusal(sentence ?? ''));
    }
    const reaper = createMockDawClient(DAW_SETUPS.reaper);
    expect(await reaper.applyFxToRange(request)).toEqual({
      ok: true,
      changed: true,
      message: fxChainAddedAnswer('Podcast Voice.RfxChain', 3, 'REAPER'),
      undoSteps: 1,
    });
    expect(await reaper.removeFxFromRange(request)).toEqual({
      ok: true,
      changed: true,
      message: fxChainRemovedAnswer('Podcast Voice.RfxChain', 'REAPER'),
      undoSteps: 1,
    });
    expect(await reaper.applyFxToRange({ ...request, chapterId: 'chapter-9' })).toEqual(staleRefusal(DAW_ANSWERS.rangeStale));
    expect(await reaper.applyFxToRange({ ...request, fadeMs: 2.5 })).toEqual(refusal(DAW_ANSWERS.cutBadFade));
    expect(await reaper.removeFxFromRange({ ...request, chainName: 'Radio.RfxChain\n' })).toEqual(refusal(DAW_ANSWERS.fxBadChain));
    expect(await reaper.fxChains()).toEqual({
      source: 'Your REAPER FX chains',
      choices: (DAW_PROJECT.fxChains ?? []).map((name) => ({ id: name, name })),
    });

    const withMode = (mode: 'steps' | 'app'): DawCapabilities => ({
      ...DAW_SETUPS.reaper,
      capabilities: { ...DAW_SETUPS.reaper.capabilities, fx_range: { level: 'experimental', available: true, mode } },
    });
    expect(await createMockDawClient(withMode('steps')).applyFxToRange(request)).toEqual({
      ok: true,
      changed: true,
      message: fxChainAddedAnswer('Podcast Voice.RfxChain', 3, 'REAPER'),
      undoSteps: FX_RANGE_STEPS.length,
      steps: [...FX_RANGE_STEPS],
    });
    expect((await createMockDawClient(withMode('app')).removeFxFromRange(request)).undoSteps).toBe(0);
  });

  it('refusal-carries-the-capabilitys-sentence: take and marker calls use their own capability sentence', async () => {
    const mock = createMockDawClient(DAW_SETUPS.audacity);
    expect((await mock.useTake('chapter-1', 0, 4, 'take-1')).refused).toBe(DAW_SETUPS.audacity.capabilities.takes.message);
    expect((await createMockDawClient(DAW_SETUPS.builtin).addMarker('finding-1')).refused).toBe(DAW_SETUPS.builtin.capabilities.markers.message);
  });

  it('dawclient-reads-it: each setup answers its saved time, unsaved flag and transport, and the schema accepts it', async () => {
    for (const [id, setup] of Object.entries(DAW_SETUPS)) {
      const state = await createMockDawClient(setup).projectState();
      expect(dawProjectStateSchema.parse(state), id).toEqual(DAW_PROJECT_STATES[id as keyof typeof DAW_SETUPS]);
    }
    expect((await createMockDawClient(DAW_SETUPS.reaper).projectState()).savedAt).toBe('2026-09-26T08:40');
    const builtin = await createMockDawClient(DAW_SETUPS.builtin).projectState();
    expect(builtin.savedAt).toBeNull();
    expect(builtin.unsavedChanges).toBe(false);
  });

  it('dawclient-reads-it: a setup given its own project state answers it', async () => {
    const live = { savedAt: '2026-09-26T08:40', unsavedChanges: true, playState: 'recording', playPosition: 40.25 } as const;
    expect(await createMockDawClient(DAW_SETUPS.reaper, DAW_PROJECT, live).projectState()).toEqual(live);
  });

  it('behaviour differs only through the capability fields: Audacity with backups can use a take, without them it cannot', async () => {
    expect((await createMockDawClient(DAW_SETUPS.audacity).useTake('chapter-1', 0, 4, 'take-1')).ok).toBe(false);
    expect((await createMockDawClient(DAW_SETUPS['audacity-backups']).useTake('chapter-1', 0, 4, 'take-1')).ok).toBe(true);
  });
});

describe('the port never names a DAW', () => {
  it('client-never-names-a-daw: ports/daw.ts has no DAW name and no branch on the kind', () => {
    const source = readFileSync(fileURLToPath(new URL('./daw.ts', import.meta.url)), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/**'))
      .join('\n');
    expect(source).not.toMatch(/reaper|audacity|built-?in|standalone/i);
    expect(source).not.toMatch(/\.daw\b|\bkind\b|capabilit(y|ies)\.daw/);
  });
});

describe("pickup markers are the DAW's truth", () => {
  const away = DAW_SETUPS['reaper-off'];
  const awaySentence = away.capabilities.pickups.message;

  it('away-writes-are-the-pages-to-queue: a DAW that does not answer refuses each call with the pickups capability sentence and sends nothing', async () => {
    expect(awaySentence).toBeTruthy();
    const host = pickupsHost(away);
    const refusal = { ok: false, changed: false, message: awaySentence, undoSteps: 0, refused: awaySentence };
    for (const daw of [createHostDawClient({ ...hostApi(), ...host.api }), createMockDawClient(away)]) {
      expect(await daw.addPickupMarkers(PICKUPS)).toEqual(refusal);
      expect(await daw.setPickupMarkerDone('pickup-1', true)).toEqual(refusal);
      expect(await daw.readPickupMarkers()).toEqual({ ...refusal, markers: [] });
    }
    expect(host.calls).toEqual([]);
  });

  it("away-writes-are-the-pages-to-queue: the host's own capabilities golden refuses with the resolver's sentence for its reason", async () => {
    const golden = read('daw-capabilities-reaper.json', dawCapabilitiesSchema);
    const support = golden.capabilities.pickups;
    expect(support).toMatchObject({ available: false, reason: 'standalone' });
    const daw = createHostDawClient(hostApi());
    expect(await daw.addPickupMarkers(PICKUPS)).toMatchObject({ ok: false, changed: false, refused: support?.message });
  });

  it('away-writes-are-the-pages-to-queue: the refusal is the sentence the resolver sent, not one the client words', async () => {
    const sentence = 'A sentence only the resolver knows.';
    const capabilities: DawCapabilities = {
      ...away,
      capabilities: { ...away.capabilities, pickups: { level: 'supported', available: false, reason: 'not_running', message: sentence } },
    };
    const host = pickupsHost(capabilities);
    const daw = createHostDawClient({ ...hostApi(), ...host.api });
    expect((await daw.setPickupMarkerDone('pickup-1', false)).refused).toBe(sentence);
    expect((await createMockDawClient(capabilities).addPickupMarkers(PICKUPS)).refused).toBe(sentence);
    expect(host.calls).toEqual([]);
  });

  it('the DAW refusing a rename is its own sentence, and the client does not try again', async () => {
    const host = pickupsHost();
    const daw = createHostDawClient({ ...hostApi(), ...host.api });
    await daw.addPickupMarkers(PICKUPS);
    // Another client marked pickup-1 done behind this one's back: this client still thinks it open, so it sends and the DAW refuses.
    const other = createHostDawClient({ ...hostApi(), ...host.api });
    await other.addPickupMarkers(PICKUPS.slice(0, 1));
    expect(await other.setPickupMarkerDone('pickup-1', true)).toMatchObject({ ok: true, changed: true });
    expect(await daw.setPickupMarkerDone('pickup-1', true)).toEqual({
      ok: false,
      changed: false,
      message: DAW_ANSWERS.noOpenPickup,
      undoSteps: 0,
      refused: DAW_ANSWERS.noOpenPickup,
    });
    expect(host.calls.filter((call) => call === 'resolve')).toHaveLength(2);
  });

  it('a later session learns each pickup time by adding again: nothing is added and the ids map to the markers', async () => {
    const host = pickupsHost();
    await createHostDawClient({ ...hostApi(), ...host.api }).addPickupMarkers(PICKUPS);
    const later = createHostDawClient({ ...hostApi(), ...host.api });
    expect(await later.setPickupMarkerDone('pickup-2', true)).toEqual({ ok: true, changed: false, message: NOTHING_TO_CHANGE, undoSteps: 0 });
    expect(await later.addPickupMarkers(PICKUPS)).toEqual({ ok: true, changed: false, message: pickupsImportedAnswer(0, 2), undoSteps: 0 });
    expect(await later.setPickupMarkerDone('pickup-2', true)).toMatchObject({ ok: true, changed: true, undoSteps: 1 });
    const read = await later.readPickupMarkers();
    expect(read.markers.map((marker) => [marker.ref, marker.state])).toEqual([
      ['pickup-1', 'open'],
      ['pickup-2', 'done'],
    ]);
  });

  it('the host adapter sends each pickup as one CSV row: commas and quotes quoted, a line break made a space', async () => {
    const host = pickupsHost();
    const sent: string[] = [];
    const daw = createHostDawClient({
      ...hostApi(),
      ...host.api,
      pickupsImport: (csvText) => {
        sent.push(csvText);
        return host.api.pickupsImport('start,note,tag\n1,x,\n');
      },
    });
    await daw.addPickupMarkers([{ ref: 'p', start: 2.5, tag: 'a,b', note: 'Say "hello"\nagain' }]);
    expect(sent).toEqual(['start,note,tag\n2.5,"Say ""hello"" again","a,b"\n']);
  });

  it('a marker this session never marked is read without an id', async () => {
    const host = pickupsHost();
    await createHostDawClient({ ...hostApi(), ...host.api }).addPickupMarkers(PICKUPS.slice(1));
    const read = await createHostDawClient({ ...hostApi(), ...host.api }).readPickupMarkers();
    expect(read.markers).toEqual([{ start: 9.25, state: 'open', tag: '', note: 'Second pickup' }]);
  });

  it("the host's own sentences: the import and the read answers match the goldens internal/pickups wrote", () => {
    expect(pickupsImportedAnswer(2, 0)).toBe(read('pickups-import-success.json', pickupsStateSchema).message);
    expect(pickupMarkersReadAnswer(1, 1)).toBe(read('pickups-markers-listed.json', pickupsStateSchema).message);
  });
});

describe('fx-range-params-and-bypass', () => {
  it('fx-range-params-and-bypass: the host adapter sends the words, the chain and the setting only, and answers the bindings as they are', async () => {
    const capability = read('daw-fx-range-params-refused.json', dawFxRangeSettingsSchema);
    const stale = read('daw-fx-range-bypass-refused-stale.json', dawResultSchema);
    expect(capability.result.ok).toBe(false);
    expect(capability.settings).toEqual([]);
    expect(stale).toMatchObject({ ok: false, code: 'stale' });
    const calls: unknown[][] = [];
    const host = createHostDawClient({
      ...hostApi(),
      dawFxRangeParams: (...args) => {
        calls.push(['params', ...args]);
        return Promise.resolve(capability);
      },
      dawSetFxRangeParam: (...args) => {
        calls.push(['set', ...args]);
        return Promise.resolve(stale);
      },
      dawBypassFxRange: (...args) => {
        calls.push(['bypass', ...args]);
        return Promise.resolve(stale);
      },
    });
    expect(await host.fxRangeParams(FX_TARGET)).toEqual(capability);
    expect(await host.setFxRangeParam({ ...FX_TARGET, fx: 1, index: 2, value: 0.5 })).toEqual(stale);
    expect(await host.bypassFxRange(FX_TARGET, false)).toEqual(stale);
    expect(calls).toEqual([
      ['params', 'chapter-1', 3, 3, 'Podcast Voice.RfxChain'],
      ['set', 'chapter-1', 3, 3, 'Podcast Voice.RfxChain', 1, 2, 0.5],
      ['bypass', 'chapter-1', 3, 3, 'Podcast Voice.RfxChain', false],
    ]);
  });

  it("fx-range-params-and-bypass: the mock refuses with the setup's fx_range sentence, Audacity says the effect is baked in, and REAPER answers", async () => {
    for (const id of ['reaper-off', 'builtin'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.fx_range.message ?? '';
      const daw = createMockDawClient(DAW_SETUPS[id]);
      expect(await daw.fxRangeParams(FX_TARGET), id).toEqual({ result: refusal(sentence), settings: [], truncated: false, bypassed: false });
      expect(await daw.bypassFxRange(FX_TARGET, true), id).toEqual(refusal(sentence));
    }
    const audacity = createMockDawClient(DAW_SETUPS['audacity-backups']);
    expect((await audacity.fxRangeParams(FX_TARGET)).result).toEqual(refusal(DAW_ANSWERS.fxBakedIn));
    expect(await audacity.setFxRangeParam({ ...FX_TARGET, fx: 0, index: 0, value: -3 })).toEqual(refusal(DAW_ANSWERS.fxBakedIn));
    expect(await audacity.bypassFxRange(FX_TARGET, true)).toEqual(refusal(DAW_ANSWERS.fxBakedIn));

    const reaper = createMockDawClient(DAW_SETUPS.reaper);
    const settings = await reaper.fxRangeParams(FX_TARGET);
    expect(settings).toEqual({
      result: { ok: true, changed: false, message: fxSettingsReadAnswer('Podcast Voice.RfxChain', FX_RANGE_SETTINGS.length, 'REAPER'), undoSteps: 0 },
      settings: [...FX_RANGE_SETTINGS],
      truncated: false,
      bypassed: false,
    });
    expect(dawFxRangeSettingsSchema.safeParse(settings).success).toBe(true);
    expect(await reaper.setFxRangeParam({ ...FX_TARGET, fx: 0, index: 1, value: 2 })).toEqual({
      ok: true,
      changed: true,
      message: fxSettingSetAnswer('Podcast Voice.RfxChain', '2', 'REAPER'),
      undoSteps: 1,
    });
    expect(await reaper.setFxRangeParam({ ...FX_TARGET, fx: 0, index: 0, value: 0 })).toMatchObject({ ok: true, changed: false, undoSteps: 0 });
    expect(await reaper.setFxRangeParam({ ...FX_TARGET, fx: 0, index: 2, value: 0 })).toEqual(refusal(DAW_ANSWERS.fxNoSetting));
    expect(await reaper.setFxRangeParam({ ...FX_TARGET, fx: 0, index: 0, value: 25 })).toEqual(refusal(DAW_ANSWERS.fxValueOutside));
    expect(await reaper.bypassFxRange(FX_TARGET, false)).toEqual({
      ok: true,
      changed: true,
      message: fxBypassAnswer('Podcast Voice.RfxChain', false, 'REAPER'),
      undoSteps: 1,
    });
  });
});
