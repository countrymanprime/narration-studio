import { useMemo, type ReactNode } from 'react';
import { useContextProvider, type ContextProvider } from '../../../registries/context';
import type { DeliveryProfile, MeasureFileResult } from '../../../types';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { PANEL_HEADER_CLASS } from '../../primitives/panelStyles';
import { statusTone } from '../../../kinds/statusTone';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import type { FileActions } from './FileActions';
import { buildChapterRows, buildRows, sharedWaiting, type Cell, type ChapterSlot, type FileRow } from './rows';
import { useDawGates, type Gate } from './useDawGates';
import { useMasterSelection } from './useMasterSelection';

/** The file a right-click landed on: the marker in the row's first cell. */
const fileIdOf = (target: Element): string | null => target.closest('tr')?.querySelector('[data-file]')?.getAttribute('data-file') ?? null;

const DANGER = { color: 'var(--danger-text)' };
const MUTED = { color: 'var(--text-muted)' };

/**
 * The column widths (`Table columns`): File takes what is left, every other column is fixed, so a long message or a long name wraps in its
 * own column and never moves the others between states (XMS-3, R4MS1-2). Each holds its heading and its longest value on one line ("Not
 * measured", "✕ 0.4 / ✕ 6.1"), the outer ones with the card's 16 px inset.
 * The table's own floor (`TABLE_FLOOR`) keeps File at least about 10rem: under it the table scrolls in its box rather than breaking a
 * chapter name a letter a line (XMS-1).
 */
const COLUMNS = ['auto', '4.5rem', '4.75rem', '4.75rem', '6rem', '6.5rem', '7.5rem'] as const;
const TABLE_FLOOR = 'min-w-[44rem]';
const NOWRAP = 'whitespace-nowrap';

const NOTHING_MEASURED = 'Nothing measured yet. Check your rendered chapter files (WAV) to see them here.';

/** A measured value; one the profile's rule did not meet is red, bold, marked with a cross and said in words for a screen reader. */
function Value({ cell }: { cell: Cell | undefined }) {
  if (!cell) return null;
  return (
    <span className={cell.missed ? 'font-semibold' : undefined} style={cell.missed ? DANGER : undefined}>
      {cell.missed && <span aria-hidden="true">✕ </span>}
      {cell.text}
      {cell.missed && <span className="sr-only"> (not met)</span>}
    </span>
  );
}

function Result({ row }: { row: FileRow }) {
  if (row.waiting) return <StatusBadge tone={statusTone(row.waitingPill === 'Measuring' ? 'checking' : 'waiting')} label={row.waitingPill ?? 'Waiting'} />;
  if (row.verdict === 'fail') return <StatusBadge tone={statusTone('fail')} label="Fail" icon="✕" />;
  if (row.verdict === 'pass') return <StatusBadge tone={statusTone('pass')} label="Pass" />;
  return <StatusBadge tone={statusTone('not_checked')} label="Not judged" />;
}

/**
 * The table panel's header row (the mock's `.ph`): `heading` (the page title, the chapter bar and the profile pill) at the left; at the
 * right the one refresh icon, "Check the files again". The page's run controls (`controls`, which the mock lacks) sit in a strip under it,
 * and under that the card's notices (`notices`: a run's progress, what could not be read, the lines rows share), each at the card's inset.
 */
function FilesHeader({
  heading,
  controls,
  notices,
  actions,
}: {
  heading?: ReactNode;
  controls?: ReactNode;
  notices: readonly ReactNode[];
  actions: Pick<FileActions, 'onRecheck'>;
}) {
  const gates = useDawGates();
  const gate: Gate = gates.recheck;
  return (
    <>
      <div className={PANEL_HEADER_CLASS}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">{heading}</div>
        <IconButton action="retry" label="Check the files again" disabledReason={gate.ok ? undefined : gate.reason} onClick={actions.onRecheck} />
      </div>
      {controls && <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[var(--border)] px-4 py-2 last:border-b-0">{controls}</div>}
      {notices.length > 0 && <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0">{notices}</div>}
    </>
  );
}

/**
 * Master & QC's per-file checks (the Studio Next mock's Master page): one row per file, each level red when the profile's rule on
 * it was not met, the Result column in words, and a row with no measurements saying what it waits on ("<reason> · not mastered").
 * The caller owns which file is selected (it is the shared chapter). Right-click on a row offers its checks through the context
 * provider; the actions themselves are the page's (`FileActions`).
 */
export function FilesTable({
  files,
  profile,
  slots,
  openPickups,
  heading,
  controls,
  notices = [],
  selected,
  onSelect,
  actions,
}: {
  files: readonly MeasureFileResult[];
  /** Without one (still being read) the panel holds its header only. */
  profile: DeliveryProfile | undefined;
  /** The chapters, credits and retail sample that each get a row; without them there is a row per file only. */
  slots?: readonly ChapterSlot[];
  /** Open pickups by chapter id (the Pickups page's list); a row with no file says how many it waits on. */
  openPickups?: Readonly<Record<string, number>>;
  /** The page title, chapter bar and profile pill, drawn in the panel's header. */
  heading?: ReactNode;
  /** The page's run controls, drawn beside the refresh icon. */
  controls?: ReactNode;
  /** The page's notices for this card (a run's progress, a read that failed), drawn under the controls; a falsy one is skipped. */
  notices?: readonly ReactNode[];
  selected: string | undefined;
  onSelect: (fileId: string) => void;
  actions: FileActions;
}) {
  const rows = useMemo(() => {
    if (!profile) return [];
    return slots ? buildChapterRows(files, profile, slots, openPickups) : buildRows(files, profile);
  }, [files, profile, slots, openPickups]);
  const { current, bind, onKeyDown } = useMasterSelection({ rows, selected, onSelect });
  // A message rows share is said once, in the card, and no row repeats it; with no file measured at all one line says so for every row.
  const shared = useMemo(() => sharedWaiting(rows), [rows]);
  const sharedTexts = useMemo(() => new Set(shared.map((group) => group.text)), [shared]);
  const notes = !profile
    ? []
    : files.length === 0
      ? [NOTHING_MEASURED, ...shared.filter((group) => !rows.some((row) => row.noFile && row.waiting === group.text)).map((group) => group.line)]
      : shared.map((group) => group.line);
  const gates = useDawGates();

  const provider = useMemo<ContextProvider>(
    () => ({
      match: (target) => fileIdOf(target) !== null,
      items: (target) => {
        const row = rows.find((candidate) => candidate.id === fileIdOf(target));
        if (!row) return [];
        return [
          { key: 'show', label: 'Show the checks', onSelect: () => onSelect(row.id) },
          {
            key: 'play',
            label: 'Play the quietest 5 s',
            unavailable: row.noFile
              ? 'This chapter has no file yet.'
              : row.waiting
                ? 'This file is not mastered yet.'
                : gates.play.ok
                  ? undefined
                  : gates.play.reason,
            onSelect: () => actions.onPlayQuietest(row.id),
          },
          {
            key: 'open',
            label: `Open in ${gates.dawName}`,
            unavailable: row.noFile ? 'This chapter has no file yet.' : gates.open.ok ? undefined : gates.open.reason,
            onSelect: () => actions.onOpenInDaw(row.id),
          },
          { key: 'recheck', label: 'Check the files again', unavailable: gates.recheck.ok ? undefined : gates.recheck.reason, onSelect: actions.onRecheck },
        ];
      },
    }),
    [rows, gates, actions, onSelect],
  );
  useContextProvider(provider);

  return (
    <Panel flush label="Per-file checks">
      <FilesHeader
        heading={heading}
        controls={controls}
        notices={[
          ...notices.filter(Boolean),
          ...notes.map((note) => (
            <p key={note} style={MUTED}>
              {note}
            </p>
          )),
        ]}
        actions={actions}
      />
      {/* The keys sit on the wrapper: a row's own Enter and Space come from `TableRow`, the arrows from here. It is the containing block of
          the cells' screen-reader text (`sr-only`, absolute), so that text scrolls with the table instead of widening the page. */}
      {profile && (
        <div ref={bind} onKeyDown={onKeyDown} className="relative overflow-x-auto">
          <Table label="Per-file checks" columns={COLUMNS} className={TABLE_FLOOR}>
            <TableHead>
              <TableRow>
                <TableHeader className={NOWRAP}>File</TableHeader>
                <TableHeader className={NOWRAP}>Length</TableHeader>
                <TableHeader className={NOWRAP}>RMS</TableHeader>
                <TableHeader className={NOWRAP}>Peak</TableHeader>
                <TableHeader className={NOWRAP}>Noise floor</TableHeader>
                <TableHeader className={NOWRAP}>Head / tail</TableHeader>
                <TableHeader className={NOWRAP}>Result</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <FileTableRow
                  key={row.id}
                  row={row}
                  said={row.waiting !== undefined && sharedTexts.has(row.waiting)}
                  selected={row.id === current}
                  onSelect={onSelect}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

/** `said`: the row's message is one the card already says for several rows, so the row leaves it out. */
function FileTableRow({ row, said, selected, onSelect }: { row: FileRow; said: boolean; selected: boolean; onSelect: (id: string) => void }) {
  return (
    // `data-no-file` marks a chapter nothing was rendered for, for the visual suite's drivers: since a shared message is said once in
    // the card, such a row no longer carries text that tells it apart.
    <TableRow onActivate={() => onSelect(row.id)} selected={selected} data={row.noFile ? { 'data-no-file': '' } : undefined}>
      <TableCell className="break-words">
        {/* The marker the right-click provider reads: a row's own attributes are the primitive's. */}
        <span data-file={row.id} className="contents" />
        {row.name}
      </TableCell>
      {row.waiting ? (
        <>
          <TableCell numeric>—</TableCell>
          <TableCell colSpan={4} muted>
            {said ? null : `${row.waiting} · not mastered`}
          </TableCell>
        </>
      ) : (
        <>
          <TableCell numeric>{row.length}</TableCell>
          <TableCell numeric>
            <Value cell={row.rms} />
          </TableCell>
          <TableCell numeric>
            <Value cell={row.peak} />
          </TableCell>
          <TableCell numeric>
            <Value cell={row.noiseFloor} />
          </TableCell>
          <TableCell numeric>
            <Value cell={row.head} /> / <Value cell={row.tail} />
          </TableCell>
        </>
      )}
      <TableCell align="right" className={NOWRAP}>
        <Result row={row} />
      </TableCell>
    </TableRow>
  );
}
