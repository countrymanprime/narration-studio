import { Link } from 'react-router-dom';
import { InsetCard } from '../primitives/InsetCard';

/**
 * The chapter's unreviewed take-review pickups - repeated reads
 * already recorded, needing comping - as a count line with Open Proof (take review's groups are Proof's notes, not the proofer's list on the Pickups page), always shown ("1 group not reviewed yet" or "none waiting", each in its
 * own dashed box) rather than only when positive, so the narrator can always tell there is nothing here to chase, not
 * just that the row is missing. It is a different kind of pickup from the check's
 * own gaps above it, so a count and a link are enough, no per-item detail. Proof's book level has no chapter
 * filter yet, so the link lands unfiltered.
 */
export function TakeReviewPickups({ count }: { count: number }) {
  return (
    <InsetCard dashed className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>Repeated reads (Proof): {count === 0 ? 'none waiting' : `${count} group${count === 1 ? '' : 's'} not reviewed yet`}</span>
      <Link to="/proof" className="font-semibold underline">
        Open Proof
      </Link>
    </InsetCard>
  );
}
