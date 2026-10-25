import { useState } from 'react';
import type { MeasureJob } from '../../../types';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';
import { statusTone, type StatusId } from '../../../kinds/statusTone';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { ChapterState } from './chapterStates';
import { heardText } from './useHostRead';
import { ARRIVE_CLASSES } from '../../primitives/changeHighlight';

const STATUS = { ok: 'pass', bad: 'fail', wait: 'waiting' } as const satisfies Record<string, StatusId>;
const DANGER = { color: 'var(--danger-text)' };
const MUTED = { color: 'var(--text-muted)' };
/** A book of thousands of chapters would make a list as long as the book; this many rows show first, the rest on request. */
const FIRST_ROWS = 100;
/**
 * A row of the list, the summary and the loading blocks share one 32 px pitch with a hairline between rows, so the eye can follow a name
 * to its pill across the card; a long name wraps to two lines instead of being cut (alignment audit XDL-4, R4TB-8, R3DL-4).
 */
const ROW = 'flex min-h-8 items-center';
/** More rows than this (about 40 rem of them) scroll inside the card. */
const SCROLL_AFTER = 18;

/**
 * "Before you build" (the mock's aside): chapters passing n of N, then a row per chapter, named in the manuscript's heading style, that
 * opens it in Master & QC; the header's button opens Master & QC itself. While the chapters or the measurement cannot be read the page says
 * so, with when the host last answered and Check again, and keeps the last list it had (marked as possibly out of date) rather than
 * calling every chapter "Not mastered".
 */
export function Preflight({
  states,
  known,
  measuring,
  problem,
  lastHeard,
  onCheckAgain,
  onOpen,
  onOpenMaster,
}: {
  states: readonly ChapterState[];
  /** The chapters and the measurement have both been read at least once. */
  known: boolean;
  /** A measurement that is running now. */
  measuring?: MeasureJob;
  /** Why the latest read failed, in the host's words. */
  problem?: string;
  lastHeard?: number;
  onCheckAgain: () => void;
  onOpen: (chapterId: string) => void;
  onOpenMaster?: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? states : states.slice(0, FIRST_ROWS);
  return (
    <Panel title="Before you build" actions={onOpenMaster && <IconButton action="goTo" label="Open in Master & QC" onClick={onOpenMaster} />}>
      <div className="flex flex-col gap-1">
        {problem && (
          <p role="alert" className={`text-sm ${ARRIVE_CLASSES}`} style={DANGER}>
            Can't tell which chapters pass, {heardText(lastHeard)}: {problem}
            {known && ' The list below may be out of date.'}{' '}
            <Button variant="ghost" size="sm" onClick={onCheckAgain}>
              Check again
            </Button>
          </p>
        )}
        {measuring && (
          <p role="status" className="text-sm" style={MUTED}>
            {measuring.message || 'Measuring the files'} ({measuring.percent}%)
          </p>
        )}
        {/* The blocks are the list's own rows: a name and a pill on the list's pitch and rules (XDL-12). */}
        {!known && !problem && (
          <LoadingRegion label="Loading the chapter checks" status="Reading the chapters…" className="flex flex-col">
            {[0, 1, 2].map((row) => (
              <div key={row} className={`${ROW} justify-between`}>
                <Skeleton className="w-40" />
                <Skeleton className="w-20" />
              </div>
            ))}
          </LoadingRegion>
        )}
        {known && (
          <>
            <div className={`${ROW} justify-between text-sm`}>
              <span>Chapters passing</span>
              <b className="font-mono">
                {states.filter((state) => state.kind === 'ok').length} of {states.length}
              </b>
            </div>
            {/* A long book scrolls inside the card rather than running the page on for thousands of pixels (R3DL-4); a short one is not a
                scroll box, so no gutter is kept for a scrollbar it never shows. */}
            <ul
              className={`flex flex-col ${shown.length > SCROLL_AFTER ? 'max-h-[40rem] overflow-y-auto' : ''}`}
              aria-label="Chapters"
              tabIndex={shown.length > SCROLL_AFTER ? 0 : undefined}
            >
              {shown.map((state) => (
                <li key={state.id} className="border-t border-[var(--border)]">
                  <Button
                    variant="link"
                    onClick={() => onOpen(state.id)}
                    aria-label={`${state.name}: ${state.text}. Open in Master & QC`}
                    className={`${ROW} flex! w-full justify-between gap-2 py-1 text-left text-sm whitespace-normal! no-underline!`}
                  >
                    <span dir="auto" title={state.name} className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]">
                      {state.name}
                    </span>
                    {/* A space, so the text drawn reads "Chapter 01 Pass", words of the name: run together it fails axe's
                        label-content-name-mismatch. A flex box draws no space for it. */}{' '}
                    <StatusBadge tone={statusTone(STATUS[state.kind])} label={state.text} />
                  </Button>
                </li>
              ))}
            </ul>
            {shown.length < states.length && (
              <Button variant="secondary" size="sm" onClick={() => setAll(true)} className="self-start">
                Show the other {states.length - shown.length} {states.length - shown.length === 1 ? 'chapter' : 'chapters'}
              </Button>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
