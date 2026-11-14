import { Link } from 'react-router-dom';
import { HIT_AREA } from '../primitives/hitArea';
import { PICKUP_SOURCE_ROW } from './pickupSourceRow';

/**
 * The chapter's unreviewed pickup notes on Proof (category `pickup`: the Booth's read-aloud restarts, and any group the retired take
 * review saved) as a count line with Open Proof on that chapter. Always shown ("2 not reviewed yet" or "none waiting", each on its
 * own ruled row) rather than only when positive, so the narrator can always tell there is nothing here to chase, not just that the
 * row is missing. It is a different kind of pickup from the check's own gaps above it, so a count and a link are enough, no
 * per-item detail. `onNavigate` runs when the link is followed (a dialog that holds the report closes, so it is not left over the new page).
 */
export function ProofPickupNotes({ chapterId, count, onNavigate }: { chapterId: string; count: number; onNavigate?: () => void }) {
  return (
    <div className={PICKUP_SOURCE_ROW}>
      <span>Pickup notes (Proof): {count === 0 ? 'none waiting' : `${count} not reviewed yet`}</span>
      <Link to={`/proof?chapter=${encodeURIComponent(chapterId)}`} onClick={onNavigate} className={`flex-none font-semibold underline ${HIT_AREA}`}>
        Open Proof
      </Link>
    </div>
  );
}
