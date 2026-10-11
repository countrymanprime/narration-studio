import { apiErrorMessage } from '../../api/errorMessage';
import type { ProductionApi, ProductionMilestone, ProductionPayment, ProductionPlan } from '../../api/contracts/production';
import type { Command, Result } from '../../studio/journal/createJournal';

/** What the Schedule's commands call on the host. */
export type ScheduleApi = Pick<ProductionApi, 'saveProductionMilestones' | 'setProductionDeadline' | 'setProductionPayment'>;

/** Every Schedule change touches the plan, so two of them never undo out of order. */
const TOUCHES = ['production/plan'];

const refused = (error: unknown): Result<never> => ({ ok: false, refusal: { code: 'host_refused', reason: apiErrorMessage(error) } });

/** Runs a host write and answers the plan it answered, or the host's own sentence when it refused. */
async function write(call: () => Promise<ProductionPlan>): Promise<Result<ProductionPlan>> {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return refused(error);
  }
}

const undoWith = (call: () => Promise<ProductionPlan>) => async (): Promise<Result<unknown>> => write(call);

/** Replaces the milestones; the host checks them whole. Undo puts the earlier list back. One command, so one undo step. */
export function saveMilestonesCommand(api: ScheduleApi, label: string, before: ProductionPlan, milestones: ProductionMilestone[]): Command<ProductionPlan> {
  return {
    label,
    touches: TOUCHES,
    run: () => write(() => api.saveProductionMilestones(milestones)),
    undo: undoWith(() => api.saveProductionMilestones(before.milestones)),
  };
}

/** Sets the due date, keeping the contracted amount the plan has. */
export function setDueDateCommand(api: ScheduleApi, before: ProductionPlan, date: string): Command<ProductionPlan> {
  return {
    label: 'Change the due date',
    touches: TOUCHES,
    run: () => write(() => api.setProductionDeadline(date, before.contractedAmount)),
    undo: undoWith(() => api.setProductionDeadline(before.deadline ?? '', before.contractedAmount)),
  };
}

/** Sets the contracted amount (null clears it), keeping the due date. */
export function setAmountCommand(api: ScheduleApi, before: ProductionPlan, amount: number | null): Command<ProductionPlan> {
  return {
    label: 'Change the contracted amount',
    touches: TOUCHES,
    run: () => write(() => api.setProductionDeadline(before.deadline ?? '', amount)),
    undo: undoWith(() => api.setProductionDeadline(before.deadline ?? '', before.contractedAmount)),
  };
}

/** Sets how the book pays. The host clears the amount for a royalty share or none, so undo puts the amount back too. */
export function setPaymentCommand(api: ScheduleApi, before: ProductionPlan, payment: ProductionPayment): Command<ProductionPlan> {
  return {
    label: 'Change how the book pays',
    touches: TOUCHES,
    run: () => write(() => api.setProductionPayment(payment)),
    undo: undoWith(async () => {
      const plan = await api.setProductionPayment(before.payment ?? 'none');
      return before.contractedAmount === null ? plan : api.setProductionDeadline(before.deadline ?? '', before.contractedAmount);
    }),
  };
}
