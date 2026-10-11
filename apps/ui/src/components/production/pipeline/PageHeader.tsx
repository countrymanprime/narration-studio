import { Button } from '../../primitives/Button';
import { Heading } from '../../primitives/Heading';
import { Icon } from '../../primitives/Icon';
import { IconButton } from '../../primitives/IconButton';
import { TooltipTarget } from '../../primitives/Tooltip';
import { fmtD, num } from '../../schedule/dates';
import { deadlineTone, type Calc, type Tone } from '../../schedule/progress';
import { VerdictPill } from '../../schedule/VerdictPill';

/** The tone as a word and a shape, beside its colour, so the due date is never told by colour alone. */
const TONE_MARK: Record<Tone, { glyph: string; word: string; color: string } | null> = {
  neutral: null,
  success: { glyph: '✓', word: 'finished', color: 'var(--ok-text)' },
  warn: { glyph: '!', word: 'due soon', color: 'var(--warn-text)' },
  danger: { glyph: '✕', word: 'overdue or behind', color: 'var(--danger-text)' },
};

type Props = {
  chapters: number;
  words: number;
  k: Calc;
  today: Date;
  due: Date | null;
  /** The record capability: Start session is disabled with its own reason beside it. */
  record: { ok: boolean; reason: string };
  timerRunning: boolean;
  stopping?: boolean;
  onStopTimer: () => void;
  onStartSession: () => void;
  /** Opens the status report dialog (SN-P622). */
  onExport: () => void;
  onOpenSchedule: () => void;
};

/** The Production title, the book's figures and due date in their tone, the verdict, and the page's actions (the mock's `phead`). */
export function PageHeader({ chapters, words, k, today, due, record, timerRunning, stopping, onStopTimer, onStartSession, onExport, onOpenSchedule }: Props) {
  const tone = deadlineTone(k);
  const mark = TONE_MARK[tone];
  const days = k.daysLeft === null ? null : `${Math.abs(k.daysLeft)} ${Math.abs(k.daysLeft) === 1 ? 'day' : 'days'}`;
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-[1_1_24rem] flex-col gap-2">
        <Heading title="Production" />
        <p className="text-[0.8125rem] text-[var(--text-muted)]">
          {chapters} chapters · {num(words)} words ·{' '}
          {due && days ? (
            <>
              delivery due <b style={mark ? { color: mark.color } : undefined}>{fmtD(due)}</b> ({days}
              {k.daysLeft !== null && k.daysLeft < 0 ? ' past' : ''}
              {mark && (
                <span style={{ color: mark.color }}>
                  {' '}
                  · <span aria-hidden="true">{mark.glyph}</span> {mark.word}
                </span>
              )}
              )
            </>
          ) : (
            'no delivery date set'
          )}
        </p>
        <div>
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
      </div>
      <div className="flex flex-none flex-wrap items-center gap-2">
        {timerRunning && (
          <Button variant="secondary" pending={stopping} onClick={onStopTimer}>
            Stop timer
          </Button>
        )}
        <IconButton action="export" label="Export status report" onClick={onExport} />
        <Button variant="primary" disabled={!record.ok} onClick={onStartSession} aria-describedby={record.ok ? undefined : 'start-session-reason'}>
          <Icon name="record" />
          Start session
        </Button>
        {!record.ok && (
          <span id="start-session-reason" className="max-w-[24ch] text-[0.8125rem] text-[var(--text-muted)]">
            {record.reason}
          </span>
        )}
      </div>
    </header>
  );
}
