import type { DawResult } from '../../../api/contracts/daw';
import type { EditStackMode, EditStacksApi } from '../../../api/contracts/editStacks';
import type { DawClient, StackGroup } from '../../../ports/daw';
import type { Command, Result } from '../../../studio/journal/createJournal';
import type { StackPlan } from '../model/stacking';
import type { StackActing } from './stackPlan';
import { NO_BACKUP, plural } from './stackText';

type PlanGroup = StackPlan['groups'][number];

/** A step run before a `steps` DAW is asked, for the whole region at once; a refusal stops the stack with nothing changed. */
export interface BeforeStackStep {
  name: string;
  run(context: { chapterId: string; region: { start: number; end: number }; label: string }): Promise<Result<{ backupId: string }>>;
}

/** The steps a DAW that stacks in several edits runs first. The backup slice appends its backup here; with none, such a stack is refused. */
export const beforeStack: BeforeStackStep[] = [];

export interface StackDeps {
  daw: Pick<DawClient, 'stackTakes' | 'unstackTakes'>;
  log: Pick<EditStacksApi, 'editingStackRecord' | 'editingStackRemove'>;
  /** Called after the records change, so the page reads the chapter's stacks again. */
  onChange: () => void;
}

export interface StackAsk {
  chapterId: string;
  plan: StackPlan;
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const refusal = (code: string, reason: string): Result<never> => ({ ok: false, refusal: { code, reason } });
const failed = (e: unknown): DawResult => ({ ok: false, changed: false, message: why(e), undoSteps: 0, refused: why(e) });
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The group as the DAW port takes it. Only the passage ids reach the host, which rebuilds the items, moves and shift itself. */
const groupOf = (g: PlanGroup): StackGroup => ({ passageId: g.passage.id, itemGuid: '', base: g.base.id, moves: g.moves });
const modeOf = (how: StackActing): EditStackMode => (how.kind === 'recorder' ? 'app' : how.kind === 'steps' ? 'steps' : 'native');

export interface StackDone {
  message: string;
  takes: number;
}

/**
 * Stacks the retries of the planned passages as one history entry. The DAW is asked first (a `steps` DAW after a backup; the built-in recorder
 * is not asked at all), and only a stack it accepted is recorded through the Editing records, one record for each passage. A refusal records
 * nothing. A stack is not undoable in the app (the undo-inverse table, row 43), so the entry refuses Undo with the DAW to undo it in.
 */
export function stackCommand(deps: StackDeps, how: StackActing, ask: StackAsk): Command<StackDone> {
  const { chapterId, plan } = ask;
  return {
    label: `Stacked ${plural(plan.takes, 'retry', 'retries')} as takes`,
    touches: [`editing/${chapterId}/stacks`],
    daw: how.kind !== 'recorder',
    async run() {
      let backupId: string | undefined;
      if (how.kind === 'steps') {
        if (!beforeStack.length || !plan.region) return refusal('no_backup', NO_BACKUP);
        for (const step of beforeStack) {
          const done = await step.run({ chapterId, region: plan.region, label: 'Stack retries as takes' });
          if (!done.ok) return done;
          backupId = done.value.backupId;
        }
      }
      const res: DawResult =
        how.kind === 'recorder'
          ? { ok: true, changed: true, message: `Stacked ${plural(plan.takes, 'take', 'takes')} in the app.`, undoSteps: 0 }
          : await deps.daw.stackTakes({ chapterId, groups: plan.groups.map(groupOf), shift: plan.shift }).catch(failed);
      if (!res.ok) return refusal(res.code ?? 'daw_refused', res.refused ?? res.message);
      try {
        for (const g of plan.groups) {
          await deps.log.editingStackRecord(chapterId, {
            passageId: g.passage.id,
            base: g.base.id,
            takes: g.passage.takes.map((t) => t.id),
            moves: g.moves.map((m) => ({ takeId: m.takeId, offset: round1(m.from - g.base.start) })),
            mode: modeOf(how),
            undoSteps: res.undoSteps,
            ...(res.steps?.length ? { steps: [...res.steps] } : {}),
            ...(backupId ? { backupId } : {}),
          });
        }
      } catch (e) {
        return refusal('record_failed', `${why(e)} ${how.dawName} stacked the takes: undo it there (Edit > Undo).`);
      } finally {
        deps.onChange();
      }
      return { ok: true, value: { message: res.message, takes: plan.takes } };
    },
    notUndoableReason: how.kind === 'recorder' ? 'Un-stack the takes to put them back.' : `Undo it in ${how.dawName}.`,
  };
}

/**
 * Puts stacked takes back where they were recorded, as one history entry. The DAW is asked first with the positions the record gave; only when
 * it accepts are the records forgotten. A refusal removes nothing.
 */
export function unstackCommand(deps: StackDeps, how: StackActing, ask: StackAsk): Command<StackDone> {
  const { chapterId, plan } = ask;
  return {
    label: `Moved ${plural(plan.takes, 'take', 'takes')} back to where ${plan.takes === 1 ? 'it was' : 'they were'} recorded`,
    touches: [`editing/${chapterId}/stacks`],
    daw: how.kind !== 'recorder',
    async run() {
      const res: DawResult =
        how.kind === 'recorder'
          ? { ok: true, changed: true, message: `Moved ${plural(plan.takes, 'take', 'takes')} back in the app.`, undoSteps: 0 }
          : await deps.daw.unstackTakes({ chapterId, groups: plan.groups.map(groupOf), shift: plan.shift }).catch(failed);
      if (!res.ok) return refusal(res.code ?? 'daw_refused', res.refused ?? res.message);
      try {
        for (const g of plan.groups) {
          await deps.log.editingStackRemove(
            chapterId,
            g.passage.id,
            g.moves.map((m) => m.takeId),
          );
        }
      } catch (e) {
        return refusal('record_failed', `${why(e)} ${how.dawName} moved the takes back: the record of the stack is still kept.`);
      } finally {
        deps.onChange();
      }
      return { ok: true, value: { message: res.message, takes: plan.takes } };
    },
    notUndoableReason: how.kind === 'recorder' ? 'Stack the retries again to redo it.' : `Undo it in ${how.dawName}.`,
  };
}

/** Hides the reads that were not kept, in the DAW, and never deletes. A DAW that changed nothing is a refusal, so no entry is made. */
export function cleanUpCommand(
  daw: Pick<DawClient, 'hideTakes'>,
  line: { id: string; chapterId: string; firstToken: number; lastToken: number },
  keptId: string,
  count: number,
  dawName: string,
): Command<DawResult> {
  return {
    label: `Hid ${plural(count, 'other read', 'other reads')}`,
    touches: [`takes/${line.id}`],
    daw: true,
    async run() {
      const res = await daw.hideTakes(line.chapterId, line.firstToken, line.lastToken, keptId).catch(failed);
      if (!res.ok || !res.changed) return refusal(res.code ?? 'daw_refused', res.refused ?? res.message);
      return { ok: true, value: res };
    },
    notUndoableReason: `Undo the hide in ${dawName}.`,
  };
}
