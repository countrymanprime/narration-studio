import { StatusBadge } from '../../../primitives/StatusBadge';
import { entryPill } from './selectors';

/** The pill on a Story Bible entry row: "Verify · N" while suggestions wait, "Review" when the entry is flagged. The entry flag is the page's (SN-B8). */
export function EntryVerifyPill({ verify, flagged }: { verify: number; flagged: boolean }) {
  const label = entryPill(verify, flagged);
  if (!label) return null;
  return <StatusBadge tone="warning" label={label} />;
}
