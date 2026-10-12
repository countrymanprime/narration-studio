import type { EditCut, EditCutsApi } from '../api/contracts/editCuts';
import type { AcceptedWord, EditLogApi } from '../api/contracts/editLog';
import type { EditStacksApi } from '../api/contracts/editStacks';
import type { EditWordFxApi, WordFx } from '../api/contracts/wordFx';

// The Editing records port (ADR 0856): the words the narrator kept as read, the cuts and the word effects, each kept by the
// host in the project's editing/ folder and checked against the current text on every read, and the stacks and retry modes
// (ADR 0858), kept beside them. A page reads and changes
// them through this port only. A later Editing slice adds its methods here together with its binding (ISP).

/** What a page asks of the Editing records: the accepted words, the cuts, the word effects, the stacks and the retry modes. */
export type EditLogPort = EditLogApi & EditCutsApi & EditWordFxApi & EditStacksApi;

/** The `NarrationApi` methods the host adapter calls. */
export type EditLogHostApi = Pick<
  EditLogPort,
  | 'editingAcceptedList'
  | 'editingAccept'
  | 'editingUnaccept'
  | 'editingCutsList'
  | 'editingCutRecord'
  | 'editingCutRemove'
  | 'editingWordFxList'
  | 'editingWordFxRecord'
  | 'editingWordFxRemove'
  | 'editingStacksList'
  | 'editingStackRecord'
  | 'editingStackRemove'
  | 'editingRetryModeGet'
  | 'editingRetryModeSet'
>;

/** The port over the host's bindings (or the mock's): the answers pass through as the schemas decoded them. */
export function createHostEditLog(api: EditLogHostApi): EditLogPort {
  return {
    editingAcceptedList: (chapterId) => api.editingAcceptedList(chapterId),
    editingAccept: (chapterId, keys) => api.editingAccept(chapterId, keys),
    editingUnaccept: (chapterId, keys) => api.editingUnaccept(chapterId, keys),
    editingCutsList: (chapterId) => api.editingCutsList(chapterId),
    editingCutRecord: (chapterId, cut) => api.editingCutRecord(chapterId, cut),
    editingCutRemove: (chapterId, id) => api.editingCutRemove(chapterId, id),
    editingWordFxList: (chapterId) => api.editingWordFxList(chapterId),
    editingWordFxRecord: (chapterId, fx) => api.editingWordFxRecord(chapterId, fx),
    editingWordFxRemove: (chapterId, id) => api.editingWordFxRemove(chapterId, id),
    editingStacksList: (chapterId) => api.editingStacksList(chapterId),
    editingStackRecord: (chapterId, stack) => api.editingStackRecord(chapterId, stack),
    editingStackRemove: (chapterId, passageId, takeIds) => api.editingStackRemove(chapterId, passageId, takeIds),
    editingRetryModeGet: (level, chapterId, passageId) => api.editingRetryModeGet(level, chapterId, passageId),
    editingRetryModeSet: (level, chapterId, passageId, mode) => api.editingRetryModeSet(level, chapterId, passageId, mode),
  };
}

/**
 * The keys whose flags a page hides: the accepted words that still match the text. A stale word is not accepted, so its
 * flag shows again, and it is never applied to the word that took its place.
 */
export function acceptedKeys(words: readonly AcceptedWord[]): Set<string> {
  return new Set(words.filter((word) => !word.stale).map((word) => word.key));
}

/**
 * The keys a page strikes through: the words of the cuts that still match the text. A stale cut's words changed since it was
 * made, so it is reported and never struck onto the words that took their place.
 */
export function cutKeys(cuts: readonly EditCut[]): Set<string> {
  return new Set(cuts.filter((cut) => !cut.stale).flatMap((cut) => cut.keys));
}

/**
 * The effect each word carries for the underline and its menu: the first recorded effect on the word that still matches the
 * text. A stale effect's words changed since it was added, so it is reported and never drawn onto the words that took their
 * place.
 */
export function wordFxByKey(effects: readonly WordFx[]): Map<string, WordFx> {
  const byKey = new Map<string, WordFx>();
  const live = effects.filter((effect) => !effect.stale);
  // Ids number the effects in the order they were recorded (fx1, fx2, ... fx10).
  for (const fx of live.sort((x, y) => x.id.localeCompare(y.id, 'en', { numeric: true }))) {
    for (const key of fx.keys) if (!byKey.has(key)) byKey.set(key, fx);
  }
  return byKey;
}
