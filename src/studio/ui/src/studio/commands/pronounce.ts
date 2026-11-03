import { apiErrorMessage } from '../../api/errorMessage';
import type { GuidePronunciation, StoryBibleApi } from '../../api/contracts/storyBible';
import { SCRIPT_IMPORTED_SOURCE, USER_DICTIONARY_SOURCE, type PronunciationCandidateRow } from '../../api/contracts/pronunciationSources';
import type { Command, Journal, Result } from '../journal/createJournal';

/** The host calls that change a name's pronunciation. No other UI file calls them (`pronunciationSingleStore.test.ts`). */
export type PronounceApi = Pick<
  StoryBibleApi,
  'guidePronounceUser' | 'guidePronounce' | 'guidePronunciationUseAlternate' | 'guidePronunciationRestore' | 'guideEntities'
>;

/**
 * One name of a Story Bible entry (its own when `aliasIndex` is absent), its text, and the pronunciation it has now, which Undo writes back.
 * Undo finds the name by its entry and text, never by its place alone: an alias removed meanwhile moves the others up.
 */
export type PronounceTarget = { entryId: string; aliasIndex?: number; name: string; prior: GuidePronunciation };

const NAME_GONE = 'That name is no longer in the Story Bible.';

type Journalling = Pick<Journal, 'act'>;

const attempt = async (call: () => Promise<void>): Promise<Result<null>> => {
  try {
    await call();
    return { ok: true, value: null };
  } catch (error) {
    return { ok: false, refusal: { code: 'host-refused', reason: apiErrorMessage(error) } };
  }
};

/** The alias index as the host's calls take it: last, and left off for the entry's own name. */
const alias = (target: PronounceTarget): [] | [number] => (target.aliasIndex === undefined ? [] : [target.aliasIndex]);

const listeners = new Set<() => void>();

/**
 * Calls `listener` after any pronunciation changes through these commands, made or undone on any page (Undo from History included), so a
 * page that shows Story Bible names reads them again (Script's Words, the Story Bible's list). Returns the unsubscribe.
 */
export function subscribePronunciationChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const announced = async (call: () => Promise<void>): Promise<Result<null>> => {
  const result = await attempt(call);
  if (result.ok) listeners.forEach((listener) => listener());
  return result;
};

/** Writes the earlier value back to the same name, or refuses when the entry is gone or the name at that place is another one now. */
async function restore(api: PronounceApi, target: PronounceTarget): Promise<Result<null>> {
  let entries: Awaited<ReturnType<PronounceApi['guideEntities']>>;
  try {
    entries = await api.guideEntities();
  } catch (error) {
    return { ok: false, refusal: { code: 'host-refused', reason: apiErrorMessage(error) } };
  }
  const entry = entries.find((row) => row.id === target.entryId);
  const now = target.aliasIndex === undefined ? entry?.canonical_name : entry?.aliases[target.aliasIndex]?.text;
  if (now?.trim().toLowerCase() !== target.name.trim().toLowerCase()) return { ok: false, refusal: { code: 'name-gone', reason: NAME_GONE } };
  return announced(() => api.guidePronunciationRestore(target.entryId, target.prior, ...alias(target)));
}

function command(api: PronounceApi, target: PronounceTarget, label: string, run: () => Promise<void>): Command<null> {
  return {
    label,
    // The Story Bible page's own keys (GuideDetail's `storyBible/entities/<id>`), so an edit of the entry there and a pronunciation change
    // here order their undos.
    touches: [`storyBible/entities/${target.entryId}/names/${target.aliasIndex ?? 'own'}`],
    run: () => announced(run),
    undo: () => restore(api, target),
  };
}

/**
 * The one way a pronunciation changes (audit cluster 13, #2595): the Story Bible's names grid and Script's Words card both call these, so a change is
 * one journal entry whichever page made it, and Undo from either page writes the name's earlier value back.
 */
export const pronounceOwn = (journal: Journalling, api: PronounceApi, target: PronounceTarget, ipa: string) =>
  journal.act<null>(command(api, target, 'Changed a pronunciation', () => api.guidePronounceUser(target.entryId, ipa, ...alias(target))));

export const pronounceFromSource = (journal: Journalling, api: PronounceApi, target: PronounceTarget, source: { id: string; label: string }) =>
  journal.act<null>(command(api, target, `Pronunciation from ${source.label}`, () => api.guidePronounce(target.entryId, source.id, ...alias(target))));

export const pronounceUseAlternate = (journal: Journalling, api: PronounceApi, target: PronounceTarget) =>
  journal.act<null>(command(api, target, 'Switched pronunciation', () => api.guidePronunciationUseAlternate(target.entryId, ...alias(target))));

/** The user dictionary's sources: the host cannot ask them by id, so their record is written onto the name as it is. */
const USER_LAYERS: readonly string[] = [USER_DICTIONARY_SOURCE, SCRIPT_IMPORTED_SOURCE];

/**
 * Uses one of the dictionaries' candidates for a name (#2595): a registry source is asked for it by the host, as choosing it on the source
 * tag does; a record of the narrator's dictionary is written as it is, marked chosen. One journal entry, which Undo reverses.
 */
export const pronounceFromCandidate = (journal: Journalling, api: PronounceApi, target: PronounceTarget, candidate: PronunciationCandidateRow) =>
  USER_LAYERS.includes(candidate.sourceId)
    ? journal.act<null>(
        command(api, target, `Pronunciation from ${candidate.label}`, () =>
          api.guidePronunciationRestore(
            target.entryId,
            { ipa: candidate.say, source: candidate.sourceId, confidence: 'narrator', chosen: true },
            ...alias(target),
          ),
        ),
      )
    : pronounceFromSource(journal, api, target, { id: candidate.sourceId, label: candidate.label });
