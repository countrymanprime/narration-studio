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
 * it is installed, when the choice has no download behind it, or when the list of downloads has not been read. It is two lines at every width
 * and in every state, what is so and then what to do (alignment audit XSE2-14), and it names the thing as the select above it does (R3SE2-20).
 */
export function AssetNote({ row, value, kindOf }: { row: SettingMeta; value: string; kindOf: (rowId: string) => string }) {
  const store = useAssetsStore();
  const { showCategory } = useSettingsNav();
  const ref = assetOfOption(row.options?.[value], kindOf);
  const view = ref ? store.viewOf(ref) : undefined;
  if (!view || view.status === 'installed') return null;
  const { item } = view;
  const name = row.options?.[value]?.label ?? item.displayName;
  const busy = view.status === 'downloading' || view.status === 'verifying';
  return (
    <div className="flex flex-col items-start gap-1.5 text-[0.8125rem]" data-asset-note={`${item.kind}/${item.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        {busy ? (
          <>
            <ProgressBar className="w-40" label={`Downloading ${name}`} value={view.status === 'verifying' ? 100 : view.percent} running />
            <span className="text-[var(--text-muted)]">{view.status === 'verifying' ? 'Checking…' : `${view.percent}%`}</span>
          </>
        ) : view.status === 'failed' ? (
          <>
            <StatusBadge tone="danger" label="Download failed" />
            <span role="alert" className="text-[var(--text-muted)]">
              {view.failure}
            </span>
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
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {busy ? (
          <IconButton action="cancelDownload" label={`Cancel the download of ${name}`} onClick={() => void store.cancel(item)} />
        ) : view.status === 'failed' ? (
          <Button variant="secondary" size="sm" onClick={() => void store.install(item)}>
            Retry
          </Button>
        ) : view.status === 'unavailable' ? null : (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`${view.status === 'repair' ? 'Repair' : 'Download'} ${name}`}
            onClick={() => void store.install(item)}
          >
            {view.status === 'repair' ? 'Repair' : 'Download'}
          </Button>
        )}
        <Button variant="link" size="sm" onClick={() => showCategory('models')}>
          Models &amp; downloads
        </Button>
      </div>
    </div>
  );
}
