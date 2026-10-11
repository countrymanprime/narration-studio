import type { AcceptedWord, EditLogApi } from '../api/contracts/editLog';

// The Editing records port (ADR 0856): the words the narrator kept as read, and later the cuts and word effects, each kept by
// the host in the project's editing/ folder and checked against the current text on every read. A page reads and changes
// them through this port only. A later Editing slice adds its methods here together with its binding (ISP).

/** What a page asks of the Editing records. Today: the accepted words. */
export type EditLogPort = EditLogApi;

/** The `NarrationApi` methods the host adapter calls. */
export type EditLogHostApi = Pick<EditLogApi, 'editingAcceptedList' | 'editingAccept' | 'editingUnaccept'>;

/** The port over the host's bindings (or the mock's): the answers pass through as the schemas decoded them. */
export function createHostEditLog(api: EditLogHostApi): EditLogPort {
  return {
    editingAcceptedList: (chapterId) => api.editingAcceptedList(chapterId),
    editingAccept: (chapterId, keys) => api.editingAccept(chapterId, keys),
    editingUnaccept: (chapterId, keys) => api.editingUnaccept(chapterId, keys),
  };
}

/**
 * The keys whose flags a page hides: the accepted words that still match the text. A stale word is not accepted, so its
 * flag shows again, and it is never applied to the word that took its place.
 */
export function acceptedKeys(words: readonly AcceptedWord[]): Set<string> {
  return new Set(words.filter((word) => !word.stale).map((word) => word.key));
}
