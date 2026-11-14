import { Link } from 'react-router-dom';
import { HIT_AREA } from '../primitives/hitArea';
import { PICKUP_SOURCE_ROW } from './pickupSourceRow';

/**
 * RS5 B (D22): the proofer's REAPER pickup list, shown project-wide rather
 * than scoped to the chapter - attributing `PICKUP:` markers to one chapter's linked track span (RS5 A) is
 * ambiguous when chapter tracks overlap in time, and needs the owner's real project layout to be safe. `remaining`
 * is the same figure the Pickups page (`/pickups`) shows, from the bridge's `pickupsCount`/`pickupsState`; that needs
 * REAPER running, so `available` false (the `pickups` DAW capability) reads a plain instruction instead of a stale
 * or wrong number. Always shown, like `ProofPickupNotes` above it, so the narrator can tell there is nothing to
 * chase rather than a missing line (RS8: its own label, a different pickup source from the check's own gaps). `onNavigate` runs when
 * the link is followed (a dialog that holds the report closes, so it is not left over the new page).
 */
export function PickupListCount({ available, remaining, onNavigate }: { available: boolean; remaining?: number; onNavigate?: () => void }) {
  return (
    <div className={PICKUP_SOURCE_ROW}>
      <span>Pickup list: {available ? `${remaining ?? 0} open (project-wide)` : 'open REAPER to count'}</span>
      {available && (
        <Link to="/pickups" onClick={onNavigate} className={`flex-none font-semibold underline ${HIT_AREA}`}>
          Open pickups
        </Link>
      )}
    </div>
  );
}
