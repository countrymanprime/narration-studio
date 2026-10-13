import { Icon } from '../../primitives/Icon';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { TooltipTarget } from '../../primitives/Tooltip';
import type { CheckCounts } from './overviewFigures';

type Props = {
  counts: CheckCounts;
  /** A chapter id's name for the tooltips. */
  nameOf: (chapterId: string) => string;
  /** Why the check cannot start (the DAW is unreachable); absent when it can. */
  unavailable?: string;
  onCheck: (chapterIds: string[]) => void;
};

function Row({ label, ids, nameOf, warn }: { label: string; ids: readonly string[]; nameOf: (id: string) => string; warn?: boolean }) {
  const names = ids.length ? ids.map(nameOf).join(', ') : 'No chapters';
  return (
    <TooltipTarget text={names} className="w-full">
      {/* flex-1: the trigger is inline-flex, so the row fills it and the count sits at the right, as This week's figures do. */}
      <div
        role="group"
        aria-label={`${label}: ${ids.length}. ${names}`}
        className="flex flex-1 items-baseline justify-between gap-3 text-[0.875rem]"
        tabIndex={0}
      >
        <span>{label}</span>
        <b className="font-mono" style={ids.length && warn ? { color: 'var(--warn-text)' } : undefined}>
          {ids.length}
        </b>
      </div>
    </TooltipTarget>
  );
}

/** "Recording check": how many narration chapters are checked as of the last save, out of date, or never checked; the icon starts the check. */
export function CheckCountsCard({ counts, nameOf, unavailable, onCheck }: Props) {
  const needs = [...counts.stale, ...counts.never];
  const reason = unavailable ?? (needs.length ? undefined : 'Every chapter is checked as of the last save');
  return (
    <Panel
      title="Recording check"
      className="min-w-0"
      actions={
        <TooltipTarget text={reason ?? 'Check recordings'}>
          <IconButton label="Check recordings" aria-haspopup="dialog" disabledReason={reason} onClick={() => onCheck(needs)}>
            <Icon name="checkRecordings" />
          </IconButton>
        </TooltipTarget>
      }
    >
      <div className="flex flex-col gap-2">
        <Row label="Checked, as of last save" ids={counts.current} nameOf={nameOf} />
        <Row label="Out of date" ids={counts.stale} nameOf={nameOf} warn />
        <Row label="Not checked yet" ids={counts.never} nameOf={nameOf} />
      </div>
    </Panel>
  );
}
