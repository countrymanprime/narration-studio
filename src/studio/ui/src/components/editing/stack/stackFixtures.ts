import type { DawCapabilities } from '../../../api/contracts/daw';
import type { EditStackRecordRequest, EditStacksApi, PassageStack, RetryLevel, RetryMode, RetryModeAnswer } from '../../../api/contracts/editStacks';
import { DAW_SETUPS } from '../../../fixtures/daw';
import type { StackLine } from './types';

export const CHAPTER = 'chapter-1';

const take = (id: string, start: number, len: number) => ({ id, start, len });

/** A line of the script with the reads the stack works on. `p-1` has three reads, `p-2` two, `p-3` one. */
export const stackLine = (id: string, takes: ReturnType<typeof take>[], over: Partial<StackLine> = {}): StackLine => ({
  id,
  chapterId: CHAPTER,
  kept: false,
  keptId: null,
  hidden: [],
  script: `The words of ${id}.`,
  firstToken: 1,
  lastToken: 9,
  takes,
  ...over,
});

/** Two retry groups and a line read once, in the order of the chapter: the first moves the second up when stacked. */
export function chapterLines(): StackLine[] {
  return [
    stackLine('p-1', [take('t-1', 10, 4), take('t-2', 20, 4), take('t-3', 30, 4)]),
    stackLine('p-2', [take('t-4', 50, 5), take('t-5', 60, 5)]),
    stackLine('p-3', [take('t-6', 80, 3)]),
  ];
}

/** Audacity as it would be once stacking is built: several edits, and backups on or off. */
export function stepsCaps(backups: boolean): DawCapabilities {
  const audacity = DAW_SETUPS['audacity-backups'];
  return {
    ...audacity,
    capabilities: {
      ...audacity.capabilities,
      stack_takes: { level: 'experimental', available: true, mode: 'steps' },
      backups: backups
        ? { level: 'experimental', available: true }
        : { level: 'not_yet_available', available: false, reason: 'not_yet', message: 'Audacity keeps backups only when you turn them on.' },
    },
  };
}

/** The recorder as it would be once stacking is built: the app makes the change itself. */
export function recorderCaps(): DawCapabilities {
  return DAW_SETUPS.builtin;
}

/** The Editing records for stacks and retry choices, in memory, with every call recorded. */
export function fakeStackLog(opts: { refuseRecord?: string } = {}): EditStacksApi & { calls: string[]; stacks: PassageStack[]; modes: Map<string, RetryMode> } {
  const calls: string[] = [];
  const stacks: PassageStack[] = [];
  const modes = new Map<string, RetryMode>();
  const key = (level: RetryLevel, chapterId: string, passageId: string) =>
    level === 'project' ? 'project' : level === 'chapter' ? `c:${chapterId}` : `p:${passageId}`;
  const change = (chapterId: string, changed: string[]) => ({ chapterId, stacks: stacks.filter((s) => s.chapterId === chapterId), changed });
  const answer = (level: RetryLevel, chapterId: string, passageId: string): RetryModeAnswer => {
    const own = modes.get(key(level, chapterId, passageId));
    const inherited = level === 'passage' ? (modes.get(`c:${chapterId}`) ?? modes.get('project')) : level === 'chapter' ? modes.get('project') : undefined;
    return {
      level,
      ...(chapterId ? { chapterId } : {}),
      ...(passageId ? { passageId } : {}),
      mode: own ?? inherited ?? 'leave',
      from: own ? level : 'default',
      ...(own ? { set: own } : {}),
    };
  };
  return {
    calls,
    stacks,
    modes,
    editingStacksList: async (chapterId) => (calls.push(`list ${chapterId}`), change(chapterId, [])),
    editingStackRecord: async (chapterId, r: EditStackRecordRequest) => {
      calls.push(
        `record ${r.passageId} ${r.moves.map((m) => `${m.takeId}@${m.offset}`).join(',')} ${r.mode} undo=${r.undoSteps}${r.backupId ? ` backup=${r.backupId}` : ''}`,
      );
      if (opts.refuseRecord) throw new Error(opts.refuseRecord);
      stacks.push({
        id: `stk-${r.passageId}`,
        chapterId,
        passageId: r.passageId,
        base: r.base,
        offsets: Object.fromEntries(r.moves.map((m) => [m.takeId, m.offset])),
        mode: r.mode,
        undoSteps: r.undoSteps,
        ...(r.steps ? { steps: r.steps } : {}),
        ...(r.backupId ? { backupId: r.backupId } : {}),
        at: '2026-10-12T10:00:00Z',
      });
      return change(
        chapterId,
        r.moves.map((m) => m.takeId),
      );
    },
    editingStackRemove: async (chapterId, passageId, takeIds) => {
      calls.push(`remove ${passageId} ${takeIds.join(',')}`);
      const at = stacks.findIndex((s) => s.passageId === passageId);
      if (at >= 0) {
        for (const id of takeIds) delete stacks[at].offsets[id];
        if (!Object.keys(stacks[at].offsets).length) stacks.splice(at, 1);
      }
      return change(chapterId, takeIds);
    },
    editingRetryModeGet: async (level, chapterId, passageId) => answer(level, chapterId, passageId),
    editingRetryModeSet: async (level, chapterId, passageId, mode) => {
      calls.push(`mode ${level} ${mode || 'follow'}`);
      if (mode) modes.set(key(level, chapterId, passageId), mode);
      else modes.delete(key(level, chapterId, passageId));
      return answer(level, chapterId, passageId);
    },
  };
}
