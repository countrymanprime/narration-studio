import type { AssetInstallJob, AssetItem } from '../../../types';
import { formatSize } from '../../assets/AssetFacts';
import { IconButton } from '../../primitives/IconButton';
import { ProgressBar } from '../../primitives/ProgressBar';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';
import { memoryText, minutesText, type ToolStatus } from './components';

const PILL: Record<ToolStatus, [StatusTone, string]> = {
  installed: ['success', 'Installed · checked'],
  downloading: ['info', 'Downloading'],
  verifying: ['info', 'Checking the download'],
  failed: ['danger', 'Download failed'],
  'not-installed': ['neutral', 'Not installed'],
  unavailable: ['neutral', 'Not available yet'],
};

export type ToolRowProps = {
  tool: AssetItem;
  status: ToolStatus;
  /** The running download, for its real percent; absent before the host answered. */
  job?: Pick<AssetInstallJob, 'percent'>;
  /** The host's sentence for the failed download, or why a cancel or a removal did not work. */
  failure?: string;
  download: () => void;
  cancel: () => void;
  retry: () => void;
  dismiss: () => void;
  remove: () => void;
};

/**
 * One analysis tool in Settings: its name and status pill, what it does, and its size, host, memory and time per book (or the host's
 * reason it cannot be had yet). The one action its status allows sits on the right: Download, Cancel while it downloads, Try again and
 * Dismiss after a failure, Remove once installed. Props only, so a story can show every status.
 */
export function ToolRow({ tool, status, job, failure, download, cancel, retry, dismiss, remove }: ToolRowProps) {
  const [tone, label] = PILL[status];
  const name = tool.displayName;
  const busy = status === 'downloading' || status === 'verifying';
  return (
    <li data-component={tool.id} data-status={status} className="flex min-w-0 flex-col gap-1 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="m-0 text-[0.9375rem] font-semibold">{name}</h3>
        <StatusBadge tone={tone} label={label} />
        <span className="flex-1" />
        {status === 'not-installed' && <IconButton action="download" label={`Download ${name}…`} aria-haspopup="dialog" onClick={download} />}
        {status === 'installed' && <IconButton action="remove" variant="danger" label={`Remove ${name}`} aria-haspopup="dialog" onClick={remove} />}
        {busy && <IconButton action="cancelDownload" label={`Cancel the download of ${name}`} onClick={cancel} />}
        {status === 'failed' && (
          <>
            <IconButton action="retry" label={`Try ${name} again`} onClick={retry} />
            <IconButton action="dismiss" label="Dismiss" onClick={dismiss} />
          </>
        )}
      </div>
      {tool.description && <p className="m-0 max-w-[62ch] text-sm">{tool.description}</p>}
      {status === 'unavailable' ? (
        <span data-comp-reason className="text-xs text-[var(--text-muted)]">
          {tool.unavailableReason}
        </span>
      ) : (
        <span data-comp-facts className="flex flex-wrap gap-x-3.5 gap-y-0.5 text-xs text-[var(--text-muted)]">
          <span>{formatSize(tool.downloadSize)}</span>
          {tool.downloadHost && <span>from {tool.downloadHost}</span>}
          {tool.ramGB !== undefined && <span>needs {memoryText(tool.ramGB)}</span>}
          {tool.minutesPerBook ? <span>{minutesText(tool.minutesPerBook)} per book</span> : null}
        </span>
      )}
      {busy && (
        <div className="flex min-w-0 items-center gap-2.5">
          <ProgressBar
            className="min-w-20 flex-1"
            label={`Downloading ${name}`}
            value={job ? job.percent : null}
            running
            size="thin"
            valueText={status === 'verifying' ? 'Checking' : undefined}
          />
          <span className="text-xs whitespace-nowrap text-[var(--text-muted)]">
            {status === 'verifying' ? 'Checking…' : `${job?.percent ?? 0}% of ${formatSize(tool.downloadSize)}`}
          </span>
        </div>
      )}
      {failure && (
        <span role="alert" data-comp-error className="text-xs text-[var(--danger-text)]">
          {failure}
        </span>
      )}
    </li>
  );
}
