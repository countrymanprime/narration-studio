import { StatusBadge } from '../../primitives/StatusBadge';
import { plural } from '../../../plural';

/** "N takes" after a note's heard text, only where its spot has several. A word, never a colour alone. */
export function TakesBadge({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <span role="img" aria-label={`${plural(count, 'take')} at this spot`} className="inline-flex flex-none">
      <StatusBadge tone="neutral" shape="tag" label={`${plural(count, 'take')}`} />
    </span>
  );
}
