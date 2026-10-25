import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { formatSize } from '../../assets/AssetFacts';
import { Button } from '../../primitives/Button';
import { InsetCard } from '../../primitives/InsetCard';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import { Panel } from '../../primitives/Panel';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../../primitives/Table';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import { AnalysisToolsSection } from '../analysis/AnalysisToolsSection';
import { useSettingsStore } from '../data/SettingsStore';
import { ASSET_COLUMNS, AssetRow } from '../models/AssetRow';
import { assetKey, useAssetsStore, type AssetView } from '../models/AssetsStore';
import { planRemoval, settingLabel, usesOf } from '../models/assetUse';
import { ASSET_FILTERS, assetPages, GROUP_OF_KIND, RECOMMENDED_SET, type AssetGroup } from '../registry/assets';
import { ANALYSIS_KIND } from '../analysis/components';
import type { Category } from '../registry/types';
import { useSettingsNav } from '../row/SettingsNav';
import { PaneTitle } from './PaneTitle';

type Filter = 'all' | AssetGroup;
type Notice = { tone: 'alert' | 'status'; text: string };

const list = (names: readonly string[]): string => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? ''));

function Heading({ category }: { category: Category }) {
  return <PaneTitle title={category.label} blurb={category.blurb} />;
}

/**
 * Models & downloads: everything the app downloads in one list, from the host's asset registry. Which one a setting uses is chosen in the
 * section that uses it; here a download is started, followed, cancelled, repaired or removed. Removing one a setting has chosen moves that
 * setting to the smallest other installed choice, or is refused when there is none. The table becomes cards below 1020px of the page.
 */
export function ModelsPane({ category }: { category: Category }) {
  const assets = useAssetsStore();
  const api = usePort('assets');
  const settings = useSettingsStore();
  const { go } = useSettingsNav();
  const [filter, setFilter] = useState<Filter>('all');
  const [removing, setRemoving] = useState<AssetView>();
  const [removePending, setRemovePending] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const noticeCard = notice && (
    <InsetCard
      as="p"
      role={notice.tone === 'alert' ? 'alert' : 'status'}
      tone={notice.tone === 'alert' ? 'danger' : 'neutral'}
      fill={notice.tone !== 'alert'}
      className="m-0 text-[0.875rem] text-pretty"
    >
      {notice.text}
    </InsetCard>
  );
  const openFolder = () => {
    api.assetsOpenFolder().catch((failure) => setNotice({ tone: 'alert', text: `The folder could not be opened: ${apiErrorMessage(failure)}` }));
  };

  const { catalog, loadError } = assets;
  const { fieldsOf } = settings;
  const rows = useMemo(() => assets.views.filter((view) => view.item.kind !== ANALYSIS_KIND), [assets.views]);
  const shown = rows.filter((view) => filter === 'all' || GROUP_OF_KIND[view.item.kind] === filter);
  const installed = assets.views.filter((view) => view.status === 'installed').length;
  const usesFor = (view: AssetView) => usesOf(view.item, fieldsOf);

  if (!catalog && !loadError) {
    return (
      <LoadingRegion label="Loading models and downloads" status="Reading the models on this computer…" className="flex flex-col gap-3">
        <Heading category={category} />
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} tall />
        ))}
      </LoadingRegion>
    );
  }
  if (!catalog) {
    return (
      <div className="flex flex-col gap-3">
        <Heading category={category} />
        <InsetCard tone="danger" role="alert" className="flex flex-col items-start gap-1.5 text-[0.875rem]">
          <b>The list of models could not be read.</b>
          <span>{loadError} Your downloads are not touched.</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void assets.refresh()}>
              Retry
            </Button>
            <Button variant="secondary" size="sm" onClick={openFolder}>
              Open the folder
            </Button>
          </div>
        </InsetCard>
        {noticeCard}
      </div>
    );
  }

  const recommended = RECOMMENDED_SET.map((ref) => assets.viewOf(ref)).filter((view): view is AssetView => view !== undefined);
  const recommendedBusy = recommended.some((view) => view.status === 'downloading' || view.status === 'verifying');
  const downloadRecommended = () => {
    for (const view of recommended) if (view.status === 'missing' || view.status === 'failed' || view.status === 'repair') void assets.install(view.item);
  };

  const confirmRemove = async () => {
    if (!removing || removePending) return;
    const target = removing;
    const name = target.item.displayName;
    const plan = planRemoval(usesFor(target), target.item, fieldsOf, assets.viewOf);
    if (plan.blocked.length > 0) {
      setRemoving(undefined);
      setNotice({
        tone: 'alert',
        text: `${name} was not removed. It is the only installed choice for ${list(plan.blocked.map((row) => row.label))}. Download another one first, then remove this one.`,
      });
      return;
    }
    setRemovePending(true);
    const refused = await assets.remove(target.item);
    if (refused !== undefined) {
      setNotice({ tone: 'alert', text: `${name} was not removed. ${refused}` });
    } else {
      const moved: string[] = [];
      const failed: string[] = [];
      for (const move of plan.moves) {
        const { row, scope } = move.use;
        // A computer value equal to the default is cleared, as the setting's own row does.
        const sent = scope === 'global' && move.to === row.def ? null : move.to;
        if (await settings.write(row, scope, sent)) moved.push(`${settingLabel(move.use)} now uses ${move.toLabel}`);
        else failed.push(settingLabel(move.use));
      }
      const text = [
        `${name} removed.`,
        ...moved.map((sentence) => `${sentence}.`),
        failed.length > 0 ? `${list(failed)} could not be moved and still point at it.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      setNotice({ tone: failed.length > 0 ? 'alert' : 'status', text });
    }
    setRemovePending(false);
    setRemoving(undefined);
  };

  const removingUses = removing ? usesFor(removing) : [];
  const removingSize = removing ? formatSize(removing.item.diskSize || removing.item.downloadSize) : '';
  const removeBody = removing
    ? removingUses.length > 0
      ? `It is chosen for: ${list(removingUses.map(settingLabel))}. Those settings switch to the smallest other choice you have installed. ${removingSize} is freed. You can download it again.`
      : `${removingSize} is freed. You can download it again.`
    : '';

  return (
    <div className="flex flex-col gap-3.5">
      <Heading category={category} />
      <Panel label="Disk use">
        <div data-disk className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
            <span>
              <b>{catalog.totalInstalledBytes > 0 ? formatSize(catalog.totalInstalledBytes) : '0 MB'}</b> used by {installed}{' '}
              {installed === 1 ? 'item' : 'items'}
            </span>
            <span className="min-w-0 text-[0.8125rem] text-[var(--text-muted)]">
              Stored in <code className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.75rem] [overflow-wrap:anywhere]">{catalog.cacheRoot}</code>
            </span>
          </div>
          <Button variant="secondary" size="sm" className="flex-none" onClick={openFolder}>
            Open folder
          </Button>
        </div>
      </Panel>
      {noticeCard}
      {rows.every((view) => view.status !== 'installed') && (
        <Panel label="Nothing is downloaded yet">
          <div className="flex flex-col items-start gap-2.5">
            <b>Nothing is downloaded yet</b>
            <p className="m-0 max-w-[62ch]">
              The app needs a transcription model to check recordings and a voice to preview names. The recommended pair is about 600 MB.
            </p>
            <Button pending={recommendedBusy} onClick={downloadRecommended}>
              Download the recommended set
            </Button>
          </div>
        </Panel>
      )}
      <ToggleGroup
        label="Show"
        look="segmented"
        value={filter}
        onChange={(next) => setFilter(next as Filter)}
        options={ASSET_FILTERS}
        className="max-w-full self-start overflow-x-auto whitespace-nowrap"
      />
      <Table
        label="Models, voices and tools"
        columns={ASSET_COLUMNS}
        className="@max-[1020px]:block @max-[1020px]:[&_tbody]:block @max-[1020px]:[&_thead]:sr-only"
      >
        <TableHead>
          <TableRow>
            <TableHeader>Name, type and size</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Used by</TableHeader>
            <TableHeader hiddenLabel="Actions" />
          </TableRow>
        </TableHead>
        <TableBody>
          {shown.map((view) => {
            const uses = view.status === 'installed' ? usesFor(view) : [];
            return (
              <AssetRow
                key={assetKey(view.item)}
                view={view}
                pages={assetPages(view.item)}
                inUse={uses.map(settingLabel)}
                go={go}
                install={() => void assets.install(view.item)}
                cancel={() => void assets.cancel(view.item)}
                remove={() => {
                  setNotice(undefined);
                  setRemoving(view);
                }}
                dismiss={() => assets.dismissFailure(view.item)}
              />
            );
          })}
        </TableBody>
      </Table>
      <AnalysisToolsSection bare />
      <span className="sr-only" role="status" aria-live="polite">
        {assets.announcement}
      </span>
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.item.displayName}?`}
          body={removeBody}
          confirmLabel="Remove"
          confirmVariant="danger"
          pending={removePending}
          confirm={() => void confirmRemove()}
          cancel={() => setRemoving(undefined)}
        />
      )}
    </div>
  );
}
