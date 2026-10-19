import { assetOfOption } from '../registry/rows';
import { useAssetsStore } from '../models/AssetsStore';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { ProgressBar } from '../../primitives/ProgressBar';
import { StatusBadge } from '../../primitives/StatusBadge';
import { useSettingsNav } from './SettingsNav';
import type { SettingMeta } from '../registry/types';

/**
 * Under a choice of downloadable things: is the chosen one on this computer, and a way to get it without leaving the row. Nothing shows when
 * it is installed, when the choice has no download behind it, or when the list of downloads has not been read.
 */
export function AssetNote({ row, value, kindOf }: { row: SettingMeta; value: string; kindOf: (rowId: string) => string }) {
  const store = useAssetsStore();
  const { showCategory } = useSettingsNav();
  const ref = assetOfOption(row.options?.[value], kindOf);
  const view = ref ? store.viewOf(ref) : undefined;
  if (!view || view.status === 'installed') return null;
  const { item } = view;
  const name = item.displayName;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]" data-asset-note={`${item.kind}/${item.id}`}>
      {view.status === 'downloading' || view.status === 'verifying' ? (
        <>
          <ProgressBar className="w-40" label={`Downloading ${name}`} value={view.status === 'verifying' ? 100 : view.percent} running />
          <span className="text-[var(--text-muted)]">{view.status === 'verifying' ? 'Checking…' : `${view.percent}%`}</span>
          <IconButton action="cancelDownload" label={`Cancel the download of ${name}`} onClick={() => void store.cancel(item)} />
        </>
      ) : view.status === 'failed' ? (
        <>
          <StatusBadge tone="danger" label="Download failed" />
          <span role="alert" className="text-[var(--text-muted)]">
            {view.failure}
          </span>
          <Button variant="secondary" size="sm" onClick={() => void store.install(item)}>
            Retry
          </Button>
        </>
      ) : view.status === 'unavailable' ? (
        <>
          <StatusBadge tone="neutral" label="Not available yet" />
          <span className="text-[var(--text-muted)]">{item.unavailableReason}</span>
        </>
      ) : (
        <>
          <StatusBadge tone="warning" label={view.status === 'repair' ? 'Needs repair' : 'Not on this computer'} />
          <span className="text-[var(--text-muted)]">{name} must be downloaded before it is used.</span>
          <Button
            variant="secondary"
            size="sm"
            aria-label={`${view.status === 'repair' ? 'Repair' : 'Download'} ${name}`}
            onClick={() => void store.install(item)}
          >
            {view.status === 'repair' ? 'Repair' : 'Download'}
          </Button>
        </>
      )}
      <Button variant="link" size="sm" onClick={() => showCategory('models')}>
        Models &amp; downloads
      </Button>
    </div>
  );
}
