// The Script page's journalled commands (ADR 0771), the mock's `state/commands/script.ts` over the host: marks and their
// threads (`MarksApi`), prep states and flagged words (`ScriptPrepApi`), speakers and new Story Bible entries
// (`StoryBibleApi`). Each runs through `journal.act` with a label and the host command that takes it back, and reads what
// the inverse needs from the page's read cache first. A refusal is the host's own sentence and journals nothing. After each
// command and each undo the list it changed is read again.
//
// The host has no call that changes a mark's type or its opening text, so those two are a replacement: the mark is added
// again with the new value and its replies, resolved again if it was, and the old one removed. The replacement has a new id
// and the replies carry the time they were added again.

import type { Mark, MarksApi, MarkThreadAuthor, ThreadMessage } from '../../../../api/contracts/marks';
import { SCRIPT_SAY_MANUAL_SOURCE, type PrepState, type ScriptPrepApi, type ScriptWord } from '../../../../api/contracts/scriptPrep';
import type { StoryBibleApi } from '../../../../api/contracts/storyBible';
import { apiErrorMessage } from '../../../../api/errorMessage';
import { chapterName, type ChapterNameInput } from '../../../../chapterName';
import type { Command, Journal, Result } from '../../../../studio/journal/createJournal';
import type { ScriptData, ScriptList } from './scriptData';

export type ScriptCommandEnv = {
  journal: Pick<Journal, 'act'>;
  marks: Pick<MarksApi, 'marksAdd' | 'marksRemove' | 'marksReply' | 'marksEditMessage' | 'marksDeleteMessage' | 'marksRestoreMessage' | 'marksSetStatus'>;
  scriptPrep: Pick<ScriptPrepApi, 'scriptPrepSetChapter' | 'scriptWordFlag' | 'scriptWordSay' | 'scriptWordUnflag'>;
  storyBible: Pick<StoryBibleApi, 'guideCorrectCue' | 'guideCreate' | 'guideDelete'>;
  data: Pick<ScriptData, 'getState' | 'load'>;
  /** Says a change aloud (the overlay service's live region). */
  announce: (text: string) => void;
};

/** A range of one line: UTF-16 offsets into its text. */
export type LineRange = { chapterId: string; paragraphId: string; start: number; end: number };

/** What a journalled command answers: the host's value and the journal entry, for an Undo offer. */
export type Done<T> = { value: T; entryId: number | null };

export const PREP_LABELS: Record<PrepState, string> = { none: 'Not started', progress: 'In progress', prepped: 'Prepped' };
const PREP_ORDER: readonly PrepState[] = ['none', 'progress', 'prepped'];

const refuse = (code: string, reason: string): Result<never> => ({ ok: false, refusal: { code, reason } });

/** Runs a host call and answers its result, or the host's sentence when it refuses. */
async function attempt<T>(call: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return refuse('host-refused', apiErrorMessage(error));
  }
}

/** Reads the lists a change touched; a failed read is the cache's own error state, and the change stands. */
const reload = (env: ScriptCommandEnv, ...lists: ScriptList[]): Promise<void> => Promise.all(lists.map((list) => env.data.load(list))).then(() => undefined);

/** Runs the command through the journal, then reads the lists again; the inverse reads them again after an undo. */
async function journalled<R>(env: ScriptCommandEnv, lists: ScriptList[], command: Command<R>): Promise<Result<Done<R>>> {
  const undo = command.undo;
  const result = await env.journal.act<R>({
    ...command,
    undo: undo
      ? async (value: R) => {
          const undone = await undo(value);
          await reload(env, ...lists);
          return undone;
        }
      : undefined,
  });
  await reload(env, ...lists);
  return result.ok ? { ok: true, value: { value: result.value.value, entryId: result.value.id } } : result;
}

/** A list from the cache, read first when nothing has loaded it. */
async function cached<L extends 'marks' | 'prep' | 'cues' | 'entries'>(env: ScriptCommandEnv, list: L) {
  if (!env.data.getState()[list]?.value) await env.data.load(list);
  return env.data.getState()[list]?.value as NonNullable<ReturnType<ScriptData['getState']>[L]>['value'];
}

const markGone = (): Result<never> => refuse('mark-gone', 'That mark is no longer there.');

async function markById(env: ScriptCommandEnv, id: string): Promise<Mark | undefined> {
  return (await cached(env, 'marks'))?.marks.find((mark) => mark.id === id);
}

/* ---------- Marks ---------- */

/** Marks a range with a type, with a note or the question a query needs. Undo removes it. */
export async function addMark(env: ScriptCommandEnv, range: LineRange, type: string, text: string): Promise<Result<Done<Mark>>> {
  const kind = (await cached(env, 'marks'))?.types.find((row) => row.key === type);
  if (kind?.asks && !text.trim()) return refuse('query-text', 'Write the query first.');
  const touches = ['marks'];
  return journalled<Mark>(env, ['marks'], {
    label: kind?.asks ? 'Added a query' : 'Added a mark',
    touches,
    async run() {
      const added = await attempt(() => env.marks.marksAdd(range.chapterId, range.paragraphId, range.start, range.end, type, text.trim()));
      if (added.ok) touches[0] = `marks/${added.value.id}`;
      return added;
    },
    undo: (mark) => attempt(() => env.marks.marksRemove(mark.id)),
  });
}

/** Adds a mark again with its replies (and resolved again if it was); a reply the host refuses removes the new mark again. */
type MarkChange = { type?: string; text?: string; status?: Mark['status'] };

async function rebuild(env: ScriptCommandEnv, old: Mark, change: MarkChange): Promise<Result<Mark>> {
  const added = await attempt(() => env.marks.marksAdd(old.chapterId, old.paragraphId, old.start, old.end, change.type ?? old.type, change.text ?? old.text));
  if (!added.ok) return added;
  let mark = added.value;
  for (const message of old.thread) {
    const replied = await attempt(() => env.marks.marksReply(mark.id, message.who, message.text));
    if (!replied.ok) {
      await attempt(() => env.marks.marksRemove(mark.id));
      return replied;
    }
    mark = replied.value;
  }
  const status = 'status' in change ? change.status : old.status;
  if (status === 'resolved' && mark.status === 'open') return attempt(() => env.marks.marksSetStatus(mark.id, 'resolved'));
  return { ok: true, value: mark };
}

/** Replaces a mark by a rebuilt one, then removes the old one. */
async function replace(env: ScriptCommandEnv, old: Mark, change: MarkChange): Promise<Result<Mark>> {
  const rebuilt = await rebuild(env, old, change);
  if (!rebuilt.ok) return rebuilt;
  const removed = await attempt(() => env.marks.marksRemove(old.id));
  return removed.ok ? rebuilt : removed;
}

/** Deletes a mark. Undo adds it back with its replies under a new id, so the entry is spent once undone. */
export async function removeMark(env: ScriptCommandEnv, id: string): Promise<Result<Done<null>>> {
  const old = await markById(env, id);
  if (!old) return markGone();
  return journalled<null>(env, ['marks'], {
    label: 'Removed a mark',
    touches: [`marks/${id}`],
    async run() {
      const removed = await attempt(() => env.marks.marksRemove(id));
      return removed.ok ? { ok: true, value: null } : removed;
    },
    undo: () => rebuild(env, old, {}),
  });
}

/** The undo of a replacement: the mark as it now is, put back to the old values. */
function replaceBack(env: ScriptCommandEnv, old: Mark) {
  return async (current: Mark): Promise<Result<Mark>> => {
    const now = await markById(env, current.id);
    return now ? replace(env, now, { type: old.type, text: old.text, status: old.status }) : markGone();
  };
}

/** Changes a mark's type. A query keeps its thread either way; the host opens a mark whose new type asks. */
export async function setMarkType(env: ScriptCommandEnv, id: string, type: string): Promise<Result<Done<Mark>>> {
  const old = await markById(env, id);
  if (!old) return markGone();
  return journalled<Mark>(env, ['marks'], {
    label: 'Changed the type of a mark',
    touches: ['marks'],
    run: () => replace(env, old, { type }),
    undo: replaceBack(env, old),
  });
}

/** Adds a reply to the end of a mark's thread. Undo deletes it. */
export async function replyToMark(env: ScriptCommandEnv, id: string, who: MarkThreadAuthor, text: string): Promise<Result<Done<Mark>>> {
  return journalled<Mark>(env, ['marks'], {
    label: 'Replied in a thread',
    touches: [`marks/${id}`],
    run: () => attempt(() => env.marks.marksReply(id, who, text)),
    undo: (mark) => attempt(() => env.marks.marksDeleteMessage(id, mark.thread.length - 1)),
  });
}

/** Changes the text of a message: a reply in place, the opening message (index -1) by a replacement. Undo puts the old text back. */
export async function editMessage(env: ScriptCommandEnv, id: string, index: number, text: string): Promise<Result<Done<Mark>>> {
  const old = await markById(env, id);
  if (!old) return markGone();
  if (index < 0) {
    return journalled<Mark>(env, ['marks'], {
      label: 'Edited a message',
      touches: ['marks'],
      run: () => replace(env, old, { text }),
      undo: replaceBack(env, old),
    });
  }
  const before = old.thread[index];
  if (!before) return refuse('message-gone', 'That message is no longer there.');
  return journalled<Mark>(env, ['marks'], {
    label: 'Edited a message',
    touches: [`marks/${id}`],
    run: () => attempt(() => env.marks.marksEditMessage(id, index, text)),
    undo: () => attempt(() => env.marks.marksEditMessage(id, index, before.text)),
  });
}

/** Deletes a message: a reply (Undo restores it at its place), or the opening message's text (Undo puts it back). */
export async function deleteMessage(env: ScriptCommandEnv, id: string, index: number): Promise<Result<Done<unknown>>> {
  if (index < 0) return editMessage(env, id, -1, '');
  return journalled<ThreadMessage>(env, ['marks'], {
    label: 'Deleted a message',
    touches: [`marks/${id}`],
    async run() {
      const deleted = await attempt(() => env.marks.marksDeleteMessage(id, index));
      return deleted.ok ? { ok: true, value: deleted.value.message } : deleted;
    },
    undo: (message) => attempt(() => env.marks.marksRestoreMessage(id, index, message)),
  });
}

/** Resolves or reopens a query; each is the other's undo. */
export async function setMarkStatus(env: ScriptCommandEnv, id: string, status: 'open' | 'resolved'): Promise<Result<Done<Mark>>> {
  return journalled<Mark>(env, ['marks'], {
    label: status === 'resolved' ? 'Resolved a query' : 'Reopened a query',
    touches: [`marks/${id}`],
    run: () => attempt(() => env.marks.marksSetStatus(id, status)),
    undo: () => attempt(() => env.marks.marksSetStatus(id, status === 'resolved' ? 'open' : 'resolved')),
  });
}

/* ---------- Prep ---------- */

const prepOf = async (env: ScriptCommandEnv, chapterId: string): Promise<PrepState> =>
  (await cached(env, 'prep'))?.chapters.find((row) => row.chapterId === chapterId)?.state ?? 'none';

/** Sets a chapter's prep state and says "{chapter}: {state}"; the state it already has journals nothing. Undo sets the earlier state and says that. */
export async function setPrep(env: ScriptCommandEnv, chapter: ChapterNameInput & { id: string }, state: PrepState): Promise<Result<Done<PrepState>>> {
  const before = await prepOf(env, chapter.id);
  const said = (to: PrepState) => `${chapterName(chapter, 'short')}: ${PREP_LABELS[to]}`;
  const set = async (to: PrepState): Promise<Result<PrepState>> => {
    const stored = await attempt(() => env.scriptPrep.scriptPrepSetChapter(chapter.id, to));
    if (!stored.ok) return stored;
    env.announce(said(to));
    return { ok: true, value: stored.value.state };
  };
  if (state === before) return { ok: true, value: { value: before, entryId: null } };
  return journalled<PrepState>(env, ['prep'], { label: said(state), touches: [`scriptPrep/${chapter.id}`], run: () => set(state), undo: () => set(before) });
}

/** Steps a chapter's prep state along none, progress, prepped, stopping at either end; a step that changes nothing journals nothing. */
export async function stepPrep(env: ScriptCommandEnv, chapter: ChapterNameInput & { id: string }, delta: number): Promise<Result<Done<PrepState>>> {
  const current = await prepOf(env, chapter.id);
  const next = PREP_ORDER[Math.max(0, Math.min(PREP_ORDER.length - 1, PREP_ORDER.indexOf(current) + delta))] ?? current;
  return next === current ? { ok: true, value: { value: current, entryId: null } } : setPrep(env, chapter, next);
}

/* ---------- Words ---------- */

const sameRange = (a: LineRange, b: LineRange): boolean =>
  a.chapterId === b.chapterId && a.paragraphId === b.paragraphId && a.start === b.start && a.end === b.end;

/** Flags a range for pronunciation. A range that is flagged already answers its word and journals nothing. Undo removes the flag. */
export async function flagWord(env: ScriptCommandEnv, range: LineRange): Promise<Result<Done<ScriptWord>>> {
  const words = (await cached(env, 'prep'))?.words ?? [];
  const existing = words.find((word) => word.flags.some((flag) => sameRange(flag, range)));
  if (existing) return { ok: true, value: { value: existing, entryId: null } };
  return journalled<ScriptWord>(env, ['prep'], {
    label: 'Flagged a word',
    touches: ['scriptPrep/words'],
    run: () => attempt(() => env.scriptPrep.scriptWordFlag(range.chapterId, range.paragraphId, range.start, range.end)),
    async undo(word) {
      const flag = word.flags.find((row) => sameRange(row, range));
      return flag ? attempt(() => env.scriptPrep.scriptWordUnflag(flag.id)) : refuse('flag-gone', 'That flag is no longer there.');
    },
  });
}

/** Removes one flag. Undo flags the same range again, and gives back how the word is said when the last flag took it away. */
export async function unflagWord(env: ScriptCommandEnv, flagId: string): Promise<Result<Done<ScriptWord>>> {
  const words = (await cached(env, 'prep'))?.words ?? [];
  const word = words.find((row) => row.flags.some((flag) => flag.id === flagId));
  const flag = word?.flags.find((row) => row.id === flagId);
  if (!word || !flag) return refuse('flag-gone', 'That flag is no longer there.');
  return journalled<ScriptWord>(env, ['prep'], {
    label: 'Removed a flagged word',
    touches: ['scriptPrep/words'],
    run: () => attempt(() => env.scriptPrep.scriptWordUnflag(flagId)),
    async undo(after) {
      const flagged = await attempt(() => env.scriptPrep.scriptWordFlag(flag.chapterId, flag.paragraphId, flag.start, flag.end));
      if (!flagged.ok || !word.say || after.say) return flagged;
      return attempt(() => env.scriptPrep.scriptWordSay(word.word, word.say, word.source));
    },
  });
}

/**
 * Removes a word from the list: every one of its flags. Undo flags each range again and gives back how the word was said. The host
 * keeps a word only while it has a flag, so the mock's `addWord` (a word with no place in the text) has no host call and is not here.
 */
export async function removeWord(env: ScriptCommandEnv, key: string): Promise<Result<Done<null>>> {
  const word = ((await cached(env, 'prep'))?.words ?? []).find((row) => row.word === key);
  if (!word || word.flags.length === 0) return refuse('word-gone', 'That word is no longer flagged.');
  return journalled<null>(env, ['prep'], {
    label: 'Removed a flagged word',
    touches: [`scriptPrep/words/${key}`],
    async run() {
      for (const flag of word.flags) {
        const removed = await attempt(() => env.scriptPrep.scriptWordUnflag(flag.id));
        if (!removed.ok) return removed;
      }
      return { ok: true, value: null };
    },
    async undo() {
      for (const flag of word.flags) {
        const flagged = await attempt(() => env.scriptPrep.scriptWordFlag(flag.chapterId, flag.paragraphId, flag.start, flag.end));
        if (!flagged.ok) return flagged;
      }
      return word.say ? attempt(() => env.scriptPrep.scriptWordSay(word.word, word.say, word.source)) : { ok: true, value: null };
    },
  });
}

/** Saves how a word is said and the source it came from; typed text is the narrator's own (`manual`). Undo puts the old value back. */
export async function saveSay(env: ScriptCommandEnv, word: string, say: string, source: string = SCRIPT_SAY_MANUAL_SOURCE): Promise<Result<Done<ScriptWord>>> {
  const words = (await cached(env, 'prep'))?.words ?? [];
  const before = words.find((row) => row.word === word);
  return journalled<ScriptWord>(env, ['prep'], {
    label: 'Saved how a word is said',
    touches: [`scriptPrep/words/${word}`],
    run: () => attempt(() => env.scriptPrep.scriptWordSay(word, say.trim(), source)),
    undo: () => attempt(() => env.scriptPrep.scriptWordSay(word, before?.say ?? '', before?.source ?? '')),
  });
}

/* ---------- Speakers and Story Bible entries ---------- */

/** Confirms who speaks a quoted phrase. Undo gives the phrase its earlier speaker (or none) back, as the narrator's correction. */
export async function confirmSpeaker(env: ScriptCommandEnv, cueId: string, entryId: string): Promise<Result<Done<null>>> {
  const cue = (await cached(env, 'cues'))?.find((row) => row.id === cueId);
  if (!cue) return refuse('cue-gone', 'That line is no longer in the Story Bible.');
  const correct = (speaker: string) => async (): Promise<Result<null>> => {
    const corrected = await attempt(() => env.storyBible.guideCorrectCue(cueId, speaker));
    return corrected.ok ? { ok: true, value: null } : corrected;
  };
  return journalled<null>(env, ['cues', 'entries'], {
    label: 'Confirmed a speaker',
    touches: [`storyBible/cues/${cueId}`],
    run: correct(entryId),
    undo: correct(cue.speaker_entity_id ?? 'unknown'),
  });
}

/**
 * Makes a Story Bible entry from a selected name, or finds the entry that already has it (ignoring case), which journals
 * nothing. Undo deletes the new entry.
 */
export async function createEntryFrom(env: ScriptCommandEnv, category: string, text: string): Promise<Result<Done<string> & { created: boolean }>> {
  const name = text.trim();
  if (!name) return refuse('entry-name', 'Select a name first.');
  const low = name.toLowerCase();
  const entries = (await cached(env, 'entries')) ?? [];
  const found = entries.find((entry) => entry.canonical_name.toLowerCase() === low || entry.aliases.some((alias) => alias.text.toLowerCase() === low));
  if (found) return { ok: true, value: { value: found.id, entryId: null, created: false } };
  const result = await journalled<string>(env, ['entries'], {
    label: `Added “${name}” to the Story Bible`,
    touches: ['storyBible/entries'],
    run: () => attempt(() => env.storyBible.guideCreate(name, category, [])),
    undo: (id) => attempt(() => env.storyBible.guideDelete(id)),
  });
  return result.ok ? { ok: true, value: { ...result.value, created: true } } : result;
}
