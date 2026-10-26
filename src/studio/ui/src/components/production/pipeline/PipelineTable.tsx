import type { StageChapterRecommendation } from '../../../types';
import type { ChapterStatus } from '../../../api/contracts/manuscript';
import { statusTone, type StatusId } from '../../../kinds/statusTone';
import { badgeClass, badgeStyle, toneColors } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { TooltipTarget } from '../../primitives/Tooltip';
import type { Notify } from '../../primitives/Toast';
import { openReadiness } from '../readiness/openReadiness';
import { ReadinessChip } from '../readiness/ReadinessChip';
import {
  cellName,
  COLUMN_LABEL,
  NOT_STARTED_PREP,
  UNDER_WAY,
  type CellKind,
  type GoTarget,
  type PipelineCell,
  type PipelineColumn,
  type PipelineRow,
  type RecordedFigure,
} from './pipelineRows';
import { CHANGE_HIGHLIGHT_CLASSES } from '../../primitives/changeHighlight';

/** What a cell says, as a registry status: open pickups are a thing still to do (D10); the other open cell is a failed delivery check. */
const cellStatus = (cell: PipelineCell): StatusId => {
  const byKind: Record<Exclude<CellKind, 'open'>, StatusId> = { done: 'done', progress: 'in_progress', none: 'not_started' };
  return cell.kind === 'open' ? (cell.column === 'pickups' ? 'open_pickup' : 'fail') : byKind[cell.kind];
};
/**
 * The columns (Table `columns`): every stage column holds a 52 px cell and 4 px either side, the last also the card's 16 px edge, and
 * Rec. / Est. holds the recorded length over "of" the estimate, "10:42" or a two-word state on top (the mock's 80 px stage columns left
 * 28 px of air around each cell and squeezed the chapter names to two to five lines, alignment audit XPR2-10; one stacked column
 * rather than two keeps the names their 300 px at 1440). Chapter takes the rest, and the table never goes below a 10 rem name column:
 * under that it scrolls inside its card with the names pinned at the left (R4TA-1).
 */
const STAGE_WIDTH = '3.75rem';
const COLUMNS = ['auto', '4.75rem', ...Array<string>(6).fill(STAGE_WIDTH), '4.5rem'];
const STAGE_COLUMNS: readonly PipelineColumn[] = ['prep', 'record', 'edit', 'proof', 'pickups', 'master', 'qc'];
// Important: the cell's own 10 px padding is the same specificity and comes later in the stylesheet. The last column keeps its 16 px card edge.
const STAGE_CELL = 'px-1! last:pr-4!';
/** The names stay in view while the stages scroll under them, on the card's own colour. */
const STICKY_NAME = 'sticky left-0 z-[1] bg-[var(--surface)]';

/** A disc half filled, drawn with CSS so it reads the same in every font. */
const underWayMark = (
  <span
    data-under-way=""
    aria-hidden="true"
    className="inline-block size-2.5 rounded-full border border-current [background:linear-gradient(90deg,currentColor_50%,transparent_50%)]"
  />
);
/** An empty circle, for prep not started. */
const notStartedMark = <span data-not-started="" aria-hidden="true" className="inline-block size-2.5 rounded-full border border-current" />;
const textOf = (cell: PipelineCell) => (cell.text === UNDER_WAY ? underWayMark : cell.text === NOT_STARTED_PREP ? notStartedMark : cell.text);

function StageCell({
  row,
  cell,
  onGo,
  beside = false,
}: {
  row: PipelineRow;
  cell: PipelineCell;
  onGo: (target: GoTarget, chapterId: string) => void;
  /** The readiness chip shares the cell: the stage cell gives up its 52 px minimum and takes what the chip leaves. */
  beside?: boolean;
}) {
  const colors = toneColors(statusTone(cellStatus(cell)));
  // The mock fills an empty cell (`.cell`, --raised) rather than outlining it.
  const look = 'soft';
  // The mock's `.cell` is `width: 100%` of its column; the shape itself is only a minimum.
  const classes = `${badgeClass('cell')} w-full ${beside ? 'min-w-0! px-0!' : ''}`;
  if (!cell.go) {
    return (
      <TooltipTarget text={cell.tip} className={beside ? 'min-w-0' : 'w-full'}>
        <span className={classes} style={badgeStyle(colors, look)} aria-label={cellName(row.name, cell)} role="img">
          {textOf(cell)}
        </span>
      </TooltipTarget>
    );
  }
  return (
    <TooltipTarget text={cell.tip} className={beside ? 'min-w-0' : 'w-full'}>
      {/* native-control-ok: a flat cell-shaped badge that is a button; Button's padded uppercase chrome and IconButton's square do not draw the mock's cell. */}
      <button
        type="button"
        data-cell={cell.column}
        aria-label={cellName(row.name, cell)}
        className={`${classes} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]`}
        style={badgeStyle(colors, look)}
        onClick={() => onGo(cell.target, row.id)}
      >
        <span aria-hidden="true">{textOf(cell)}</span>
      </button>
    </TooltipTarget>
  );
}

/** The Rec. / Est. cell: the measured clock (or a muted state word, never a 0 for unknown) over "of" the estimate. One image, named in full. */
function RecordedCell({ figure, estimate }: { figure: RecordedFigure; estimate: string }) {
  return (
    <TooltipTarget text={figure.tip}>
      <span role="img" aria-label={figure.label} data-recorded={figure.kind} className="flex flex-col items-end leading-[1.2]">
        <span className={figure.kind === 'none' ? 'font-sans text-[0.75rem] whitespace-normal text-[var(--text-muted)]' : undefined}>{figure.text}</span>
        <span data-estimate="" className="text-[0.6875rem] text-[var(--text-muted)]">
          {estimate === '—' ? 'no est.' : `of ${estimate}`}
        </span>
      </span>
    </TooltipTarget>
  );
}

type TableProps = {
  rows: readonly PipelineRow[];
  /** The readiness of each chapter; a chapter without one draws no chip. */
  recommendations: ReadonlyMap<string, StageChapterRecommendation>;
  /** A cell goes to the page for its stage and chapter. The components import no router. */
  onGo: (target: GoTarget, chapterId: string) => void;
  /** Where the readiness panel says what a Confirm or Dismiss did. */
  notify: Notify;
  /** Hears the chapter status a Confirm or Revert set. */
  onStatus: (chapterId: string, status: ChapterStatus) => void;
  /** The chapter an action just changed: its row is highlighted once (changeHighlight.ts). */
  justChanged?: string | null;
  /** Opens a chapter's recording check, offered by its readiness panel when nothing has checked the recording yet. */
  onCheckRecording?: (chapterId: string) => void;
};

/** Every chapter and where it stands in each stage (the mock's PipelineTable). One format for every stage: a tick when done, the percent when under way, a dash when not started. */
export function PipelineTable({ rows, recommendations, onGo, notify, onStatus, justChanged = null, onCheckRecording }: TableProps) {
  return (
    // The table scrolls inside its panel at a narrow width, never the page, with a shadow on the side that has more (`scroll-x-edges`);
    // the region is a tab stop so the keyboard can scroll it.
    <div className="scroll-x-edges overflow-x-auto" tabIndex={0} role="group" aria-label="Chapter pipeline scroll area">
      <Table label="Chapter pipeline" columns={COLUMNS} className="min-w-[41.75rem]">
        <TableHead>
          <TableRow>
            <TableHeader className={STICKY_NAME}>Chapter</TableHeader>
            <TableHeader
              align="right"
              info="Rec.: the audio on the chapter's linked track in the saved project, before editing, or a word saying why there is none. Est.: its finished length estimated from its words at the planning rate, not a measurement."
            >
              Rec. / Est.
            </TableHeader>
            {STAGE_COLUMNS.map((column) => (
              <TableHeader key={column} className={STAGE_CELL}>
                {COLUMN_LABEL[column]}
              </TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const recommendation = recommendations.get(row.id);
            return (
              <TableRow
                key={row.id}
                data={row.id === justChanged ? { 'data-just-changed': '' } : undefined}
                className={row.id === justChanged ? CHANGE_HIGHLIGHT_CLASSES : ''}
              >
                {/* Broken between words, never inside one ("Caterpill / ar", R4SM-3). */}
                <TableCell className={`font-medium [overflow-wrap:break-word] ${STICKY_NAME}`}>{row.name}</TableCell>
                <TableCell numeric>
                  <RecordedCell figure={row.recorded} estimate={row.estimate} />
                </TableCell>
                {STAGE_COLUMNS.map((column) => {
                  const chip = recommendation && row.current === column;
                  return (
                    <TableCell key={column} className={STAGE_CELL}>
                      {chip ? (
                        // The verdict chip sits inside the cell for the stage the chapter is in, at its right end, so it never covers a row
                        // rule or the next column (XPR2-12, XPR1-34).
                        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
                          <StageCell row={row} cell={row.cells[column]} onGo={onGo} beside />
                          <ReadinessChip
                            recommendation={recommendation}
                            onOpen={() =>
                              openReadiness({ chapterId: row.id, notify, onStatus, onCheckRecording: onCheckRecording && (() => onCheckRecording(row.id)) })
                            }
                          />
                        </span>
                      ) : (
                        <StageCell row={row} cell={row.cells[column]} onGo={onGo} />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
