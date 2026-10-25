import type { DeliveryProfile, ManuscriptChapter, MeasureFileResult } from '../../../types';
import type { CreditsEntry } from '../../credits/creditsEntries';
import { Button } from '../../primitives/Button';
import { Panel } from '../../primitives/Panel';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';
import { statusTone, type StatusId } from '../../../kinds/statusTone';
import { StatusBadge } from '../../primitives/StatusBadge';
import { packageCounts, packageItems, profileName, type PackageItem } from './packageItems';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// A check not judged yet is a hollow circle, not the mock's "…", which read as a list still loading (R4MS1-5, R4TB-3).
const BADGE = {
  ok: { status: 'pass', icon: '✓', word: 'Passes' },
  bad: { status: 'fail', icon: '✕', word: 'Fails' },
  wait: { status: 'waiting', icon: '○', word: 'Not checked yet' },
} as const satisfies Record<string, { status: StatusId; icon: string; word: string }>;

/** The loaded card's rows: the three profile checks and the count, so the card does not jump when they arrive (R4MS2-9, XMS-16). */
const SKELETON_ROWS = 4;

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
            {Array.from({ length: SKELETON_ROWS }, (_, row) => (
              <Skeleton key={row} />
            ))}
          </LoadingRegion>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {items.map((item, index) => (
              // One badge width whatever its glyph, beside the first line of a row that wraps (XMS-16).
              <li key={index} className="flex items-start gap-2">
                <span className="flex w-7 flex-none justify-center">
                  <StatusBadge tone={statusTone(BADGE[item.state].status)} label={BADGE[item.state].icon} />
                </span>
                <span className="sr-only">{BADGE[item.state].word}: </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
        {/* The button keeps its own width (a full-width bar was the loudest thing on the stacked page, R4MS1-13) and waits for what it
            summarises. The mock's caption under it ("0 failing and 14 not ready.") only repeated the rows above, so it is gone (R4MS2-4). */}
        <Button className="mt-4" onClick={onOpenDelivery} disabled={loading}>
          Open Delivery
        </Button>
      </Panel>
    </aside>
  );
}
