import { Button } from '../../primitives/Button';
import { Heading } from '../../primitives/Heading';
import { Icon } from '../../primitives/Icon';
import { IconButton } from '../../primitives/IconButton';
import { Skeleton } from '../../primitives/Skeleton';
import { TooltipTarget } from '../../primitives/Tooltip';
import { fmtD, num } from '../../schedule/dates';
import { statusTone } from '../../../kinds/statusTone';
import { toneColors } from '../../primitives/StatusBadge';
import { deadlineTone, TONE_STATUS, type Calc, type Tone } from '../../schedule/progress';
import { VerdictPill } from '../../schedule/VerdictPill';
import { TimerChip, type RunningTimer } from '../../layout/TimerChip';

/** The due date's colour by its tone; the verdict pill beside it says the tone in words and a mark, so it is never told by colour alone. */
const TONE_COLOR: Record<Tone, string | null> = {
  neutral: null,
  success: toneColors(statusTone(TONE_STATUS.success)).text,
  warn: toneColors(statusTone(TONE_STATUS.warn)).text,
  danger: toneColors(statusTone(TONE_STATUS.danger)).text,
};

type Props = {
  /** The production log is still being read: the figures, due date and verdict are blocks, because nothing is known yet (not "0 chapters", not "No due date set"). The block is as tall as the figures-and-verdict line (24.3 px) it stands for, so the header does not change height when the figures arrive. */
  loading?: boolean;
  chapters: number;
  words: number;
  k: Calc;
  today: Date;
  due: Date | null;
  /** The record capability: Start session is disabled with its own reason under it, and a way to Settings when Settings is what fixes it. */
  record: { ok: boolean; reason: string; inSettings?: boolean };
  timerRunning: boolean;
  /** The running stage timer, drawn as a chip beside Stop timer (it was the app header's chip); null draws none. */
  timer?: RunningTimer | null;
  stopping?: boolean;
  onStopTimer: () => void;
  onStartSession: () => void;
  /** Opens the status report dialog (SN-P622). */
  onExport: () => void;
  onOpenSchedule: () => void;
  /** Opens Settings' DAW section, where recording is switched on. */
  onOpenSettings?: () => void;
};

/** The Production title, the book's figures and due date in their tone, the verdict, and the page's actions (the mock's `phead`). */
export function PageHeader({
  loading = false,
  chapters,
  words,
  k,
  today,
  due,
  record,
  timerRunning,
  timer,
  stopping,
  onStopTimer,
  onStartSession,
  onExport,
  onOpenSchedule,
  onOpenSettings,
}: Props) {
  const color = TONE_COLOR[deadlineTone(k)];
  const days = k.daysLeft === null ? null : `${Math.abs(k.daysLeft)} ${Math.abs(k.daysLeft) === 1 ? 'day' : 'days'}`;
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-[1_1_24rem] flex-col gap-2">
        <Heading title="Production" size="hero" />
        {loading ? (
          <Skeleton className="h-[1.52rem] w-96 max-w-full" />
        ) : (
          // The figures and the verdict on one line: the pill is the verdict of that line, not a row of its own (alignment audit XPR2-44).
          // The pill carries the verdict's word and mark, so the date is told here by its colour and the days only (XPR1-13).
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-[0.8125rem] text-[var(--text-muted)]">
              {chapters} chapters · {num(words)} words
              {due && days && (
                <>
                  {' '}
                  · delivery due <b style={color ? { color } : undefined}>{fmtD(due)}</b> ({days}
                  {k.daysLeft !== null && k.daysLeft < 0 ? ' past' : ''})
                </>
              )}
            </p>
            <TooltipTarget text="Open the schedule">
              {/* native-control-ok: the verdict pill is a badge that opens the Schedule; Button's chrome would replace the pill the mock draws. */}
              <button
                type="button"
                className="cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                onClick={onOpenSchedule}
              >
                <VerdictPill k={k} today={today} due={due} />
              </button>
            </TooltipTarget>
          </div>
        )}
      </div>
      {/* The actions wrap under the title on a narrow window instead of running off it (XPR2-2); why Start session is off is said once,
          on one line under the buttons, and not before the capabilities are read (XPR2-9, XPR2-41). */}
      <div className="flex max-w-full min-w-0 flex-col items-start gap-1.5 min-[640px]:items-end">
        <div className="flex flex-wrap items-center gap-2 min-[640px]:justify-end">
          {timer && <TimerChip timer={timer} />}
          {timerRunning && (
            <Button variant="secondary" pending={stopping} onClick={onStopTimer}>
              Stop timer
            </Button>
          )}
          <IconButton action="export" label="Export status report" onClick={onExport} />
          <Button variant="primary" disabled={!record.ok} onClick={onStartSession} aria-describedby={record.ok || loading ? undefined : 'start-session-reason'}>
            <Icon name="record" />
            Start session
          </Button>
        </div>
        {!record.ok && !loading && (
          <p id="start-session-reason" className="text-[0.8125rem] text-[var(--text-muted)] min-[640px]:text-right">
            {record.reason}
            {record.inSettings && onOpenSettings && (
              <>
                {' '}
                <Button variant="link" onClick={onOpenSettings}>
                  Open DAW settings
                </Button>
              </>
            )}
          </p>
        )}
      </div>
    </header>
  );
}
