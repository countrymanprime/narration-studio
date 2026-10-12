// The browser mock's stack record and retry choice. It keeps them in memory and checks them the way
// apps/desktop/internal/editlog/stacks.go does, with the host's sentences: a first read or a moved take the passage does not
// offer, an offset that is negative or not finite, no move, a take already stacked, a missing DAW result or an id shaped like a
// path is refused and nothing is saved; a partial un-stack removes some takes and the stack goes with its last; the retry mode
// resolves a passage's over its chapter's over the project's, and is `leave` by default.
import type {
  EditStackChange,
  EditStackList,
  EditStackRecordRequest,
  EditStacksApi,
  ManuscriptChapter,
  PassageStack,
  RetryLevel,
  RetryMode,
  RetryModeAnswer,
} from '../types';
import { STACK_MAX_ID, STACK_MAX_STEPS, STACK_MAX_TAKES, STACK_MAX_UNDO_STEPS } from './contracts/editStacks';
import { wireClone } from './mockFixtures';

const MAX_OFFSET = 7 * 24 * 3600;
const MAX_STEP_TEXT = 1000;

/** An id the host offered, never a path or markup (stacks.go plainID). */
const plainId = (id: string) => id !== '' && [...id].length <= STACK_MAX_ID && !/[\s\p{Cc}/\\<>\uFEFF]/u.test(id);

function checkResult(stack: EditStackRecordRequest): void {
  const missing = 'a stack is recorded only after the DAW stacked the takes: its result is missing';
  const undo = stack.undoSteps as number | null | undefined;
  if (typeof undo !== 'number' || !Number.isInteger(undo) || undo < 0 || undo > STACK_MAX_UNDO_STEPS) throw new Error(missing);
  if (stack.backupId !== undefined && stack.backupId !== '' && !plainId(stack.backupId)) throw new Error('a backup is named by the id the DAW gave it');
  const steps = stack.steps ?? [];
  if (steps.length > STACK_MAX_STEPS) throw new Error(`a stack's result can list at most ${STACK_MAX_STEPS} steps`);
  if (steps.some((step) => step.trim() === '' || [...step].length > MAX_STEP_TEXT || /\p{Cc}/u.test(step))) {
    throw new Error("each step of a stack's result must say what was done in one line");
  }
  switch (stack.mode) {
    case 'native':
      if (undo < 1 || steps.length > 0) throw new Error('a stack the DAW made itself is one undo step or more, and lists no steps');
      return;
    case 'app':
      if (steps.length > 0) throw new Error('a stack the app made lists no steps');
      return;
    case 'steps':
      if (undo < 1 || steps.length === 0 || !stack.backupId) throw new Error("a stack made in steps needs the DAW's steps and the backup taken before them");
      return;
    default:
      throw new Error(missing);
  }
}

function checkRequest(stack: EditStackRecordRequest): void {
  if (!plainId(stack.passageId)) throw new Error('that passage is not one the Takes panel offers');
  if (stack.takes.length > STACK_MAX_TAKES) throw new Error(`a passage can offer at most ${STACK_MAX_TAKES} takes`);
  if (!stack.takes.every(plainId)) throw new Error('a take is named by the id the Takes panel offers');
  const offered = new Set(stack.takes);
  if (!offered.has(stack.base)) throw new Error('the first read is not a take of this passage');
  if (stack.moves.length === 0) throw new Error('there are no takes to stack');
  const moved = new Set<string>();
  for (const move of stack.moves) {
    if (!offered.has(move.takeId)) throw new Error('that take is not a take of this passage');
    if (move.takeId === stack.base) throw new Error('the first read stays where it is: it is not stacked on itself');
    if (moved.has(move.takeId)) throw new Error('a take is stacked once');
    if (!Number.isFinite(move.offset) || move.offset < 0 || move.offset > MAX_OFFSET) {
      throw new Error("a stacked take's offset must be the seconds after the first read's start where it began");
    }
    moved.add(move.takeId);
  }
  checkResult(stack);
}

function checkScope(level: RetryLevel, chapterId: string, passageId: string): void {
  switch (level) {
    case 'project':
      if (chapterId !== '' || passageId !== '') throw new Error("the project's retry mode names no chapter or passage");
      return;
    case 'chapter':
      if (!plainId(chapterId) || passageId !== '') throw new Error("a chapter's retry mode names its chapter and no passage");
      return;
    case 'passage':
      if (!plainId(chapterId) || !plainId(passageId)) throw new Error("a passage's retry mode names its chapter and its passage");
      return;
    default:
      throw new Error('a retry mode is set for the project, a chapter or a passage');
  }
}

export function createEditStacksMock(ready: Promise<unknown>, chapters: () => ManuscriptChapter[]): EditStacksApi {
  let stacks: PassageStack[] = [];
  let project: RetryMode | '' = '';
  const chapterModes = new Map<string, RetryMode>();
  const passageModes = new Map<string, RetryMode>();
  const passageKey = (chapterId: string, passageId: string) => `${chapterId}\u0000${passageId}`;
  const hasChapter = (chapterId: string) => chapters().some((chapter) => chapter.id === chapterId);

  const list = (chapterId: string): EditStackList =>
    wireClone({
      chapterId,
      stacks: stacks.filter((stack) => stack.chapterId === chapterId).sort((x, y) => (x.passageId < y.passageId ? -1 : x.passageId > y.passageId ? 1 : 0)),
    });
  const change = (chapterId: string, changed: string[]): EditStackChange => ({ ...list(chapterId), changed: [...changed].sort() });

  const resolve = (level: RetryLevel, chapterId: string, passageId: string): RetryModeAnswer => {
    const answer: RetryModeAnswer = { level, mode: 'leave', from: 'default' };
    if (project) Object.assign(answer, { mode: project, from: 'project' });
    if (level === 'project') return project ? { ...answer, set: project } : answer;
    answer.chapterId = chapterId;
    const chapterMode = chapterModes.get(chapterId);
    if (chapterMode) Object.assign(answer, { mode: chapterMode, from: 'chapter' }, level === 'chapter' ? { set: chapterMode } : {});
    if (level === 'chapter') return answer;
    answer.passageId = passageId;
    const passageMode = passageModes.get(passageKey(chapterId, passageId));
    if (passageMode) Object.assign(answer, { mode: passageMode, from: 'passage', set: passageMode });
    return answer;
  };

  return {
    editingStacksList: async (chapterId) => {
      await ready;
      return list(chapterId);
    },
    editingStackRecord: async (chapterId, request) => {
      await ready;
      checkRequest(request);
      if (!hasChapter(chapterId)) throw new Error('that chapter is not in the manuscript');
      const existing = stacks.find((stack) => stack.passageId === request.passageId);
      if (existing && existing.chapterId !== chapterId) throw new Error('that passage is stacked in another chapter');
      if (existing && existing.base !== request.base) {
        throw new Error('this passage is already stacked on another first read: put those takes back first');
      }
      const offsets = { ...(existing?.offsets ?? {}) };
      for (const move of request.moves) {
        if (Object.hasOwn(offsets, move.takeId)) throw new Error('that take is already stacked on this passage, so nothing was saved');
        offsets[move.takeId] = move.offset;
      }
      if (Object.keys(offsets).length > STACK_MAX_TAKES) throw new Error(`a passage can have at most ${STACK_MAX_TAKES} stacked takes`);
      const stack: PassageStack = {
        id: `stk-${request.passageId}`,
        chapterId,
        passageId: request.passageId,
        base: request.base,
        offsets,
        mode: request.mode,
        undoSteps: request.undoSteps,
        ...(request.steps?.length ? { steps: [...request.steps] } : {}),
        ...(request.backupId ? { backupId: request.backupId } : {}),
        at: new Date().toISOString(),
      };
      stacks = [...stacks.filter((other) => other.passageId !== request.passageId), stack];
      return change(
        chapterId,
        request.moves.map((move) => move.takeId),
      );
    },
    editingStackRemove: async (chapterId, passageId, takeIds) => {
      await ready;
      if (takeIds.length === 0) throw new Error('choose the takes to put back first');
      if (takeIds.length > STACK_MAX_TAKES) throw new Error(`at most ${STACK_MAX_TAKES} takes can be put back at once`);
      const changed: string[] = [];
      stacks = stacks.flatMap((stack) => {
        if (stack.chapterId !== chapterId || stack.passageId !== passageId) return [stack];
        const offsets = { ...stack.offsets };
        for (const id of takeIds) {
          if (Object.hasOwn(offsets, id)) {
            delete offsets[id];
            changed.push(id);
          }
        }
        return Object.keys(offsets).length > 0 ? [{ ...stack, offsets }] : [];
      });
      return change(chapterId, changed);
    },
    editingRetryModeGet: async (level, chapterId, passageId) => {
      await ready;
      checkScope(level, chapterId, passageId);
      return resolve(level, chapterId, passageId);
    },
    editingRetryModeSet: async (level, chapterId, passageId, mode) => {
      await ready;
      checkScope(level, chapterId, passageId);
      if (mode !== '' && mode !== 'stack' && mode !== 'leave') throw new Error('retries are either stacked or left where they were recorded');
      if (level !== 'project' && !hasChapter(chapterId)) throw new Error('that chapter is not in the manuscript');
      if (level === 'project') project = mode;
      else if (level === 'chapter') {
        if (mode) chapterModes.set(chapterId, mode);
        else chapterModes.delete(chapterId);
      } else if (mode) passageModes.set(passageKey(chapterId, passageId), mode);
      else passageModes.delete(passageKey(chapterId, passageId));
      return resolve(level, chapterId, passageId);
    },
  };
}
