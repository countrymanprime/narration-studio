import { useRef } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import type { ProductionMilestone, ProductionPayment, ProductionPlan } from '../../api/contracts/production';
import { overlay } from '../../overlay/overlayService';
import { useOpenPickups } from '../pickups/useOpenPickups';
import { usePort } from '../../ports/usePort';
import type { Command, Journal } from '../../studio/journal/createJournal';
import { planStart, recordedSeries } from '../production/measured/measured.selectors';
import { ProgressChart } from '../production/overview/ProgressChart';
import { Button } from '../primitives/Button';
import { NeedManuscript } from '../layout/NeedManuscript';
import { Heading } from '../primitives/Heading';
import { IconButton } from '../primitives/IconButton';
import { Panel } from '../primitives/Panel';
import { ContractPanel } from './ContractPanel';
import { agoText, daysText, dueDateProblem, fmtDY, isIsoDate, parseIso } from './dates';
import { milestoneFromDraft } from './draft';
import { maxMinutes } from './measures';
import { MilestoneTable } from './MilestoneTable';
import { openMilestoneDialog } from './openMilestoneDialog';
import { WPH } from './estimates';
import { calc } from './progress';
import { useScheduleReading } from './useScheduleReading';
import { saveMilestonesCommand, setAmountCommand, setDueDateCommand, setPaymentCommand } from './scheduleCommands';
import { VerdictPill } from './VerdictPill';
import { WorkedOut } from './WorkedOut';

/** How long a write waits for the one before it to be answered, before it goes ahead anyway. */
export const WRITE_WAIT_MS = 15_000;

/** What the page needs of the command journal: run a change as one entry, take an entry back, and hear of a change made from elsewhere (the history panel's Undo). */
/** The topic of the page's refusals: a newer one replaces the old, and a change that goes through takes it away. */
const REFUSAL = 'schedule-refusal';

type ScheduleJournal = Pick<Journal, 'act' | 'undo' | 'subscribe'>;

export type SchedulePageProps = {
  journal: ScheduleJournal;
  /** The day the estimates start from. The page uses the real date; a test fixes it. */
  today?: Date;
  /** False when the project has no manuscript: the page asks for one whatever the estimates a cached word count could still give. */
  hasManuscript?: boolean;
  /** Opens the manuscript import from the empty state, when the shell offers one. */
  onImport?: () => void;
};

/**
 * The Schedule page body (the mock's Schedule): the verdict for the due date, the recorded audio against the plan, how the book pays, the work left and how it is worked out,
 * and the milestones. Every change is one journalled command, so one
 * undo step; a refusal from the host is shown as its own sentence and nothing is changed.
 */
export function SchedulePage({ journal, today, hasManuscript = true, onImport }: SchedulePageProps) {
  const production = usePort('production');
  const openLines = useOpenPickups();
  const { state, refreshFailure, day, reload, keepPlan, now } = useScheduleReading(today, journal);
  // Writes go one after another, each built from the newest plan, so two quick changes never start from the same old list.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // The rows whose change is on its way to the host: a second press on the same row while one is pending is the same press.
  const pending = useRef(new Set<string>());

  if (state.phase === 'loading') return <p role="status">Loading the schedule…</p>;
  if (state.phase === 'error')
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p style={{ color: 'var(--danger-text)' }}>{state.message}</p>
        <Button variant="secondary" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  const { plan, chapters, profileId, recordedHours, takeLog, readAt } = state;

  if (!hasManuscript || chapters.length === 0) return <NeedManuscript title="Schedule" onImport={onImport} />;

  /**
   * Runs a change as one journal entry, after the ones before it. `build` gets the newest plan; `stale` may refuse when what the narrator
   * acted on has changed since it was drawn. A refusal shows the host's sentence and changes nothing; the answer is the plan it left.
   */
  const run = (
    build: (latest: ProductionPlan) => Command<ProductionPlan>,
    undoText?: string,
    stale?: (latest: ProductionPlan) => string | undefined,
  ): Promise<string | undefined> => {
    // A host that never answers one write must not hold every later one forever: after a wait the next write goes ahead.
    const task = Promise.race([queue.current, new Promise((resolve) => window.setTimeout(resolve, WRITE_WAIT_MS))]).then(
      async (): Promise<string | undefined> => {
        // Every write starts from what the host holds now, not from what the page last drew: a list saved whole would otherwise overwrite another writer's.
        let latest: ProductionPlan;
        try {
          latest = await production.productionPlan();
        } catch (error) {
          const reason = `The schedule could not be read before the change, so nothing was changed: ${apiErrorMessage(error)}`;
          overlay.toast(reason, { tone: 'error', topic: REFUSAL });
          return reason;
        }
        const changed = stale?.(latest);
        if (changed) {
          overlay.toast(changed, { tone: 'error', topic: REFUSAL });
          return changed;
        }
        const result = await journal.act(build(latest));
        if (!result.ok) {
          overlay.toast(result.refusal.reason, { tone: 'error', topic: REFUSAL });
          return result.refusal.reason;
        }
        keepPlan(result.value.value);
        // A refusal is about the change before: once one goes through, it is no longer true.
        overlay.dismissTopic(REFUSAL);
        if (undoText)
          overlay.toastUndo(undoText, async () => {
            const undone = await journal.undo(result.value.id);
            await reload();
            return undone;
          });
        return undefined;
      },
    );
    queue.current = task.catch(() => undefined);
    return task;
  };
  const saveList = (
    label: string,
    milestones: (latest: ProductionMilestone[]) => ProductionMilestone[],
    undoText?: string,
    stale?: (latest: ProductionPlan) => string | undefined,
  ) => run((latest) => saveMilestonesCommand(production, label, latest, milestones(latest.milestones)), undoText, stale);

  // A plan edited by hand can hold a date that is not one; the page treats it as no due date and says so.
  const due = plan.deadline && isIsoDate(plan.deadline) ? parseIso(plan.deadline) : null;
  const k = calc(chapters, day, due, openLines?.length ?? 0);
  const bounds = { chapters: chapters.filter((c) => c.kind === 'narration').length, minutes: maxMinutes(k.words) };
  const same = (a: ProductionMilestone | undefined, b: ProductionMilestone | undefined) => JSON.stringify(a) === JSON.stringify(b);
  const sameList = (a: readonly ProductionMilestone[], b: readonly ProductionMilestone[]) => a.length === b.length && a.every((m, i) => same(m, b[i]));
  const CHANGED = 'The milestones changed since this was shown. Look at them again and redo it.';
  /** The row the narrator acted on is still at its place in the newest list, as it was drawn. */
  const rowMoved = (index: number, shown: ProductionMilestone) => (latest: ProductionPlan) => (same(latest.milestones[index], shown) ? undefined : CHANGED);
  const edit = (index: number | null, focus?: 'note') => {
    const opened = plan.milestones;
    const existing = index === null ? undefined : opened[index];
    openMilestoneDialog({
      existing,
      profileId,
      bounds,
      focusNote: focus === 'note',
      onSave: async (draft) => {
        const made = milestoneFromDraft(draft, existing, bounds);
        if ('refusal' in made) return made.refusal;
        // An edit saves the whole list, so one that changed since the dialog opened would be overwritten: refuse it. An add only appends.
        const stale = index === null ? undefined : (latest: ProductionPlan) => (sameList(latest.milestones, opened) ? undefined : CHANGED);
        return saveList(
          index === null ? 'Add milestone' : 'Edit milestone',
          (list) => (index === null ? [...list, made.milestone] : list.map((m, i) => (i === index ? made.milestone : m))),
          index === null ? 'Milestone added.' : undefined,
          stale,
        );
      },
    });
  };
  /** Runs a row's change unless the same row's is still pending. */
  const once = (key: string, change: () => Promise<unknown>) => {
    if (pending.current.has(key)) return;
    pending.current.add(key);
    void change().finally(() => pending.current.delete(key));
  };
  const toggleDone = (index: number) => {
    const m = plan.milestones[index];
    // A milestone that is not done carries no flag, as the host writes it.
    const next: ProductionMilestone = { ...m, done: !m.done };
    if (!next.done) delete next.done;
    void saveList(
      m.done ? `Mark ${m.name} open again` : `Mark ${m.name} done`,
      (list) => list.map((x, i) => (i === index ? next : x)),
      undefined,
      rowMoved(index, m),
    );
  };
  const remove = (index: number) => {
    const m = plan.milestones[index];
    once(`remove:${index}`, () => saveList(`Remove ${m.name}`, (list) => list.filter((_, i) => i !== index), `Removed ${m.name}.`, rowMoved(index, m)));
  };
  const changeDue = async (text: string): Promise<boolean> => {
    const problem = dueDateProblem(text);
    if (problem) {
      overlay.toast(problem, { tone: 'error', topic: REFUSAL });
      return false;
    }
    return (await run((latest) => setDueDateCommand(production, latest, text.trim()))) === undefined;
  };

  return (
    <div className="flex flex-col gap-4">
      {refreshFailure && (
        <div role="status" className="flex flex-wrap items-center gap-3 text-[0.88rem]" style={{ color: 'var(--danger-text)' }}>
          <span>{`Couldn't read the schedule again: ${refreshFailure}. This is what was read ${agoText(now - readAt)}.`}</span>
          <Button variant="secondary" onClick={() => void reload()}>
            Check again
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1.5">
          <Heading title="Schedule">
            {due && k.daysLeft !== null
              ? `Due ${fmtDY(due, day)} · ${daysText(k.daysLeft)}`
              : plan.deadline
                ? `The plan's due date, ${plan.deadline}, is not a real date`
                : 'No due date set'}
          </Heading>
        </div>
        <span className="flex-1" />
        <VerdictPill k={k} today={day} due={due} />
      </div>
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        <ProgressChart
          title="Recorded audio vs plan"
          clearTodayLabel
          height={280}
          fill
          k={k}
          wph={WPH}
          start={planStart(day)}
          today={day}
          due={due}
          recordedHours={recordedHours}
          series={recordedSeries(takeLog, planStart(day))}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <ContractPanel
            plan={plan}
            words={k.words}
            onPayment={(payment: ProductionPayment) => void run((latest) => setPaymentCommand(production, latest, payment))}
            onRefuse={(sentence) => overlay.toast(sentence, { tone: 'error', topic: REFUSAL })}
            onAccepted={() => overlay.dismissTopic(REFUSAL)}
            onAmount={(amount) => void run((latest) => setAmountCommand(production, latest, amount))}
          />
          <WorkedOut k={k} />
        </div>
      </div>
      <Panel title="Milestones" flush actions={<IconButton action="add" label="Add milestone" onClick={() => edit(null)} />}>
        <MilestoneTable
          milestones={plan.milestones}
          chapters={chapters}
          today={day}
          due={plan.deadline}
          onToggleDone={toggleDone}
          onEdit={edit}
          onRemove={remove}
          onDueChange={changeDue}
        />
      </Panel>
    </div>
  );
}
