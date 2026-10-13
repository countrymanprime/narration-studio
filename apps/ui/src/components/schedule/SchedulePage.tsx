import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import type { ProductionMilestone, ProductionPayment, ProductionPlan } from '../../api/contracts/production';
import { overlay } from '../../overlay/overlayService';
import { useOpenPickups } from '../pickups/useOpenPickups';
import { usePort } from '../../ports/usePort';
import type { Measured } from '../../api/schemas/base';
import type { TakeLogEntry } from '../../fixtures/measurements';
import type { Command, Journal } from '../../studio/journal/createJournal';
import { planStart, recordedSeries } from '../production/measured/measured.selectors';
import { ProgressChart } from '../production/overview/ProgressChart';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { IconButton } from '../primitives/IconButton';
import { Panel } from '../primitives/Panel';
import { ContractPanel } from './ContractPanel';
import { fmtD, isIsoDate, parseIso } from './dates';
import { milestoneFromDraft } from './draft';
import { maxMinutes } from './measures';
import { MilestoneTable } from './MilestoneTable';
import { openMilestoneDialog } from './openMilestoneDialog';
import { WPH } from './estimates';
import { calc, scheduleChapters, type ScheduleChapter } from './progress';
import { saveMilestonesCommand, setAmountCommand, setDueDateCommand, setPaymentCommand } from './scheduleCommands';
import { VerdictPill } from './VerdictPill';
import { WorkedOut } from './WorkedOut';

/** What the page needs of the command journal: run a change as one entry, and take an entry back. */
type ScheduleJournal = Pick<Journal, 'act' | 'undo'>;

export type SchedulePageProps = {
  journal: ScheduleJournal;
  /** The day the estimates start from. The page uses the real date; a test fixes it. */
  today?: Date;
  /** Opens the manuscript import from the empty state, when the shell offers one. */
  onImport?: () => void;
};

type Loaded = {
  plan: ProductionPlan;
  chapters: ScheduleChapter[];
  profileId: string | undefined;
  /** Finished hours recorded so far, summed over the narrated chapters whose length was measured. */
  recordedHours: number;
  /** The take log, or why it could not be read: the chart's recorded line is drawn from it. */
  takeLog: Measured<TakeLogEntry[]>;
};
type State = { phase: 'loading' } | { phase: 'error'; message: string } | ({ phase: 'ready' } & Loaded);

/** The platform a delivery profile key ("acx@2026-09") names. */
const platformIdOf = (projectProfile: string | undefined): string | undefined => projectProfile?.split('@')[0] || undefined;

/**
 * The Schedule page body (the mock's Schedule): the verdict for the due date, the recorded audio against the plan, how the book pays, the work left and how it is worked out,
 * and the milestones. Every change is one journalled command, so one
 * undo step; a refusal from the host is shown as its own sentence and nothing is changed.
 */
export function SchedulePage({ journal, today, onImport }: SchedulePageProps) {
  const production = usePort('production');
  const openLines = useOpenPickups();
  const deliveryProfiles = usePort('deliveryProfiles');
  const measurements = usePort('measurements');
  const [state, setState] = useState<State>({ phase: 'loading' });
  const day = useMemo(() => today ?? new Date(), [today]);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [plan, overview, profiles, log] = await Promise.all([
        production.productionPlan(),
        production.productionOverview(),
        // The profile only decides which measures are offered; if it cannot be read the neutral profile applies.
        Promise.allSettled([deliveryProfiles.deliveryProfiles()]),
        // The take log only draws the chart's recorded line; a refused read leaves the line out with its reason.
        measurements.takeLog().catch((error: unknown): Measured<TakeLogEntry[]> => ({ ok: false, reason: apiErrorMessage(error) })),
      ]);
      const read = profiles[0];
      setState({
        phase: 'ready',
        plan,
        chapters: scheduleChapters(overview.chapters),
        profileId: platformIdOf(read.status === 'fulfilled' ? read.value.projectProfile : undefined),
        recordedHours: overview.chapters.filter((c) => c.contentKind !== 'reference').reduce((a, c) => a + (c.recordedSeconds ?? 0), 0) / 3600,
        takeLog: log,
      });
    } catch (error) {
      setState({ phase: 'error', message: `The schedule could not be read: ${apiErrorMessage(error)}` });
    }
  }, [production, deliveryProfiles, measurements]);
  useEffect(() => void load(), [load]);

  if (state.phase === 'loading') return <p role="status">Loading the schedule…</p>;
  if (state.phase === 'error')
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p style={{ color: 'var(--danger-text)' }}>{state.message}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  const { plan, chapters, profileId, recordedHours, takeLog } = state;
  const keep = (next: ProductionPlan) => setState({ ...state, plan: next });

  if (chapters.length === 0)
    return (
      <Panel title="Schedule">
        <div className="flex flex-col items-start gap-3">
          <p>This project has no manuscript yet. Import one to begin.</p>
          {onImport && <Button onClick={onImport}>Import manuscript</Button>}
        </div>
      </Panel>
    );

  /** Runs a change as one journal entry. A refusal shows the host's sentence and changes nothing; the answer is the plan it left. */
  const run = async (command: Command<ProductionPlan>, undoText?: string): Promise<string | undefined> => {
    const result = await journal.act(command);
    if (!result.ok) {
      overlay.toast(result.refusal.reason, { tone: 'error' });
      return result.refusal.reason;
    }
    keep(result.value.value);
    if (undoText)
      overlay.toastUndo(undoText, async () => {
        const undone = await journal.undo(result.value.id);
        await load();
        return undone;
      });
    return undefined;
  };
  const saveList = (label: string, milestones: ProductionMilestone[], undoText?: string) =>
    run(saveMilestonesCommand(production, label, plan, milestones), undoText);

  const k = calc(chapters, day, plan.deadline ? parseIso(plan.deadline) : null, openLines?.length ?? 0);
  const bounds = { chapters: chapters.filter((c) => c.kind === 'narration').length, minutes: maxMinutes(k.words) };
  const edit = (index: number | null, focus?: 'note') => {
    const existing = index === null ? undefined : plan.milestones[index];
    openMilestoneDialog({
      existing,
      profileId,
      bounds,
      focusNote: focus === 'note',
      onSave: async (draft) => {
        const made = milestoneFromDraft(draft, existing, bounds);
        if ('refusal' in made) return made.refusal;
        const list = index === null ? [...plan.milestones, made.milestone] : plan.milestones.map((m, i) => (i === index ? made.milestone : m));
        return saveList(index === null ? 'Add milestone' : 'Edit milestone', list, index === null ? 'Milestone added.' : undefined);
      },
    });
  };
  const toggleDone = (index: number) => {
    const m = plan.milestones[index];
    // A milestone that is not done carries no flag, as the host writes it.
    const next: ProductionMilestone = { ...m, done: !m.done };
    if (!next.done) delete next.done;
    void saveList(
      m.done ? `Mark ${m.name} open again` : `Mark ${m.name} done`,
      plan.milestones.map((x, i) => (i === index ? next : x)),
    );
  };
  const remove = (index: number) => {
    const m = plan.milestones[index];
    void saveList(
      `Remove ${m.name}`,
      plan.milestones.filter((_, i) => i !== index),
      `Removed ${m.name}.`,
    );
  };
  const changeDue = (date: string) => {
    if (!isIsoDate(date)) return void overlay.toast('Write the due date as YYYY-MM-DD.', { tone: 'error' });
    void run(setDueDateCommand(production, plan, date));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1.5">
          <Heading title="Schedule">{plan.deadline ? `Due ${fmtD(parseIso(plan.deadline))} · ${k.daysLeft} days left` : 'No due date set'}</Heading>
        </div>
        <span className="flex-1" />
        <VerdictPill k={k} today={day} due={plan.deadline ? parseIso(plan.deadline) : null} />
      </div>
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        <ProgressChart
          title="Recorded audio vs plan"
          height={280}
          k={k}
          wph={WPH}
          start={planStart(day)}
          today={day}
          due={plan.deadline ? parseIso(plan.deadline) : null}
          recordedHours={recordedHours}
          series={recordedSeries(takeLog, planStart(day))}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <ContractPanel
            plan={plan}
            words={k.words}
            onPayment={(payment: ProductionPayment) => void run(setPaymentCommand(production, plan, payment))}
            onAmount={(amount) => void run(setAmountCommand(production, plan, amount))}
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
