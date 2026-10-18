import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { ProgressBar } from '../../primitives/ProgressBar';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';
import { TableRow } from '../../primitives/Table';
import { TABLE_CELL_CLASS } from '../../primitives/tableStyles';
import { formatSize } from '../../assets/AssetFacts';
import { PAGE_LABEL, PAGE_PATH, type UsedPage } from '../registry/types';
import type { AssetStatus, AssetView } from './AssetsStore';

const PILL: Record<AssetStatus, [StatusTone, string]> = {
  installed: ['success', 'Installed · checked'],
  downloading: ['info', 'Downloading'],
  verifying: ['info', 'Checking the download'],
  failed: ['danger', 'Download failed'],
  missing: ['neutral', 'Not installed'],
  repair: ['warning', 'Needs repair'],
  unavailable: ['neutral', 'Not available yet'],
};

/** Below the page's 1020px container a row is a card: each cell on its own line, named by its `data-label`. */
const CARD_ROW =
  '@max-[1020px]:mb-2.5 @max-[1020px]:block @max-[1020px]:rounded-lg @max-[1020px]:border @max-[1020px]:border-[var(--border)] @max-[1020px]:py-1.5';
const CARD_CELL = '@max-[1020px]:block @max-[1020px]:h-auto @max-[1020px]:border-b-0 @max-[1020px]:py-1 @max-[1020px]:break-words';
const CARD_LABEL =
  "@max-[1020px]:before:mr-1.5 @max-[1020px]:before:font-['Barlow_Condensed',sans-serif] @max-[1020px]:before:text-[length:var(--font-size-label)] @max-[1020px]:before:font-semibold @max-[1020px]:before:tracking-[var(--tracking-label)] @max-[1020px]:before:text-[var(--text-muted)] @max-[1020px]:before:uppercase @max-[1020px]:before:content-[attr(data-label)]";

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
};

/** One asset of the Models & downloads list: what it is, where it stands, who reads it, and the one action its status allows. Props only. */
export function AssetRow({ view, pages, inUse, go, install, cancel, remove, dismiss }: AssetRowProps) {
  const { item, status } = view;
  const name = item.displayName;
  const [tone, label] = PILL[status];
  const busy = status === 'downloading' || status === 'verifying';
  const size = formatSize(item.diskSize || item.downloadSize);
  return (
    <TableRow data={{ 'data-asset': `${item.kind}/${item.id}`, 'data-status': status }} className={CARD_ROW}>
      {/* native-control-ok: the row header of the asset table; it becomes a card heading at narrow widths (CARD_CELL) */}
      <th scope="row" className={`${TABLE_CELL_CLASS} text-left align-top font-normal ${CARD_CELL}`}>
        <b className="font-semibold">{name}</b>
        <span className="block text-[0.75rem] text-[var(--text-muted)]">
          {item.kindLabel}
          {status === 'unavailable' ? '' : ` · ${size}`}
        </span>
        {item.description && <span className="block text-[0.8125rem]">{item.description}</span>}
      </th>
      <Cell label="Status">
        <StatusBadge tone={tone} label={status === 'downloading' ? `Downloading ${view.percent}%` : label} />
        {status === 'installed' && inUse.length > 0 && <span className="block text-[0.75rem] text-[var(--text-muted)]">In use: {inUse.join(', ')}</span>}
        {busy && (
          <span className="mt-1 flex items-center gap-2">
            <ProgressBar
              className="w-30"
              label={`Downloading ${name}`}
              value={status === 'verifying' ? 100 : view.percent}
              running
              size="thin"
              valueText={status === 'verifying' ? 'Checking' : undefined}
            />
            <span className="text-[0.75rem] text-[var(--text-muted)]">{status === 'verifying' ? 'Checking…' : `${view.percent}%`}</span>
          </span>
        )}
        {status === 'failed' && view.failure && (
          <span role="alert" className="block text-[0.75rem] text-[var(--danger-text)]">
            {view.failure}
          </span>
        )}
        {status === 'repair' && <span className="block text-[0.75rem] text-[var(--text-muted)]">A file failed its check.</span>}
        {status === 'unavailable' && <span className="block text-[0.75rem] text-[var(--text-muted)]">{item.unavailableReason}</span>}
      </Cell>
      <Cell label="Used by">
        <span className="inline-flex max-w-[14.375rem] flex-wrap gap-x-2.5">
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
      <Cell className="w-px whitespace-nowrap">
        <span className="inline-flex gap-1">
          {status === 'missing' && <IconButton action="download" label={`Download ${name} (${size})`} onClick={install} />}
          {status === 'installed' && <IconButton action="remove" variant="danger" label={`Remove ${name}`} aria-haspopup="dialog" onClick={remove} />}
          {busy && <IconButton action="cancelDownload" label={`Cancel the download of ${name}`} onClick={cancel} />}
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
