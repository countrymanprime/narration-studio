import type { DeliveryProfile, ManuscriptChapter, MeasureFileResult } from '../../../types';
import type { CreditsEntry } from '../../credits/creditsEntries';
import { Button } from '../../primitives/Button';
import { Panel } from '../../primitives/Panel';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';
import { StatusBadge } from '../../primitives/StatusBadge';
import { packageCounts, packageItems, profileName, type PackageItem } from './packageItems';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const BADGE = {
  ok: { tone: 'success', icon: '✓', word: 'Passes' },
  bad: { tone: 'danger', icon: '✕', word: 'Fails' },
  wait: { tone: 'neutral', icon: '…', word: 'Waiting' },
} as const;

/**
 * The aside "Delivery package · <profile>" (the Studio Next mock's Master page): the profile's package checks, the files that fail,
 * how many chapters are not ready (the count Delivery shows), and the way on to Delivery. The page decides where Delivery is (`onOpenDelivery`).
 */
export function PackageChecks({
  profile,
  chapters,
  credits,
  files,
  loading = false,
  onOpenDelivery,
}: {
  profile: DeliveryProfile | undefined;
  chapters: readonly ManuscriptChapter[];
  /** The opening and closing credits files, which Delivery counts as chapters too. */
  credits: { opening?: CreditsEntry; closing?: CreditsEntry };
  files: readonly MeasureFileResult[];
  /** The profile or the chapters are still being read, so no count is drawn: "0 failing" would read as a pass. */
  loading?: boolean;
  onOpenDelivery: () => void;
}) {
  const { failing, notReady } = packageCounts(chapters, credits, files);
  const items: PackageItem[] = [
    ...packageItems(profile, files),
    ...failing.map((text): PackageItem => ({ state: 'bad', text })),
    ...(notReady > 0 ? [{ state: 'wait', text: `${plural(notReady, 'chapter', 'chapters')} not ready` } satisfies PackageItem] : []),
  ];
  return (
    <aside aria-label={`Delivery package · ${profile ? profileName(profile) : '…'}`}>
      <Panel title={`Delivery package · ${profile ? profileName(profile) : '…'}`}>
        {loading ? (
          <LoadingRegion label="Loading the delivery package checks" status="Reading the profile and the chapters…" className="flex flex-col gap-2">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} />
            ))}
          </LoadingRegion>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {items.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <StatusBadge tone={BADGE[item.state].tone} label={BADGE[item.state].icon} />
                <span className="sr-only">{BADGE[item.state].word}: </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={onOpenDelivery}>Open Delivery</Button>
          {!loading && (
            <span className="text-sm text-[var(--text-muted)]">
              {failing.length} failing and {notReady} not ready.
            </span>
          )}
        </div>
      </Panel>
    </aside>
  );
}
