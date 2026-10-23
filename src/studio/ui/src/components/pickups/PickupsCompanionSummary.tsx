import { SectionLabel } from '../primitives/SectionLabel';
import { openPickups } from './list/pickupRows';
import { usePickupList } from './useOpenPickups';
import { usePickupsState } from './usePickupsState';

// Mock 07's pickups list: Plex Mono, 13 px, 29 px rows. The
// same mono family other dense rows already use (Kbd.tsx, KeyHint.tsx).
const ROW = "flex min-h-[1.8125rem] items-center font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.8125rem]";

/**
 * The Booth companion's Pickups section: the same pickup list the
 * Pickups page works through, read-only at 380 px - how many are left and the one last jumped to. Jumping, punching and
 * marking one done stay on the page; closed-loop proofing's session plan replaces this once it exists.
 */
export function PickupsCompanionSummary() {
  const state = usePickupsState();
  const list = usePickupList();
  const remaining = list ? openPickups(list).length : 0;
  const next = state.phase === 'success' ? state.next : undefined;
  return (
    <div className="flex flex-col">
      <p className={ROW}>{list && list.length > 0 ? `${remaining} pickup${remaining === 1 ? '' : 's'} remaining of ${list.length}` : 'No pickups yet'}</p>
      {next && (
        <p className={ROW}>
          Next: {next.tag && <SectionLabel className="mr-1.5">{next.tag}</SectionLabel>}
          {next.note}
        </p>
      )}
      <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        Jump to one or mark it done on the Pickups page in the full app.
      </p>
    </div>
  );
}
