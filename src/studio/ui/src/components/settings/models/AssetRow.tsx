import { useEffect, useRef } from 'react';
import { useErrorToast } from '../../../hooks/useErrorToast';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { ProgressBar } from '../../primitives/ProgressBar';
import { StatusBadge } from '../../primitives/StatusBadge';
import { installPill } from '../installPill';
import { TableRow } from '../../primitives/Table';
import { TABLE_CELL_CLASS } from '../../primitives/tableStyles';
import { formatSize } from '../../assets/AssetFacts';
import { PAGE_LABEL, PAGE_PATH, type UsedPage } from '../registry/types';
import type { AssetView } from './AssetsStore';

/**
 * Below the page's 1020px container a row is a card on the card surface: the name and its actions on the first line (the action stays beside
 * the asset it acts on), then Status and Used by, each named by its `data-label` (alignment audit XSE2-27, XSE1-14).
 */
// The grid placement (columns, spans, the first line) and the radius are unprefixed: a table row and its cells ignore them, so only the card
// layout below 1020px uses them, and the page keeps to its count of off-vocabulary width variants (layoutQueries.test.ts).
const CARD_ROW =
  'grid-cols-[minmax(0,1fr)_auto] rounded-lg @max-[1020px]:mb-2.5 @max-[1020px]:grid @max-[1020px]:border @max-[1020px]:border-[var(--border)] @max-[1020px]:bg-[var(--surface)] @max-[1020px]:py-1.5';
const CARD_CELL = '@max-[1020px]:block @max-[1020px]:h-auto @max-[1020px]:border-b-0! @max-[1020px]:py-1 @max-[1020px]:break-words';
const CARD_WIDE = 'col-span-2';
const CARD_LABEL =
  "@max-[1020px]:before:mr-1.5 @max-[1020px]:before:font-['Barlow_Condensed',sans-serif] @max-[1020px]:before:text-[length:var(--font-size-label)] @max-[1020px]:before:font-semibold @max-[1020px]:before:tracking-[var(--tracking-label)] @max-[1020px]:before:text-[var(--text-muted)] @max-[1020px]:before:uppercase @max-[1020px]:before:content-[attr(data-label)]";

/** The table's columns (`Table columns`): the name takes what is left, the others keep one width in every state, so nothing moves between states. */
export const ASSET_COLUMNS = ['auto', '12rem', '18rem', '6.5rem'] as const;

function Cell({ label, className = '', children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    // native-control-ok: a table cell that turns into a labelled card line (data-label) below 1020px, which TableCell cannot draw
    <td data-label={label} className={`${TABLE_CELL_CLASS} align-top ${CARD_CELL} ${label ? CARD_LABEL : ''} ${className}`}>
      {children}
    </td>
  );
}

export type AssetRowProps = {
  view: AssetView;
  /** The pages that read it. */
  pages: readonly UsedPage[];
  /** The labels of the settings whose chosen value is this asset; shown while it is installed. */
  inUse: readonly string[];
  go: (path: string) => void;
  install: () => void;
  cancel: () => void;
  remove: () => void;
  dismiss: () => void;
  /** Check the files (issue 2731): offered on an installed row, busy while the check runs. */
  verify: () => void;
};

/**
 * The installed pill's words: "checked" only while the last check stands, with the time when it was today (a check that just passed shows
 * at once), and plain "Installed" after a check that was refused or not answered.
 */
function installedLabel(verifiedAt: string, unchecked: boolean, now = new Date()): string {
  if (unchecked) return 'Installed';
  const at = verifiedAt ? new Date(verifiedAt) : undefined;
  if (!at || Number.isNaN(at.getTime()) || at.toDateString() !== now.toDateString()) return 'Installed · checked';
  return `Installed · checked ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/** One asset of the Models & downloads list: what it is, where it stands, who reads it, and the one action its status allows. Props only. */
export function AssetRow({ view, pages, inUse, go, install, cancel, remove, dismiss, verify }: AssetRowProps) {
  const { item, status, checking } = view;
  useErrorToast(status === 'failed' ? view.failure : undefined);
  const name = item.displayName;
  // A check of an installed asset draws the download's checking look, in its own words, with nothing to cancel.
  const pill = installPill(checking ? 'verifying' : status);
  const { tone, label } = checking
    ? { ...pill, label: 'Checking the files' }
    : status === 'installed'
      ? { ...pill, label: installedLabel(item.verifiedAt, view.unchecked) }
      : pill;
  // A check that finds the files damaged or gone takes the pressed button away: focus goes to the action that replaced it (Repair,
  // Download), not to the page body.
  const actions = useRef<HTMLSpanElement>(null);
  const pressedCheck = useRef(false);
  useEffect(() => {
    if (!pressedCheck.current || checking) return;
    pressedCheck.current = false;
    const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
    if (status !== 'installed' && lost) actions.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [status, checking]);
  const downloading = status === 'downloading' || status === 'verifying';
  const busy = downloading || checking;
  const size = formatSize(item.diskSize || item.downloadSize);
  return (
    <TableRow data={{ 'data-asset': `${item.kind}/${item.id}`, 'data-status': status }} className={CARD_ROW}>
      {/* native-control-ok: the row header of the asset table; it becomes a card heading at narrow widths (CARD_CELL) */}
      <th scope="row" className={`${TABLE_CELL_CLASS} text-left align-top font-normal ${CARD_CELL} row-start-1`}>
        <b className="font-semibold">{name}</b>
        <span className="block text-[0.75rem] text-[var(--text-muted)]">
          {item.kindLabel}
          {status === 'unavailable' ? '' : ` · ${size}`}
        </span>
        {item.description && <span className="block text-[0.8125rem]">{item.description}</span>}
      </th>
      <Cell label="Status" className={CARD_WIDE}>
        <StatusBadge tone={tone} label={status === 'downloading' ? `Downloading ${view.percent}%` : label} />
        {status === 'installed' && !checking && inUse.length > 0 && (
          <span className="block text-[0.75rem] text-[var(--text-muted)]">In use: {inUse.join(', ')}</span>
        )}
        {busy && (
          <span className="mt-1 flex items-center gap-2">
            <ProgressBar
              className="w-30"
              label={checking ? `Checking the files of ${name}` : `Downloading ${name}`}
              value={status === 'downloading' ? view.percent : 100}
              running
              size="thin"
              valueText={status === 'downloading' ? undefined : 'Checking'}
            />
            {status !== 'downloading' && <span className="text-[0.75rem] text-[var(--text-muted)]">Checking…</span>}
          </span>
        )}
        {status === 'repair' && <span className="block text-[0.75rem] text-[var(--text-muted)]">A file failed its check.</span>}
        {status === 'unavailable' && <span className="block text-[0.75rem] text-[var(--text-muted)]">{item.unavailableReason}</span>}
      </Cell>
      <Cell label="Used by" className={CARD_WIDE}>
        <span className="inline-flex flex-wrap gap-x-2.5">
          {pages.map((page) => (
            <Button
              key={page}
              variant="link"
              size="sm"
              aria-label={`Used by ${PAGE_LABEL[page]}. Go to ${PAGE_LABEL[page]}`}
              onClick={() => go(PAGE_PATH[page])}
            >
              {PAGE_LABEL[page]}
            </Button>
          ))}
        </span>
      </Cell>
      <Cell className="col-start-2 row-start-1 whitespace-nowrap">
        <span ref={actions} className="flex justify-end gap-1">
          {status === 'missing' && <IconButton action="download" label={`Download ${name} (${size})`} onClick={install} />}
          {/* Drawn while it checks too, spinning, so focus stays on it and a second press is ignored. */}
          {status === 'installed' && (
            <IconButton
              action="checkFiles"
              label={`Check the files of ${name}`}
              pending={checking}
              onClick={() => {
                pressedCheck.current = true;
                verify();
              }}
            />
          )}
          {status === 'installed' && !checking && (
            <IconButton action="remove" variant="danger" label={`Remove ${name}`} aria-haspopup="dialog" onClick={remove} />
          )}
          {downloading && <IconButton action="cancelDownload" label={`Cancel the download of ${name}`} onClick={cancel} />}
          {status === 'repair' && (
            <>
              <IconButton action="retry" label={`Repair ${name}`} onClick={install} />
              <IconButton action="remove" variant="danger" label={`Remove ${name}`} aria-haspopup="dialog" onClick={remove} />
            </>
          )}
          {status === 'failed' && (
            <>
              <IconButton action="retry" label={`Try ${name} again`} onClick={install} />
              <IconButton action="dismiss" label="Dismiss" onClick={dismiss} />
            </>
          )}
        </span>
      </Cell>
    </TableRow>
  );
}
