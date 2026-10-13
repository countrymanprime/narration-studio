import type { ReactNode } from 'react';
import type { ChapterStatus } from '../../../api/contracts/manuscript';
import { Button } from '../../primitives/Button';
import { hm } from '../../schedule/dates';
import { rankNextUp, type NextItem, type NextUpInputs } from './nextUpRanking';
import type { GoTarget } from './pipelineRows';

type Props = {
  inputs: NextUpInputs;
  /** The record capability, from `DawClient.capabilities`: its own sentence sits beside Open Booth, which stays open to read and prepare. No branch on which DAW. */
  record: { ok: boolean; reason: string };
  onGo: (target: GoTarget, chapterId?: string) => void;
  /** Review the chapters a new manuscript changed. Absent where the host reports none. */
  onReviewChanges?: () => void;
  /** The stage timer. A timer is started from the item of the chapter being recorded and hidden while one runs. */
  timer: { running: boolean; starting?: string; onStart: (chapterId: string, stage: ChapterStatus) => void };
};

/** The disc's colours by what the item is (the mock: copper for recording, danger for pickups and a failed check, warn for changes). */
const DISC = {
  rec: { background: 'var(--accent-soft)', color: 'var(--accent-strong)' },
  danger: { background: 'var(--danger-soft)', color: 'var(--danger-text)' },
  warn: { background: 'var(--warn-soft)', color: 'var(--warn-text)' },
} as const;

function Item({ icon, tone, title, sub, children }: { icon: string; tone: keyof typeof DISC; title: ReactNode; sub: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3 border-t border-[var(--border)] py-3 first:border-t-0">
      <span
        aria-hidden="true"
        data-tone={tone}
        className="mt-0.5 flex size-6 flex-none items-center justify-center rounded-full text-[0.8rem]"
        style={DISC[tone]}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div>
          <span className="block text-[0.9375rem] leading-[1.35] font-semibold [overflow-wrap:anywhere]">{title}</span>
          <span className="block text-[0.8125rem] leading-[1.4] [overflow-wrap:anywhere] text-[var(--text-muted)]">{sub}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </li>
  );
}

function Rendered({ item, record, onGo, onReviewChanges, timer }: Omit<Props, 'inputs'> & { item: NextItem }) {
  switch (item.kind) {
    case 'rec': {
      const left =
        item.hoursLeft === null
          ? 'recording in progress'
          : `${Math.round((item.share ?? 0) * 100)}% recorded · about ${hm(item.hoursLeft)} of finished audio left`;
      return (
        <Item icon="●" tone="rec" title={`Finish recording ${item.name}`} sub={left}>
          {/* Opening the Booth to read and prepare is navigation; only Record needs the capability (the Booth gates that itself). */}
          <Button variant="primary" size="sm" onClick={() => onGo('booth', item.chapterId)}>
            Open Booth
          </Button>
          {!record.ok && <span className="text-[0.8125rem] text-[var(--text-muted)]">{record.reason}</span>}
          {!timer.running && (
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Start timer on ${item.name}`}
              pending={timer.starting === item.chapterId}
              disabled={timer.starting !== undefined && timer.starting !== item.chapterId}
              onClick={() => timer.onStart(item.chapterId, item.chapterStage)}
            >
              Start timer
            </Button>
          )}
        </Item>
      );
    }
    case 'pick':
      return (
        <Item icon="↺" tone="danger" title={`Pickup session · ${item.lines} lines`} sub={`${item.chapters.join(' and ')} · match mic, gain and position first`}>
          <Button variant="secondary" size="sm" onClick={() => onGo('pickups')}>
            Review pickups
          </Button>
        </Item>
      );
    case 'fail':
      return (
        <Item
          icon="◠"
          tone="danger"
          title={`${item.tag} fails ${item.fails.length} ACX ${item.fails.length > 1 ? 'checks' : 'check'}`}
          sub={item.fails.join(' · ')}
        >
          <Button variant="secondary" size="sm" onClick={() => onGo('master', item.chapterId)}>
            Inspect failed check
          </Button>
        </Item>
      );
    case 'flags':
      return (
        <Item
          icon="!"
          tone="warn"
          title={`${item.count} ${item.count > 1 ? 'chapters' : 'chapter'} changed by the new manuscript`}
          sub={item.names.join(' · ')}
        >
          <Button variant="secondary" size="sm" onClick={onReviewChanges}>
            Review changes
          </Button>
        </Item>
      );
  }
}

/** What to do next, ranked by risk to the due date (the mock's NextUp). */
export function NextUp({ inputs, record, onGo, onReviewChanges, timer }: Props) {
  const items = rankNextUp(inputs).filter((item) => item.kind !== 'flags' || onReviewChanges);
  if (items.length === 0) return <p className="py-5 text-center text-[0.875rem] text-[var(--text-muted)]">Nothing needs you right now.</p>;
  return (
    <ol aria-label="Next up">
      {items.map((item) => (
        <Rendered key={item.kind} item={item} record={record} onGo={onGo} onReviewChanges={onReviewChanges} timer={timer} />
      ))}
    </ol>
  );
}
