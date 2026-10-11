import type { StageChapterRecommendation } from '../../../types';
import type { ChapterStatus } from '../../../api/contracts/manuscript';
import { badgeClass, badgeStyle, toneColors, type StatusTone } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { TooltipTarget } from '../../primitives/Tooltip';
import type { Notify } from '../../primitives/Toast';
import { openReadiness } from '../readiness/openReadiness';
import { ReadinessChip } from '../readiness/ReadinessChip';
import { cellName, COLUMN_LABEL, type CellKind, type GoTarget, type PipelineCell, type PipelineColumn, type PipelineRow } from './pipelineRows';

const KIND_TONE: Record<CellKind, StatusTone> = { done: 'success', progress: 'progress', open: 'danger', none: 'neutral' };
/** Every stage column is the same width; Fin. is narrower (the mock: 80 px and 64 px). */
const STAGE_WIDTH = '5rem';
const FIN_WIDTH = '4rem';
const STAGE_COLUMNS: readonly PipelineColumn[] = ['prep', 'record', 'edit', 'proof', 'pickups', 'master', 'qc'];

function StageCell({ row, cell, onGo }: { row: PipelineRow; cell: PipelineCell; onGo: (target: GoTarget, chapterId: string) => void }) {
  const colors = toneColors(KIND_TONE[cell.kind]);
  const look = cell.kind === 'none' ? 'outline' : 'soft';
  const classes = badgeClass('cell');
  if (!cell.go) {
    return (
      <TooltipTarget text={cell.tip}>
        <span className={classes} style={badgeStyle(colors, look)} aria-label={cellName(row.name, cell)} role="img">
          {cell.text}
        </span>
      </TooltipTarget>
    );
  }
  return (
    <TooltipTarget text={cell.tip}>
      {/* native-control-ok: a flat cell-shaped badge that is a button; Button's padded uppercase chrome and IconButton's square do not draw the mock's cell. */}
      <button
        type="button"
        data-cell={cell.column}
        aria-label={cellName(row.name, cell)}
        className={`${classes} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]`}
        style={badgeStyle(colors, look)}
        onClick={() => onGo(cell.target, row.id)}
      >
        <span aria-hidden="true">{cell.text}</span>
      </button>
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
};

/** Every chapter and where it stands in each stage (the mock's PipelineTable). One format for every stage: a tick when done, the percent when under way, a dash when not started. */
export function PipelineTable({ rows, recommendations, onGo, notify, onStatus }: TableProps) {
  return (
    // The table scrolls inside its panel at a narrow width, never the page; the region is a tab stop so the keyboard can scroll it.
    <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Chapter pipeline scroll area">
      <Table label="Chapter pipeline" className="min-w-[44rem] table-fixed">
        <colgroup>
          <col />
          <col style={{ width: FIN_WIDTH }} />
          {STAGE_COLUMNS.map((column) => (
            <col key={column} style={{ width: STAGE_WIDTH }} />
          ))}
        </colgroup>
        <TableHead>
          <TableRow>
            <TableHeader>Chapter</TableHeader>
            <TableHeader info="Estimated finished length at the planning rate. The measured length is in the Record cell's tip.">Fin.</TableHeader>
            {STAGE_COLUMNS.map((column) => (
              <TableHeader key={column}>{COLUMN_LABEL[column]}</TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const recommendation = recommendations.get(row.id);
            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium [overflow-wrap:anywhere]">{row.name}</TableCell>
                <TableCell numeric>{row.finished}</TableCell>
                {STAGE_COLUMNS.map((column) => {
                  const stage = <StageCell row={row} cell={row.cells[column]} onGo={onGo} />;
                  return (
                    <TableCell key={column}>
                      {recommendation && row.current === column ? (
                        // The verdict chip sits on the corner of the cell for the stage the chapter is in.
                        <span className="relative inline-flex">
                          {stage}
                          <span className="absolute -top-2 -right-2">
                            <ReadinessChip recommendation={recommendation} onOpen={() => openReadiness({ chapterId: row.id, notify, onStatus })} />
                          </span>
                        </span>
                      ) : (
                        stage
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
