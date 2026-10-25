import { Link } from 'react-router-dom';
import { HIT_AREA } from '../primitives/hitArea';
import { PICKUP_SOURCE_ROW } from './pickupSourceRow';

/**
 * The chapter's unreviewed take-review pickups - repeated reads
 * already recorded, needing comping - as a count line with Open Proof (take review's groups are Proof's notes, not the proofer's list on the Pickups page), always shown ("1 group not reviewed yet" or "none waiting", each on its
 * own ruled row) rather than only when positive, so the narrator can always tell there is nothing here to chase, not
 * just that the row is missing. It is a different kind of pickup from the check's
 * own gaps above it, so a count and a link are enough, no per-item detail. Proof's book level has no chapter
 * filter yet, so the link lands unfiltered.
 */
export function TakeReviewPickups({ count }: { count: number }) {
  return (
    <div className={PICKUP_SOURCE_ROW}>
      <span>Repeated reads (Proof): {count === 0 ? 'none waiting' : `${count} group${count === 1 ? '' : 's'} not reviewed yet`}</span>
      <Link to="/proof" className={`flex-none font-semibold underline ${HIT_AREA}`}>
        Open Proof
      </Link>
    </div>
  );
}
